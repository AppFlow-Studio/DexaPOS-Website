-- =============================================================================
-- Connection hardening: one per-minute cron dispatcher, log retention, and a
-- station change push
-- =============================================================================
-- Plan: Dexa-POS/docs/engineering/database/SUPABASE-CONNECTIONS-AND-STORAGE-2026-09-24.md,
-- Phase 3 (3.1, 3.2, 3.4). 3.3 (order-number lock) is its own migration,
-- 20260925121500_order_number_xact_lock.sql, because it is mirrored into
-- Dexa-POS/supabase/migrations/ and this file is not.
--
-- WHY
--   cron.use_background_workers is off, so every pg_cron run opens a new
--   Postgres connection. Before this migration ~5 jobs fired together at every
--   minute mark and ~8 at :00/:15/:30/:45, on a project sitting at 59 of 60
--   connections. Four operational tables had no retention.
--
-- 3.1  public.run_frequent_jobs() runs the 7 sub-hourly jobs from ONE cron job
--      ('frequent-jobs', every minute), each in its own exception block so one
--      failure doesn't stop the rest:
--        every minute   poke_orderout_status_relay, poke_orderout_delivery_dispatch,
--                       expire_stale_pending_online_orders
--        minute % 2 = 0 mark_stale_stations_offline
--        minute % 5 = 2 restore_expired_item_snoozes, sweep_orderout_delivery_dispatches
--        minute %15 = 7 poke_reservation_request_expiry
--      The 7 jobs it replaces are unscheduled in the same transaction, so no
--      minute runs twice or not at all. Hourly and nightly jobs are untouched.
--      auto_clock_out_stale_shifts is deliberately NOT included (out of scope).
--      Inner failures do not mark the cron run failed; they are logged as
--      WARNING "run_frequent_jobs: <job> failed" in the Postgres logs.
--
-- 3.2  public.purge_operational_logs() (a PROCEDURE: it COMMITs per batch so a
--      large first run doesn't hold one long transaction), nightly at 03:20 UTC:
--        cron.job_run_details         older than 7 days
--        webhook_dead_letter_queue    resolved/abandoned, older than 30 days
--        valor_webhook_events         older than 30 days
--        valor_webhook_events.raw_payload set to NULL for 'ignored' and
--          'invalid_signature' rows (unverified requests whose bodies are never
--          processed; the valor-webhook edge function stops storing them too).
--          The nightly run covers the last 2 days; the one-off backfill is
--          CALL public.purge_operational_logs(p_strip_since => '-infinity');
--      VACUUM FULL cannot run in a migration; see the plan's Phase 3.2 runbook.
--
-- 3.4  station_updated nudge on the PUBLIC topic station:{id}, which the POS
--      already joins (useRemoteActionsListener). Payload is empty; the POS
--      re-reads its station state. Fires only on the columns the POS acts on,
--      never on heartbeat / online / device-capability writes:
--        stations          UPDATE of is_active, deactivated_at, location_id,
--                          station_type, station_name, station_number,
--                          view_scope, can_*, current_receipt_printer_id,
--                          kiosk_profile_id; and DELETE
--        payment_terminals INSERT / DELETE, and UPDATE of the assignment or
--                          connection config (never health / counter columns)
--
-- Rollback: rollback/20260925121000_connection_hardening_rollback.sql
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 3.1 Per-minute dispatcher
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.run_frequent_jobs()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
-- A job that waits on a row lock fails in 3 s with 55P03 (caught below) and
-- runs again on its next slot, instead of delaying every other job.
SET lock_timeout TO '3s'
AS $function$
DECLARE
  v_minute integer := extract(minute FROM now() AT TIME ZONE 'UTC')::integer;
BEGIN
  -- Every minute --------------------------------------------------------------
  BEGIN
    PERFORM public.poke_orderout_status_relay();
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'run_frequent_jobs: poke_orderout_status_relay failed: % (%)', SQLERRM, SQLSTATE;
  END;

  BEGIN
    PERFORM public.poke_orderout_delivery_dispatch();
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'run_frequent_jobs: poke_orderout_delivery_dispatch failed: % (%)', SQLERRM, SQLSTATE;
  END;

  BEGIN
    PERFORM public.expire_stale_pending_online_orders();
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'run_frequent_jobs: expire_stale_pending_online_orders failed: % (%)', SQLERRM, SQLSTATE;
  END;

  -- Every 2 minutes -------------------------------------------------------------
  IF v_minute % 2 = 0 THEN
    BEGIN
      PERFORM public.mark_stale_stations_offline();
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'run_frequent_jobs: mark_stale_stations_offline failed: % (%)', SQLERRM, SQLSTATE;
    END;
  END IF;

  -- Every 5 minutes, offset from the minute-0 pile-up ---------------------------
  IF v_minute % 5 = 2 THEN
    BEGIN
      PERFORM public.restore_expired_item_snoozes();
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'run_frequent_jobs: restore_expired_item_snoozes failed: % (%)', SQLERRM, SQLSTATE;
    END;

    BEGIN
      PERFORM public.sweep_orderout_delivery_dispatches();
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'run_frequent_jobs: sweep_orderout_delivery_dispatches failed: % (%)', SQLERRM, SQLSTATE;
    END;
  END IF;

  -- Every 15 minutes, offset from the quarter-hour pile-up ----------------------
  IF v_minute % 15 = 7 THEN
    BEGIN
      PERFORM public.poke_reservation_request_expiry();
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'run_frequent_jobs: poke_reservation_request_expiry failed: % (%)', SQLERRM, SQLSTATE;
    END;
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.run_frequent_jobs() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.run_frequent_jobs() TO service_role;

COMMENT ON FUNCTION public.run_frequent_jobs() IS
  'pg_cron dispatcher (job frequent-jobs, every minute). Runs the sub-hourly jobs in one connection instead of one connection per job. See 20260925121000_connection_hardening.sql.';

DO $cron$
DECLARE
  r record;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE NOTICE 'pg_cron not installed; skipping frequent-jobs schedule';
    RETURN;
  END IF;

  -- Print what is being replaced (mark-stale-stations-offline has no tracked
  -- migration, so this is the only record of its live command).
  FOR r IN
    SELECT jobid, jobname, schedule, command, username
      FROM cron.job
     WHERE jobname IN (
       'orderout-status-relay-drain',
       'orderout-delivery-dispatch-drain',
       'expire-stale-pending-online-orders',
       'mark-stale-stations-offline',
       'restore-expired-item-snoozes',
       'orderout-delivery-dispatch-sweep',
       'website-reservation-request-expiry'
     )
     ORDER BY jobname
  LOOP
    RAISE NOTICE 'unscheduling cron job % (%, "%", owner %): %',
      r.jobid, r.jobname, r.schedule, r.username, r.command;
    PERFORM cron.unschedule(r.jobid);
  END LOOP;

  PERFORM cron.schedule(
    'frequent-jobs',
    '* * * * *',
    $cmd$SELECT public.run_frequent_jobs()$cmd$
  );
END;
$cron$;

-- -----------------------------------------------------------------------------
-- 3.2 Retention
-- -----------------------------------------------------------------------------
-- SECURITY INVOKER and no SET clause: both are required for COMMIT inside a
-- procedure. pg_cron runs it as the job owner (postgres). Every name is
-- schema-qualified for that reason. The cron command must be exactly the CALL
-- (a multi-statement command is one implicit transaction and COMMIT fails).
CREATE OR REPLACE PROCEDURE public.purge_operational_logs(
  p_batch_size integer DEFAULT 10000,
  p_max_batches integer DEFAULT 500,
  p_strip_since timestamptz DEFAULT NULL
)
LANGUAGE plpgsql
AS $procedure$
DECLARE
  -- Cutoffs are fixed once: now() moves after every COMMIT.
  v_now timestamptz := pg_catalog.now();
  v_labels text[] := ARRAY[
    'cron.job_run_details',
    'webhook_dead_letter_queue',
    'valor_webhook_events'
  ];
  v_statements text[] := ARRAY[
    -- pg_cron leaves end_time NULL on runs orphaned by a restart.
    $q$DELETE FROM cron.job_run_details
        WHERE runid IN (SELECT d.runid FROM cron.job_run_details d
                         WHERE coalesce(d.end_time, d.start_time) < $1
                         LIMIT $2)$q$,
    -- Every path to resolved/abandoned sets resolved_at; updated_at is the fallback.
    $q$DELETE FROM public.webhook_dead_letter_queue
        WHERE id IN (SELECT q.id FROM public.webhook_dead_letter_queue q
                      WHERE q.status IN ('resolved', 'abandoned')
                        AND coalesce(q.resolved_at, q.updated_at) < $1
                      LIMIT $2)$q$,
    -- Oldest first, through idx_valor_webhook_events_time.
    $q$DELETE FROM public.valor_webhook_events
        WHERE id IN (SELECT e.id FROM public.valor_webhook_events e
                      WHERE e.received_at < $1
                      ORDER BY e.received_at
                      LIMIT $2)$q$
  ];
  v_cutoffs timestamptz[] := ARRAY[
    v_now - interval '7 days',
    v_now - interval '30 days',
    v_now - interval '30 days'
  ];
  v_rows integer;
  v_total bigint;
  v_batches integer;
  v_from timestamptz;
  v_to timestamptz;
BEGIN
  IF p_batch_size IS NULL OR p_batch_size < 1 OR p_max_batches IS NULL OR p_max_batches < 1 THEN
    RAISE EXCEPTION 'purge_operational_logs: p_batch_size and p_max_batches must be >= 1';
  END IF;

  FOR i IN 1 .. array_length(v_labels, 1) LOOP
    v_total := 0;
    v_batches := 0;
    LOOP
      BEGIN
        EXECUTE v_statements[i] USING v_cutoffs[i], p_batch_size;
        GET DIAGNOSTICS v_rows = ROW_COUNT;
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'purge_operational_logs: % failed: % (%)', v_labels[i], SQLERRM, SQLSTATE;
        v_rows := 0;
      END;
      COMMIT;
      v_total := v_total + v_rows;
      v_batches := v_batches + 1;
      EXIT WHEN v_rows < p_batch_size OR v_batches >= p_max_batches;
    END LOOP;
    RAISE LOG 'purge_operational_logs: % deleted % rows in % batches', v_labels[i], v_total, v_batches;
  END LOOP;

  -- Strip the bodies of unverified Valor requests, in 6-hour windows of the
  -- received_at index, oldest first.
  v_total := 0;
  SELECT greatest(
           coalesce(p_strip_since, v_now - interval '2 days'),
           min(e.received_at)
         )
    INTO v_from
    FROM public.valor_webhook_events e;

  -- '-infinity' on an empty table would never advance.
  WHILE v_from IS NOT NULL AND isfinite(v_from) AND v_from <= v_now LOOP
    v_to := v_from + interval '6 hours';
    BEGIN
      UPDATE public.valor_webhook_events e
         SET raw_payload = NULL
       WHERE e.received_at >= v_from
         AND e.received_at < v_to
         AND e.outcome IN ('ignored', 'invalid_signature')
         AND e.raw_payload IS NOT NULL;
      GET DIAGNOSTICS v_rows = ROW_COUNT;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'purge_operational_logs: valor raw_payload strip failed at %: % (%)', v_from, SQLERRM, SQLSTATE;
      v_rows := 0;
    END;
    COMMIT;
    v_total := v_total + v_rows;
    v_from := v_to;
  END LOOP;
  RAISE LOG 'purge_operational_logs: valor_webhook_events raw_payload stripped on % rows', v_total;
END;
$procedure$;

REVOKE ALL ON PROCEDURE public.purge_operational_logs(integer, integer, timestamptz) FROM PUBLIC, anon, authenticated;

COMMENT ON PROCEDURE public.purge_operational_logs(integer, integer, timestamptz) IS
  'Nightly retention (job purge-operational-logs, 03:20 UTC): cron.job_run_details 7 d, resolved/abandoned webhook_dead_letter_queue 30 d, valor_webhook_events 30 d, and NULLs raw_payload on ignored/invalid_signature Valor rows. COMMITs per batch; call with CALL, never inside a transaction. See 20260925121000_connection_hardening.sql.';

DO $schedule$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'purge-operational-logs') THEN
      PERFORM cron.unschedule('purge-operational-logs');
    END IF;
    PERFORM cron.schedule(
      'purge-operational-logs',
      '20 3 * * *',
      'CALL public.purge_operational_logs()'
    );
  END IF;
EXCEPTION WHEN undefined_table OR undefined_function OR insufficient_privilege THEN
  RAISE NOTICE 'purge-operational-logs not scheduled: %', SQLERRM;
END;
$schedule$;

-- -----------------------------------------------------------------------------
-- 3.4 Station change push
-- -----------------------------------------------------------------------------
-- A failed send must never block a station or terminal write, so both
-- functions swallow errors with a WARNING. SECURITY DEFINER because the writes
-- come from authenticated users, service_role and pg_cron alike.
CREATE OR REPLACE FUNCTION public.notify_station_updated()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_station_id uuid := CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END;
BEGIN
  PERFORM realtime.send('{}'::jsonb, 'station_updated', 'station:' || v_station_id::text, false);
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'notify_station_updated failed for station %: % (%)', v_station_id, SQLERRM, SQLSTATE;
  RETURN NULL;
END;
$function$;

REVOKE ALL ON FUNCTION public.notify_station_updated() FROM PUBLIC, anon, authenticated;

-- UPDATE OF keeps heartbeat / online / capability writes from even evaluating
-- the WHEN; the WHEN drops the Website's "send every field" saves that change
-- nothing (trg_stations_updated_at bumps updated_at on every update).
DROP TRIGGER IF EXISTS trg_stations_notify_updated ON public.stations;
CREATE TRIGGER trg_stations_notify_updated
AFTER UPDATE OF
  is_active, deactivated_at, location_id, station_type, station_name,
  station_number, view_scope, can_create_orders, can_process_payments,
  can_void_orders, can_apply_discounts, can_update_kitchen_status,
  current_receipt_printer_id, kiosk_profile_id
ON public.stations
FOR EACH ROW
WHEN (
     OLD.is_active IS DISTINCT FROM NEW.is_active
  OR OLD.deactivated_at IS DISTINCT FROM NEW.deactivated_at
  OR OLD.location_id IS DISTINCT FROM NEW.location_id
  OR OLD.station_type IS DISTINCT FROM NEW.station_type
  OR OLD.station_name IS DISTINCT FROM NEW.station_name
  OR OLD.station_number IS DISTINCT FROM NEW.station_number
  OR OLD.view_scope IS DISTINCT FROM NEW.view_scope
  OR OLD.can_create_orders IS DISTINCT FROM NEW.can_create_orders
  OR OLD.can_process_payments IS DISTINCT FROM NEW.can_process_payments
  OR OLD.can_void_orders IS DISTINCT FROM NEW.can_void_orders
  OR OLD.can_apply_discounts IS DISTINCT FROM NEW.can_apply_discounts
  OR OLD.can_update_kitchen_status IS DISTINCT FROM NEW.can_update_kitchen_status
  OR OLD.current_receipt_printer_id IS DISTINCT FROM NEW.current_receipt_printer_id
  OR OLD.kiosk_profile_id IS DISTINCT FROM NEW.kiosk_profile_id
)
EXECUTE FUNCTION public.notify_station_updated();

-- A DELETE trigger's WHEN cannot reference NEW, so deletes get their own trigger.
DROP TRIGGER IF EXISTS trg_stations_notify_deleted ON public.stations;
CREATE TRIGGER trg_stations_notify_deleted
AFTER DELETE ON public.stations
FOR EACH ROW
EXECUTE FUNCTION public.notify_station_updated();

-- The station's payment terminal lives in payment_terminals.station_id and is
-- returned to the POS by get_location_stations_with_status. Health checks
-- update this table every ~90 s per terminal, so the change test compares only
-- assignment and connection-config keys. It reads them through to_jsonb so a
-- key missing on one environment compares as NULL instead of failing the
-- migration.
CREATE OR REPLACE FUNCTION public.notify_payment_terminal_station()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_keys constant text[] := ARRAY[
    'station_id', 'is_active', 'terminal_type', 'terminal_name', 'terminal_model',
    'connection_type', 'tpn', 'register_id', 'auth_key_secret_id', 'api_environment',
    'local_ip_address', 'local_port', 'valor_ip_address', 'valor_port',
    'valor_cancel_port', 'valor_epi', 'castles_ip_address', 'castles_port',
    'auto_settle', 'settle_time', 'signature_threshold', 'spin_proxy_timeout',
    'print_customer_receipt', 'print_merchant_receipt'
  ];
  v_old jsonb;
  v_new jsonb;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.station_id IS NOT NULL THEN
      PERFORM realtime.send('{}'::jsonb, 'station_updated', 'station:' || NEW.station_id::text, false);
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.station_id IS NOT NULL THEN
      PERFORM realtime.send('{}'::jsonb, 'station_updated', 'station:' || OLD.station_id::text, false);
    END IF;
  ELSE
    v_old := to_jsonb(OLD);
    v_new := to_jsonb(NEW);
    IF EXISTS (SELECT 1 FROM unnest(v_keys) k WHERE v_old -> k IS DISTINCT FROM v_new -> k) THEN
      IF OLD.station_id IS NOT NULL THEN
        PERFORM realtime.send('{}'::jsonb, 'station_updated', 'station:' || OLD.station_id::text, false);
      END IF;
      IF NEW.station_id IS NOT NULL AND NEW.station_id IS DISTINCT FROM OLD.station_id THEN
        PERFORM realtime.send('{}'::jsonb, 'station_updated', 'station:' || NEW.station_id::text, false);
      END IF;
    END IF;
  END IF;
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'notify_payment_terminal_station failed: % (%)', SQLERRM, SQLSTATE;
  RETURN NULL;
END;
$function$;

REVOKE ALL ON FUNCTION public.notify_payment_terminal_station() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_payment_terminals_notify_station ON public.payment_terminals;
CREATE TRIGGER trg_payment_terminals_notify_station
AFTER INSERT OR UPDATE OR DELETE ON public.payment_terminals
FOR EACH ROW
EXECUTE FUNCTION public.notify_payment_terminal_station();

COMMIT;

-- Verify
--   3.1  select jobname, schedule, command, active from cron.job order by jobname;
--          -> frequent-jobs present; the 7 replaced jobs absent.
--        select status, count(*), max(end_time - start_time) from cron.job_run_details d
--          join cron.job j using (jobid) where j.jobname = 'frequent-jobs'
--           and d.start_time > now() - interval '1 hour' group by 1;
--          -> ~60 succeeded runs per hour, each well under 2 s.
--   3.2  select jobname, schedule, command from cron.job where jobname = 'purge-operational-logs';
--        After the first run: select status, return_message from cron.job_run_details d join cron.job j
--          using (jobid) where j.jobname = 'purge-operational-logs' order by start_time desc limit 1;
--   3.4  A heartbeat must not broadcast, an is_active toggle must broadcast once:
--          select count(*) from realtime.messages where topic = 'station:<id>' and event = 'station_updated'
--             and inserted_at > now() - interval '1 minute';
