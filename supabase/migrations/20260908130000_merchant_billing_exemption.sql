-- Allow HQ to comp selected merchants without weakening plan/service assignments.
-- The exemption bypasses SaaS payment enforcement only; manual merchant suspension
-- and normal feature-entitlement checks remain authoritative.
begin;

alter table public.merchants
  add column if not exists billing_exempt boolean not null default false,
  add column if not exists billing_exempt_reason text,
  add column if not exists billing_exempt_expires_at timestamptz,
  add column if not exists billing_exempt_granted_at timestamptz,
  add column if not exists billing_exempt_granted_by text;

alter table public.merchants
  drop constraint if exists merchants_billing_exemption_evidence_check;
alter table public.merchants
  add constraint merchants_billing_exemption_evidence_check check (
    not billing_exempt or (
      length(btrim(coalesce(billing_exempt_reason, ''))) >= 5
      and billing_exempt_granted_at is not null
      and billing_exempt_granted_by is not null
    )
  );

comment on column public.merchants.billing_exempt is
  'HQ-controlled SaaS payment exemption. Does not grant plans, add-ons, or override manual merchant suspension.';
comment on column public.merchants.billing_exempt_expires_at is
  'Optional automatic end for payment exemption; NULL means HQ must disable it manually.';

create or replace function public.is_merchant_billing_exempt(p_merchant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select coalesce(m.billing_exempt, false)
    and (m.billing_exempt_expires_at is null or m.billing_exempt_expires_at > now())
  from public.merchants m
  where m.id = p_merchant_id;
$function$;
revoke all on function public.is_merchant_billing_exempt(uuid) from public, anon;
grant execute on function public.is_merchant_billing_exempt(uuid) to service_role;

create or replace function public.guard_billing_exempt_invoice_creation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if public.is_merchant_billing_exempt(new.merchant_id) then
    raise exception 'Cannot create a subscription invoice while the merchant billing exemption is active';
  end if;
  return new;
end;
$function$;
drop trigger if exists guard_billing_exempt_invoice_creation
  on public.subscription_invoices;
create trigger guard_billing_exempt_invoice_creation
before insert on public.subscription_invoices
for each row execute function public.guard_billing_exempt_invoice_creation();
revoke all on function public.guard_billing_exempt_invoice_creation()
  from public, anon, authenticated;

create or replace function public.set_merchant_billing_exemption(
  p_merchant_id uuid,
  p_enabled boolean,
  p_reason text,
  p_expires_at timestamptz default null,
  p_actor_user_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_before public.merchants%rowtype;
  v_now timestamptz := now();
  v_actor text := case
    when coalesce(auth.jwt()->>'role', '') = 'service_role'
      then coalesce(nullif(btrim(p_actor_user_id), ''), 'service_role')
    else public.current_user_id()
  end;
begin
  if not (public.hq_has_permission('system.billing.manage')
    or coalesce(auth.jwt()->>'role', '') = 'service_role') then
    raise exception 'Only HQ billing administrators can change billing exemptions';
  end if;
  if p_merchant_id is null then raise exception 'merchant_id is required'; end if;
  if length(btrim(coalesce(p_reason, ''))) < 5 then
    raise exception 'A reason of at least 5 characters is required';
  end if;
  if coalesce(p_enabled, false) and p_expires_at is not null and p_expires_at <= v_now then
    raise exception 'Billing exemption expiration must be in the future';
  end if;

  select * into v_before from public.merchants where id = p_merchant_id for update;
  if not found then raise exception 'Merchant not found'; end if;

  if coalesce(p_enabled, false) and exists (
    select 1 from public.merchant_subscriptions ms
    where ms.merchant_id = p_merchant_id
      and ms.processor_subscription_id is not null
      and coalesce(ms.processor_subscription_status, 'active') not in ('deactivated', 'deleted')
  ) then
    raise exception 'Deactivate active Valor recurring schedules before enabling the billing exemption';
  end if;

  update public.merchants
  set billing_exempt = coalesce(p_enabled, false),
      billing_exempt_reason = case when p_enabled then btrim(p_reason) else null end,
      billing_exempt_expires_at = case when p_enabled then p_expires_at else null end,
      billing_exempt_granted_at = case when p_enabled then v_now else null end,
      billing_exempt_granted_by = case when p_enabled then v_actor else null end,
      updated_at = v_now
  where id = p_merchant_id;

  perform public.log_subscription_billing_event(
    case when p_enabled then 'merchant_billing_exemption_enabled'
      else 'merchant_billing_exemption_disabled' end,
    p_merchant_id,
    null,
    'merchant',
    v_before.name,
    p_merchant_id,
    jsonb_build_object(
      'before', jsonb_build_object(
        'enabled', v_before.billing_exempt,
        'reason', v_before.billing_exempt_reason,
        'expires_at', v_before.billing_exempt_expires_at
      ),
      'after', jsonb_build_object(
        'enabled', coalesce(p_enabled, false),
        'reason', case when p_enabled then btrim(p_reason) else null end,
        'expires_at', case when p_enabled then p_expires_at else null end
      ),
      'reason', btrim(p_reason)
    ),
    jsonb_build_object('source', 'hq_subscription_workspace', 'actor_user_id', v_actor)
  );

  return jsonb_build_object(
    'merchant_id', p_merchant_id,
    'enabled', coalesce(p_enabled, false),
    'active', public.is_merchant_billing_exempt(p_merchant_id),
    'expires_at', case when p_enabled then p_expires_at else null end
  );
end;
$function$;
revoke all on function public.set_merchant_billing_exemption(uuid, boolean, text, timestamptz, text)
  from public, anon;
grant execute on function public.set_merchant_billing_exemption(uuid, boolean, text, timestamptz, text)
  to authenticated, service_role;

-- Exempt cycles are deliberately skipped, not accumulated for later back-billing.
create or replace function public.advance_billing_exempt_subscription(
  p_subscription_id uuid,
  p_as_of_date date default current_date
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_subscription public.merchant_subscriptions%rowtype;
  v_period_start date;
  v_period_end date;
  v_next_billing_date date;
  v_skipped integer := 0;
begin
  if not (public.hq_has_permission('system.billing.manage')
    or coalesce(auth.jwt()->>'role', '') = 'service_role') then
    raise exception 'Only HQ/system can advance exempt billing periods';
  end if;
  select * into v_subscription from public.merchant_subscriptions
  where id = p_subscription_id for update;
  if not found then raise exception 'Subscription not found'; end if;
  if not public.is_merchant_billing_exempt(v_subscription.merchant_id) then
    raise exception 'Merchant billing exemption is not active';
  end if;

  v_period_start := v_subscription.current_period_start;
  v_period_end := v_subscription.current_period_end;
  v_next_billing_date := v_subscription.next_billing_date;
  while v_next_billing_date <= coalesce(p_as_of_date, current_date) and v_skipped < 240 loop
    v_period_start := v_period_end + 1;
    v_period_end := (v_period_start + interval '1 month' - interval '1 day')::date;
    v_next_billing_date := v_period_start;
    v_skipped := v_skipped + 1;
  end loop;

  if v_skipped > 0 then
    update public.merchant_subscriptions
    set current_period_start = v_period_start,
        current_period_end = v_period_end,
        next_billing_date = v_next_billing_date,
        metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
          'billing_exemption_last_skipped_at', now(),
          'billing_exemption_skipped_cycles',
            coalesce((metadata->>'billing_exemption_skipped_cycles')::integer, 0) + v_skipped
        ),
        updated_at = now()
    where id = p_subscription_id;
    perform public.log_subscription_billing_event(
      'billing_exempt_cycles_skipped', v_subscription.merchant_id,
      v_subscription.location_id, 'merchant_subscription', null, p_subscription_id,
      jsonb_build_object('skipped_cycles', v_skipped, 'next_billing_date', v_next_billing_date),
      jsonb_build_object('source', 'advance_billing_exempt_subscription')
    );
  end if;
  return jsonb_build_object('subscription_id', p_subscription_id,
    'skipped_cycles', v_skipped, 'next_billing_date', v_next_billing_date);
end;
$function$;
revoke all on function public.advance_billing_exempt_subscription(uuid, date) from public, anon;
grant execute on function public.advance_billing_exempt_subscription(uuid, date)
  to authenticated, service_role;

-- Card resolution remains strict for normal merchants and intentionally returns
-- NULL for an exempt merchant so subscriptions can be created without a card.
create or replace function public.resolve_subscription_billing_profile(
  p_merchant_id uuid, p_location_id uuid default null,
  p_scope text default 'location', p_profile_id uuid default null
) returns uuid language plpgsql security definer set search_path = '' as $function$
declare v_location_id uuid; v_profile_id uuid;
begin
  if not (public.is_dexapos_admin() or coalesce(auth.jwt()->>'role', '') = 'service_role') then
    raise exception 'Only HQ/system can resolve billing cards';
  end if;
  if p_scope not in ('merchant_tier', 'location') or p_scope is null then
    raise exception 'Invalid subscription billing scope';
  end if;
  if p_scope = 'merchant_tier' then
    select id into v_location_id from public.locations where merchant_id = p_merchant_id
    order by created_at, id limit 1;
  else
    select id into v_location_id from public.locations
    where id = p_location_id and merchant_id = p_merchant_id;
  end if;
  if v_location_id is null then raise exception 'No valid billing location found'; end if;
  if public.is_merchant_billing_exempt(p_merchant_id) and p_profile_id is null then
    return null;
  end if;

  select bp.id into v_profile_id from public.merchant_billing_profiles bp
  where bp.merchant_id = p_merchant_id and bp.is_active and bp.is_primary
    and bp.processor = 'valor' and bp.billing_method = 'card'
    and (p_profile_id is null or bp.id = p_profile_id)
    and (bp.location_id = v_location_id or (p_scope = 'merchant_tier' and bp.location_id is null))
  order by (bp.location_id is null) desc, bp.created_at, bp.id limit 1;
  if v_profile_id is null then
    raise exception 'No active primary Valor card for % billing. Location services require that location''s own card.', p_scope;
  end if;
  return v_profile_id;
end;
$function$;
revoke all on function public.resolve_subscription_billing_profile(uuid, uuid, text, uuid) from public;
grant execute on function public.resolve_subscription_billing_profile(uuid, uuid, text, uuid)
  to authenticated, service_role;

-- The payment exemption wins over billing suspension, but never over a manual
-- merchant/account suspension or a canceled subscription.
create or replace function public.get_subscription_access_state(
  p_merchant_id uuid,
  p_location_id uuid default null
)
returns jsonb language plpgsql stable security definer set search_path = '' as $function$
declare
  v_merchant_status text; v_tier_status text; v_tier_grace timestamptz;
  v_location_status text; v_location_grace timestamptz;
  v_billing_exempt boolean := false; v_billing_exempt_expires_at timestamptz;
  v_allowed boolean := true; v_status text := 'active'; v_reason text := null;
begin
  if p_merchant_id is null then raise exception 'merchant_id is required'; end if;
  if not (coalesce(auth.role(), '') = 'service_role' or public.is_dexapos_admin()
    or p_merchant_id = public.user_merchant_id() or public.is_merchant_admin(p_merchant_id)) then
    raise exception 'Access denied: merchant scope mismatch';
  end if;
  select lower(coalesce(m.onboarding_status, 'active')),
    public.is_merchant_billing_exempt(m.id), m.billing_exempt_expires_at
  into v_merchant_status, v_billing_exempt, v_billing_exempt_expires_at
  from public.merchants m where m.id = p_merchant_id;
  if v_merchant_status is null then raise exception 'Merchant not found'; end if;
  if p_location_id is not null and not exists (
    select 1 from public.locations l where l.id = p_location_id and l.merchant_id = p_merchant_id
  ) then raise exception 'Location does not belong to merchant'; end if;

  select lower(ms.status), ms.grace_period_ends_at into v_tier_status, v_tier_grace
  from public.merchant_subscriptions ms where ms.merchant_id = p_merchant_id
    and ms.metadata->>'billing_scope' = 'merchant_tier'
  order by ms.updated_at desc limit 1;
  if v_tier_status is null then
    select lower(mps.status) into v_tier_status from public.merchant_plan_subscriptions mps
    where mps.merchant_id = p_merchant_id
    order by mps.updated_at desc, mps.created_at desc limit 1;
  end if;
  if p_location_id is not null then
    select lower(ms.status), ms.grace_period_ends_at into v_location_status, v_location_grace
    from public.merchant_subscriptions ms
    where ms.merchant_id = p_merchant_id and ms.location_id = p_location_id
      and ms.metadata->>'billing_scope' = 'location'
    order by ms.updated_at desc limit 1;
  end if;

  if v_merchant_status in ('suspended', 'cancelled', 'canceled', 'churned', 'deactivated') then
    v_allowed := false; v_status := 'merchant_suspended';
    v_reason := 'Merchant access is disabled by DEXA HQ.';
  elsif v_tier_status in ('cancelled', 'canceled') then
    v_allowed := false; v_status := 'subscription_canceled';
    v_reason := 'The merchant tier subscription is canceled.';
  elsif v_location_status in ('cancelled', 'canceled') then
    v_allowed := false; v_status := 'location_canceled';
    v_reason := 'The location service subscription is canceled.';
  elsif v_billing_exempt then
    v_status := 'billing_exempt';
    v_reason := 'SaaS payment enforcement is waived by DEXA HQ.';
  elsif v_tier_status = 'suspended' then
    v_allowed := false; v_status := 'subscription_suspended';
    v_reason := 'The merchant tier subscription is suspended.';
  elsif v_location_status = 'suspended' then
    v_allowed := false; v_status := 'location_suspended';
    v_reason := 'The location service subscription is suspended.';
  elsif v_tier_status = 'past_due' or v_location_status = 'past_due' then
    v_status := 'past_due_grace';
    v_reason := 'Payment is past due. Access remains available until suspension.';
  end if;

  return jsonb_build_object(
    'allowed', v_allowed, 'access_allowed', v_allowed, 'pos_access_allowed', v_allowed,
    'status', v_status, 'access_status', v_status, 'reason', v_reason,
    'merchant_status', v_merchant_status, 'subscription_status', v_tier_status,
    'merchant_tier_status', v_tier_status, 'merchant_tier_grace_period_ends_at', v_tier_grace,
    'location_id', p_location_id, 'location_subscription_status', v_location_status,
    'location_grace_period_ends_at', v_location_grace,
    'grace_period_ends_at', coalesce(v_location_grace, v_tier_grace),
    'billing_exempt', v_billing_exempt,
    'billing_exempt_expires_at', v_billing_exempt_expires_at
  );
end;
$function$;
revoke all on function public.get_subscription_access_state(uuid, uuid) from public, anon;
grant execute on function public.get_subscription_access_state(uuid, uuid)
  to authenticated, service_role;

create or replace function public.get_subscription_entitlement(
  p_merchant_id uuid, p_location_id uuid, p_service_code text
)
returns jsonb language plpgsql stable security definer set search_path = '' as $function$
declare
  v_access jsonb; v_service public.billable_services%rowtype;
  v_direct boolean := false; v_plan boolean := false; v_billing_exempt boolean := false;
  v_request_status text; v_current_plan text; v_current_plan_name text;
  v_required_plan text; v_required_plan_name text;
  v_current_order integer; v_required_order integer; v_entitled boolean;
begin
  v_access := public.get_subscription_access_state(p_merchant_id, p_location_id);
  v_billing_exempt := coalesce((v_access->>'billing_exempt')::boolean, false);
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
      and (ms.status in ('active', 'trial', 'past_due') or (v_billing_exempt and ms.status = 'suspended'))
      and mss.service_id = v_service.id and mss.is_enabled and mss.quantity > 0
  ) into v_direct;
  v_required_plan := nullif(v_service.metadata->>'required_plan_code', '');
  if v_required_plan is not null then
    select sp.plan_code, sp.display_name, sp.display_order
    into v_current_plan, v_current_plan_name, v_current_order
    from public.merchant_plan_subscriptions mps join public.subscription_plans sp on sp.id = mps.plan_id
    where mps.merchant_id = p_merchant_id
      and (mps.status in ('active', 'past_due') or (v_billing_exempt and mps.status = 'suspended'))
    order by mps.updated_at desc limit 1;
    select display_name, display_order into v_required_plan_name, v_required_order
    from public.subscription_plans
    where plan_code = v_required_plan and plan_scope = 'merchant_tier' and is_active;
    v_plan := v_current_order is not null and v_required_order is not null
      and v_current_order >= v_required_order;
  end if;
  select status into v_request_status from public.subscription_service_requests
  where merchant_id = p_merchant_id and location_id = p_location_id and service_id = v_service.id
  order by created_at desc limit 1;
  v_entitled := coalesce((v_access->>'allowed')::boolean, false) and (v_direct or v_plan);
  return jsonb_build_object(
    'entitled', v_entitled,
    'status', case when v_entitled then 'active'
      when v_request_status in ('pending', 'processing') then 'pending'
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
grant execute on function public.get_subscription_entitlement(uuid, uuid, text)
  to authenticated, service_role;

commit;
