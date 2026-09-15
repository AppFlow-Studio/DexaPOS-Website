-- Location subscriptions bill devices only (explicit per-device services), never a
-- base/per-station plan.
--
-- Previously a location subscription with no plan was force-attached the
-- 'SERVICE_CATALOG' plan, which added a per-extra-station charge ($49 each beyond
-- the first station) auto-derived from the deployed POS-tablet count — with no way
-- to remove it. Devices are now charged only through explicit hardware services
-- (POS Tablet, KDS, …). Merchant-tier subscriptions are unchanged and still carry a
-- merchant_tier plan.

begin;

-- Location subscriptions may run without a plan.
alter table public.merchant_subscriptions
  alter column plan_id drop not null;

-- Force location scope to plan_id = NULL (devices only); keep merchant-tier plan logic.
create or replace function public.upsert_merchant_subscription(
  p_subscription_id uuid default null::uuid,
  p_merchant_id uuid default null::uuid,
  p_location_id uuid default null::uuid,
  p_plan_id uuid default null::uuid,
  p_current_period_start date default null::date,
  p_current_period_end date default null::date,
  p_next_billing_date date default null::date,
  p_status text default 'active'::text,
  p_trial_ends_at timestamp with time zone default null::timestamp with time zone,
  p_billing_profile_id uuid default null::uuid,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_existing public.merchant_subscriptions%rowtype;
  v_id uuid; v_plan_id uuid; v_plan_scope text; v_profile_id uuid;
  v_scope text := coalesce(p_metadata->>'billing_scope', 'location');
begin
  if not (public.is_dexapos_admin() or coalesce(auth.jwt()->>'role', '') = 'service_role') then
    raise exception 'Only HQ can manage merchant subscriptions';
  end if;
  -- Serialize creation before looking up the scope's existing row.
  perform 1 from public.merchants where id = p_merchant_id for update;
  if not found then raise exception 'Merchant not found'; end if;
  if not exists (select 1 from public.locations where id = p_location_id and merchant_id = p_merchant_id) then
    raise exception 'Location does not belong to merchant';
  end if;
  if v_scope not in ('merchant_tier', 'location') then raise exception 'Invalid billing scope'; end if;
  if p_current_period_start is null or p_current_period_end is null or p_next_billing_date is null then
    raise exception 'Current period dates and next billing date are required';
  end if;

  select * into v_existing from public.merchant_subscriptions ms
  where ms.merchant_id = p_merchant_id and ms.metadata->>'billing_scope' = v_scope
    and (v_scope = 'merchant_tier' or ms.location_id = p_location_id)
  for update;
  if v_existing.metadata->>'billing_setup_required' = 'true' then
    raise exception 'Review migrated billing, add the correct card, and confirm the cutover date before activation';
  end if;
  if v_existing.metadata #>> '{billing_cutover_review,start_date}' is not null
    and p_status not in ('canceled', 'suspended')
    and current_date < (v_existing.metadata #>> '{billing_cutover_review,start_date}')::date then
    raise exception 'The reviewed billing cutover date has not started yet';
  end if;
  if p_subscription_id is not null and p_subscription_id is distinct from v_existing.id then
    raise exception 'Subscription ID does not belong to this merchant and billing scope';
  end if;
  if v_existing.id is not null and v_existing.location_id <> p_location_id then
    raise exception 'Existing tier billing anchor cannot be moved without schedule reconciliation';
  end if;

  -- Location subscriptions bill devices only (no base/per-station plan). Merchant-tier
  -- subscriptions must carry a merchant_tier plan.
  if v_scope = 'merchant_tier' then
    v_plan_id := coalesce(p_plan_id, v_existing.plan_id);
    select coalesce(plan_scope, 'service_billing') into v_plan_scope
      from public.subscription_plans where id = v_plan_id;
    if v_plan_scope is null or v_plan_scope <> 'merchant_tier' then
      raise exception 'Plan does not match subscription billing scope';
    end if;
  else
    v_plan_id := null;
  end if;

  if p_status in ('canceled', 'suspended') and v_existing.id is not null then
    -- Stopping access/renewal must not require a working replacement card.
    v_profile_id := v_existing.billing_profile_id;
  else
    v_profile_id := public.resolve_subscription_billing_profile(
      p_merchant_id, p_location_id, v_scope, p_billing_profile_id);
  end if;
  v_id := coalesce(v_existing.id, gen_random_uuid());
  insert into public.merchant_subscriptions (
    id, merchant_id, location_id, plan_id, current_period_start, current_period_end,
    next_billing_date, status, trial_ends_at, billing_profile_id, station_count, monthly_amount, metadata
  ) values (
    v_id, p_merchant_id, p_location_id, v_plan_id, p_current_period_start, p_current_period_end,
    p_next_billing_date, coalesce(p_status, 'active'), p_trial_ends_at, v_profile_id,
    case when v_scope = 'merchant_tier' then 0 else public.get_active_station_count(p_location_id) end,
    0, coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object('billing_scope', v_scope)
  ) on conflict (id) do update set
    plan_id = excluded.plan_id, current_period_start = excluded.current_period_start,
    current_period_end = excluded.current_period_end, next_billing_date = excluded.next_billing_date,
    status = excluded.status, trial_ends_at = excluded.trial_ends_at,
    billing_profile_id = excluded.billing_profile_id,
    metadata = public.merchant_subscriptions.metadata || excluded.metadata, updated_at = now();
  perform public.recalc_subscription(v_id);
  perform public.log_subscription_billing_event(
    'subscription_created', p_merchant_id, p_location_id, 'merchant_subscription', null, v_id,
    jsonb_build_object('plan_id', v_plan_id, 'billing_profile_id', v_profile_id, 'billing_scope', v_scope),
    coalesce(p_metadata, '{}'::jsonb));
  return v_id;
end;
$function$;

-- Retire the plan on existing location subscriptions so future invoices drop the
-- per-station charge. Existing (already-issued) invoices are unaffected.
update public.merchant_subscriptions
set plan_id = null, updated_at = now()
where metadata->>'billing_scope' = 'location' and plan_id is not null;

commit;
