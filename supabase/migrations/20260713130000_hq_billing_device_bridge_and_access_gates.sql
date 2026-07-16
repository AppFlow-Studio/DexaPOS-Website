-- ============================================================================
-- HQ billing device bridge + access gates
-- ----------------------------------------------------------------------------
-- Website/backend-owned fast follow for the HQ billing-control ticket.
--
-- Adds:
-- - device-aware station counting for subscription billing
-- - device-category -> billable-service mapping upsert RPC
-- - automatic subscription service quantity sync from deployed devices
-- - station quota trigger based on paid/device-driven subscription count
-- - subscription suspension/restore access-state trigger for stations/terminals
--
-- POS app still needs to consume the resulting status/quota state for local UX.
-- ============================================================================

create or replace function public.get_active_station_count(
  p_location_id uuid
)
returns integer
language plpgsql
stable
security definer
set search_path = 'public', 'pg_temp'
as $function$
declare
  v_device_station_count integer := 0;
  v_physical_station_count integer := 0;
begin
  select count(*)::integer
  into v_device_station_count
  from public.device_inventory di
  join public.device_catalog dc on dc.id = di.catalog_id
  where di.location_id = p_location_id
    and di.status = 'deployed'::public.device_lifecycle_status
    and dc.device_category = 'pos_tablet';

  if v_device_station_count > 0 then
    return v_device_station_count;
  end if;

  -- Legacy fallback for locations not yet represented in Device Inventory.
  select count(*)::integer
  into v_physical_station_count
  from public.stations s
  where s.location_id = p_location_id
    and s.is_active = true
    and s.deactivated_at is null;

  return coalesce(v_physical_station_count, 0);
end;
$function$;

revoke all on function public.get_active_station_count(uuid) from public;
grant execute on function public.get_active_station_count(uuid) to authenticated, service_role;

create or replace function public.upsert_device_billing_service_mapping(
  p_device_category text,
  p_service_code text,
  p_is_active boolean default true,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = 'public', 'pg_temp'
as $function$
declare
  v_mapping_id uuid;
  v_device_category text := lower(regexp_replace(btrim(coalesce(p_device_category, '')), '[^a-zA-Z0-9]+', '_', 'g'));
  v_service_code text := lower(regexp_replace(btrim(coalesce(p_service_code, '')), '[^a-zA-Z0-9]+', '_', 'g'));
begin
  if not (
    public.is_dexapos_admin()
    or coalesce(auth.jwt()->>'role', '') = 'service_role'
  ) then
    raise exception 'Only HQ/system can manage device billing mappings';
  end if;

  if v_device_category = '' then
    raise exception 'Device category is required';
  end if;

  if v_service_code = '' then
    raise exception 'Service code is required';
  end if;

  if not exists (
    select 1
    from public.billable_services bs
    where bs.service_code = v_service_code
  ) then
    raise exception 'Billable service not found: %', v_service_code;
  end if;

  insert into public.device_billing_service_mappings (
    device_category,
    service_code,
    is_active,
    metadata
  ) values (
    v_device_category,
    v_service_code,
    coalesce(p_is_active, true),
    coalesce(p_metadata, '{}'::jsonb)
  )
  on conflict (device_category) do update
  set
    service_code = excluded.service_code,
    is_active = excluded.is_active,
    metadata = coalesce(public.device_billing_service_mappings.metadata, '{}'::jsonb)
      || excluded.metadata,
    updated_at = now()
  returning id into v_mapping_id;

  perform public.log_subscription_billing_event(
    'device_billing_mapping_upserted',
    null,
    null,
    'device_billing_service_mapping',
    v_device_category,
    v_mapping_id,
    jsonb_build_object(
      'device_category', v_device_category,
      'service_code', v_service_code,
      'is_active', coalesce(p_is_active, true)
    ),
    jsonb_build_object('source', 'upsert_device_billing_service_mapping')
  );

  return v_mapping_id;
end;
$function$;

revoke all on function public.upsert_device_billing_service_mapping(text, text, boolean, jsonb) from public;
grant execute on function public.upsert_device_billing_service_mapping(text, text, boolean, jsonb) to authenticated, service_role;

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

revoke all on function public.sync_location_device_billing(uuid) from public;
grant execute on function public.sync_location_device_billing(uuid) to service_role;

create or replace function public.sync_location_device_billing_trigger()
returns trigger
language plpgsql
security definer
set search_path = 'public', 'pg_temp'
as $function$
begin
  if tg_op = 'DELETE' then
    if old.location_id is not null then
      perform public.sync_location_device_billing(old.location_id);
    end if;
    return old;
  end if;

  if tg_op = 'UPDATE'
     and old.location_id is not null
     and old.location_id is distinct from new.location_id then
    perform public.sync_location_device_billing(old.location_id);
  end if;

  if new.location_id is not null then
    perform public.sync_location_device_billing(new.location_id);
  end if;

  return new;
end;
$function$;

drop trigger if exists trg_device_inventory_sync_billing on public.device_inventory;
create trigger trg_device_inventory_sync_billing
after insert or delete or update of status, catalog_id, merchant_id, location_id
on public.device_inventory
for each row
execute function public.sync_location_device_billing_trigger();

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

drop trigger if exists trg_stations_subscription_quota on public.stations;
create trigger trg_stations_subscription_quota
before insert or update of is_active, location_id, deactivated_at
on public.stations
for each row
execute function public.enforce_station_subscription_quota();

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
    v_snapshot := coalesce(v_subscription.metadata #> '{billing_access_state,snapshot}', '{}'::jsonb);

    select coalesce(array_agg(value::uuid), array[]::uuid[])
    into v_station_ids
    from jsonb_array_elements_text(coalesce(v_snapshot->'station_ids', '[]'::jsonb));

    select coalesce(array_agg(value::uuid), array[]::uuid[])
    into v_terminal_ids
    from jsonb_array_elements_text(coalesce(v_snapshot->'payment_terminal_ids', '[]'::jsonb));

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

revoke all on function public.apply_subscription_access_state(uuid) from public;
grant execute on function public.apply_subscription_access_state(uuid) to service_role;

create or replace function public.apply_subscription_access_state_trigger()
returns trigger
language plpgsql
security definer
set search_path = 'public', 'pg_temp'
as $function$
begin
  if old.status is distinct from new.status then
    perform public.apply_subscription_access_state(new.id);
  end if;

  return new;
end;
$function$;

drop trigger if exists trg_merchant_subscriptions_access_state on public.merchant_subscriptions;
create trigger trg_merchant_subscriptions_access_state
after update of status
on public.merchant_subscriptions
for each row
execute function public.apply_subscription_access_state_trigger();
