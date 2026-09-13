-- Comped (free) subscription services + website_builder billable service.
--
-- 1. A "comped" add-on is ENTITLED but bills $0. get_subscription_entitlement
--    already returns entitled=true for any enabled assignment (is_enabled +
--    quantity>0), so a comped service unlocks the feature. To make it free, the
--    two pricing paths (recalc_subscription, generate_subscription_invoice) must
--    SKIP assignments flagged metadata->>'comped' = 'true' when building the
--    priced services array. This powers HQ "enable for free" and grandfathering.
--
-- 2. Seed the website_builder billable service (no code existed for it). Price is
--    a placeholder — HQ tunes it in /manage/settings/billing-catalog.

begin;

-- ---------------------------------------------------------------------------
-- recalc_subscription: exclude comped assignments from pricing
-- (verbatim copy of 20260906120000 def + one comped filter line)
-- ---------------------------------------------------------------------------
create or replace function public.recalc_subscription(
  p_subscription_id uuid
)
returns table (
  subscription_id uuid,
  station_count integer,
  monthly_amount numeric(12,2),
  subtotal numeric(12,2),
  card_surcharge numeric(12,2),
  line_items jsonb
)
language plpgsql
security definer
set search_path = 'public', 'pg_temp'
as $function$
declare
  v_subscription public.merchant_subscriptions%rowtype;
  v_billing_method text := 'card';
  v_station_count integer := 0;
  v_services jsonb := '[]'::jsonb;
  v_calc record;
begin
  if not (
    public.is_dexapos_admin()
    or coalesce(auth.jwt()->>'role', '') = 'service_role'
  ) then
    raise exception 'Only HQ/system can recalculate subscriptions';
  end if;

  select *
  into v_subscription
  from public.merchant_subscriptions ms
  where ms.id = p_subscription_id
  for update;

  if not found then
    raise exception 'Subscription not found: %', p_subscription_id;
  end if;

  if v_subscription.metadata->>'billing_scope' = 'legacy' then
    raise exception 'Archived subscription pricing is read-only';
  end if;

  if v_subscription.billing_profile_id is not null then
    select mbp.billing_method
    into v_billing_method
    from public.merchant_billing_profiles mbp
    where mbp.id = v_subscription.billing_profile_id
      and mbp.is_active = true;
  end if;

  v_station_count := case when v_subscription.metadata->>'billing_scope' = 'merchant_tier'
    then 0 else public.get_active_station_count(v_subscription.location_id) end;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'service_id', mss.service_id,
        'quantity', mss.quantity
      )
      order by bs.service_category asc, bs.display_name asc
    ),
    '[]'::jsonb
  )
  into v_services
  from public.merchant_subscription_services mss
  join public.billable_services bs on bs.id = mss.service_id
  where mss.subscription_id = v_subscription.id
    and mss.is_enabled = true
    and mss.quantity > 0
    and coalesce(mss.metadata->>'comped', '') <> 'true';  -- comped add-ons bill $0

  select *
  into v_calc
  from public.calculate_subscription_total(
    v_subscription.plan_id,
    v_station_count,
    v_services,
    coalesce(v_billing_method, 'card')
  );

  update public.merchant_subscriptions
  set
    station_count = v_station_count,
    monthly_amount = v_calc.total_amount,
    metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
      'pricing_model', 'unified_calculator',
      'pricing_last_recalculated_at', now(),
      'pricing_subtotal', v_calc.subtotal,
      'pricing_card_surcharge', v_calc.card_surcharge
    ),
    updated_at = now()
  where id = v_subscription.id;

  perform public.log_subscription_billing_event(
    'subscription_recalculated',
    v_subscription.merchant_id,
    v_subscription.location_id,
    'merchant_subscription',
    null,
    v_subscription.id,
    jsonb_build_object(
      'old_monthly_amount', v_subscription.monthly_amount,
      'new_monthly_amount', v_calc.total_amount,
      'old_station_count', v_subscription.station_count,
      'new_station_count', v_station_count,
      'subtotal', v_calc.subtotal,
      'card_surcharge', v_calc.card_surcharge
    ),
    jsonb_build_object(
      'source', 'recalc_subscription',
      'line_items', v_calc.line_items
    )
  );

  return query
  select
    v_subscription.id,
    v_station_count,
    v_calc.total_amount::numeric(12,2),
    v_calc.subtotal::numeric(12,2),
    v_calc.card_surcharge::numeric(12,2),
    v_calc.line_items::jsonb;
end;
$function$;

-- ---------------------------------------------------------------------------
-- generate_subscription_invoice: exclude comped assignments from pricing
-- (verbatim copy of 20260909120000 def + one comped filter line)
-- ---------------------------------------------------------------------------
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
    and mss.quantity > 0
    and coalesce(mss.metadata->>'comped', '') <> 'true';  -- comped add-ons bill $0

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

-- ---------------------------------------------------------------------------
-- replace_merchant_subscription_services: exclude comped assignments from the
-- cached monthly_amount so it agrees with the invoice ($0 for comped).
-- (verbatim copy of 20260508173000 def + one comped filter line)
-- ---------------------------------------------------------------------------
create or replace function public.replace_merchant_subscription_services(
  p_subscription_id uuid,
  p_services jsonb default '[]'::jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_subscription public.merchant_subscriptions%rowtype;
  v_service_item jsonb;
  v_service_id uuid;
  v_quantity integer;
  v_enabled boolean;
  v_billing_method text := 'card';
  v_monthly_total numeric(10,2) := 0;
  v_service_count integer := 0;
begin
  if not (
    public.is_dexapos_admin()
    or coalesce(auth.jwt()->>'role', '') = 'service_role'
  ) then
    raise exception 'Only HQ/system can manage subscription service assignments';
  end if;

  select *
  into v_subscription
  from public.merchant_subscriptions ms
  where ms.id = p_subscription_id;

  if not found then
    raise exception 'Subscription not found: %', p_subscription_id;
  end if;

  if v_subscription.billing_profile_id is not null then
    select mbp.billing_method
    into v_billing_method
    from public.merchant_billing_profiles mbp
    where mbp.id = v_subscription.billing_profile_id
      and mbp.is_active = true;
  end if;

  delete from public.merchant_subscription_services
  where subscription_id = p_subscription_id;

  for v_service_item in
    select value
    from jsonb_array_elements(coalesce(p_services, '[]'::jsonb))
  loop
    begin
      v_service_id := nullif(btrim(v_service_item->>'service_id'), '')::uuid;
    exception when others then
      raise exception 'Invalid service_id in assignment payload';
    end;

    v_quantity := greatest(coalesce(nullif(v_service_item->>'quantity', '')::integer, 1), 0);
    v_enabled := coalesce((v_service_item->>'enabled')::boolean, true);

    if v_service_id is null or not v_enabled or v_quantity <= 0 then
      continue;
    end if;

    insert into public.merchant_subscription_services (
      subscription_id,
      service_id,
      quantity,
      is_enabled,
      metadata
    ) values (
      p_subscription_id,
      v_service_id,
      v_quantity,
      true,
      coalesce(v_service_item->'metadata', '{}'::jsonb)
    );
  end loop;

  select
    coalesce(sum(calc.total_amount), 0)::numeric(10,2),
    count(*)::integer
  into v_monthly_total, v_service_count
  from public.merchant_subscription_services mss
  join lateral public.calculate_billable_service_amounts(
    mss.service_id,
    mss.quantity,
    coalesce(v_billing_method, 'card')
  ) calc on true
  where mss.subscription_id = p_subscription_id
    and mss.is_enabled = true
    and coalesce(mss.metadata->>'comped', '') <> 'true';  -- comped add-ons bill $0

  update public.merchant_subscriptions
  set
    monthly_amount = v_monthly_total,
    metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
      'pricing_model', 'service_catalog',
      'assigned_service_count', v_service_count
    ),
    updated_at = now()
  where id = p_subscription_id;

  perform public.log_subscription_billing_event(
    'subscription_plan_changed',
    v_subscription.merchant_id,
    v_subscription.location_id,
    'merchant_subscription',
    null,
    p_subscription_id,
    jsonb_build_object(
      'assigned_service_count', v_service_count,
      'monthly_amount', v_monthly_total
    ),
    jsonb_build_object(
      'source', 'replace_merchant_subscription_services'
    )
  );
end;
$function$;

-- ---------------------------------------------------------------------------
-- website_builder billable service (placeholder price; HQ edits in catalog)
-- ---------------------------------------------------------------------------
insert into public.billable_services (
  service_code,
  display_name,
  service_category,
  pricing_model,
  base_price_monthly,
  additional_unit_price,
  included_quantity,
  card_surcharge_pct,
  unit_label,
  is_active,
  metadata
) values (
  'website_builder',
  'Website Builder',
  'software',
  'flat',
  49.00,
  null,
  1,
  4.00,
  'service',
  true,
  jsonb_build_object('seeded_from', 'self_service_feature_unlock', 'placeholder_price', true)
)
on conflict (service_code) do nothing;

commit;
