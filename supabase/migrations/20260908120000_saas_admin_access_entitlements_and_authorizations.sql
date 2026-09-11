-- Complete the shared SaaS access, entitlement, and add-on authorization contract.
-- This migration does not charge cards, create invoices, or alter historical billing rows.
begin;

create sequence if not exists public.subscription_service_request_number_seq;

create table if not exists public.subscription_service_requests (
  id uuid primary key default gen_random_uuid(),
  request_number text not null unique default (
    'ADD-' || lpad(nextval('public.subscription_service_request_number_seq')::text, 6, '0')
  ),
  merchant_id uuid not null references public.merchants(id),
  location_id uuid not null references public.locations(id),
  service_id uuid not null references public.billable_services(id),
  merchant_name_snapshot text not null,
  location_name_snapshot text not null,
  service_name_snapshot text not null,
  requested_quantity integer not null default 1 check (requested_quantity between 1 and 1000),
  requested_by text not null,
  requested_by_email text,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'approved', 'denied', 'cancelled')),
  authorization_reference text not null unique,
  authorization_accepted boolean not null check (authorization_accepted),
  authorization_accepted_at timestamptz not null,
  authorization_terms_version text not null,
  authorization_text text not null,
  authorized_subtotal numeric(12,2) not null check (authorized_subtotal >= 0),
  authorized_card_surcharge numeric(12,2) not null default 0 check (authorized_card_surcharge >= 0),
  authorized_total numeric(12,2) not null check (authorized_total >= 0),
  authorized_billing_cadence text not null
    check (authorized_billing_cadence in ('monthly_recurring', 'one_time')),
  authorization_ip_address text,
  authorization_user_agent text,
  reviewed_by text,
  reviewed_at timestamptz,
  decision_note text check (decision_note is null or length(decision_note) <= 2000),
  applied_subscription_id uuid references public.merchant_subscriptions(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_subscription_service_requests_open
  on public.subscription_service_requests (merchant_id, location_id, service_id)
  where status in ('pending', 'processing');
create index if not exists idx_subscription_service_requests_hq_queue
  on public.subscription_service_requests (status, created_at desc);
create index if not exists idx_subscription_service_requests_merchant_history
  on public.subscription_service_requests (merchant_id, created_at desc);

drop trigger if exists update_subscription_service_requests_updated_at
  on public.subscription_service_requests;
create trigger update_subscription_service_requests_updated_at
before update on public.subscription_service_requests
for each row execute function public.update_updated_at_column();

create or replace function public.protect_subscription_service_request_authorization()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if tg_op = 'DELETE' then
    raise exception 'Subscription service authorization evidence cannot be deleted';
  end if;
  if new.merchant_id is distinct from old.merchant_id
    or new.location_id is distinct from old.location_id
    or new.service_id is distinct from old.service_id
    or new.merchant_name_snapshot is distinct from old.merchant_name_snapshot
    or new.location_name_snapshot is distinct from old.location_name_snapshot
    or new.service_name_snapshot is distinct from old.service_name_snapshot
    or new.requested_quantity is distinct from old.requested_quantity
    or new.requested_by is distinct from old.requested_by
    or new.requested_by_email is distinct from old.requested_by_email
    or new.authorization_reference is distinct from old.authorization_reference
    or new.authorization_accepted is distinct from old.authorization_accepted
    or new.authorization_accepted_at is distinct from old.authorization_accepted_at
    or new.authorization_terms_version is distinct from old.authorization_terms_version
    or new.authorization_text is distinct from old.authorization_text
    or new.authorized_subtotal is distinct from old.authorized_subtotal
    or new.authorized_card_surcharge is distinct from old.authorized_card_surcharge
    or new.authorized_total is distinct from old.authorized_total
    or new.authorized_billing_cadence is distinct from old.authorized_billing_cadence
    or new.authorization_ip_address is distinct from old.authorization_ip_address
    or new.authorization_user_agent is distinct from old.authorization_user_agent then
    raise exception 'Subscription service authorization evidence is immutable';
  end if;
  return new;
end;
$function$;

drop trigger if exists protect_subscription_service_request_authorization
  on public.subscription_service_requests;
create trigger protect_subscription_service_request_authorization
before update or delete on public.subscription_service_requests
for each row execute function public.protect_subscription_service_request_authorization();

alter table public.subscription_service_requests enable row level security;
alter table public.subscription_service_requests force row level security;
drop policy if exists subscription_service_requests_select
  on public.subscription_service_requests;
create policy subscription_service_requests_select
on public.subscription_service_requests
for select to authenticated
using (
  (public.user_belongs_to_merchant(merchant_id) and not public.is_dexapos_admin())
  or public.hq_has_permission('system.billing.manage')
);
revoke all on table public.subscription_service_requests from public, anon, authenticated;
grant select on table public.subscription_service_requests to authenticated;
grant all on table public.subscription_service_requests to service_role;
grant usage, select on sequence public.subscription_service_request_number_seq to service_role;

alter table public.app_notifications
  add column if not exists subscription_service_request_id uuid
    references public.subscription_service_requests(id) on delete set null;
create index if not exists idx_app_notifications_service_request
  on public.app_notifications(subscription_service_request_id)
  where subscription_service_request_id is not null;

-- One access decision for website and POS. Past-due accounts remain usable until
-- a worker or HQ explicitly changes the applicable subscription to suspended.
create or replace function public.get_subscription_access_state(
  p_merchant_id uuid,
  p_location_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_merchant_status text;
  v_tier_status text;
  v_tier_grace timestamptz;
  v_location_status text;
  v_location_grace timestamptz;
  v_allowed boolean := true;
  v_status text := 'active';
  v_reason text := null;
begin
  if p_merchant_id is null then raise exception 'merchant_id is required'; end if;
  if not (coalesce(auth.role(), '') = 'service_role' or public.is_dexapos_admin()
    or p_merchant_id = public.user_merchant_id() or public.is_merchant_admin(p_merchant_id)) then
    raise exception 'Access denied: merchant scope mismatch';
  end if;

  select lower(coalesce(m.onboarding_status, 'active')) into v_merchant_status
  from public.merchants m where m.id = p_merchant_id;
  if v_merchant_status is null then raise exception 'Merchant not found'; end if;
  if p_location_id is not null and not exists (
    select 1 from public.locations l where l.id = p_location_id and l.merchant_id = p_merchant_id
  ) then raise exception 'Location does not belong to merchant'; end if;

  select lower(ms.status), ms.grace_period_ends_at
  into v_tier_status, v_tier_grace
  from public.merchant_subscriptions ms
  where ms.merchant_id = p_merchant_id
    and ms.metadata->>'billing_scope' = 'merchant_tier'
  order by ms.updated_at desc limit 1;
  if v_tier_status is null then
    select lower(mps.status) into v_tier_status
    from public.merchant_plan_subscriptions mps
    where mps.merchant_id = p_merchant_id
    order by mps.updated_at desc, mps.created_at desc limit 1;
  end if;

  if p_location_id is not null then
    select lower(ms.status), ms.grace_period_ends_at
    into v_location_status, v_location_grace
    from public.merchant_subscriptions ms
    where ms.merchant_id = p_merchant_id and ms.location_id = p_location_id
      and ms.metadata->>'billing_scope' = 'location'
    order by ms.updated_at desc limit 1;
  end if;

  if v_merchant_status in ('suspended', 'cancelled', 'canceled', 'churned', 'deactivated') then
    v_allowed := false; v_status := 'merchant_suspended';
    v_reason := 'Merchant access is disabled by DEXA HQ.';
  elsif v_tier_status in ('suspended', 'cancelled', 'canceled') then
    v_allowed := false; v_status := 'subscription_suspended';
    v_reason := 'The merchant tier subscription is suspended.';
  elsif v_location_status in ('suspended', 'cancelled', 'canceled') then
    v_allowed := false; v_status := 'location_suspended';
    v_reason := 'The location service subscription is suspended.';
  elsif v_tier_status = 'past_due' or v_location_status = 'past_due' then
    v_status := 'past_due_grace';
    v_reason := 'Payment is past due. Access remains available until suspension.';
  end if;

  return jsonb_build_object(
    'allowed', v_allowed, 'access_allowed', v_allowed, 'pos_access_allowed', v_allowed,
    'status', v_status, 'access_status', v_status, 'reason', v_reason,
    'merchant_status', v_merchant_status,
    'subscription_status', v_tier_status,
    'merchant_tier_status', v_tier_status,
    'merchant_tier_grace_period_ends_at', v_tier_grace,
    'location_id', p_location_id,
    'location_subscription_status', v_location_status,
    'location_grace_period_ends_at', v_location_grace,
    'grace_period_ends_at', coalesce(v_location_grace, v_tier_grace)
  );
end;
$function$;
revoke all on function public.get_subscription_access_state(uuid, uuid) from public, anon;
grant execute on function public.get_subscription_access_state(uuid, uuid) to authenticated, service_role;

-- Preserve the established plan/limit payload while making access_status the
-- first status key consumed by current POS clients.
create or replace function public.get_merchant_subscription_status(p_merchant_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_location_count int := 0;
  v_required_plan public.subscription_plans%rowtype;
  v_subscription record;
  v_resolved public.subscription_plans%rowtype;
  v_upgrade public.subscription_plans%rowtype;
  v_plan jsonb := null;
  v_resolved_tier jsonb := null;
  v_upgrade_target jsonb := null;
  v_can_add boolean := false;
  v_access jsonb;
begin
  v_access := public.get_subscription_access_state(p_merchant_id, null);
  select count(*)::int into v_location_count from public.locations l
  where l.merchant_id = p_merchant_id and coalesce(l.is_active, true);

  select * into v_required_plan from public.subscription_plans sp
  where sp.plan_scope = 'merchant_tier' and sp.is_active
    and v_location_count >= coalesce(sp.min_locations, 0)
    and (sp.max_locations is null or v_location_count <= sp.max_locations)
  order by sp.display_order, sp.created_at limit 1;

  select
    mps.id,
    mps.plan_id,
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
  order by mps.updated_at desc, mps.created_at desc limit 1;

  if v_subscription.id is not null then
    v_plan := jsonb_build_object('code', v_subscription.plan_code, 'name', v_subscription.display_name,
      'min_locations', v_subscription.min_locations, 'max_locations', v_subscription.max_locations,
      'monthly_price_cents', v_subscription.monthly_price_cents, 'description', v_subscription.description);
    select * into v_resolved from public.subscription_plans where id = v_subscription.plan_id;
  else
    select * into v_resolved from public.subscription_plans sp
    where sp.plan_scope = 'merchant_tier' and sp.is_active
    order by sp.display_order, sp.created_at limit 1;
  end if;

  if v_resolved.id is not null then
    v_can_add := v_resolved.max_locations is null or v_location_count < v_resolved.max_locations;
    v_resolved_tier := jsonb_build_object('code', v_resolved.plan_code, 'name', v_resolved.display_name,
      'min_locations', v_resolved.min_locations, 'max_locations', v_resolved.max_locations,
      'base_price_monthly', v_resolved.base_price_monthly, 'display_order', v_resolved.display_order,
      'description', v_resolved.description);
    select * into v_upgrade from public.subscription_plans sp
    where sp.plan_scope = 'merchant_tier' and sp.is_active
      and sp.display_order > v_resolved.display_order
      and (sp.max_locations is null or sp.max_locations >= v_location_count + 1)
    order by sp.display_order, sp.created_at limit 1;
    if v_upgrade.id is not null then
      v_upgrade_target := jsonb_build_object('code', v_upgrade.plan_code, 'name', v_upgrade.display_name,
        'max_locations', v_upgrade.max_locations, 'base_price_monthly', v_upgrade.base_price_monthly);
    end if;
  end if;

  return v_access || jsonb_build_object(
    'plan', v_plan, 'active_location_count', v_location_count,
    'is_over_limit', case when v_subscription.id is null or v_subscription.max_locations is null then false
      else v_location_count > v_subscription.max_locations end,
    'required_plan_code', v_required_plan.plan_code,
    'subscription_status', v_subscription.status,
    'current_period_end', v_subscription.current_period_end,
    'resolved_tier', v_resolved_tier, 'can_add_location', v_can_add,
    'upgrade_target', v_upgrade_target
  );
end;
$function$;
revoke all on function public.get_merchant_subscription_status(uuid) from public, anon;
grant execute on function public.get_merchant_subscription_status(uuid) to authenticated, service_role;

create or replace function public.get_subscription_entitlement(
  p_merchant_id uuid,
  p_location_id uuid,
  p_service_code text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_access jsonb;
  v_service public.billable_services%rowtype;
  v_direct boolean := false;
  v_plan boolean := false;
  v_request_status text;
  v_current_plan text;
  v_current_plan_name text;
  v_required_plan text;
  v_required_plan_name text;
  v_current_order integer;
  v_required_order integer;
  v_entitled boolean;
begin
  v_access := public.get_subscription_access_state(p_merchant_id, p_location_id);
  select * into v_service from public.billable_services
  where service_code = lower(regexp_replace(p_service_code, '[^a-zA-Z0-9]+', '_', 'g')) and is_active;
  if v_service.id is null then
    return jsonb_build_object('entitled', false, 'status', 'unavailable', 'reason', 'Service is not active');
  end if;

  select exists (
    select 1 from public.merchant_subscription_services mss
    join public.merchant_subscriptions ms on ms.id = mss.subscription_id
    where ms.merchant_id = p_merchant_id and ms.location_id = p_location_id
      and ms.metadata->>'billing_scope' = 'location'
      and ms.status in ('active', 'trial', 'past_due')
      and mss.service_id = v_service.id and mss.is_enabled and mss.quantity > 0
  ) into v_direct;

  v_required_plan := nullif(v_service.metadata->>'required_plan_code', '');
  if v_required_plan is not null then
    select sp.plan_code, sp.display_name, sp.display_order
    into v_current_plan, v_current_plan_name, v_current_order
    from public.merchant_plan_subscriptions mps join public.subscription_plans sp on sp.id = mps.plan_id
    where mps.merchant_id = p_merchant_id and mps.status in ('active', 'past_due')
    order by mps.updated_at desc limit 1;
    select display_name, display_order into v_required_plan_name, v_required_order
    from public.subscription_plans
    where plan_code = v_required_plan and plan_scope = 'merchant_tier' and is_active;
    v_plan := v_current_order is not null and v_required_order is not null and v_current_order >= v_required_order;
  end if;

  select status into v_request_status from public.subscription_service_requests
  where merchant_id = p_merchant_id and location_id = p_location_id and service_id = v_service.id
  order by created_at desc limit 1;
  v_entitled := coalesce((v_access->>'allowed')::boolean, false) and (v_direct or v_plan);

  return jsonb_build_object(
    'entitled', v_entitled,
    'status', case when v_entitled then 'active' when v_request_status in ('pending', 'processing') then 'pending'
      when v_request_status = 'cancelled' then 'cancelled' else 'inactive' end,
    'service_id', v_service.id, 'service_code', v_service.service_code,
    'direct_assignment', v_direct, 'included_by_plan', v_plan,
    'request_status', v_request_status, 'current_plan_code', v_current_plan,
    'current_plan_name', v_current_plan_name,
    'required_plan_code', v_required_plan, 'required_plan_name', v_required_plan_name,
    'access', v_access,
    'reason', case when not coalesce((v_access->>'allowed')::boolean, false) then v_access->>'reason'
      when not (v_direct or v_plan) then 'Service is not assigned to this location' else null end
  );
end;
$function$;
revoke all on function public.get_subscription_entitlement(uuid, uuid, text) from public, anon;
grant execute on function public.get_subscription_entitlement(uuid, uuid, text) to authenticated, service_role;

-- Billing workers update merchant_subscriptions. Keep the legacy tier summary
-- in sync so HQ/merchant screens and old POS callers never show stale access.
create or replace function public.sync_merchant_tier_billing_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if new.metadata->>'billing_scope' = 'merchant_tier' and (
    tg_op = 'INSERT'
    or (tg_op = 'UPDATE' and new.status is distinct from old.status)
  ) then
    update public.merchant_plan_subscriptions
    set status = case
        when new.status = 'canceled' then 'cancelled'
        when new.status = 'trial' then 'active'
        else new.status
      end,
      updated_at = now()
    where merchant_id = new.merchant_id;
  end if;
  return new;
end;
$function$;
drop trigger if exists sync_merchant_tier_billing_status
  on public.merchant_subscriptions;
create trigger sync_merchant_tier_billing_status
after insert or update of status on public.merchant_subscriptions
for each row execute function public.sync_merchant_tier_billing_status();

-- Merchant-tier suspension targets every merchant location. Location service
-- suspension targets one location. Restoration only re-enables resources that
-- are not still blocked by another suspended billing stream.
create or replace function public.apply_subscription_access_state(p_subscription_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = 'public', 'pg_temp'
as $function$
declare
  v_subscription public.merchant_subscriptions%rowtype;
  v_scope text;
  v_snapshot jsonb := '{}'::jsonb;
begin
  if pg_trigger_depth() = 0 and not (public.is_dexapos_admin() or coalesce(auth.jwt()->>'role', '') = 'service_role') then
    raise exception 'Only HQ/system can apply subscription access state';
  end if;
  select * into v_subscription from public.merchant_subscriptions where id = p_subscription_id for update;
  if not found then raise exception 'Subscription not found: %', p_subscription_id; end if;
  v_scope := v_subscription.metadata->>'billing_scope';
  if v_scope = 'legacy' or v_subscription.metadata->>'billing_setup_required' = 'true' then
    return jsonb_build_object('success', true, 'state', 'billing_cutover_held');
  end if;

  if v_subscription.status = 'suspended' then
    if v_subscription.metadata #>> '{billing_access_state,state}' = 'suspended' then
      return jsonb_build_object('success', true, 'state', 'already_suspended');
    end if;
    v_snapshot := jsonb_build_object(
      'station_ids', coalesce((select jsonb_agg(s.id) from public.stations s
        join public.locations l on l.id = s.location_id
        where l.merchant_id = v_subscription.merchant_id and s.is_active and s.deactivated_at is null
          and (v_scope = 'merchant_tier' or s.location_id = v_subscription.location_id)), '[]'::jsonb),
      'payment_terminal_ids', coalesce((select jsonb_agg(pt.id) from public.payment_terminals pt
        join public.locations l on l.id = pt.location_id
        where l.merchant_id = v_subscription.merchant_id and pt.is_active
          and (v_scope = 'merchant_tier' or pt.location_id = v_subscription.location_id)), '[]'::jsonb)
    );
    update public.stations s set is_active = false, deactivated_at = coalesce(s.deactivated_at, now()), updated_at = now()
    from public.locations l where l.id = s.location_id and l.merchant_id = v_subscription.merchant_id
      and (v_scope = 'merchant_tier' or s.location_id = v_subscription.location_id) and s.is_active;
    update public.payment_terminals pt set is_active = false, updated_at = now()
    from public.locations l where l.id = pt.location_id and l.merchant_id = v_subscription.merchant_id
      and (v_scope = 'merchant_tier' or pt.location_id = v_subscription.location_id) and pt.is_active;
    update public.merchant_subscriptions set metadata = metadata || jsonb_build_object('billing_access_state',
      jsonb_build_object('state', 'suspended', 'scope', v_scope, 'applied_at', now(), 'snapshot', v_snapshot)), updated_at = now()
    where id = v_subscription.id;
    perform public.log_subscription_billing_event('subscription_access_suspended', v_subscription.merchant_id,
      case when v_scope = 'merchant_tier' then null else v_subscription.location_id end,
      'merchant_subscription', null, v_subscription.id, jsonb_build_object('scope', v_scope),
      jsonb_build_object('source', 'apply_subscription_access_state', 'snapshot', v_snapshot));
    return jsonb_build_object('success', true, 'state', 'suspended', 'scope', v_scope, 'snapshot', v_snapshot);
  end if;

  if v_subscription.status in ('active', 'trial')
    and v_subscription.metadata #>> '{billing_access_state,state}' = 'suspended' then
    -- Gather every historical billing snapshot so a resource deferred by one
    -- stream can be restored after the final blocking stream becomes active.
    update public.stations s set is_active = true, deactivated_at = null, updated_at = now()
    where s.id in (
      select distinct value::uuid from public.merchant_subscriptions ms
      cross join lateral jsonb_array_elements_text(coalesce(
        ms.metadata #> '{billing_access_state,snapshot,station_ids}',
        ms.metadata #> '{billing_access_state,previous_snapshot,station_ids}', '[]'::jsonb))
      where ms.merchant_id = v_subscription.merchant_id
    ) and not exists (
      select 1 from public.merchant_subscriptions blocker
      where blocker.merchant_id = v_subscription.merchant_id and blocker.status = 'suspended'
        and (blocker.metadata->>'billing_scope' = 'merchant_tier'
          or (blocker.metadata->>'billing_scope' = 'location' and blocker.location_id = s.location_id))
    );
    update public.payment_terminals pt set is_active = true, updated_at = now()
    where pt.id in (
      select distinct value::uuid from public.merchant_subscriptions ms
      cross join lateral jsonb_array_elements_text(coalesce(
        ms.metadata #> '{billing_access_state,snapshot,payment_terminal_ids}',
        ms.metadata #> '{billing_access_state,previous_snapshot,payment_terminal_ids}', '[]'::jsonb))
      where ms.merchant_id = v_subscription.merchant_id
    ) and not exists (
      select 1 from public.merchant_subscriptions blocker
      where blocker.merchant_id = v_subscription.merchant_id and blocker.status = 'suspended'
        and (blocker.metadata->>'billing_scope' = 'merchant_tier'
          or (blocker.metadata->>'billing_scope' = 'location' and blocker.location_id = pt.location_id))
    );
    v_snapshot := coalesce(v_subscription.metadata #> '{billing_access_state,snapshot}', '{}'::jsonb);
    update public.merchant_subscriptions set metadata = metadata || jsonb_build_object('billing_access_state',
      jsonb_build_object('state', 'restored', 'scope', v_scope, 'restored_at', now(), 'previous_snapshot', v_snapshot)),
      updated_at = now() where id = v_subscription.id;
    perform public.log_subscription_billing_event('subscription_access_restored', v_subscription.merchant_id,
      case when v_scope = 'merchant_tier' then null else v_subscription.location_id end,
      'merchant_subscription', null, v_subscription.id, jsonb_build_object('scope', v_scope),
      jsonb_build_object('source', 'apply_subscription_access_state'));
    return jsonb_build_object('success', true, 'state', 'restored', 'scope', v_scope);
  end if;
  return jsonb_build_object('success', true, 'state', 'unchanged', 'status', v_subscription.status);
end;
$function$;

commit;
