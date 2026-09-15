-- Separate billing streams without rewriting historical invoices. Billing workers
-- must be paused during rollout; this migration never contacts a payment gateway.
begin;

lock table public.merchant_subscriptions in share row exclusive mode;
lock table public.merchant_subscription_services in share row exclusive mode;

create temporary table billing_scope_cutover on commit drop as
select ms.id,
  case when sp.plan_scope = 'merchant_tier' or ms.metadata->>'billing_scope' = 'merchant_tier'
    then 'merchant_tier' else 'location' end as scope,
  anchor.id as anchor_location_id
from public.merchant_subscriptions ms
join public.subscription_plans sp on sp.id = ms.plan_id
left join public.merchant_billing_profiles bp on bp.id = ms.billing_profile_id
left join lateral (
  select l.id from public.locations l where l.merchant_id = ms.merchant_id
  order by l.created_at, l.id limit 1
) anchor on true
where case when sp.plan_scope = 'merchant_tier' or ms.metadata->>'billing_scope' = 'merchant_tier' then
  ms.location_id is distinct from anchor.id or exists (
    select 1 from public.merchant_subscription_services s where s.subscription_id = ms.id
  ) or (bp.id is not null and (bp.merchant_id is distinct from ms.merchant_id
    or (bp.location_id is not null and bp.location_id is distinct from anchor.id)))
else bp.id is not null and (bp.merchant_id is distinct from ms.merchant_id
  or bp.location_id is distinct from ms.location_id) end;

do $preflight$
declare v_ids text;
begin
  if exists (select 1 from public.merchant_subscriptions ms
    join public.subscription_plans sp on sp.id = ms.plan_id
    where ms.metadata->>'billing_scope' in ('merchant_tier', 'location')
      and (ms.metadata->>'billing_scope' = 'merchant_tier') <> (coalesce(sp.plan_scope, 'service_billing') = 'merchant_tier')) then
    raise exception 'Resolve conflicting plan and metadata billing scopes before migration';
  end if;
  if exists (select 1 from public.merchant_subscriptions ms join billing_scope_cutover c on c.id = ms.id
    where ms.status = 'suspended' or ms.metadata #>> '{billing_access_state,state}' = 'suspended') then
    raise exception 'Reconcile suspended access snapshots before billing scope conversion';
  end if;
  select string_agg(ms.id::text, ', ') into v_ids
  from public.merchant_subscriptions ms
  join billing_scope_cutover c on c.id = ms.id
  where nullif(btrim(ms.processor_subscription_id), '') is not null
    or nullif(btrim(ms.processor_subscription_status), '') is not null
    or ms.processor_next_payment_at is not null;
  if v_ids is not null then
    raise exception 'Reconcile external recurring schedules before migration: %', v_ids;
  end if;
  select string_agg(d.merchant_id::text, ', ') into v_ids from (
    select ms.merchant_id from public.merchant_subscriptions ms
    join public.subscription_plans sp on sp.id = ms.plan_id
    where sp.plan_scope = 'merchant_tier' or ms.metadata->>'billing_scope' = 'merchant_tier'
    group by ms.merchant_id having count(*) > 1
  ) d;
  if v_ids is not null then
    raise exception 'Resolve multiple merchant tiers before migration: %', v_ids;
  end if;
  if exists (select 1 from billing_scope_cutover where anchor_location_id is null) then
    raise exception 'Cannot convert a merchant without a billing anchor';
  end if;
  if exists (select 1 from billing_scope_cutover c
    join public.merchant_subscription_services s on s.subscription_id = c.id
    where c.scope = 'merchant_tier') and not exists (
      select 1 from public.subscription_plans where plan_code = 'SERVICE_CATALOG'
        and coalesce(plan_scope, 'service_billing') = 'service_billing'
  ) then
    raise exception 'SERVICE_CATALOG location plan is required before conversion';
  end if;
end;
$preflight$;

update public.merchant_subscriptions ms
set metadata = ms.metadata || jsonb_build_object('billing_scope',
  case when sp.plan_scope = 'merchant_tier' or ms.metadata->>'billing_scope' = 'merchant_tier'
    then 'merchant_tier' else 'location' end)
from public.subscription_plans sp where sp.id = ms.plan_id;

alter table public.merchant_subscriptions drop constraint merchant_subscriptions_location_id_key;

-- Retain old subscription IDs, card links, assignments, periods, and amounts for
-- invoice history. Replacement rows carry no card or external schedule reference.
do $convert$
declare
  v_old public.merchant_subscriptions%rowtype;
  v_cutover record; v_new_id uuid; v_services_id uuid; v_catalog_id uuid;
begin
  select id into v_catalog_id from public.subscription_plans where plan_code = 'SERVICE_CATALOG';
  for v_cutover in select * from billing_scope_cutover loop
    select * into v_old from public.merchant_subscriptions where id = v_cutover.id;
    update public.merchant_subscriptions set status = 'canceled',
      canceled_at = now(), cancel_reason = 'Archived for billing scope separation; not a gateway cancellation',
      metadata = metadata || jsonb_build_object('billing_scope', 'legacy',
        'scope_cutover_at', now(), 'scope_cutover_original_status', v_old.status,
        'scope_cutover_original_canceled_at', v_old.canceled_at,
        'scope_cutover_original_cancel_reason', v_old.cancel_reason), updated_at = now()
    where id = v_old.id;

    insert into public.merchant_subscriptions (
      merchant_id, location_id, plan_id, current_period_start, current_period_end,
      next_billing_date, station_count, monthly_amount, status, metadata
    ) values (
      v_old.merchant_id,
      case when v_cutover.scope = 'merchant_tier' then v_cutover.anchor_location_id else v_old.location_id end,
      v_old.plan_id, current_date, (current_date + interval '1 month' - interval '1 day')::date,
      current_date, 0, 0, 'canceled',
      jsonb_build_object('billing_scope', v_cutover.scope, 'billing_setup_required', true,
        'legacy_subscription_id', v_old.id, 'scope_cutover_at', now())
    ) returning id into v_new_id;

    v_services_id := v_new_id;
    if v_cutover.scope = 'merchant_tier' and exists (
      select 1 from public.merchant_subscription_services where subscription_id = v_old.id
    ) then
      insert into public.merchant_subscriptions (
        merchant_id, location_id, plan_id, current_period_start, current_period_end,
        next_billing_date, station_count, monthly_amount, status, metadata
      ) values (
        v_old.merchant_id, v_old.location_id, v_catalog_id, current_date,
        (current_date + interval '1 month' - interval '1 day')::date, current_date, 0, 0, 'canceled',
        jsonb_build_object('billing_scope', 'location', 'billing_setup_required', true,
          'legacy_subscription_id', v_old.id, 'scope_cutover_at', now())
      ) returning id into v_services_id;
    end if;
    if v_cutover.scope = 'location' or v_services_id <> v_new_id then
      insert into public.merchant_subscription_services
        (subscription_id, service_id, quantity, is_enabled, metadata)
      select v_services_id, service_id, quantity, is_enabled, metadata
      from public.merchant_subscription_services where subscription_id = v_old.id;
    end if;
    perform public.log_subscription_billing_event('subscription_scope_converted',
      v_old.merchant_id, v_old.location_id, 'merchant_subscription', null, v_old.id,
      jsonb_build_object('original_status', v_old.status, 'replacement_id', v_new_id,
        'location_services_id', v_services_id),
      jsonb_build_object('migration', '20260906120000', 'no_gateway_changes', true));
  end loop;
end;
$convert$;

alter table public.merchant_subscriptions add constraint merchant_subscriptions_billing_scope_valid
  check (metadata->>'billing_scope' is not null and metadata->>'billing_scope' in ('merchant_tier', 'location', 'legacy'));
alter table public.merchant_subscriptions add constraint merchant_subscriptions_cutover_nonbillable
  check ((metadata->>'billing_scope' <> 'legacy' and metadata->>'billing_setup_required' is distinct from 'true')
    or status = 'canceled');
create unique index merchant_subscriptions_one_tier_per_merchant
  on public.merchant_subscriptions(merchant_id) where metadata->>'billing_scope' = 'merchant_tier';
create unique index merchant_subscriptions_one_services_per_location
  on public.merchant_subscriptions(location_id) where metadata->>'billing_scope' = 'location';

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
    select id into v_location_id from public.locations
    where merchant_id = p_merchant_id
    order by created_at, id limit 1;
  else
    select id into v_location_id from public.locations
    where id = p_location_id and merchant_id = p_merchant_id;
  end if;
  if v_location_id is null then raise exception 'No valid billing location found'; end if;
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
grant execute on function public.resolve_subscription_billing_profile(uuid, uuid, text, uuid) to authenticated, service_role;

create or replace function public.upsert_merchant_subscription(
  p_subscription_id uuid default null, p_merchant_id uuid default null,
  p_location_id uuid default null, p_plan_id uuid default null,
  p_current_period_start date default null, p_current_period_end date default null,
  p_next_billing_date date default null, p_status text default 'active',
  p_trial_ends_at timestamptz default null, p_billing_profile_id uuid default null,
  p_metadata jsonb default '{}'::jsonb
) returns uuid language plpgsql security definer set search_path = '' as $function$
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
  v_plan_id := coalesce(p_plan_id, v_existing.plan_id);
  if v_plan_id is null and v_scope = 'location' then
    select id into v_plan_id from public.subscription_plans where plan_code = 'SERVICE_CATALOG';
  end if;
  select coalesce(plan_scope, 'service_billing') into v_plan_scope
    from public.subscription_plans where id = v_plan_id;
  if v_plan_scope is null or (v_scope = 'merchant_tier') <> (v_plan_scope = 'merchant_tier') then
    raise exception 'Plan does not match subscription billing scope';
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

-- Also guard writes outside the upsert RPC. Historical invoice snapshots and
-- existing processor subscription IDs are never rewritten by this migration.
create or replace function public.guard_subscription_billing_scope()
returns trigger language plpgsql security definer set search_path = '' as $function$
declare v_plan_scope text; v_profile public.merchant_billing_profiles%rowtype;
begin
  if tg_op = 'DELETE' then
    if old.metadata->>'billing_scope' = 'legacy' then
      raise exception 'Archived subscriptions are read-only';
    end if;
    return old;
  end if;
  if new.metadata->>'billing_scope' = 'legacy' then
    raise exception 'Archived subscriptions are read-only; historical invoices require separate reconciliation';
  end if;
  if tg_op = 'UPDATE' and old.metadata->>'legacy_subscription_id' is not null then
    if new.metadata->>'legacy_subscription_id' is distinct from old.metadata->>'legacy_subscription_id' then
      raise exception 'Migration source cannot be removed';
    end if;
    if (new.metadata->>'billing_setup_required' is distinct from old.metadata->>'billing_setup_required'
      or new.metadata->'billing_cutover_review' is distinct from old.metadata->'billing_cutover_review')
      and current_setting('app.billing_scope_review', true) is distinct from old.id::text then
      raise exception 'Use prepare_migrated_subscription to review billing cutover';
    end if;
  end if;
  if new.metadata #>> '{billing_cutover_review,start_date}' is not null
    and new.current_period_start < (new.metadata #>> '{billing_cutover_review,start_date}')::date then
    raise exception 'Billing cannot start before the reviewed cutover date';
  end if;
  if tg_op = 'UPDATE' and (new.merchant_id is distinct from old.merchant_id
    or new.location_id is distinct from old.location_id
    or new.metadata->>'billing_scope' is distinct from old.metadata->>'billing_scope') then
    raise exception 'Subscription billing scope is immutable';
  end if;
  select plan_scope into v_plan_scope from public.subscription_plans where id = new.plan_id;
  if (new.metadata->>'billing_scope' = 'merchant_tier') <> (coalesce(v_plan_scope, 'service_billing') = 'merchant_tier') then
    raise exception 'Subscription plan/scope mismatch';
  end if;
  if new.billing_profile_id is not null then
    select * into v_profile from public.merchant_billing_profiles where id = new.billing_profile_id;
    if not found or v_profile.merchant_id is distinct from new.merchant_id
      or (v_profile.location_id is distinct from new.location_id and not
        (new.metadata->>'billing_scope' = 'merchant_tier' and v_profile.location_id is null)) then
      raise exception 'Billing card does not belong to subscription scope';
    end if;
  end if;
  return new;
end;
$function$;
create trigger guard_subscription_billing_scope before insert or update or delete
  on public.merchant_subscriptions for each row execute function public.guard_subscription_billing_scope();

-- Preparation does not activate, invoice, or charge. Normal Save & Charge remains
-- the explicit activation step after the operator has reconciled external billing.
create or replace function public.prepare_migrated_subscription(
  p_subscription_id uuid, p_start_date date, p_external_billing_reviewed boolean
) returns void language plpgsql security definer set search_path = '' as $function$
declare v_sub public.merchant_subscriptions%rowtype; v_profile_id uuid;
begin
  if not (public.is_dexapos_admin() or coalesce(auth.jwt()->>'role', '') = 'service_role') then
    raise exception 'Only HQ/system can prepare migrated billing';
  end if;
  if p_external_billing_reviewed is distinct from true then
    raise exception 'Confirm external schedules and historical balances have been reconciled';
  end if;
  if p_start_date is null or p_start_date < current_date then
    raise exception 'Choose a cutover date today or later';
  end if;
  select * into v_sub from public.merchant_subscriptions where id = p_subscription_id for update;
  if not found or v_sub.metadata->>'billing_setup_required' is distinct from 'true'
    or v_sub.status <> 'canceled' then
    raise exception 'Subscription is not awaiting migration review';
  end if;
  if v_sub.processor_subscription_id is not null or v_sub.processor_subscription_status is not null
    or v_sub.processor_next_payment_at is not null then
    raise exception 'Replacement already has external schedule data; reconcile it before preparation';
  end if;
  if exists (select 1 from public.subscription_invoices si
    where si.subscription_id = (v_sub.metadata->>'legacy_subscription_id')::uuid
      and si.status = 'paid' and si.billing_period_end >= p_start_date) then
    raise exception 'Cutover overlaps a paid historical period; choose a later date';
  end if;
  v_profile_id := public.resolve_subscription_billing_profile(v_sub.merchant_id,
    v_sub.location_id, v_sub.metadata->>'billing_scope', null);
  perform set_config('app.billing_scope_review', v_sub.id::text, true);
  update public.merchant_subscriptions set billing_profile_id = v_profile_id,
    current_period_start = p_start_date,
    current_period_end = (p_start_date + interval '1 month' - interval '1 day')::date,
    next_billing_date = p_start_date,
    metadata = metadata || jsonb_build_object('billing_setup_required', false,
      'billing_cutover_review', jsonb_build_object('reviewed_at', now(),
        'reviewed_by', auth.jwt()->>'sub', 'start_date', p_start_date,
        'external_billing_reviewed', true)), updated_at = now()
  where id = v_sub.id;
  perform set_config('app.billing_scope_review', '', true);
  perform public.recalc_subscription(v_sub.id);
  perform public.log_subscription_billing_event('subscription_scope_reviewed',
    v_sub.merchant_id, v_sub.location_id, 'merchant_subscription', null, v_sub.id,
    jsonb_build_object('billing_profile_id', v_profile_id, 'start_date', p_start_date),
    jsonb_build_object('legacy_subscription_id', v_sub.metadata->>'legacy_subscription_id',
      'external_billing_reviewed', true, 'no_gateway_changes', true));
end;
$function$;
revoke all on function public.prepare_migrated_subscription(uuid, date, boolean) from public;
grant execute on function public.prepare_migrated_subscription(uuid, date, boolean) to authenticated, service_role;

create or replace function public.guard_tier_service_assignment()
returns trigger language plpgsql security definer set search_path = '' as $function$
begin
  if tg_op in ('UPDATE', 'DELETE') and exists (
    select 1 from public.merchant_subscriptions where id = old.subscription_id
      and metadata->>'billing_scope' = 'legacy'
  ) then
    raise exception 'Archived service assignments are read-only';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  if exists (select 1 from public.merchant_subscriptions where id = new.subscription_id
    and metadata->>'billing_scope' in ('merchant_tier', 'legacy')) then
    raise exception 'Devices and add-ons belong to a location subscription, not the merchant tier';
  end if;
  return new;
end;
$function$;
create trigger guard_tier_service_assignment before insert or update or delete
  on public.merchant_subscription_services for each row execute function public.guard_tier_service_assignment();

-- Updated pricing/device RPC definitions follow, retaining their existing
-- authorization, audit logging, invoice snapshots, and return contracts.

create or replace function public.calculate_subscription_total(
  p_plan_id uuid default null,
  p_station_count integer default 0,
  p_services jsonb default '[]'::jsonb,
  p_billing_method text default 'card'
)
returns table (
  station_count integer,
  billing_method text,
  line_items jsonb,
  subtotal numeric(12,2),
  card_surcharge numeric(12,2),
  total_amount numeric(12,2)
)
language plpgsql
stable
security definer
set search_path = 'public', 'pg_temp'
as $function$
declare
  v_plan public.subscription_plans%rowtype;
  v_has_plan boolean := false;
  v_plan_scope text := 'service_billing';
  v_base_price numeric(12,2) := 0;
  v_station_count integer := greatest(coalesce(p_station_count, 0), 0);
  v_overage integer := 0;
  v_line_items jsonb := '[]'::jsonb;
  v_subtotal numeric(12,2) := 0;
  v_surcharge_pct numeric(5,2) := 4.00;
  v_card_surcharge numeric(12,2) := 0;
  v_total numeric(12,2) := 0;
  v_service_item jsonb;
  v_service_id uuid;
  v_service_code text;
  v_quantity integer;
  v_service public.billable_services%rowtype;
  v_service_calc record;
begin
  if coalesce(p_billing_method, 'card') not in ('ach', 'card') then
    raise exception 'Unsupported billing method: %', p_billing_method;
  end if;

  if p_plan_id is not null then
    select *
    into v_plan
    from public.subscription_plans sp
    where sp.id = p_plan_id;

    v_has_plan := found;

    if not v_has_plan then
      raise exception 'Subscription plan not found: %', p_plan_id;
    end if;

    v_plan_scope := coalesce(v_plan.plan_scope, 'service_billing');
    if v_plan_scope = 'merchant_tier' then
      v_station_count := 0;
      if jsonb_array_length(coalesce(p_services, '[]'::jsonb)) > 0 then
        raise exception 'Merchant tier pricing cannot include location services';
      end if;
    end if;
    v_base_price := case
      when v_plan_scope = 'merchant_tier'
        then round((coalesce(v_plan.monthly_price_cents, 0)::numeric / 100.0), 2)
      else round(coalesce(v_plan.base_price_monthly, 0), 2)
    end;
    v_surcharge_pct := coalesce(v_plan.card_surcharge_pct, v_surcharge_pct);

    if v_base_price > 0 then
      v_line_items := v_line_items || jsonb_build_array(
        jsonb_build_object(
          'code', case when v_plan_scope = 'merchant_tier' then 'merchant_tier_base' else 'base_monthly' end,
          'description', coalesce(v_plan.display_name, 'Subscription') || ' monthly base',
          'category', 'plan',
          'pricing_model', 'flat',
          'quantity', 1,
          'unit_label', 'month',
          'unit_price', v_base_price,
          'subtotal', v_base_price,
          'amount', v_base_price
        )
      );
      v_subtotal := round(v_subtotal + v_base_price, 2);
    end if;

    v_overage := greatest(v_station_count - greatest(coalesce(v_plan.included_stations, 0), 0), 0);

    if v_overage > 0 and coalesce(v_plan.per_extra_station_price, 0) > 0 then
      v_line_items := v_line_items || jsonb_build_array(
        jsonb_build_object(
          'code', 'extra_stations',
          'description', 'Extra active stations beyond included count',
          'category', 'plan',
          'pricing_model', 'per_unit',
          'quantity', v_overage,
          'unit_label', 'station',
          'unit_price', round(v_plan.per_extra_station_price, 2),
          'subtotal', round(v_overage * v_plan.per_extra_station_price, 2),
          'amount', round(v_overage * v_plan.per_extra_station_price, 2)
        )
      );
      v_subtotal := round(v_subtotal + (v_overage * v_plan.per_extra_station_price), 2);
    end if;
  end if;

  for v_service_item in
    select value
    from jsonb_array_elements(coalesce(p_services, '[]'::jsonb))
  loop
    v_service_id := null;
    v_service_code := nullif(btrim(coalesce(v_service_item->>'service_code', v_service_item->>'code', '')), '');

    if nullif(btrim(coalesce(v_service_item->>'service_id', '')), '') is not null then
      begin
        v_service_id := (v_service_item->>'service_id')::uuid;
      exception when others then
        raise exception 'Invalid service_id in subscription calculator payload';
      end;
    end if;

    if v_service_id is null and v_service_code is not null then
      select bs.id
      into v_service_id
      from public.billable_services bs
      where bs.service_code = lower(regexp_replace(v_service_code, '[^a-zA-Z0-9]+', '_', 'g'))
      limit 1;
    end if;

    if v_service_id is null then
      continue;
    end if;

    select *
    into v_service
    from public.billable_services bs
    where bs.id = v_service_id;

    if not found or not coalesce(v_service.is_active, false) then
      continue;
    end if;

    v_quantity := greatest(coalesce(nullif(v_service_item->>'quantity', '')::integer, 1), 0);
    if v_quantity <= 0 then
      continue;
    end if;

    select *
    into v_service_calc
    from public.calculate_billable_service_amounts(v_service.id, v_quantity, 'ach');

    v_surcharge_pct := greatest(v_surcharge_pct, coalesce(v_service.card_surcharge_pct, 0));
    v_line_items := v_line_items || jsonb_build_array(
      jsonb_build_object(
        'code', v_service.service_code,
        'description', v_service.display_name,
        'category', v_service.service_category,
        'pricing_model', v_service.pricing_model,
        'quantity', v_quantity,
        'unit_label', v_service.unit_label,
        'unit_price', case
          when v_service.pricing_model = 'per_unit' then v_service.base_price_monthly
          else v_service_calc.subtotal
        end,
        'base_price_monthly', v_service.base_price_monthly,
        'additional_unit_price', v_service.additional_unit_price,
        'included_quantity', v_service.included_quantity,
        'subtotal', v_service_calc.subtotal,
        'amount', v_service_calc.subtotal
      )
    );
    v_subtotal := round(v_subtotal + v_service_calc.subtotal, 2);
  end loop;

  v_card_surcharge := case
    when coalesce(p_billing_method, 'card') = 'card'
      then round(v_subtotal * (v_surcharge_pct / 100.0), 2)
    else 0::numeric
  end;
  v_total := round(v_subtotal + v_card_surcharge, 2);

  if v_card_surcharge > 0 then
    v_line_items := v_line_items || jsonb_build_array(
      jsonb_build_object(
        'code', 'card_surcharge',
        'description', 'Card billing surcharge',
        'category', 'billing',
        'pricing_model', 'percent',
        'quantity', 1,
        'unit_label', 'charge',
        'unit_price', v_card_surcharge,
        'subtotal', v_card_surcharge,
        'amount', v_card_surcharge,
        'surcharge_pct', v_surcharge_pct
      )
    );
  end if;

  return query
  select
    v_station_count,
    coalesce(p_billing_method, 'card'),
    v_line_items,
    v_subtotal,
    v_card_surcharge,
    v_total;
end;
$function$;

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
    and mss.quantity > 0;

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

create or replace function public.generate_subscription_invoice_snapshot(
  p_subscription_id uuid,
  p_due_date date default null
)
returns uuid
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
  v_invoice_id uuid;
  v_invoice_number text;
begin
  if not (
    public.is_dexapos_admin()
    or coalesce(auth.jwt()->>'role', '') = 'service_role'
  ) then
    raise exception 'Only HQ/system can generate subscription invoice snapshots';
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
    jsonb_agg(jsonb_build_object('service_id', mss.service_id, 'quantity', mss.quantity)),
    '[]'::jsonb
  )
  into v_services
  from public.merchant_subscription_services mss
  where mss.subscription_id = v_subscription.id
    and mss.is_enabled = true
    and mss.quantity > 0;

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
      'pricing_model', 'unified_calculator',
      'test_duplicate', true
    )
  )
  returning id into v_invoice_id;

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
      'total_amount', v_calc.total_amount,
      'test_duplicate', true
    ),
    jsonb_build_object('line_items', v_calc.line_items)
  );

  return v_invoice_id;
end;
$function$;

create or replace function public.generate_subscription_invoice(
  p_subscription_id uuid,
  p_due_date date default null
)
returns uuid
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

  v_station_count := case when v_subscription.metadata->>'billing_scope' = 'merchant_tier'
    then 0 else public.get_active_station_count(v_subscription.location_id) end;

  select coalesce(
    jsonb_agg(jsonb_build_object('service_id', mss.service_id, 'quantity', mss.quantity)),
    '[]'::jsonb
  )
  into v_services
  from public.merchant_subscription_services mss
  where mss.subscription_id = v_subscription.id
    and mss.is_enabled = true
    and mss.quantity > 0;

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

create or replace function public.sync_location_device_billing(
  p_location_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = 'public', 'pg_temp'
as $function$
declare
  v_subscription public.merchant_subscriptions%rowtype;
  v_station_count integer := 0;
  v_service record;
  v_recalc record;
  v_changed_services jsonb := '[]'::jsonb;
begin
  if p_location_id is null then
    return jsonb_build_object('success', true, 'skipped', true, 'reason', 'no_location');
  end if;

  if pg_trigger_depth() = 0
     and not (
       public.is_dexapos_admin()
       or coalesce(auth.jwt()->>'role', '') = 'service_role'
     ) then
    raise exception 'Only HQ/system can sync device billing';
  end if;

  select *
  into v_subscription
  from public.merchant_subscriptions ms
  where ms.location_id = p_location_id
    and ms.metadata->>'billing_scope' = 'location'
    and ms.status <> 'canceled'
  order by ms.updated_at desc
  limit 1
  for update;

  if not found then
    return jsonb_build_object(
      'success', true,
      'skipped', true,
      'reason', 'no_active_subscription',
      'location_id', p_location_id
    );
  end if;

  v_station_count := public.get_active_station_count(p_location_id);

  update public.merchant_subscriptions
  set
    station_count = v_station_count,
    metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
      'device_billing_last_synced_at', now(),
      'device_billing_station_count', v_station_count
    ),
    updated_at = now()
  where id = v_subscription.id;

  for v_service in
    select
      bs.id as service_id,
      bs.service_code,
      coalesce(count(di.id), 0)::integer as quantity
    from public.device_billing_service_mappings dbsm
    join public.billable_services bs
      on bs.service_code = dbsm.service_code
    left join public.device_catalog dc
      on dc.device_category = dbsm.device_category
    left join public.device_inventory di
      on di.catalog_id = dc.id
      and di.location_id = p_location_id
      and di.status = 'deployed'::public.device_lifecycle_status
    where dbsm.is_active = true
      and bs.is_active = true
    group by bs.id, bs.service_code
  loop
    insert into public.merchant_subscription_services (
      subscription_id,
      service_id,
      quantity,
      is_enabled,
      metadata
    ) values (
      v_subscription.id,
      v_service.service_id,
      greatest(v_service.quantity, 0),
      v_service.quantity > 0,
      jsonb_build_object(
        'source', 'device_billing_bridge',
        'last_synced_at', now()
      )
    )
    on conflict (subscription_id, service_id) do update
    set
      quantity = excluded.quantity,
      is_enabled = excluded.is_enabled,
      metadata = coalesce(public.merchant_subscription_services.metadata, '{}'::jsonb)
        || excluded.metadata,
      updated_at = now();

    v_changed_services := v_changed_services || jsonb_build_array(
      jsonb_build_object(
        'service_code', v_service.service_code,
        'quantity', v_service.quantity
      )
    );
  end loop;

  select *
  into v_recalc
  from public.recalc_subscription(v_subscription.id);

  perform public.log_subscription_billing_event(
    'device_billing_synced',
    v_subscription.merchant_id,
    v_subscription.location_id,
    'merchant_subscription',
    null,
    v_subscription.id,
    jsonb_build_object(
      'old_station_count', v_subscription.station_count,
      'new_station_count', v_station_count,
      'services', v_changed_services
    ),
    jsonb_build_object(
      'source', 'sync_location_device_billing',
      'monthly_amount', v_recalc.monthly_amount
    )
  );

  return jsonb_build_object(
    'success', true,
    'subscription_id', v_subscription.id,
    'location_id', p_location_id,
    'station_count', v_station_count,
    'services', v_changed_services,
    'monthly_amount', v_recalc.monthly_amount
  );
end;
$function$;

create or replace function public.enforce_station_subscription_quota()
returns trigger
language plpgsql
security definer
set search_path = 'public', 'pg_temp'
as $function$
declare
  v_subscription public.merchant_subscriptions%rowtype;
  v_active_count integer := 0;
begin
  if tg_op = 'DELETE' then
    return old;
  end if;

  if pg_trigger_depth() > 1 then
    return new;
  end if;

  if not coalesce(new.is_active, false) or new.deactivated_at is not null then
    return new;
  end if;

  if public.is_dexapos_admin()
     or coalesce(auth.jwt()->>'role', '') = 'service_role' then
    return new;
  end if;

  select *
  into v_subscription
  from public.merchant_subscriptions ms
  where ms.location_id = new.location_id
    and ms.metadata->>'billing_scope' = 'location'
    and ms.status <> 'canceled'
  order by ms.updated_at desc
  limit 1;

  if not found then
    return new;
  end if;

  if v_subscription.status = 'suspended' then
    raise exception 'Subscription is suspended for this location - restore billing before activating stations.';
  end if;

  select count(*)::integer
  into v_active_count
  from public.stations s
  where s.location_id = new.location_id
    and s.is_active = true
    and s.deactivated_at is null
    and s.id is distinct from new.id;

  if v_active_count + 1 > greatest(coalesce(v_subscription.station_count, 0), 0) then
    raise exception 'Station limit reached for this location''s plan - add a device/seat to add a station.';
  end if;

  return new;
end;
$function$;

create or replace function public.apply_subscription_access_state(
  p_subscription_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = 'public', 'pg_temp'
as $function$
declare
  v_subscription public.merchant_subscriptions%rowtype;
  v_snapshot jsonb := '{}'::jsonb;
  v_station_ids uuid[] := array[]::uuid[];
  v_terminal_ids uuid[] := array[]::uuid[];
begin
  if pg_trigger_depth() = 0
     and not (
       public.is_dexapos_admin()
       or coalesce(auth.jwt()->>'role', '') = 'service_role'
     ) then
    raise exception 'Only HQ/system can apply subscription access state';
  end if;

  select *
  into v_subscription
  from public.merchant_subscriptions ms
  where ms.id = p_subscription_id
  for update;

  if not found then
    raise exception 'Subscription not found: %', p_subscription_id;
  end if;

  if v_subscription.metadata->>'billing_scope' = 'legacy'
    or v_subscription.metadata->>'billing_setup_required' = 'true' then
    return jsonb_build_object('success', true, 'state', 'billing_cutover_held');
  end if;

  if v_subscription.status = 'suspended' then
    if v_subscription.metadata #>> '{billing_access_state,state}' = 'suspended' then
      return jsonb_build_object(
        'success', true,
        'subscription_id', p_subscription_id,
        'state', 'already_suspended'
      );
    end if;

    v_snapshot := jsonb_build_object(
      'station_ids',
        coalesce((
          select jsonb_agg(s.id)
          from public.stations s
          where s.location_id = v_subscription.location_id
            and s.is_active = true
            and s.deactivated_at is null
        ), '[]'::jsonb),
      'payment_terminal_ids',
        coalesce((
          select jsonb_agg(pt.id)
          from public.payment_terminals pt
          where pt.location_id = v_subscription.location_id
            and pt.is_active = true
        ), '[]'::jsonb)
    );

    update public.stations
    set
      is_active = false,
      deactivated_at = coalesce(deactivated_at, now()),
      updated_at = now()
    where location_id = v_subscription.location_id
      and is_active = true;

    update public.payment_terminals
    set
      is_active = false,
      updated_at = now()
    where location_id = v_subscription.location_id
      and is_active = true;

    update public.merchant_subscriptions
    set
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'billing_access_state',
        jsonb_build_object(
          'state', 'suspended',
          'applied_at', now(),
          'reason', 'subscription_suspended',
          'snapshot', v_snapshot
        )
      ),
      updated_at = now()
    where id = v_subscription.id;

    perform public.log_subscription_billing_event(
      'subscription_access_suspended',
      v_subscription.merchant_id,
      v_subscription.location_id,
      'merchant_subscription',
      null,
      v_subscription.id,
      jsonb_build_object('status', v_subscription.status),
      jsonb_build_object('source', 'apply_subscription_access_state', 'snapshot', v_snapshot)
    );

    return jsonb_build_object(
      'success', true,
      'subscription_id', p_subscription_id,
      'state', 'suspended',
      'snapshot', v_snapshot
    );
  end if;

  if v_subscription.status in ('active', 'trial')
     and v_subscription.metadata #>> '{billing_access_state,state}' = 'suspended' then
    if exists (select 1 from public.merchant_subscriptions ms
      where ms.merchant_id = v_subscription.merchant_id and ms.id <> v_subscription.id
        and ms.status = 'suspended'
        and ms.location_id = v_subscription.location_id) then
      return jsonb_build_object('success', true, 'state', 'blocked_by_other_subscription');
    end if;
    v_snapshot := coalesce(v_subscription.metadata #> '{billing_access_state,snapshot}', '{}'::jsonb);

    select coalesce(array_agg(value::uuid), array[]::uuid[])
    into v_station_ids
    from jsonb_array_elements_text(coalesce(v_snapshot->'station_ids', '[]'::jsonb));

    select coalesce(array_agg(value::uuid), array[]::uuid[])
    into v_terminal_ids
    from jsonb_array_elements_text(coalesce(v_snapshot->'payment_terminal_ids', '[]'::jsonb));

    -- A sibling may have deferred restoration while this stream was suspended.
    -- Recover its snapshot too when the last blocking stream becomes active.
    select array_cat(v_station_ids, coalesce(array_agg(ids.value::uuid), array[]::uuid[]))
    into v_station_ids
    from public.merchant_subscriptions ms
    cross join lateral jsonb_array_elements_text(coalesce(ms.metadata #> '{billing_access_state,snapshot,station_ids}', '[]'::jsonb)) ids
    where ms.merchant_id = v_subscription.merchant_id and ms.location_id = v_subscription.location_id
      and ms.id <> v_subscription.id and ms.status in ('active', 'trial')
      and ms.metadata #>> '{billing_access_state,state}' = 'suspended';
    select array_cat(v_terminal_ids, coalesce(array_agg(ids.value::uuid), array[]::uuid[]))
    into v_terminal_ids
    from public.merchant_subscriptions ms
    cross join lateral jsonb_array_elements_text(coalesce(ms.metadata #> '{billing_access_state,snapshot,payment_terminal_ids}', '[]'::jsonb)) ids
    where ms.merchant_id = v_subscription.merchant_id and ms.location_id = v_subscription.location_id
      and ms.id <> v_subscription.id and ms.status in ('active', 'trial')
      and ms.metadata #>> '{billing_access_state,state}' = 'suspended';

    update public.stations
    set
      is_active = true,
      deactivated_at = null,
      updated_at = now()
    where id = any(v_station_ids)
      and location_id = v_subscription.location_id;

    update public.payment_terminals
    set
      is_active = true,
      updated_at = now()
    where id = any(v_terminal_ids)
      and location_id = v_subscription.location_id;

    update public.merchant_subscriptions
    set
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'billing_access_state',
        jsonb_build_object(
          'state', 'restored',
          'restored_at', now(),
          'previous_snapshot', v_snapshot
        )
      ),
      updated_at = now()
    where id = v_subscription.id;

    update public.merchant_subscriptions ms
    set metadata = ms.metadata || jsonb_build_object('billing_access_state', jsonb_build_object(
      'state', 'restored', 'restored_at', now(),
      'previous_snapshot', ms.metadata #> '{billing_access_state,snapshot}')),
      updated_at = now()
    where ms.merchant_id = v_subscription.merchant_id and ms.location_id = v_subscription.location_id
      and ms.id <> v_subscription.id and ms.status in ('active', 'trial')
      and ms.metadata #>> '{billing_access_state,state}' = 'suspended';

    perform public.log_subscription_billing_event(
      'subscription_access_restored',
      v_subscription.merchant_id,
      v_subscription.location_id,
      'merchant_subscription',
      null,
      v_subscription.id,
      jsonb_build_object('status', v_subscription.status),
      jsonb_build_object('source', 'apply_subscription_access_state', 'restored_snapshot', v_snapshot)
    );

    return jsonb_build_object(
      'success', true,
      'subscription_id', p_subscription_id,
      'state', 'restored'
    );
  end if;

  return jsonb_build_object(
    'success', true,
    'subscription_id', p_subscription_id,
    'state', 'unchanged',
    'status', v_subscription.status
  );
end;
$function$;

-- Operational lists exclude archived streams and never invent a fallback card.
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
  if not (
       public.is_dexapos_admin()
       or coalesce(auth.jwt()->>'role', '') = 'service_role'
       or (p_merchant_id is not null and public.user_belongs_to_merchant(p_merchant_id))
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
    linked_profile.billing_method,
    ms.metadata,
    ms.created_at,
    ms.updated_at
  from public.merchant_subscriptions ms
  join public.subscription_plans sp on sp.id = ms.plan_id
  join public.locations l on l.id = ms.location_id
  left join public.merchant_billing_profiles linked_profile on linked_profile.id = ms.billing_profile_id
  where (p_merchant_id is null or ms.merchant_id = p_merchant_id)
    and ms.metadata->>'billing_scope' <> 'legacy'
  order by l.name asc, ms.created_at desc;
end;
$function$;

commit;
