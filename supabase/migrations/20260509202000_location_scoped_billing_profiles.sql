alter table public.merchant_billing_profiles
  add column if not exists location_id uuid references public.locations(id) on delete cascade;

comment on column public.merchant_billing_profiles.location_id is
  'Optional location scope for the billing profile. Null means merchant-wide legacy profile; non-null means the billing method belongs to a specific location.';

drop index if exists public.uq_merchant_billing_profiles_primary;

create index if not exists idx_merchant_billing_profiles_location
  on public.merchant_billing_profiles(location_id)
  where location_id is not null;

create unique index if not exists uq_merchant_billing_profiles_primary_merchant_global
  on public.merchant_billing_profiles(merchant_id)
  where is_primary = true and is_active = true and location_id is null;

create unique index if not exists uq_merchant_billing_profiles_primary_merchant_location
  on public.merchant_billing_profiles(merchant_id, location_id)
  where is_primary = true and is_active = true and location_id is not null;

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

  if v_effective_plan_id is null then
    v_effective_plan_id := v_service_catalog_plan_id;
  end if;

  if v_effective_plan_id is null then
    raise exception 'Service Catalog plan placeholder is missing';
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
    coalesce(p_subscription_id, gen_random_uuid()),
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
    billing_profile_id = excluded.billing_profile_id,
    metadata = excluded.metadata,
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

create or replace function public.list_merchant_subscriptions(
  p_merchant_id uuid default null
)
returns table (
  id uuid,
  merchant_id uuid,
  location_id uuid,
  location_name text,
  plan_id uuid,
  plan_code text,
  display_name text,
  current_period_start date,
  current_period_end date,
  next_billing_date date,
  station_count integer,
  monthly_amount numeric(10,2),
  status text,
  trial_ends_at timestamptz,
  canceled_at timestamptz,
  cancel_reason text,
  billing_profile_id uuid,
  billing_method text,
  metadata jsonb,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if p_merchant_id is not null
     and not (
       public.is_dexapos_admin()
       or coalesce(auth.jwt()->>'role', '') = 'service_role'
       or public.user_belongs_to_merchant(p_merchant_id)
     ) then
    raise exception 'Unauthorized merchant access';
  end if;

  return query
  select
    ms.id,
    ms.merchant_id,
    ms.location_id,
    l.name as location_name,
    ms.plan_id,
    sp.plan_code,
    sp.display_name,
    ms.current_period_start,
    ms.current_period_end,
    ms.next_billing_date,
    ms.station_count,
    ms.monthly_amount,
    ms.status,
    ms.trial_ends_at,
    ms.canceled_at,
    ms.cancel_reason,
    coalesce(ms.billing_profile_id, resolved_profile.id) as billing_profile_id,
    coalesce(linked_profile.billing_method, resolved_profile.billing_method) as billing_method,
    ms.metadata,
    ms.created_at,
    ms.updated_at
  from public.merchant_subscriptions ms
  join public.subscription_plans sp on sp.id = ms.plan_id
  join public.locations l on l.id = ms.location_id
  left join public.merchant_billing_profiles linked_profile on linked_profile.id = ms.billing_profile_id
  left join lateral (
    select mbp.id, mbp.billing_method
    from public.merchant_billing_profiles mbp
    where mbp.merchant_id = ms.merchant_id
      and mbp.is_active = true
      and mbp.is_primary = true
      and (mbp.location_id = ms.location_id or mbp.location_id is null)
    order by
      case when mbp.location_id = ms.location_id then 0 else 1 end,
      mbp.created_at desc
    limit 1
  ) resolved_profile on true
  where p_merchant_id is null or ms.merchant_id = p_merchant_id
  order by l.name asc, ms.created_at desc;
end;
$function$;
