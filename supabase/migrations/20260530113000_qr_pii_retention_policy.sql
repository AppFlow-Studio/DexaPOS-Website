-- QR Dine-In: PII / retention policy enforcement
--
-- Policy windows:
-- - guest contact on QR-bound online_order_sessions: scrub 30 days after expiry
-- - qr_scan_events ip_hash + user_agent: scrub after 7 days
-- - qr_scan_events analytical rows: retain for 90 days, then delete
-- - qr scan/alert rate-limit rows: retain for 7 days, then delete
-- - resolved qr_guest_alerts free-text message: scrub after 30 days
--
-- This keeps QR analytics useful while removing guest-identifying data on a
-- predictable schedule. Raw IPs are never stored; only ip_hash exists.

comment on column public.qr_scan_events.ip_hash is
  '@pii-sensitive Hashed requester IP for short-lived QR abuse controls. Raw IP is never stored.';

comment on column public.qr_scan_events.user_agent is
  '@pii-sensitive User-agent string captured for QR scan diagnostics. Scrubbed by retention policy.';

comment on column public.qr_scan_rate_limit.ip_hash is
  '@pii-sensitive Hashed requester IP for QR scan rate limiting only. Raw IP is never stored.';

comment on column public.online_order_sessions.customer_phone is
  '@pii-sensitive Guest contact field. Scrubbed from expired QR-bound sessions by QR retention policy.';

comment on column public.online_order_sessions.customer_name is
  '@pii-sensitive Guest contact field. Scrubbed from expired QR-bound sessions by QR retention policy.';

comment on column public.online_order_sessions.customer_email is
  '@pii-sensitive Guest contact field. Scrubbed from expired QR-bound sessions by QR retention policy.';

comment on column public.online_order_sessions.delivery_address is
  '@pii-sensitive Guest delivery/contact payload. Scrubbed from expired QR-bound sessions by QR retention policy.';

comment on column public.qr_guest_alerts.message is
  '@pii-sensitive Free-form guest text. Resolved alert messages are scrubbed by QR retention policy.';

create or replace view public.qr_scan_events_safe_v1 as
select
  e.id,
  e.merchant_id,
  e.location_id,
  e.floor_plan_object_id,
  e.table_qr_code_id,
  e.online_order_session_id,
  e.order_id,
  e.stage,
  e.occurred_at
from public.qr_scan_events e;

alter view public.qr_scan_events_safe_v1 owner to postgres;
comment on view public.qr_scan_events_safe_v1 is
  'QR-safe export/analytics projection. Excludes ip_hash and user_agent.';

create or replace view public.qr_guest_alerts_safe_v1 as
select
  a.id,
  a.merchant_id,
  a.location_id,
  a.floor_plan_object_id,
  a.table_label,
  a.online_order_session_id,
  a.order_id,
  a.alert_type,
  a.alert_key,
  a.status,
  a.acknowledged_at,
  a.acknowledged_by,
  a.resolved_at,
  a.resolved_by,
  a.created_at
from public.qr_guest_alerts a;

alter view public.qr_guest_alerts_safe_v1 owner to postgres;
comment on view public.qr_guest_alerts_safe_v1 is
  'QR-safe export/analytics projection. Excludes guest free-text message.';

create or replace view public.qr_online_order_sessions_safe_v1 as
select
  s.id,
  s.store_config_id,
  s.customer_id,
  s.is_authenticated,
  s.order_type,
  s.delivery_zone_id,
  s.loyalty_points_balance,
  s.loyalty_points_to_apply,
  s.order_id,
  s.requested_time,
  s.created_at,
  s.updated_at,
  s.expires_at,
  s.floor_plan_object_id,
  s.table_label,
  s.table_qr_code_id
from public.online_order_sessions s
where s.table_qr_code_id is not null
   or s.floor_plan_object_id is not null
   or s.table_label is not null;

alter view public.qr_online_order_sessions_safe_v1 owner to postgres;
comment on view public.qr_online_order_sessions_safe_v1 is
  'QR-safe session projection. Excludes guest contact fields, delivery_address, and session_token.';

revoke all on public.qr_scan_events_safe_v1 from public, anon;
revoke all on public.qr_guest_alerts_safe_v1 from public, anon;
revoke all on public.qr_online_order_sessions_safe_v1 from public, anon;
grant select on public.qr_scan_events_safe_v1 to authenticated, service_role;
grant select on public.qr_guest_alerts_safe_v1 to authenticated, service_role;
grant select on public.qr_online_order_sessions_safe_v1 to authenticated, service_role;

create or replace function public.cleanup_qr_pii_data(
  p_contact_retention_days integer default 30,
  p_scan_event_retention_days integer default 90,
  p_network_signal_retention_days integer default 7,
  p_rate_limit_retention_days integer default 7,
  p_resolved_alert_message_retention_days integer default 30
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_now timestamptz := now();
  v_contact_cutoff timestamptz := v_now - make_interval(days => greatest(coalesce(p_contact_retention_days, 30), 0));
  v_scan_cutoff timestamptz := v_now - make_interval(days => greatest(coalesce(p_scan_event_retention_days, 90), 0));
  v_network_cutoff timestamptz := v_now - make_interval(days => greatest(coalesce(p_network_signal_retention_days, 7), 0));
  v_rate_limit_cutoff timestamptz := v_now - make_interval(days => greatest(coalesce(p_rate_limit_retention_days, 7), 0));
  v_alert_message_cutoff timestamptz := v_now - make_interval(days => greatest(coalesce(p_resolved_alert_message_retention_days, 30), 0));
  v_scrubbed_sessions integer := 0;
  v_scrubbed_scan_metadata integer := 0;
  v_deleted_scan_events integer := 0;
  v_deleted_scan_rate_limits integer := 0;
  v_deleted_alert_rate_limits integer := 0;
  v_scrubbed_alert_messages integer := 0;
begin
  update public.online_order_sessions s
     set customer_phone = null,
         customer_name = null,
         customer_email = null,
         delivery_address = null,
         updated_at = v_now
   where s.expires_at < v_contact_cutoff
     and (
       s.table_qr_code_id is not null
       or s.floor_plan_object_id is not null
       or s.table_label is not null
     )
     and (
       s.customer_phone is not null
       or s.customer_name is not null
       or s.customer_email is not null
       or s.delivery_address is not null
     );

  get diagnostics v_scrubbed_sessions = row_count;

  update public.qr_scan_events e
     set ip_hash = null,
         user_agent = null
   where e.occurred_at < v_network_cutoff
     and (
       e.ip_hash is not null
       or e.user_agent is not null
     );

  get diagnostics v_scrubbed_scan_metadata = row_count;

  delete from public.qr_scan_events e
   where e.occurred_at < v_scan_cutoff;

  get diagnostics v_deleted_scan_events = row_count;

  delete from public.qr_scan_rate_limit r
   where r.scanned_at < v_rate_limit_cutoff;

  get diagnostics v_deleted_scan_rate_limits = row_count;

  delete from public.qr_guest_alert_rate_limit r
   where r.raised_at < v_rate_limit_cutoff;

  get diagnostics v_deleted_alert_rate_limits = row_count;

  update public.qr_guest_alerts a
     set message = null
   where a.status = 'resolved'
     and coalesce(a.resolved_at, a.created_at) < v_alert_message_cutoff
     and a.message is not null;

  get diagnostics v_scrubbed_alert_messages = row_count;

  return jsonb_build_object(
    'success', true,
    'scrubbed_sessions', v_scrubbed_sessions,
    'scrubbed_scan_metadata', v_scrubbed_scan_metadata,
    'deleted_scan_events', v_deleted_scan_events,
    'deleted_scan_rate_limits', v_deleted_scan_rate_limits,
    'deleted_alert_rate_limits', v_deleted_alert_rate_limits,
    'scrubbed_alert_messages', v_scrubbed_alert_messages,
    'contact_retention_days', greatest(coalesce(p_contact_retention_days, 30), 0),
    'scan_event_retention_days', greatest(coalesce(p_scan_event_retention_days, 90), 0),
    'network_signal_retention_days', greatest(coalesce(p_network_signal_retention_days, 7), 0),
    'rate_limit_retention_days', greatest(coalesce(p_rate_limit_retention_days, 7), 0),
    'resolved_alert_message_retention_days', greatest(coalesce(p_resolved_alert_message_retention_days, 30), 0)
  );
end;
$function$;

revoke all on function public.cleanup_qr_pii_data(integer, integer, integer, integer, integer) from public;
grant execute on function public.cleanup_qr_pii_data(integer, integer, integer, integer, integer) to service_role;

comment on function public.cleanup_qr_pii_data(integer, integer, integer, integer, integer) is
  'Daily QR retention scrubber: removes guest contact from expired QR sessions, strips qr_scan_events ip_hash/user_agent after 7d, deletes scan events after 90d, deletes rate-limit rows after 7d, and scrubs resolved guest-alert messages after 30d.';

do $$
declare
  v_job_id bigint;
begin
  begin
    select jobid
      into v_job_id
    from cron.job
    where jobname = 'cleanup-qr-pii-data'
    limit 1;
  exception
    when undefined_table then
      v_job_id := null;
  end;

  if v_job_id is not null then
    perform cron.unschedule(v_job_id);
  end if;

  begin
    perform cron.schedule(
      'cleanup-qr-pii-data',
      '35 3 * * *',
      'select public.cleanup_qr_pii_data();'
    );
  exception
    when undefined_function then
      raise notice 'cron.schedule is unavailable; schedule public.cleanup_qr_pii_data() manually';
    when insufficient_privilege then
      raise notice 'insufficient privilege to schedule cleanup-qr-pii-data; schedule manually';
  end;
end
$$;
