-- ============================================================================
-- Subscription billing refactor: service catalog + per-location assignments
-- ----------------------------------------------------------------------------
-- Goal:
-- - keep one merchant_subscription row per location for lifecycle state
-- - move pricing to billable service assignments per subscription/location
-- - keep invoice generation backward-compatible with legacy plan-only rows
-- ============================================================================

create table if not exists public.billable_services (
  id uuid primary key default gen_random_uuid(),
  service_code text not null unique,
  display_name text not null,
  service_category text not null check (service_category in ('hardware', 'software', 'service')),
  pricing_model text not null check (pricing_model in ('flat', 'per_unit', 'tiered')),
  base_price_monthly numeric(10,2) not null,
  additional_unit_price numeric(10,2),
  included_quantity integer not null default 1,
  card_surcharge_pct numeric(5,2) not null default 4.00,
  unit_label text not null default 'unit',
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint billable_services_base_price_nonnegative check (base_price_monthly >= 0),
  constraint billable_services_additional_price_nonnegative check (additional_unit_price is null or additional_unit_price >= 0),
  constraint billable_services_included_quantity_nonnegative check (included_quantity >= 0),
  constraint billable_services_surcharge_nonnegative check (card_surcharge_pct >= 0)
);

create table if not exists public.merchant_subscription_services (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references public.merchant_subscriptions(id) on delete cascade,
  service_id uuid not null references public.billable_services(id),
  quantity integer not null default 1,
  is_enabled boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (subscription_id, service_id),
  constraint merchant_subscription_services_quantity_nonnegative check (quantity >= 0)
);

create index if not exists idx_billable_services_active
  on public.billable_services(is_active, service_category, pricing_model);

create index if not exists idx_merchant_subscription_services_subscription
  on public.merchant_subscription_services(subscription_id);

drop trigger if exists update_billable_services_updated_at on public.billable_services;
create trigger update_billable_services_updated_at
before update on public.billable_services
for each row execute function public.update_updated_at_column();

drop trigger if exists update_merchant_subscription_services_updated_at on public.merchant_subscription_services;
create trigger update_merchant_subscription_services_updated_at
before update on public.merchant_subscription_services
for each row execute function public.update_updated_at_column();

alter table public.billable_services enable row level security;
alter table public.billable_services force row level security;
alter table public.merchant_subscription_services enable row level security;
alter table public.merchant_subscription_services force row level security;

drop policy if exists billable_services_read on public.billable_services;
create policy billable_services_read
on public.billable_services
for select
using (true);

drop policy if exists billable_services_manage_hq on public.billable_services;
create policy billable_services_manage_hq
on public.billable_services
for all
using (public.is_dexapos_admin())
with check (public.is_dexapos_admin());

drop policy if exists merchant_subscription_services_self on public.merchant_subscription_services;
create policy merchant_subscription_services_self
on public.merchant_subscription_services
for select
using (
  exists (
    select 1
    from public.merchant_subscriptions ms
    where ms.id = merchant_subscription_services.subscription_id
      and (
        public.user_belongs_to_merchant(ms.merchant_id)
        or public.is_dexapos_admin()
      )
  )
);

drop policy if exists merchant_subscription_services_manage_hq on public.merchant_subscription_services;
create policy merchant_subscription_services_manage_hq
on public.merchant_subscription_services
for all
using (public.is_dexapos_admin())
with check (public.is_dexapos_admin());

grant select on public.billable_services to authenticated, service_role;
grant select on public.merchant_subscription_services to authenticated, service_role;
grant all on public.billable_services to service_role;
grant all on public.merchant_subscription_services to service_role;

insert into public.subscription_plans (
  plan_code,
  display_name,
  base_price_monthly,
  included_stations,
  per_extra_station_price,
  card_surcharge_pct,
  is_active,
  metadata
) values (
  'SERVICE_CATALOG',
  'Service Catalog',
  0.00,
  0,
  0.00,
  4.00,
  true,
  jsonb_build_object('internal_placeholder', true, 'pricing_model', 'service_catalog')
)
on conflict (plan_code) do nothing;

create or replace function public.calculate_billable_service_amounts(
  p_service_id uuid,
  p_quantity integer,
  p_billing_method text default 'card'
)
returns table (
  service_code text,
  display_name text,
  service_category text,
  pricing_model text,
  quantity integer,
  base_price_monthly numeric(10,2),
  additional_unit_price numeric(10,2),
  included_quantity integer,
  card_surcharge_pct numeric(5,2),
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
  v_service public.billable_services%rowtype;
  v_quantity integer := greatest(coalesce(p_quantity, 0), 0);
  v_subtotal numeric(10,2) := 0;
  v_surcharge numeric(10,2) := 0;
  v_included integer;
begin
  select *
  into v_service
  from public.billable_services bs
  where bs.id = p_service_id;

  if not found then
    raise exception 'Billable service not found: %', p_service_id;
  end if;

  v_included := greatest(coalesce(v_service.included_quantity, 1), 0);

  case v_service.pricing_model
    when 'flat' then
      v_subtotal := case when v_quantity > 0 then round(v_service.base_price_monthly, 2) else 0::numeric end;
    when 'per_unit' then
      v_subtotal := round(v_service.base_price_monthly * v_quantity, 2);
    when 'tiered' then
      v_subtotal := case
        when v_quantity <= 0 then 0::numeric
        when v_quantity <= v_included then round(v_service.base_price_monthly, 2)
        else round(
          v_service.base_price_monthly
          + ((v_quantity - v_included) * coalesce(v_service.additional_unit_price, 0)),
          2
        )
      end;
    else
      raise exception 'Unsupported pricing model: %', v_service.pricing_model;
  end case;

  v_surcharge := case
    when coalesce(p_billing_method, 'card') = 'card'
      then round(v_subtotal * (v_service.card_surcharge_pct / 100.0), 2)
    else 0::numeric
  end;

  return query
  select
    v_service.service_code,
    v_service.display_name,
    v_service.service_category,
    v_service.pricing_model,
    v_quantity,
    v_service.base_price_monthly,
    v_service.additional_unit_price,
    v_service.included_quantity,
    v_service.card_surcharge_pct,
    v_subtotal,
    v_surcharge,
    round(v_subtotal + v_surcharge, 2);
end;
$function$;

revoke all on function public.calculate_billable_service_amounts(uuid, integer, text) from public;
grant execute on function public.calculate_billable_service_amounts(uuid, integer, text) to authenticated, service_role;

create or replace function public.list_billable_services()
returns setof public.billable_services
language sql
stable
security definer
set search_path = ''
as $function$
  select bs.*
  from public.billable_services bs
  where bs.is_active = true
  order by bs.service_category asc, bs.display_name asc;
$function$;

revoke all on function public.list_billable_services() from public;
grant execute on function public.list_billable_services() to authenticated, service_role;

create or replace function public.list_subscription_service_assignments(
  p_subscription_id uuid
)
returns table (
  id uuid,
  subscription_id uuid,
  service_id uuid,
  service_code text,
  display_name text,
  service_category text,
  pricing_model text,
  unit_label text,
  quantity integer,
  is_enabled boolean,
  base_price_monthly numeric(10,2),
  additional_unit_price numeric(10,2),
  included_quantity integer,
  card_surcharge_pct numeric(5,2),
  metadata jsonb,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_merchant_id uuid;
begin
  select ms.merchant_id
  into v_merchant_id
  from public.merchant_subscriptions ms
  where ms.id = p_subscription_id;

  if v_merchant_id is null then
    raise exception 'Subscription not found: %', p_subscription_id;
  end if;

  if not (
    public.is_dexapos_admin()
    or coalesce(auth.jwt()->>'role', '') = 'service_role'
    or public.user_belongs_to_merchant(v_merchant_id)
  ) then
    raise exception 'Unauthorized subscription access';
  end if;

  return query
  select
    mss.id,
    mss.subscription_id,
    mss.service_id,
    bs.service_code,
    bs.display_name,
    bs.service_category,
    bs.pricing_model,
    bs.unit_label,
    mss.quantity,
    mss.is_enabled,
    bs.base_price_monthly,
    bs.additional_unit_price,
    bs.included_quantity,
    bs.card_surcharge_pct,
    mss.metadata,
    mss.created_at,
    mss.updated_at
  from public.merchant_subscription_services mss
  join public.billable_services bs on bs.id = mss.service_id
  where mss.subscription_id = p_subscription_id
  order by bs.service_category asc, bs.display_name asc;
end;
$function$;

revoke all on function public.list_subscription_service_assignments(uuid) from public;
grant execute on function public.list_subscription_service_assignments(uuid) to authenticated, service_role;

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
    and mss.is_enabled = true;

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

revoke all on function public.replace_merchant_subscription_services(uuid, jsonb) from public;
grant execute on function public.replace_merchant_subscription_services(uuid, jsonb) to authenticated, service_role;

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
    order by mbp.created_at desc
    limit 1;
  else
    select mbp.billing_method
    into v_billing_method
    from public.merchant_billing_profiles mbp
    where mbp.id = v_resolved_billing_profile_id
      and mbp.merchant_id = p_merchant_id
      and mbp.is_active = true
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
    select *
    into v_plan
    from public.subscription_plans sp
    where sp.id = v_subscription.plan_id;

    if not found then
      raise exception 'Subscription plan not found for subscription %', p_subscription_id;
    end if;

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
        'unit_price', v_plan.base_price_monthly,
        'amount', v_plan.base_price_monthly
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
) values
  (
    'pos_tablet',
    'POS Tablet',
    'hardware',
    'tiered',
    50.00,
    39.00,
    1,
    4.00,
    'tablet',
    true,
    jsonb_build_object('seeded_from', 'service_catalog_refactor')
  ),
  (
    'kds',
    'KDS Display',
    'hardware',
    'per_unit',
    25.00,
    null,
    0,
    4.00,
    'device',
    true,
    jsonb_build_object('seeded_from', 'service_catalog_refactor')
  ),
  (
    'loyalty',
    'Loyalty Program',
    'software',
    'flat',
    75.00,
    null,
    1,
    4.00,
    'service',
    true,
    jsonb_build_object('seeded_from', 'service_catalog_refactor')
  ),
  (
    'online_ordering',
    'Online Ordering',
    'service',
    'flat',
    100.00,
    null,
    1,
    4.00,
    'service',
    true,
    jsonb_build_object('seeded_from', 'service_catalog_refactor', 'includes_setup', true)
  ),
  (
    'orderout',
    'Orderout',
    'service',
    'flat',
    79.99,
    null,
    1,
    4.00,
    'service',
    true,
    jsonb_build_object('seeded_from', 'service_catalog_refactor')
  )
on conflict (service_code) do update
set
  display_name = excluded.display_name,
  service_category = excluded.service_category,
  pricing_model = excluded.pricing_model,
  base_price_monthly = excluded.base_price_monthly,
  additional_unit_price = excluded.additional_unit_price,
  included_quantity = excluded.included_quantity,
  card_surcharge_pct = excluded.card_surcharge_pct,
  unit_label = excluded.unit_label,
  is_active = excluded.is_active,
  metadata = excluded.metadata,
  updated_at = now();
