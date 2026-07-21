-- Single-Location UX — Add-Location paywall gate status
-- Extends get_merchant_subscription_status ADDITIVELY (existing keys unchanged so
-- getMerchantSubscriptionOverview keeps working) with the fields the merchant-web
-- Add-Location gate needs:
--   * resolved_tier      — the merchant's plan, defaulting to Basic (lowest
--                          display_order active merchant_tier plan) when NO
--                          merchant_plan_subscriptions row exists. This encodes
--                          the locked rule "no tier row => treated as Basic".
--   * can_add_location   — whether the resolved tier still has location headroom.
--   * upgrade_target     — the next tier up that would admit one more location,
--                          used to price the gate ("additional $X/month").
-- Prices are surfaced as base_price_monthly (NUMERIC dollars) so HQ edits via
-- upsert_subscription_plan reflect in the gate with zero deploy; the legacy
-- monthly_price_cents field is retained only inside the existing `plan` object.

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
  v_resolved public.subscription_plans%rowtype;
  v_upgrade public.subscription_plans%rowtype;
  v_is_service_role boolean := coalesce(auth.role(), '') = 'service_role';
  v_plan jsonb := null;
  v_resolved_tier jsonb := null;
  v_upgrade_target jsonb := null;
  v_can_add boolean := false;
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

  -- Resolve the effective tier: the subscribed plan when a row exists, else the
  -- Basic default (lowest display_order active merchant_tier plan).
  select sp.*
  into v_resolved
  from public.merchant_plan_subscriptions mps
  join public.subscription_plans sp on sp.id = mps.plan_id
  where mps.merchant_id = p_merchant_id
    and mps.status in ('active', 'past_due', 'suspended')
  order by mps.updated_at desc, mps.created_at desc
  limit 1;

  if v_resolved.id is null then
    select sp.*
    into v_resolved
    from public.subscription_plans sp
    where sp.plan_scope = 'merchant_tier'
      and sp.is_active = true
    order by sp.display_order asc, sp.created_at asc
    limit 1;
  end if;

  if v_resolved.id is not null then
    v_can_add := v_resolved.max_locations is null
      or v_location_count < v_resolved.max_locations;

    v_resolved_tier := jsonb_build_object(
      'code', v_resolved.plan_code,
      'name', v_resolved.display_name,
      'min_locations', v_resolved.min_locations,
      'max_locations', v_resolved.max_locations,
      'base_price_monthly', v_resolved.base_price_monthly,
      'display_order', v_resolved.display_order,
      'description', v_resolved.description
    );

    -- Next tier up that would admit one more location, cheapest first.
    select sp.*
    into v_upgrade
    from public.subscription_plans sp
    where sp.plan_scope = 'merchant_tier'
      and sp.is_active = true
      and sp.display_order > v_resolved.display_order
      and (sp.max_locations is null or sp.max_locations >= v_location_count + 1)
    order by sp.display_order asc, sp.created_at asc
    limit 1;

    if v_upgrade.id is not null then
      v_upgrade_target := jsonb_build_object(
        'code', v_upgrade.plan_code,
        'name', v_upgrade.display_name,
        'max_locations', v_upgrade.max_locations,
        'base_price_monthly', v_upgrade.base_price_monthly
      );
    end if;
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
    'current_period_end', coalesce(v_subscription.current_period_end, null),
    'resolved_tier', v_resolved_tier,
    'can_add_location', v_can_add,
    'upgrade_target', v_upgrade_target
  );
end;
$$;

revoke all on function public.get_merchant_subscription_status(uuid) from public;
grant execute on function public.get_merchant_subscription_status(uuid) to authenticated, service_role;
