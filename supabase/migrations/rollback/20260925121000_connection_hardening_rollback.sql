-- Rollback for 20260925121000_connection_hardening.sql
-- Stops the station push first, then the retention job, then restores the
-- seven individual cron jobs and removes the dispatcher. Rows already purged
-- and raw_payload bodies already stripped are not restored.
--
-- mark-stale-stations-offline has no tracked migration. The forward
-- migration printed its live command as a NOTICE ("unscheduling cron job
-- ..."); if that differs from the command below, use the printed one.

BEGIN;

-- 3.4
DROP TRIGGER IF EXISTS trg_payment_terminals_notify_station ON public.payment_terminals;
DROP TRIGGER IF EXISTS trg_stations_notify_deleted ON public.stations;
DROP TRIGGER IF EXISTS trg_stations_notify_updated ON public.stations;
DROP FUNCTION IF EXISTS public.notify_payment_terminal_station();
DROP FUNCTION IF EXISTS public.notify_station_updated();

-- 3.2
DO $$
BEGIN
  PERFORM cron.unschedule('purge-operational-logs');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
DROP PROCEDURE IF EXISTS public.purge_operational_logs(integer, integer, timestamptz);

-- 3.1
SELECT cron.schedule('orderout-status-relay-drain', '* * * * *',
  $cron$SELECT public.poke_orderout_status_relay()$cron$);
SELECT cron.schedule('orderout-delivery-dispatch-drain', '* * * * *',
  $cron$SELECT public.poke_orderout_delivery_dispatch()$cron$);
SELECT cron.schedule('expire-stale-pending-online-orders', '* * * * *',
  $cron$SELECT public.expire_stale_pending_online_orders()$cron$);
SELECT cron.schedule('mark-stale-stations-offline', '*/2 * * * *',
  $cron$SELECT public.mark_stale_stations_offline()$cron$);
SELECT cron.schedule('restore-expired-item-snoozes', '*/5 * * * *',
  $cron$SELECT public.restore_expired_item_snoozes()$cron$);
SELECT cron.schedule('orderout-delivery-dispatch-sweep', '*/5 * * * *',
  $cron$SELECT public.sweep_orderout_delivery_dispatches()$cron$);
SELECT cron.schedule('website-reservation-request-expiry', '*/15 * * * *',
  $cron$SELECT public.poke_reservation_request_expiry()$cron$);

DO $$
BEGIN
  PERFORM cron.unschedule('frequent-jobs');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
DROP FUNCTION IF EXISTS public.run_frequent_jobs();

COMMIT;
