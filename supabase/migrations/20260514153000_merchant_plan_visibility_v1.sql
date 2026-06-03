-- Merchant subscription visibility V1
-- Adapts the merchant-facing plan visibility ticket onto the existing
-- subscription billing schema without breaking location-level service billing.

alter table public.subscription_plans
  add column if not exists plan_scope text not null default 'service_billing';
alter table public.subscription_plans
  drop constraint if exists subscription_plans_plan_scope_check;
alter table public.subscription_plans
  add constraint subscription_plans_plan_scope_check
  check (plan_scope in ('service_billing', 'merchant_tier'));
alter table public.subscription_plans
  add column if not exists min_locations int;
alter table public.subscription_plans
  add column if not exists max_locations int;
alter table public.subscription_plans
  add column if not exists monthly_price_cents int not null default 0;
alter table public.subscription_plans
  add column if not exists description text;
alter table public.subscription_plans
  add column if not exists display_order int not null default 0;
update public.subscription_plans
set
  description = coalesce(description, display_name),
  display_order = coalesce(display_order, 0),
  monthly_price_cents = coalesce(monthly_price_cents, 0),
  plan_scope = coalesce(plan_scope, 'service_billing')
where true;
create index if not exists idx_subscription_plans_scope_display_order
  on public.subscription_plans(plan_scope, display_order, display_name);
insert into public.subscription_plans (
  plan_code,
  display_name,
  base_price_monthly,
  included_stations,
  per_extra_station_price,
  card_surcharge_pct,
  metadata,
  plan_scope,
  min_locations,
  max_locations,
  monthly_price_cents,
  description,
  display_order,
  is_active
)
values
  ('basic', 'Basic', 0, 0, 0, 0, '{}'::jsonb, 'merchant_tier', 1, 1, 0, 'Single location', 1, true),
  ('multi_location', 'Multi-Location', 0, 0, 0, 0, '{}'::jsonb, 'merchant_tier', 2, 5, 0, 'Up to 5 locations', 2, true),
  ('franchise', 'Franchise', 0, 0, 0, 0, '{}'::jsonb, 'merchant_tier', 6, null, 0, 'Unlimited locations', 3, true)
on conflict (plan_code) do update
set
  display_name = excluded.display_name,
  plan_scope = excluded.plan_scope,
  min_locations = excluded.min_locations,
  max_locations = excluded.max_locations,
  monthly_price_cents = excluded.monthly_price_cents,
  description = excluded.description,
  display_order = excluded.display_order,
  is_active = true;
create table if not exists public.merchant_plan_subscriptions (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants(id) on delete cascade,
  plan_id uuid not null references public.subscription_plans(id),
  status text not null,
  current_period_start timestamptz not null,
  current_period_end timestamptz not null,
  trial_ends_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint merchant_plan_subscriptions_status_check
    check (status in ('active', 'past_due', 'suspended', 'cancelled')),
  constraint merchant_plan_subscriptions_period_order_check
    check (current_period_end >= current_period_start)
);
create unique index if not exists idx_merchant_plan_subscriptions_one_active
  on public.merchant_plan_subscriptions(merchant_id)
  where status in ('active', 'past_due', 'suspended');
create index if not exists idx_merchant_plan_subscriptions_plan_id
  on public.merchant_plan_subscriptions(plan_id);
create index if not exists idx_merchant_plan_subscriptions_status_period_end
  on public.merchant_plan_subscriptions(status, current_period_end);
drop trigger if exists update_merchant_plan_subscriptions_updated_at on public.merchant_plan_subscriptions;
create trigger update_merchant_plan_subscriptions_updated_at
before update on public.merchant_plan_subscriptions
for each row execute function public.update_updated_at_column();
alter table public.merchant_plan_subscriptions enable row level security;
alter table public.merchant_plan_subscriptions force row level security;
drop policy if exists merchant_plan_subscriptions_select_scope on public.merchant_plan_subscriptions;
create policy merchant_plan_subscriptions_select_scope
on public.merchant_plan_subscriptions
for select
using (
  public.is_dexapos_admin()
  or merchant_id = public.user_merchant_id()
  or public.is_merchant_admin(merchant_id)
);
drop policy if exists merchant_plan_subscriptions_manage_hq on public.merchant_plan_subscriptions;
create policy merchant_plan_subscriptions_manage_hq
on public.merchant_plan_subscriptions
for all
using (public.is_dexapos_admin())
with check (public.is_dexapos_admin());
grant select on public.merchant_plan_subscriptions to authenticated, service_role;
grant all on public.merchant_plan_subscriptions to service_role;
insert into public.permissions (code, name, description, category, scope)
values
  ('merchant.billing.view', 'View Billing', 'View subscription plan, invoices, payment history', 'merchant', 'merchant'),
  ('merchant.billing.manage', 'Manage Billing', 'Change plan, update payment method, request hardware', 'merchant', 'merchant')
on conflict (code) do update
set
  name = excluded.name,
  description = excluded.description,
  category = excluded.category,
  scope = excluded.scope;
insert into public.role_permissions (role_code, permission_code)
values
  ('merchant.owner', 'merchant.billing.view'),
  ('merchant.owner', 'merchant.billing.manage'),
  ('merchant.admin', 'merchant.billing.view'),
  ('merchant.admin', 'merchant.billing.manage'),
  ('hq.super_admin', 'merchant.billing.view'),
  ('hq.super_admin', 'merchant.billing.manage'),
  ('hq.finance_manager', 'merchant.billing.view'),
  ('hq.platform_admin', 'merchant.billing.view')
on conflict (role_code, permission_code) do nothing;
create or replace function public.get_merchant_subscription_status(p_merchant_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_location_count int := 0;
  v_required_plan public.subscription_plans%rowtype;
  v_subscription record;
  v_is_service_role boolean := coalesce(auth.role(), '') = 'service_role';
  v_plan jsonb := null;
begin
  if p_merchant_id is null then
    raise exception 'merchant_id is required';
  end if;

  if not v_is_service_role and not (
    public.is_dexapos_admin()
    or p_merchant_id = public.user_merchant_id()
    or public.is_merchant_admin(p_merchant_id)
  ) then
    raise exception 'Access denied: merchant scope mismatch';
  end if;

  select count(*)::int
  into v_location_count
  from public.locations l
  where l.merchant_id = p_merchant_id
    and coalesce(l.is_active, true) = true;

  select *
  into v_required_plan
  from public.subscription_plans sp
  where sp.plan_scope = 'merchant_tier'
    and sp.is_active = true
    and v_location_count >= coalesce(sp.min_locations, 0)
    and (sp.max_locations is null or v_location_count <= sp.max_locations)
  order by sp.display_order asc, sp.created_at asc
  limit 1;

  select
    mps.id,
    mps.status,
    mps.current_period_end,
    sp.plan_code,
    sp.display_name,
    sp.min_locations,
    sp.max_locations,
    sp.monthly_price_cents,
    sp.description
  into v_subscription
  from public.merchant_plan_subscriptions mps
  join public.subscription_plans sp on sp.id = mps.plan_id
  where mps.merchant_id = p_merchant_id
    and mps.status in ('active', 'past_due', 'suspended')
  order by mps.updated_at desc, mps.created_at desc
  limit 1;

  if v_subscription.id is not null then
    v_plan := jsonb_build_object(
      'code', v_subscription.plan_code,
      'name', v_subscription.display_name,
      'min_locations', v_subscription.min_locations,
      'max_locations', v_subscription.max_locations,
      'monthly_price_cents', v_subscription.monthly_price_cents,
      'description', v_subscription.description
    );
  end if;

  return jsonb_build_object(
    'plan', v_plan,
    'active_location_count', v_location_count,
    'is_over_limit',
      case
        when v_subscription.id is null or v_subscription.max_locations is null then false
        else v_location_count > v_subscription.max_locations
      end,
    'required_plan_code', coalesce(v_required_plan.plan_code, null),
    'subscription_status', coalesce(v_subscription.status, null),
    'current_period_end', coalesce(v_subscription.current_period_end, null)
  );
end;
$$;
revoke all on function public.get_merchant_subscription_status(uuid) from public;
grant execute on function public.get_merchant_subscription_status(uuid) to authenticated, service_role;
create or replace function public.list_subscription_plans()
returns setof public.subscription_plans
language sql
security definer
set search_path = public
as $$
  select sp.*
  from public.subscription_plans sp
  where sp.is_active = true
    and coalesce(sp.plan_scope, 'service_billing') = 'service_billing'
  order by coalesce(sp.display_order, 0), sp.display_name;
$$;
revoke all on function public.list_subscription_plans() from public;
grant execute on function public.list_subscription_plans() to authenticated, service_role;
