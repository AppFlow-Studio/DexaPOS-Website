-- Allow merchant-tier billing to coexist with location service subscriptions
-- on the same anchor location subscription row.

update public.subscription_plans
set base_price_monthly = round((coalesce(monthly_price_cents, 0)::numeric / 100.0), 2)
where coalesce(plan_scope, 'service_billing') = 'merchant_tier';
create or replace function public.calculate_subscription_amounts(
  p_plan_id uuid,
  p_station_count integer,
  p_billing_method text default 'card'
)
returns table (
  base_price_monthly numeric(10,2),
  included_stations integer,
  per_extra_station_price numeric(10,2),
  card_surcharge_pct numeric(5,2),
  station_overage integer,
  subtotal numeric(10,2),
  card_surcharge numeric(10,2),
  total_amount numeric(10,2)
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_plan public.subscription_plans%rowtype;
  v_overage integer;
  v_subtotal numeric(10,2);
  v_surcharge numeric(10,2);
  v_effective_base_price numeric(10,2);
begin
  select *
  into v_plan
  from public.subscription_plans sp
  where sp.id = p_plan_id;

  if not found then
    raise exception 'Subscription plan not found: %', p_plan_id;
  end if;

  v_effective_base_price := case
    when coalesce(v_plan.plan_scope, 'service_billing') = 'merchant_tier'
      then round((coalesce(v_plan.monthly_price_cents, 0)::numeric / 100.0), 2)
    else v_plan.base_price_monthly
  end;

  v_overage := greatest(coalesce(p_station_count, 0) - v_plan.included_stations, 0);
  v_subtotal := round(
    v_effective_base_price
    + (v_overage * v_plan.per_extra_station_price),
    2
  );
  v_surcharge := case
    when coalesce(p_billing_method, 'card') = 'card'
      then round(v_subtotal * (v_plan.card_surcharge_pct / 100.0), 2)
    else 0::numeric
  end;

  return query
  select
    v_effective_base_price,
    v_plan.included_stations,
    v_plan.per_extra_station_price,
    v_plan.card_surcharge_pct,
    v_overage,
    v_subtotal,
    v_surcharge,
    round(v_subtotal + v_surcharge, 2);
end;
$function$;
revoke all on function public.calculate_subscription_amounts(uuid, integer, text) from public;
grant execute on function public.calculate_subscription_amounts(uuid, integer, text) to authenticated, service_role;
create or replace function public.upsert_merchant_subscription(
  p_subscription_id uuid default null,
  p_merchant_id uuid default null,
  p_location_id uuid default null,
  p_plan_id uuid default null,
  p_current_period_start date default null,
  p_current_period_end date default null,
  p_next_billing_date date default null,
  p_status text default 'active',
  p_trial_ends_at timestamptz default null,
  p_billing_profile_id uuid default null,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_subscription_id uuid;
  v_station_count integer;
  v_monthly_amount numeric(10,2) := 0;
  v_billing_method text := 'card';
  v_resolved_billing_profile_id uuid;
  v_calc record;
  v_location_merchant_id uuid;
  v_effective_plan_id uuid := p_plan_id;
  v_service_catalog_plan_id uuid;
  v_existing_subscription_id uuid;
  v_existing_plan_id uuid;
  v_existing_plan_scope text;
begin
  if not (public.is_dexapos_admin() or coalesce(auth.jwt()->>'role', '') = 'service_role') then
    raise exception 'Only HQ can manage merchant subscriptions';
  end if;

  if p_merchant_id is null or p_location_id is null then
    raise exception 'merchant and location are required';
  end if;

  select l.merchant_id
  into v_location_merchant_id
  from public.locations l
  where l.id = p_location_id;

  if v_location_merchant_id is distinct from p_merchant_id then
    raise exception 'Location % does not belong to merchant %', p_location_id, p_merchant_id;
  end if;

  if p_current_period_start is null or p_current_period_end is null or p_next_billing_date is null then
    raise exception 'Current period dates and next billing date are required';
  end if;

  select sp.id
  into v_service_catalog_plan_id
  from public.subscription_plans sp
  where sp.plan_code = 'SERVICE_CATALOG'
  limit 1;

  if v_service_catalog_plan_id is null then
    raise exception 'Service Catalog plan placeholder is missing';
  end if;

  select
    ms.id,
    ms.plan_id,
    coalesce(sp.plan_scope, 'service_billing')
  into
    v_existing_subscription_id,
    v_existing_plan_id,
    v_existing_plan_scope
  from public.merchant_subscriptions ms
  left join public.subscription_plans sp on sp.id = ms.plan_id
  where ms.location_id = p_location_id
  limit 1;

  if v_effective_plan_id is null then
    if v_existing_subscription_id is not null and v_existing_plan_scope = 'merchant_tier' then
      v_effective_plan_id := v_existing_plan_id;
    else
      v_effective_plan_id := v_service_catalog_plan_id;
    end if;
  end if;

  v_resolved_billing_profile_id := p_billing_profile_id;

  if v_resolved_billing_profile_id is null then
    select mbp.id, mbp.billing_method
    into v_resolved_billing_profile_id, v_billing_method
    from public.merchant_billing_profiles mbp
    where mbp.merchant_id = p_merchant_id
      and mbp.is_active = true
      and mbp.is_primary = true
      and (mbp.location_id = p_location_id or mbp.location_id is null)
    order by
      case when mbp.location_id = p_location_id then 0 else 1 end,
      mbp.created_at desc
    limit 1;
  else
    select mbp.billing_method
    into v_billing_method
    from public.merchant_billing_profiles mbp
    where mbp.id = v_resolved_billing_profile_id
      and mbp.merchant_id = p_merchant_id
      and mbp.is_active = true
      and (mbp.location_id = p_location_id or mbp.location_id is null)
    limit 1;
  end if;

  v_station_count := public.get_active_station_count(p_location_id);

  if v_effective_plan_id is distinct from v_service_catalog_plan_id then
    select *
    into v_calc
    from public.calculate_subscription_amounts(
      v_effective_plan_id,
      v_station_count,
      coalesce(v_billing_method, 'card')
    );

    v_monthly_amount := v_calc.total_amount;
  end if;

  insert into public.merchant_subscriptions (
    id,
    merchant_id,
    location_id,
    plan_id,
    current_period_start,
    current_period_end,
    next_billing_date,
    station_count,
    monthly_amount,
    status,
    trial_ends_at,
    billing_profile_id,
    metadata
  ) values (
    coalesce(p_subscription_id, v_existing_subscription_id, gen_random_uuid()),
    p_merchant_id,
    p_location_id,
    v_effective_plan_id,
    p_current_period_start,
    p_current_period_end,
    p_next_billing_date,
    v_station_count,
    v_monthly_amount,
    coalesce(p_status, 'active'),
    p_trial_ends_at,
    v_resolved_billing_profile_id,
    coalesce(p_metadata, '{}'::jsonb)
  )
  on conflict (location_id) do update
  set
    plan_id = excluded.plan_id,
    current_period_start = excluded.current_period_start,
    current_period_end = excluded.current_period_end,
    next_billing_date = excluded.next_billing_date,
    station_count = excluded.station_count,
    status = excluded.status,
    trial_ends_at = excluded.trial_ends_at,
    billing_profile_id = coalesce(excluded.billing_profile_id, public.merchant_subscriptions.billing_profile_id),
    metadata = coalesce(public.merchant_subscriptions.metadata, '{}'::jsonb) || excluded.metadata,
    updated_at = now()
  returning id into v_subscription_id;

  perform public.log_subscription_billing_event(
    'subscription_created',
    p_merchant_id,
    p_location_id,
    'merchant_subscription',
    null,
    v_subscription_id,
    jsonb_build_object(
      'plan_id', v_effective_plan_id,
      'status', coalesce(p_status, 'active'),
      'station_count', v_station_count,
      'monthly_amount', v_monthly_amount,
      'billing_profile_id', v_resolved_billing_profile_id
    ),
    coalesce(p_metadata, '{}'::jsonb)
  );

  return v_subscription_id;
end;
$function$;
revoke all on function public.upsert_merchant_subscription(uuid, uuid, uuid, uuid, date, date, date, text, timestamptz, uuid, jsonb) from public;
grant execute on function public.upsert_merchant_subscription(uuid, uuid, uuid, uuid, date, date, date, text, timestamptz, uuid, jsonb) to authenticated, service_role;
create or replace function public.generate_subscription_invoice(
  p_subscription_id uuid,
  p_due_date date default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_subscription public.merchant_subscriptions%rowtype;
  v_plan public.subscription_plans%rowtype;
  v_billing_method text := 'card';
  v_station_count integer;
  v_calc record;
  v_invoice_id uuid;
  v_invoice_number text;
  v_line_items jsonb := '[]'::jsonb;
  v_new_period_start date;
  v_new_period_end date;
  v_subtotal numeric(10,2) := 0;
  v_card_surcharge numeric(10,2) := 0;
  v_total_amount numeric(10,2) := 0;
  v_service_assignment_count integer := 0;
  v_plan_base_price numeric(10,2) := 0;
  v_plan_scope text := 'service_billing';
  v_tier_card_surcharge numeric(10,2) := 0;
  v_has_plan boolean := false;
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
  where ms.id = p_subscription_id;

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

  if v_subscription.plan_id is not null then
    select *
    into v_plan
    from public.subscription_plans sp
    where sp.id = v_subscription.plan_id;

    v_has_plan := found;

    if v_has_plan then
      v_plan_scope := coalesce(v_plan.plan_scope, 'service_billing');
      v_plan_base_price := case
        when v_plan_scope = 'merchant_tier'
          then round((coalesce(v_plan.monthly_price_cents, 0)::numeric / 100.0), 2)
        else v_plan.base_price_monthly
      end;
    end if;
  end if;

  v_station_count := public.get_active_station_count(v_subscription.location_id);

  select count(*)::integer
  into v_service_assignment_count
  from public.merchant_subscription_services mss
  where mss.subscription_id = v_subscription.id
    and mss.is_enabled = true
    and mss.quantity > 0;

  if v_service_assignment_count > 0 then
    select
      coalesce(
        jsonb_agg(
          jsonb_build_object(
            'code', calc.service_code,
            'description', calc.display_name,
            'category', calc.service_category,
            'pricing_model', calc.pricing_model,
            'quantity', calc.quantity,
            'unit_label', bs.unit_label,
            'base_price_monthly', calc.base_price_monthly,
            'additional_unit_price', calc.additional_unit_price,
            'included_quantity', calc.included_quantity,
            'subtotal', calc.subtotal,
            'card_surcharge', calc.card_surcharge,
            'total_amount', calc.total_amount
          )
          order by bs.service_category asc, bs.display_name asc
        ),
        '[]'::jsonb
      ),
      coalesce(sum(calc.subtotal), 0)::numeric(10,2),
      coalesce(sum(calc.card_surcharge), 0)::numeric(10,2),
      coalesce(sum(calc.total_amount), 0)::numeric(10,2)
    into v_line_items, v_subtotal, v_card_surcharge, v_total_amount
    from public.merchant_subscription_services mss
    join public.billable_services bs on bs.id = mss.service_id
    join lateral public.calculate_billable_service_amounts(
      mss.service_id,
      mss.quantity,
      coalesce(v_billing_method, 'card')
    ) calc on true
    where mss.subscription_id = v_subscription.id
      and mss.is_enabled = true
      and mss.quantity > 0;
  else
    if v_subscription.plan_id is null or not v_has_plan then
      raise exception 'Subscription plan not found for subscription %', p_subscription_id;
    end if;
  end if;

  if v_plan_scope = 'merchant_tier' and v_subscription.plan_id is not null then
    v_tier_card_surcharge := case
      when coalesce(v_billing_method, 'card') = 'card'
        then round(v_plan_base_price * (coalesce(v_plan.card_surcharge_pct, 0) / 100.0), 2)
      else 0::numeric
    end;

    v_line_items := v_line_items || jsonb_build_array(
      jsonb_build_object(
        'code', 'merchant_tier_base',
        'description', v_plan.display_name || ' monthly base',
        'quantity', 1,
        'unit_price', v_plan_base_price,
        'amount', v_plan_base_price
      )
    );

    if v_tier_card_surcharge > 0 then
      v_line_items := v_line_items || jsonb_build_array(
        jsonb_build_object(
          'code', 'merchant_tier_card_surcharge',
          'description', 'Card surcharge baked into merchant tier price',
          'quantity', 1,
          'unit_price', v_tier_card_surcharge,
          'amount', v_tier_card_surcharge
        )
      );
    end if;

    v_subtotal := round(v_subtotal + v_plan_base_price, 2);
    v_card_surcharge := round(v_card_surcharge + v_tier_card_surcharge, 2);
    v_total_amount := round(v_subtotal + v_card_surcharge, 2);
  elsif v_service_assignment_count = 0 then
    select *
    into v_calc
    from public.calculate_subscription_amounts(
      v_subscription.plan_id,
      v_station_count,
      coalesce(v_billing_method, 'card')
    );

    v_subtotal := v_calc.subtotal;
    v_card_surcharge := v_calc.card_surcharge;
    v_total_amount := v_calc.total_amount;

    v_line_items := jsonb_build_array(
      jsonb_build_object(
        'code', 'base_monthly',
        'description', v_plan.display_name || ' monthly base',
        'quantity', 1,
        'unit_price', v_plan_base_price,
        'amount', v_plan_base_price
      )
    );

    if v_calc.station_overage > 0 then
      v_line_items := v_line_items || jsonb_build_array(
        jsonb_build_object(
          'code', 'extra_stations',
          'description', 'Extra active stations beyond included count',
          'quantity', v_calc.station_overage,
          'unit_price', v_plan.per_extra_station_price,
          'amount', round(v_calc.station_overage * v_plan.per_extra_station_price, 2)
        )
      );
    end if;

    if v_calc.card_surcharge > 0 then
      v_line_items := v_line_items || jsonb_build_array(
        jsonb_build_object(
          'code', 'card_surcharge',
          'description', 'Card surcharge baked into displayed price',
          'quantity', 1,
          'unit_price', v_calc.card_surcharge,
          'amount', v_calc.card_surcharge
        )
      );
    end if;
  end if;

  v_invoice_number := public.generate_subscription_invoice_number(v_subscription.next_billing_date);

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
    v_line_items,
    v_subtotal,
    v_card_surcharge,
    v_total_amount,
    'open',
    coalesce(p_due_date, v_subscription.next_billing_date),
    v_subscription.billing_profile_id,
    coalesce(v_subscription.metadata, '{}'::jsonb) || jsonb_build_object(
      'service_assignment_count', v_service_assignment_count
    )
  )
  returning id into v_invoice_id;

  v_new_period_start := v_subscription.current_period_end + 1;
  v_new_period_end := (v_new_period_start + interval '1 month' - interval '1 day')::date;

  update public.merchant_subscriptions
  set
    station_count = v_station_count,
    monthly_amount = v_total_amount,
    current_period_start = v_new_period_start,
    current_period_end = v_new_period_end,
    next_billing_date = v_new_period_start,
    updated_at = now()
  where id = v_subscription.id;

  perform public.log_subscription_billing_event(
    'invoice_generated',
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
      'subtotal', v_subtotal,
      'card_surcharge', v_card_surcharge,
      'total_amount', v_total_amount,
      'service_assignment_count', v_service_assignment_count
    ),
    jsonb_build_object('line_items', v_line_items)
  );

  return v_invoice_id;
end;
$function$;
revoke all on function public.generate_subscription_invoice(uuid, date) from public;
grant execute on function public.generate_subscription_invoice(uuid, date) to authenticated, service_role;
