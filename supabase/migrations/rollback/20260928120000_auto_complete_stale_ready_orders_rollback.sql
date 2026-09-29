-- Rollback for 20260928120000_auto_complete_stale_ready_orders.sql
-- Unschedules the daily cron and drops the function. Already-completed orders
-- are left as-is (this only stops future sweeps).

DO $$
BEGIN
  PERFORM cron.unschedule('auto-complete-stale-ready-orders');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

DROP FUNCTION IF EXISTS public.auto_complete_stale_ready_orders();
