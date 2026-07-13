-- QR Dine-In: guest alert realtime broadcast + count fallback
--
-- This extends the existing QR guest alert RPCs so they publish lightweight
-- realtime notifications on the same location-level topic the order system
-- already uses: location:{location_id}:orders

create or replace function public.broadcast_qr_guest_alert_event(
  p_location_id uuid,
  p_event text,
  p_payload jsonb
)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_topic text;
begin
  if p_location_id is null or nullif(trim(coalesce(p_event, '')), '') is null then
    return;
  end if;

  v_topic := 'location:' || p_location_id::text || ':orders';
  perform realtime.send(
    coalesce(p_payload, '{}'::jsonb),
    p_event,
    v_topic,
    true
  );
exception
  when others then
    raise warning 'broadcast_qr_guest_alert_event failed: %', sqlerrm;
end;
$function$;

create or replace function public.get_qr_guest_alert_open_count(p_location_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_count integer := 0;
begin
  if p_location_id is null then
    return jsonb_build_object('success', false, 'error', 'Missing location');
  end if;

  perform public.authorize_location_access(p_location_id);

  select count(*)
    into v_count
  from public.qr_guest_alerts
  where location_id = p_location_id
    and status <> 'resolved';

  return jsonb_build_object(
    'success', true,
    'location_id', p_location_id,
    'open_alert_count', v_count
  );
end;
$function$;

create or replace function public.raise_qr_guest_alert(
  p_session_token text,
  p_alert_type text,
  p_message text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_now timestamptz := now();
  v_session record;
  v_alert record;
  v_alert_type text := lower(trim(coalesce(p_alert_type, '')));
  v_message text := nullif(trim(coalesce(p_message, '')), '');
  v_alert_key text;
  v_count int;
  v_limit int := 5;
  v_open_alert_count integer := 0;
begin
  select
    s.id,
    s.order_id,
    s.expires_at,
    s.table_label,
    s.floor_plan_object_id,
    s.table_qr_code_id,
    osc.location_id,
    osc.merchant_id
  into v_session
  from public.online_order_sessions s
  join public.online_store_config osc
    on osc.id = s.store_config_id
  where s.session_token = p_session_token
    and s.expires_at > v_now;

  if not found then
    return jsonb_build_object('success', false, 'error', 'Invalid or expired session');
  end if;

  if v_session.table_qr_code_id is null
     and v_session.floor_plan_object_id is null
     and coalesce(v_session.table_label, '') = '' then
    return jsonb_build_object('success', false, 'error', 'Session is not bound to a QR table');
  end if;

  if v_alert_type <> 'call_server' then
    return jsonb_build_object('success', false, 'error', 'Unsupported alert type');
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('qr_guest_alert_rate_limit:' || v_session.id::text, 0)
  );

  select count(*)
    into v_count
  from public.qr_guest_alert_rate_limit
  where online_order_session_id = v_session.id
    and raised_at > v_now - interval '1 minute';

  if v_count >= v_limit then
    return jsonb_build_object(
      'success', false,
      'error', 'Rate limit exceeded',
      'reason', 'rate_limit_exceeded',
      'count', v_count,
      'limit', v_limit
    );
  end if;

  insert into public.qr_guest_alert_rate_limit (online_order_session_id)
  values (v_session.id);

  v_alert_key := v_session.id::text || '|' || v_alert_type;

  select
    a.id,
    a.status,
    a.created_at,
    a.message
  into v_alert
  from public.qr_guest_alerts a
  where a.alert_key = v_alert_key
    and a.status <> 'resolved'
  order by a.created_at desc
  limit 1
  for update;

  if found then
    update public.qr_guest_alerts
       set created_at = v_now,
           order_id = coalesce(v_session.order_id, order_id),
           message = coalesce(v_message, message)
     where id = v_alert.id
     returning id, status, created_at, message
      into v_alert;
  else
    begin
      insert into public.qr_guest_alerts (
        merchant_id,
        location_id,
        floor_plan_object_id,
        table_label,
        online_order_session_id,
        order_id,
        alert_type,
        message,
        alert_key,
        status
      ) values (
        v_session.merchant_id,
        v_session.location_id,
        v_session.floor_plan_object_id,
        v_session.table_label,
        v_session.id,
        v_session.order_id,
        v_alert_type,
        v_message,
        v_alert_key,
        'open'
      )
      returning id, status, created_at, message
        into v_alert;
    exception
      when unique_violation then
        select
          a.id,
          a.status,
          a.created_at,
          a.message
        into v_alert
        from public.qr_guest_alerts a
        where a.alert_key = v_alert_key
          and a.status <> 'resolved'
        order by a.created_at desc
        limit 1
        for update;

        update public.qr_guest_alerts
           set created_at = v_now,
               order_id = coalesce(v_session.order_id, order_id),
               message = coalesce(v_message, message)
         where id = v_alert.id
         returning id, status, created_at, message
          into v_alert;
    end;
  end if;

  select count(*)
    into v_open_alert_count
  from public.qr_guest_alerts
  where location_id = v_session.location_id
    and status <> 'resolved';

  perform public.broadcast_qr_guest_alert_event(
    v_session.location_id,
    'qr_guest_alert_changed',
    jsonb_build_object(
      'operation', 'upsert',
      'location_id', v_session.location_id,
      'alert_id', v_alert.id,
      'status', v_alert.status,
      'alert_type', v_alert_type,
      'table_label', v_session.table_label,
      'message', v_alert.message,
      'created_at', v_alert.created_at,
      'order_id', v_session.order_id,
      'online_order_session_id', v_session.id,
      'open_alert_count', v_open_alert_count
    )
  );

  return jsonb_build_object(
    'success', true,
    'alert_id', v_alert.id,
    'alert_type', v_alert_type,
    'status', v_alert.status,
    'table_label', v_session.table_label,
    'message', v_alert.message,
    'created_at', v_alert.created_at,
    'open_alert_count', v_open_alert_count
  );
end;
$function$;

create or replace function public.resolve_qr_guest_alert(p_alert_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_now timestamptz := now();
  v_actor text := coalesce(auth.jwt()->>'sub', 'service_role');
  v_alert record;
  v_open_alert_count integer := 0;
begin
  select
    a.id,
    a.location_id,
    a.online_order_session_id,
    a.order_id,
    a.table_label,
    a.alert_type,
    a.message,
    a.status,
    a.created_at,
    a.resolved_at,
    a.resolved_by
  into v_alert
  from public.qr_guest_alerts a
  where a.id = p_alert_id
  for update;

  if not found then
    return jsonb_build_object('success', false, 'error', 'Alert not found');
  end if;

  perform public.authorize_location_access(v_alert.location_id);

  if v_alert.status = 'resolved' then
    select count(*)
      into v_open_alert_count
    from public.qr_guest_alerts
    where location_id = v_alert.location_id
      and status <> 'resolved';

    return jsonb_build_object(
      'success', true,
      'alert_id', v_alert.id,
      'status', v_alert.status,
      'table_label', v_alert.table_label,
      'resolved_at', v_alert.resolved_at,
      'resolved_by', v_alert.resolved_by,
      'open_alert_count', v_open_alert_count,
      'idempotent', true
    );
  end if;

  update public.qr_guest_alerts
     set status = 'resolved',
         resolved_at = v_now,
         resolved_by = v_actor
   where id = p_alert_id
   returning id, location_id, online_order_session_id, order_id, table_label, alert_type, message, status, created_at, resolved_at, resolved_by
    into v_alert;

  select count(*)
    into v_open_alert_count
  from public.qr_guest_alerts
  where location_id = v_alert.location_id
    and status <> 'resolved';

  perform public.broadcast_qr_guest_alert_event(
    v_alert.location_id,
    'qr_guest_alert_changed',
    jsonb_build_object(
      'operation', 'resolved',
      'location_id', v_alert.location_id,
      'alert_id', v_alert.id,
      'status', v_alert.status,
      'alert_type', v_alert.alert_type,
      'table_label', v_alert.table_label,
      'message', v_alert.message,
      'created_at', v_alert.created_at,
      'resolved_at', v_alert.resolved_at,
      'resolved_by', v_alert.resolved_by,
      'order_id', v_alert.order_id,
      'online_order_session_id', v_alert.online_order_session_id,
      'open_alert_count', v_open_alert_count
    )
  );

  return jsonb_build_object(
    'success', true,
    'alert_id', v_alert.id,
    'status', v_alert.status,
    'table_label', v_alert.table_label,
    'alert_type', v_alert.alert_type,
    'message', v_alert.message,
    'resolved_at', v_alert.resolved_at,
    'resolved_by', v_alert.resolved_by,
    'open_alert_count', v_open_alert_count,
    'idempotent', false
  );
end;
$function$;

revoke all on function public.broadcast_qr_guest_alert_event(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.broadcast_qr_guest_alert_event(uuid, text, jsonb) to service_role;

revoke all on function public.get_qr_guest_alert_open_count(uuid) from public, anon, authenticated;
grant execute on function public.get_qr_guest_alert_open_count(uuid) to authenticated, service_role;

comment on function public.broadcast_qr_guest_alert_event(uuid, text, jsonb) is
  'Internal helper that emits QR guest alert changes onto the location-level orders realtime topic.';

comment on function public.get_qr_guest_alert_open_count(uuid) is
  'Staff-context fallback count reader for open QR guest alerts per location.';

comment on function public.raise_qr_guest_alert(text, text, text) is
  'Anon-safe QR guest alert raise RPC. Dedups by session+type, rate-limits repeated raises, and broadcasts alert changes.';

comment on function public.resolve_qr_guest_alert(uuid) is
  'Staff-context QR guest alert resolve RPC. Idempotent, location-authorized, and broadcasts alert changes.';
