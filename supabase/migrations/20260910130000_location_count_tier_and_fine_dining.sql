-- Location-count merchant tier + Fine Dining add-on + location-base fix.
--
-- New pricing model:
--   * Merchant tier (charged to the merchant card): 1 location = FREE; each
--     additional location = +$60/mo (N locations -> $60 x (N-1)). The separate
--     6+ "franchise" tier is retired; multi_location covers 2+ with no cap.
--   * Location subscriptions (per-location card) bill devices + add-ons only --
--     NO base/tier line (fixes the double-charged $99 base_monthly line).
--   * Catalog: retire the "Franchise Package" ($399) location add-on; add
--     "Fine Dining" ($30/mo) as a location add-on service.
--
-- This migration is production-safe (no merchant-specific data). Repointing any
-- existing franchise service assignments to fine_dining is a separate, per-env
-- data decision (grandfathered vs migrated) handled out of band.
begin;

-- 1. Merchant-tier plans -------------------------------------------------------

-- basic: single location, free.
update public.subscription_plans set
  display_name = 'Single Location',
  monthly_price_cents = 0,
  base_price_monthly = 0,
  included_stations = 0,
  per_extra_station_price = 0,
  min_locations = 1,
  max_locations = 1,
  updated_at = now()
where plan_code = 'basic' and plan_scope = 'merchant_tier';

-- multi_location: 2+ locations, $60 per location beyond the first.
-- Modeled via the existing overage machinery: 1 included, $60 per extra unit,
-- where "unit" is the merchant's active location count (see
-- calculate_subscription_total / generate_subscription_invoice below).
update public.subscription_plans set
  display_name = 'Multi-Location',
  monthly_price_cents = 0,
  base_price_monthly = 0,
  included_stations = 1,
  per_extra_station_price = 60.00,
  min_locations = 2,
  max_locations = null,
  updated_at = now()
where plan_code = 'multi_location' and plan_scope = 'merchant_tier';

-- Retire the standalone 6+ tier; multi_location now covers 6+. Row kept for FK
-- integrity of any historical merchant_subscriptions.plan_id references.
update public.subscription_plans set
  is_active = false,
  updated_at = now()
where plan_code = 'franchise' and plan_scope = 'merchant_tier';

-- 2. Location add-on catalog ---------------------------------------------------

-- Retire the Franchise Package location add-on (existing assignments survive).
update public.billable_services set
  is_active = false,
  updated_at = now()
where service_code = 'franchise';

-- Add the Fine Dining location add-on ($30/mo).
insert into public.billable_services (
  service_code, display_name, service_category, pricing_model,
  base_price_monthly, additional_unit_price, included_quantity,
  card_surcharge_pct, unit_label, is_active, metadata
) values (
  'fine_dining', 'Fine Dining', 'service', 'flat',
  30.00, null, 1, 4.00, 'location', true,
  jsonb_build_object('seeded_from', '20260909120000_location_count_tier_and_fine_dining')
)
on conflict (service_code) do update set
  display_name = excluded.display_name,
  service_category = excluded.service_category,
  pricing_model = excluded.pricing_model,
  base_price_monthly = excluded.base_price_monthly,
  additional_unit_price = excluded.additional_unit_price,
  included_quantity = excluded.included_quantity,
  card_surcharge_pct = excluded.card_surcharge_pct,
  unit_label = excluded.unit_label,
  is_active = true,
  metadata = coalesce(public.billable_services.metadata, '{}'::jsonb) || excluded.metadata,
  updated_at = now();

-- 3. Pricing engine: recreate calculate_subscription_total ---------------------
-- Changes vs prior version:
--   (a) merchant_tier no longer forces the count to 0 -- the caller passes the
--       active location count, so the overage machinery yields $60 x (N-1).
--   (b) the overage line is labeled by scope (additional_locations vs
--       extra_stations).
--   (c) non-merchant_tier (location) scope no longer emits a base_monthly line
--       (v_base_price forced to 0) -- locations bill devices/add-ons only.
create or replace function public.calculate_subscription_total(
  p_plan_id uuid default null::uuid,
  p_station_count integer default 0,
  p_services jsonb default '[]'::jsonb,
  p_billing_method text default 'card'::text
)
returns table(station_count integer, billing_method text, line_items jsonb, subtotal numeric, card_surcharge numeric, total_amount numeric)
language plpgsql
stable security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_plan public.subscription_plans%rowtype;
  v_has_plan boolean := false;
  v_plan_scope text := 'service_billing';
  v_base_price numeric(12,2) := 0;
  v_station_count integer := greatest(coalesce(p_station_count, 0), 0);
  v_overage integer := 0;
  v_line_items jsonb := '[]'::jsonb;
  v_subtotal numeric(12,2) := 0;
  v_surcharge_pct numeric(5,2) := 4.00;
  v_card_surcharge numeric(12,2) := 0;
  v_total numeric(12,2) := 0;
  v_service_item jsonb;
  v_service_id uuid;
  v_service_code text;
  v_quantity integer;
  v_service public.billable_services%rowtype;
  v_service_calc record;
begin
  if coalesce(p_billing_method, 'card') not in ('ach', 'card') then
    raise exception 'Unsupported billing method: %', p_billing_method;
  end if;

  if p_plan_id is not null then
    select *
    into v_plan
    from public.subscription_plans sp
    where sp.id = p_plan_id;

    v_has_plan := found;

    if not v_has_plan then
      raise exception 'Subscription plan not found: %', p_plan_id;
    end if;

    v_plan_scope := coalesce(v_plan.plan_scope, 'service_billing');
    if v_plan_scope = 'merchant_tier' then
      -- Merchant tier is priced by location count (passed in as p_station_count);
      -- it must never carry location services.
      if jsonb_array_length(coalesce(p_services, '[]'::jsonb)) > 0 then
        raise exception 'Merchant tier pricing cannot include location services';
      end if;
    end if;
    v_base_price := case
      when v_plan_scope = 'merchant_tier'
        then round((coalesce(v_plan.monthly_price_cents, 0)::numeric / 100.0), 2)
      -- Location/service-billing scope: no base line. The merchant tier is the
      -- only place a base is charged; locations bill devices + add-ons only.
      else 0
    end;
    v_surcharge_pct := coalesce(v_plan.card_surcharge_pct, v_surcharge_pct);

    if v_base_price > 0 then
      v_line_items := v_line_items || jsonb_build_array(
        jsonb_build_object(
          'code', case when v_plan_scope = 'merchant_tier' then 'merchant_tier_base' else 'base_monthly' end,
          'description', coalesce(v_plan.display_name, 'Subscription') || ' monthly base',
          'category', 'plan',
          'pricing_model', 'flat',
          'quantity', 1,
          'unit_label', 'month',
          'unit_price', v_base_price,
          'subtotal', v_base_price,
          'amount', v_base_price
        )
      );
      v_subtotal := round(v_subtotal + v_base_price, 2);
    end if;

    v_overage := greatest(v_station_count - greatest(coalesce(v_plan.included_stations, 0), 0), 0);

    if v_overage > 0 and coalesce(v_plan.per_extra_station_price, 0) > 0 then
      v_line_items := v_line_items || jsonb_build_array(
        jsonb_build_object(
          'code', case when v_plan_scope = 'merchant_tier' then 'additional_locations' else 'extra_stations' end,
          'description', case when v_plan_scope = 'merchant_tier'
            then 'Additional locations beyond the first'
            else 'Extra active stations beyond included count' end,
          'category', 'plan',
          'pricing_model', 'per_unit',
          'quantity', v_overage,
          'unit_label', case when v_plan_scope = 'merchant_tier' then 'location' else 'station' end,
          'unit_price', round(v_plan.per_extra_station_price, 2),
          'subtotal', round(v_overage * v_plan.per_extra_station_price, 2),
          'amount', round(v_overage * v_plan.per_extra_station_price, 2)
        )
      );
      v_subtotal := round(v_subtotal + (v_overage * v_plan.per_extra_station_price), 2);
    end if;
  end if;

  for v_service_item in
    select value
    from jsonb_array_elements(coalesce(p_services, '[]'::jsonb))
  loop
    v_service_id := null;
    v_service_code := nullif(btrim(coalesce(v_service_item->>'service_code', v_service_item->>'code', '')), '');

    if nullif(btrim(coalesce(v_service_item->>'service_id', '')), '') is not null then
      begin
        v_service_id := (v_service_item->>'service_id')::uuid;
      exception when others then
        raise exception 'Invalid service_id in subscription calculator payload';
      end;
    end if;

    if v_service_id is null and v_service_code is not null then
      select bs.id
      into v_service_id
      from public.billable_services bs
      where bs.service_code = lower(regexp_replace(v_service_code, '[^a-zA-Z0-9]+', '_', 'g'))
      limit 1;
    end if;

    if v_service_id is null then
      continue;
    end if;

    select *
    into v_service
    from public.billable_services bs
    where bs.id = v_service_id;

    if not found or not coalesce(v_service.is_active, false) then
      continue;
    end if;

    v_quantity := greatest(coalesce(nullif(v_service_item->>'quantity', '')::integer, 1), 0);
    if v_quantity <= 0 then
      continue;
    end if;

    select *
    into v_service_calc
    from public.calculate_billable_service_amounts(v_service.id, v_quantity, 'ach');

    v_surcharge_pct := greatest(v_surcharge_pct, coalesce(v_service.card_surcharge_pct, 0));
    v_line_items := v_line_items || jsonb_build_array(
      jsonb_build_object(
        'code', v_service.service_code,
        'description', v_service.display_name,
        'category', v_service.service_category,
        'pricing_model', v_service.pricing_model,
        'quantity', v_quantity,
        'unit_label', v_service.unit_label,
        'unit_price', case
          when v_service.pricing_model = 'per_unit' then v_service.base_price_monthly
          else v_service_calc.subtotal
        end,
        'base_price_monthly', v_service.base_price_monthly,
        'additional_unit_price', v_service.additional_unit_price,
        'included_quantity', v_service.included_quantity,
        'subtotal', v_service_calc.subtotal,
        'amount', v_service_calc.subtotal
      )
    );
    v_subtotal := round(v_subtotal + v_service_calc.subtotal, 2);
  end loop;

  v_card_surcharge := case
    when coalesce(p_billing_method, 'card') = 'card'
      then round(v_subtotal * (v_surcharge_pct / 100.0), 2)
    else 0::numeric
  end;
  v_total := round(v_subtotal + v_card_surcharge, 2);

  if v_card_surcharge > 0 then
    v_line_items := v_line_items || jsonb_build_array(
      jsonb_build_object(
        'code', 'card_surcharge',
        'description', 'Card billing surcharge',
        'category', 'billing',
        'pricing_model', 'percent',
        'quantity', 1,
        'unit_label', 'charge',
        'unit_price', v_card_surcharge,
        'subtotal', v_card_surcharge,
        'amount', v_card_surcharge,
        'surcharge_pct', v_surcharge_pct
      )
    );
  end if;

  return query
  select
    v_station_count,
    coalesce(p_billing_method, 'card'),
    v_line_items,
    v_subtotal,
    v_card_surcharge,
    v_total;
end;
$function$;

-- 4. Invoice generation: pass active location count for merchant-tier subs ------
create or replace function public.generate_subscription_invoice(p_subscription_id uuid, p_due_date date default null::date)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_subscription public.merchant_subscriptions%rowtype;
  v_billing_method text := 'card';
  v_station_count integer := 0;
  v_services jsonb := '[]'::jsonb;
  v_calc record;
  v_invoice_id uuid;
  v_invoice_number text;
  v_new_period_start date;
  v_new_period_end date;
begin
  if not (
    public.is_dexapos_admin()
    or coalesce(auth.jwt()->>'role', '') = 'service_role'
  ) then
    raise exception 'Only HQ/system can generate subscription invoices';
  end if;

  select *
  into v_subscription
  from public.merchant_subscriptions ms
  where ms.id = p_subscription_id
  for update;

  if not found then
    raise exception 'Subscription not found: %', p_subscription_id;
  end if;

  if v_subscription.status = 'canceled' then
    raise exception 'Cannot generate invoice for canceled subscription %', p_subscription_id;
  end if;

  if v_subscription.status = 'trial'
     and v_subscription.trial_ends_at is not null
     and v_subscription.trial_ends_at::date > current_date then
    raise exception 'Subscription % is still in trial', p_subscription_id;
  end if;

  if exists (
    select 1
    from public.subscription_invoices si
    where si.subscription_id = p_subscription_id
      and si.billing_period_start = v_subscription.current_period_start
  ) then
    raise exception 'Invoice already exists for subscription % and period %', p_subscription_id, v_subscription.current_period_start;
  end if;

  if v_subscription.billing_profile_id is not null then
    select mbp.billing_method
    into v_billing_method
    from public.merchant_billing_profiles mbp
    where mbp.id = v_subscription.billing_profile_id
      and mbp.is_active = true;
  end if;

  -- Merchant-tier subs are priced by the merchant's active location count
  -- ($60 per location beyond the first). Location subs price by station count.
  v_station_count := case when v_subscription.metadata->>'billing_scope' = 'merchant_tier'
    then (
      select count(*)::integer
      from public.locations l
      where l.merchant_id = v_subscription.merchant_id
        and coalesce(l.is_active, true)
    )
    else public.get_active_station_count(v_subscription.location_id) end;

  select coalesce(
    jsonb_agg(jsonb_build_object('service_id', mss.service_id, 'quantity', mss.quantity)),
    '[]'::jsonb
  )
  into v_services
  from public.merchant_subscription_services mss
  where mss.subscription_id = v_subscription.id
    and mss.is_enabled = true
    and mss.quantity > 0;

  select *
  into v_calc
  from public.calculate_subscription_total(
    v_subscription.plan_id,
    v_station_count,
    v_services,
    coalesce(v_billing_method, 'card')
  );

  v_invoice_number := public.generate_subscription_invoice_number(coalesce(p_due_date, v_subscription.next_billing_date));

  insert into public.subscription_invoices (
    subscription_id,
    merchant_id,
    location_id,
    invoice_number,
    billing_period_start,
    billing_period_end,
    station_count_snapshot,
    billing_method,
    line_items,
    subtotal,
    card_surcharge,
    total_amount,
    status,
    due_date,
    billing_profile_id,
    metadata
  ) values (
    v_subscription.id,
    v_subscription.merchant_id,
    v_subscription.location_id,
    v_invoice_number,
    v_subscription.current_period_start,
    v_subscription.current_period_end,
    v_station_count,
    coalesce(v_billing_method, 'card'),
    v_calc.line_items,
    v_calc.subtotal,
    v_calc.card_surcharge,
    v_calc.total_amount,
    'open',
    coalesce(p_due_date, v_subscription.next_billing_date),
    v_subscription.billing_profile_id,
    coalesce(v_subscription.metadata, '{}'::jsonb) || jsonb_build_object(
      'pricing_model', 'unified_calculator'
    )
  )
  returning id into v_invoice_id;

  v_new_period_start := v_subscription.current_period_end + 1;
  v_new_period_end := (v_new_period_start + interval '1 month' - interval '1 day')::date;

  update public.merchant_subscriptions
  set
    station_count = v_station_count,
    monthly_amount = v_calc.total_amount,
    current_period_start = v_new_period_start,
    current_period_end = v_new_period_end,
    next_billing_date = v_new_period_start,
    updated_at = now()
  where id = v_subscription.id;

  perform public.log_subscription_billing_event(
    'subscription_invoice',
    v_subscription.merchant_id,
    v_subscription.location_id,
    'subscription_invoice',
    v_invoice_number,
    v_invoice_id,
    jsonb_build_object(
      'subscription_id', v_subscription.id,
      'billing_period_start', v_subscription.current_period_start,
      'billing_period_end', v_subscription.current_period_end,
      'station_count_snapshot', v_station_count,
      'billing_method', coalesce(v_billing_method, 'card'),
      'subtotal', v_calc.subtotal,
      'card_surcharge', v_calc.card_surcharge,
      'total_amount', v_calc.total_amount
    ),
    jsonb_build_object('line_items', v_calc.line_items)
  );

  return v_invoice_id;
end;
$function$;

commit;
