-- ============================================================================
-- SaaS subscription billing foundation (Phase 1 + manual invoice generation)
-- ----------------------------------------------------------------------------
-- Placeholder pricing is intentional for now:
-- - base monthly price: 50.00
-- - included stations: 1
-- - per extra station: 79.00
-- - card surcharge: 4.00%
--
-- Temur will lock final pricing later. This schema/RPC foundation is designed
-- so plan amounts can be edited without reworking invoice math.
-- ============================================================================

create table if not exists public.subscription_plans (
  id uuid primary key default gen_random_uuid(),
  plan_code text not null unique,
  display_name text not null,
  base_price_monthly numeric(10,2) not null,
  included_stations integer not null default 1,
  per_extra_station_price numeric(10,2) not null default 79.00,
  card_surcharge_pct numeric(5,2) not null default 4.00,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint subscription_plans_base_price_nonnegative check (base_price_monthly >= 0),
  constraint subscription_plans_included_stations_nonnegative check (included_stations >= 0),
  constraint subscription_plans_extra_station_nonnegative check (per_extra_station_price >= 0),
  constraint subscription_plans_surcharge_nonnegative check (card_surcharge_pct >= 0)
);
create table if not exists public.merchant_subscriptions (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  plan_id uuid not null references public.subscription_plans(id),
  started_at timestamptz not null default now(),
  current_period_start date not null,
  current_period_end date not null,
  next_billing_date date not null,
  station_count integer not null default 1,
  monthly_amount numeric(10,2) not null,
  status text not null default 'active' check (
    status in ('trial', 'active', 'past_due', 'suspended', 'canceled')
  ),
  trial_ends_at timestamptz,
  canceled_at timestamptz,
  cancel_reason text,
  billing_profile_id uuid references public.merchant_billing_profiles(id),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (location_id),
  constraint merchant_subscriptions_station_count_positive check (station_count >= 0),
  constraint merchant_subscriptions_monthly_amount_nonnegative check (monthly_amount >= 0),
  constraint merchant_subscriptions_period_order check (current_period_end >= current_period_start)
);
create table if not exists public.subscription_invoices (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references public.merchant_subscriptions(id) on delete cascade,
  merchant_id uuid not null references public.merchants(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  invoice_number text not null unique,
  billing_period_start date not null,
  billing_period_end date not null,
  station_count_snapshot integer not null default 1,
  billing_method text not null check (billing_method in ('ach', 'card')),
  line_items jsonb not null default '[]'::jsonb,
  subtotal numeric(10,2) not null,
  card_surcharge numeric(10,2) not null default 0,
  total_amount numeric(10,2) not null,
  status text not null default 'open' check (
    status in ('open', 'processing', 'paid', 'failed', 'refunded', 'voided')
  ),
  due_date date not null,
  paid_at timestamptz,
  payment_attempt_count integer not null default 0,
  last_payment_attempt_at timestamptz,
  last_payment_error text,
  billing_profile_id uuid references public.merchant_billing_profiles(id),
  nmi_transaction_id text,
  nmi_response jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint subscription_invoices_station_snapshot_nonnegative check (station_count_snapshot >= 0),
  constraint subscription_invoices_subtotal_nonnegative check (subtotal >= 0),
  constraint subscription_invoices_surcharge_nonnegative check (card_surcharge >= 0),
  constraint subscription_invoices_total_nonnegative check (total_amount >= 0),
  constraint subscription_invoices_period_order check (billing_period_end >= billing_period_start)
);
create table if not exists public.subscription_invoice_sequences (
  yearmonth text primary key,
  last_number integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint subscription_invoice_sequences_yearmonth_format check (yearmonth ~ '^[0-9]{6}$'),
  constraint subscription_invoice_sequences_last_number_nonnegative check (last_number >= 0)
);
create unique index if not exists uq_subscription_invoices_period
  on public.subscription_invoices(subscription_id, billing_period_start);
create index if not exists idx_merchant_subscriptions_merchant
  on public.merchant_subscriptions(merchant_id);
create index if not exists idx_merchant_subscriptions_status_next_billing
  on public.merchant_subscriptions(status, next_billing_date);
create index if not exists idx_subscription_invoices_merchant_status_due
  on public.subscription_invoices(merchant_id, status, due_date);
create index if not exists idx_subscription_invoices_location
  on public.subscription_invoices(location_id, created_at desc);
drop trigger if exists update_subscription_plans_updated_at on public.subscription_plans;
create trigger update_subscription_plans_updated_at
before update on public.subscription_plans
for each row execute function public.update_updated_at_column();
drop trigger if exists update_merchant_subscriptions_updated_at on public.merchant_subscriptions;
create trigger update_merchant_subscriptions_updated_at
before update on public.merchant_subscriptions
for each row execute function public.update_updated_at_column();
drop trigger if exists update_subscription_invoices_updated_at on public.subscription_invoices;
create trigger update_subscription_invoices_updated_at
before update on public.subscription_invoices
for each row execute function public.update_updated_at_column();
drop trigger if exists update_subscription_invoice_sequences_updated_at on public.subscription_invoice_sequences;
create trigger update_subscription_invoice_sequences_updated_at
before update on public.subscription_invoice_sequences
for each row execute function public.update_updated_at_column();
alter table public.subscription_plans enable row level security;
alter table public.subscription_plans force row level security;
alter table public.merchant_subscriptions enable row level security;
alter table public.merchant_subscriptions force row level security;
alter table public.subscription_invoices enable row level security;
alter table public.subscription_invoices force row level security;
drop policy if exists subscription_plans_read on public.subscription_plans;
create policy subscription_plans_read
on public.subscription_plans
for select
using (true);
drop policy if exists subscription_plans_manage_hq on public.subscription_plans;
create policy subscription_plans_manage_hq
on public.subscription_plans
for all
using (public.is_dexapos_admin())
with check (public.is_dexapos_admin());
drop policy if exists merchant_subscriptions_self on public.merchant_subscriptions;
create policy merchant_subscriptions_self
on public.merchant_subscriptions
for select
using (
  public.user_belongs_to_merchant(merchant_id)
  or public.is_dexapos_admin()
);
drop policy if exists merchant_subscriptions_manage_hq on public.merchant_subscriptions;
create policy merchant_subscriptions_manage_hq
on public.merchant_subscriptions
for all
using (public.is_dexapos_admin())
with check (public.is_dexapos_admin());
drop policy if exists subscription_invoices_self on public.subscription_invoices;
create policy subscription_invoices_self
on public.subscription_invoices
for select
using (
  public.user_belongs_to_merchant(merchant_id)
  or public.is_dexapos_admin()
);
drop policy if exists subscription_invoices_manage_hq on public.subscription_invoices;
create policy subscription_invoices_manage_hq
on public.subscription_invoices
for all
using (public.is_dexapos_admin())
with check (public.is_dexapos_admin());
grant select on public.subscription_plans to authenticated, service_role;
grant select on public.merchant_subscriptions to authenticated, service_role;
grant select on public.subscription_invoices to authenticated, service_role;
grant all on public.subscription_plans to service_role;
grant all on public.merchant_subscriptions to service_role;
grant all on public.subscription_invoices to service_role;
grant all on public.subscription_invoice_sequences to service_role;
create or replace function public.log_subscription_billing_event(
  p_action text,
  p_merchant_id uuid,
  p_location_id uuid default null,
  p_resource_type text default null,
  p_resource_name text default null,
  p_resource_id uuid default null,
  p_changes jsonb default '{}'::jsonb,
  p_metadata jsonb default '{}'::jsonb,
  p_status text default 'success',
  p_error_message text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
begin
  insert into public.audit_logs (
    actor_user_id,
    action,
    action_category,
    severity,
    resource_type,
    resource_name,
    resource_id,
    changes,
    metadata,
    status,
    error_message,
    merchant_id,
    location_id
  ) values (
    public.current_user_id(),
    p_action,
    'billing',
    case when p_status = 'success' then 'info' else 'warning' end,
    p_resource_type,
    p_resource_name,
    p_resource_id,
    coalesce(p_changes, '{}'::jsonb),
    coalesce(p_metadata, '{}'::jsonb),
    p_status,
    p_error_message,
    p_merchant_id,
    p_location_id
  );
end;
$function$;
revoke all on function public.log_subscription_billing_event(text, uuid, uuid, text, text, uuid, jsonb, jsonb, text, text) from public;
grant execute on function public.log_subscription_billing_event(text, uuid, uuid, text, text, uuid, jsonb, jsonb, text, text) to authenticated, service_role;
create or replace function public.get_active_station_count(
  p_location_id uuid
)
returns integer
language sql
stable
security definer
set search_path = ''
as $function$
  select count(*)::integer
  from public.stations s
  where s.location_id = p_location_id
    and s.is_active = true
    and s.deactivated_at is null;
$function$;
revoke all on function public.get_active_station_count(uuid) from public;
grant execute on function public.get_active_station_count(uuid) to authenticated, service_role;
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
begin
  select *
  into v_plan
  from public.subscription_plans sp
  where sp.id = p_plan_id;

  if not found then
    raise exception 'Subscription plan not found: %', p_plan_id;
  end if;

  v_overage := greatest(coalesce(p_station_count, 0) - v_plan.included_stations, 0);
  v_subtotal := round(
    v_plan.base_price_monthly
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
    v_plan.base_price_monthly,
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
create or replace function public.generate_subscription_invoice_number(
  p_for_date date default current_date
)
returns text
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_yearmonth text := to_char(coalesce(p_for_date, current_date), 'YYYYMM');
  v_next_number integer;
begin
  insert into public.subscription_invoice_sequences (yearmonth, last_number)
  values (v_yearmonth, 0)
  on conflict (yearmonth) do nothing;

  update public.subscription_invoice_sequences
  set last_number = last_number + 1
  where yearmonth = v_yearmonth
  returning last_number into v_next_number;

  return 'SUB-' || v_yearmonth || '-' || lpad(v_next_number::text, 4, '0');
end;
$function$;
revoke all on function public.generate_subscription_invoice_number(date) from public;
grant execute on function public.generate_subscription_invoice_number(date) to authenticated, service_role;
create or replace function public.list_subscription_plans()
returns setof public.subscription_plans
language sql
stable
security definer
set search_path = ''
as $function$
  select sp.*
  from public.subscription_plans sp
  where sp.is_active = true
  order by sp.display_name asc;
$function$;
revoke all on function public.list_subscription_plans() from public;
grant execute on function public.list_subscription_plans() to authenticated, service_role;
create or replace function public.upsert_subscription_plan(
  p_plan_id uuid default null,
  p_plan_code text default null,
  p_display_name text default null,
  p_base_price_monthly numeric default null,
  p_included_stations integer default 1,
  p_per_extra_station_price numeric default 79.00,
  p_card_surcharge_pct numeric default 4.00,
  p_is_active boolean default true,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_plan_id uuid;
begin
  if not (public.is_dexapos_admin() or coalesce(auth.jwt()->>'role', '') = 'service_role') then
    raise exception 'Only HQ can manage subscription plans';
  end if;

  if coalesce(btrim(p_plan_code), '') = '' then
    raise exception 'Plan code is required';
  end if;

  if coalesce(btrim(p_display_name), '') = '' then
    raise exception 'Display name is required';
  end if;

  if p_base_price_monthly is null or p_base_price_monthly < 0 then
    raise exception 'Base price must be non-negative';
  end if;

  insert into public.subscription_plans (
    id,
    plan_code,
    display_name,
    base_price_monthly,
    included_stations,
    per_extra_station_price,
    card_surcharge_pct,
    is_active,
    metadata
  ) values (
    coalesce(p_plan_id, gen_random_uuid()),
    upper(btrim(p_plan_code)),
    btrim(p_display_name),
    round(p_base_price_monthly, 2),
    greatest(coalesce(p_included_stations, 1), 0),
    round(coalesce(p_per_extra_station_price, 79.00), 2),
    round(coalesce(p_card_surcharge_pct, 4.00), 2),
    coalesce(p_is_active, true),
    coalesce(p_metadata, '{}'::jsonb)
  )
  on conflict (plan_code) do update
  set
    display_name = excluded.display_name,
    base_price_monthly = excluded.base_price_monthly,
    included_stations = excluded.included_stations,
    per_extra_station_price = excluded.per_extra_station_price,
    card_surcharge_pct = excluded.card_surcharge_pct,
    is_active = excluded.is_active,
    metadata = excluded.metadata,
    updated_at = now()
  returning id into v_plan_id;

  perform public.log_subscription_billing_event(
    'subscription_plan_changed',
    null,
    null,
    'subscription_plan',
    upper(btrim(p_plan_code)),
    v_plan_id,
    jsonb_build_object(
      'display_name', p_display_name,
      'base_price_monthly', p_base_price_monthly,
      'included_stations', p_included_stations,
      'per_extra_station_price', p_per_extra_station_price,
      'card_surcharge_pct', p_card_surcharge_pct,
      'is_active', p_is_active
    ),
    coalesce(p_metadata, '{}'::jsonb)
  );

  return v_plan_id;
end;
$function$;
revoke all on function public.upsert_subscription_plan(uuid, text, text, numeric, integer, numeric, numeric, boolean, jsonb) from public;
grant execute on function public.upsert_subscription_plan(uuid, text, text, numeric, integer, numeric, numeric, boolean, jsonb) to authenticated, service_role;
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
  v_monthly_amount numeric(10,2);
  v_billing_method text := 'card';
  v_resolved_billing_profile_id uuid;
  v_calc record;
  v_location_merchant_id uuid;
begin
  if not (public.is_dexapos_admin() or coalesce(auth.jwt()->>'role', '') = 'service_role') then
    raise exception 'Only HQ can manage merchant subscriptions';
  end if;

  if p_merchant_id is null or p_location_id is null or p_plan_id is null then
    raise exception 'merchant, location, and plan are required';
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

  select *
  into v_calc
  from public.calculate_subscription_amounts(
    p_plan_id,
    v_station_count,
    coalesce(v_billing_method, 'card')
  );

  v_monthly_amount := v_calc.total_amount;

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
    p_plan_id,
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
    monthly_amount = excluded.monthly_amount,
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
      'plan_id', p_plan_id,
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
    ms.billing_profile_id,
    mbp.billing_method,
    ms.metadata,
    ms.created_at,
    ms.updated_at
  from public.merchant_subscriptions ms
  join public.subscription_plans sp on sp.id = ms.plan_id
  join public.locations l on l.id = ms.location_id
  left join public.merchant_billing_profiles mbp on mbp.id = ms.billing_profile_id
  where p_merchant_id is null or ms.merchant_id = p_merchant_id
  order by l.name asc, ms.created_at desc;
end;
$function$;
revoke all on function public.list_merchant_subscriptions(uuid) from public;
grant execute on function public.list_merchant_subscriptions(uuid) to authenticated, service_role;
create or replace function public.list_subscription_invoices(
  p_merchant_id uuid default null,
  p_location_id uuid default null,
  p_limit integer default 100
)
returns table (
  id uuid,
  subscription_id uuid,
  merchant_id uuid,
  location_id uuid,
  location_name text,
  invoice_number text,
  billing_period_start date,
  billing_period_end date,
  station_count_snapshot integer,
  billing_method text,
  subtotal numeric(10,2),
  card_surcharge numeric(10,2),
  total_amount numeric(10,2),
  status text,
  due_date date,
  paid_at timestamptz,
  payment_attempt_count integer,
  last_payment_attempt_at timestamptz,
  last_payment_error text,
  nmi_transaction_id text,
  nmi_response jsonb,
  line_items jsonb,
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
    si.id,
    si.subscription_id,
    si.merchant_id,
    si.location_id,
    l.name as location_name,
    si.invoice_number,
    si.billing_period_start,
    si.billing_period_end,
    si.station_count_snapshot,
    si.billing_method,
    si.subtotal,
    si.card_surcharge,
    si.total_amount,
    si.status,
    si.due_date,
    si.paid_at,
    si.payment_attempt_count,
    si.last_payment_attempt_at,
    si.last_payment_error,
    si.nmi_transaction_id,
    si.nmi_response,
    si.line_items,
    si.metadata,
    si.created_at,
    si.updated_at
  from public.subscription_invoices si
  join public.locations l on l.id = si.location_id
  where (p_merchant_id is null or si.merchant_id = p_merchant_id)
    and (p_location_id is null or si.location_id = p_location_id)
  order by si.created_at desc
  limit greatest(coalesce(p_limit, 100), 1);
end;
$function$;
revoke all on function public.list_subscription_invoices(uuid, uuid, integer) from public;
grant execute on function public.list_subscription_invoices(uuid, uuid, integer) to authenticated, service_role;
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
  v_line_items jsonb;
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

  select *
  into v_plan
  from public.subscription_plans sp
  where sp.id = v_subscription.plan_id;

  if not found then
    raise exception 'Subscription plan not found for subscription %', p_subscription_id;
  end if;

  if v_subscription.billing_profile_id is not null then
    select mbp.billing_method
    into v_billing_method
    from public.merchant_billing_profiles mbp
    where mbp.id = v_subscription.billing_profile_id
      and mbp.is_active = true;
  end if;

  v_station_count := public.get_active_station_count(v_subscription.location_id);

  select *
  into v_calc
  from public.calculate_subscription_amounts(
    v_subscription.plan_id,
    v_station_count,
    coalesce(v_billing_method, 'card')
  );

  v_invoice_number := public.generate_subscription_invoice_number(v_subscription.next_billing_date);

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
    v_calc.subtotal,
    v_calc.card_surcharge,
    v_calc.total_amount,
    'open',
    coalesce(p_due_date, v_subscription.next_billing_date),
    v_subscription.billing_profile_id,
    jsonb_build_object(
      'plan_code', v_plan.plan_code,
      'included_stations', v_plan.included_stations,
      'per_extra_station_price', v_plan.per_extra_station_price,
      'card_surcharge_pct', v_plan.card_surcharge_pct
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
      'subtotal', v_calc.subtotal,
      'card_surcharge', v_calc.card_surcharge,
      'total_amount', v_calc.total_amount
    ),
    jsonb_build_object('line_items', v_line_items)
  );

  return v_invoice_id;
end;
$function$;
revoke all on function public.generate_subscription_invoice(uuid, date) from public;
grant execute on function public.generate_subscription_invoice(uuid, date) to authenticated, service_role;
insert into public.subscription_plans (
  plan_code,
  display_name,
  base_price_monthly,
  included_stations,
  per_extra_station_price,
  card_surcharge_pct,
  is_active,
  metadata
) values
  (
    'STANDARD',
    'Standard (Placeholder)',
    50.00,
    1,
    79.00,
    4.00,
    true,
    jsonb_build_object('placeholder_pricing', true)
  ),
  (
    'PRO',
    'Pro (Placeholder)',
    99.00,
    2,
    79.00,
    4.00,
    true,
    jsonb_build_object('placeholder_pricing', true)
  ),
  (
    'FRANCHISE',
    'Franchise (Placeholder)',
    149.00,
    3,
    79.00,
    4.00,
    true,
    jsonb_build_object('placeholder_pricing', true)
  )
on conflict (plan_code) do nothing;
