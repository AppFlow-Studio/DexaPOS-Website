-- QR Dine-In Wave 2: guest status + guest alert RPCs
--
-- This wave stays fully inside Track A:
-- - polling-safe guest order status
-- - guest "call server" alert raise/resolve RPCs
-- - server-side rate-limit table for alert spam control

create table if not exists public.qr_guest_alert_rate_limit (
  id bigserial primary key,
  online_order_session_id uuid not null references public.online_order_sessions(id) on delete cascade,
  raised_at timestamptz not null default now()
);

create index if not exists idx_qr_guest_alert_rate_limit_session_time
  on public.qr_guest_alert_rate_limit (online_order_session_id, raised_at desc);

comment on table public.qr_guest_alert_rate_limit is
  'Atomic rate-limit ledger for QR guest alert raises. SECURITY DEFINER RPCs only.';

alter table public.qr_guest_alert_rate_limit enable row level security;
alter table only public.qr_guest_alert_rate_limit force row level security;

revoke all on table public.qr_guest_alert_rate_limit from public, anon, authenticated;
grant all on table public.qr_guest_alert_rate_limit to service_role;

create or replace function public.get_qr_order_status(p_session_token text)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_now timestamptz := now();
  v_session record;
  v_order record;
  v_stage text;
  v_status_label text;
  v_eta_at timestamptz;
  v_eta_minutes int;
begin
  select
    s.id,
    s.order_id,
    s.expires_at,
    s.table_label,
    s.floor_plan_object_id,
    s.table_qr_code_id,
    osc.estimated_prep_minutes
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

  if v_session.order_id is null then
    return jsonb_build_object(
      'success', true,
      'has_order', false,
      'stage', 'checkout',
      'status_label', 'Checkout',
      'table_label', v_session.table_label,
      'session_expires_at', v_session.expires_at,
      'poll_interval_seconds', 5
    );
  end if;

  select
    o.id,
    o.order_number,
    o.display_number,
    o.status,
    o.created_at,
    o.updated_at,
    o.sent_to_kitchen_at,
    o.started_preparing_at,
    o.ready_at,
    o.completed_at
  into v_order
  from public.orders o
  where o.id = v_session.order_id;

  if not found then
    return jsonb_build_object('success', false, 'error', 'Order not found for session');
  end if;

  v_stage := case
    when v_order.status in ('draft', 'pending', 'accepted') then 'received'
    when v_order.status in ('sent_to_kitchen', 'preparing') then 'preparing'
    when v_order.status = 'ready' then 'ready'
    when v_order.status = 'completed' then 'served'
    when v_order.status in ('cancelled', 'declined', 'refunded', 'void') then 'cancelled'
    else lower(v_order.status::text)
  end;

  v_status_label := case v_stage
    when 'received' then 'Received'
    when 'preparing' then 'Preparing'
    when 'ready' then 'Ready'
    when 'served' then 'Served'
    when 'cancelled' then 'Cancelled'
    when 'checkout' then 'Checkout'
    else initcap(replace(v_stage, '_', ' '))
  end;

  if v_stage in ('received', 'preparing') then
    v_eta_at := coalesce(
      v_order.ready_at,
      v_order.created_at + make_interval(mins => greatest(coalesce(v_session.estimated_prep_minutes, 20), 1))
    );
    v_eta_minutes := greatest(
      0,
      ceil(extract(epoch from (v_eta_at - v_now)) / 60.0)::int
    );
  elsif v_stage = 'ready' then
    v_eta_at := coalesce(v_order.ready_at, v_order.updated_at, v_now);
    v_eta_minutes := 0;
  elsif v_stage = 'served' then
    v_eta_at := coalesce(v_order.completed_at, v_order.updated_at, v_now);
    v_eta_minutes := 0;
  else
    v_eta_at := null;
    v_eta_minutes := null;
  end if;

  return jsonb_build_object(
    'success', true,
    'has_order', true,
    'order_id', v_order.id,
    'order_number', v_order.order_number,
    'display_number', v_order.display_number,
    'raw_status', v_order.status,
    'stage', v_stage,
    'status_label', v_status_label,
    'table_label', v_session.table_label,
    'estimated_ready_at', v_eta_at,
    'eta_minutes', v_eta_minutes,
    'last_updated_at', coalesce(v_order.updated_at, v_order.created_at),
    'session_expires_at', v_session.expires_at,
    'poll_interval_seconds', 5
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

  return jsonb_build_object(
    'success', true,
    'alert_id', v_alert.id,
    'alert_type', v_alert_type,
    'status', v_alert.status,
    'table_label', v_session.table_label,
    'message', v_alert.message,
    'created_at', v_alert.created_at
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
begin
  select
    a.id,
    a.location_id,
    a.table_label,
    a.alert_type,
    a.message,
    a.status,
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
    return jsonb_build_object(
      'success', true,
      'alert_id', v_alert.id,
      'status', v_alert.status,
      'table_label', v_alert.table_label,
      'resolved_at', v_alert.resolved_at,
      'resolved_by', v_alert.resolved_by,
      'idempotent', true
    );
  end if;

  update public.qr_guest_alerts
     set status = 'resolved',
         resolved_at = v_now,
         resolved_by = v_actor
   where id = p_alert_id
   returning id, table_label, alert_type, message, status, resolved_at, resolved_by
    into v_alert;

  return jsonb_build_object(
    'success', true,
    'alert_id', v_alert.id,
    'status', v_alert.status,
    'table_label', v_alert.table_label,
    'alert_type', v_alert.alert_type,
    'message', v_alert.message,
    'resolved_at', v_alert.resolved_at,
    'resolved_by', v_alert.resolved_by,
    'idempotent', false
  );
end;
$function$;

revoke all on function public.get_qr_order_status(text) from public, anon, authenticated;
grant execute on function public.get_qr_order_status(text) to anon, authenticated, service_role;

revoke all on function public.raise_qr_guest_alert(text, text, text) from public, anon, authenticated;
grant execute on function public.raise_qr_guest_alert(text, text, text) to anon, authenticated, service_role;

revoke all on function public.resolve_qr_guest_alert(uuid) from public, anon, authenticated;
grant execute on function public.resolve_qr_guest_alert(uuid) to authenticated, service_role;

comment on function public.get_qr_order_status(text) is
  'Anon-safe QR dine-in guest status reader. Validates session token + expiry and returns stage/ETA.';

comment on function public.raise_qr_guest_alert(text, text, text) is
  'Anon-safe QR guest alert raise RPC. Dedups by session+type and rate-limits repeated raises.';

comment on function public.resolve_qr_guest_alert(uuid) is
  'Staff-context QR guest alert resolve RPC. Idempotent and location-authorized.';
