-- ============================================================================
-- Daily cron: auto-complete stale Paid + Ready orders
-- ----------------------------------------------------------------------------
-- Orders are moved to `completed` by a plain UPDATE on the POS/dashboard, but
-- in practice many staff never do it, so fully-paid, prepared orders pile up
-- stuck in status='ready' forever (inflated "open" queues, skewed reports).
--
-- This is the server-side guarantee: a once-a-day sweep that completes clearly
-- stranded IN-HOUSE orders. Mirrors the scheduled-maintenance pattern in
-- 20260915150000_expire_stale_pending_online_orders.sql and
-- 20260715150000_auto_restore_expired_item_snoozes.sql.
--
-- Scope (intentionally conservative):
--   * status = 'ready' AND amount_due <= 0            (fully paid, nothing owed)
--   * ready_at between 7 days and 2 hours ago         (age guard + blast-radius bound)
--   * order_type in dine_in/takeout/catering/qr_dine_in, delivery_platform IS NULL,
--     and NO online_orders row                        (in-house only)
--
-- Why exclude online/delivery:
--   - For delivery/online, status='ready' means ready-for-pickup, NOT delivered.
--   - notify_order_status_change() only pushes a customer "order complete" message
--     for orders with an online_orders row; excluding them keeps this sweep silent.
--
-- A plain UPDATE is exactly right: the existing track_order_status_changes BEFORE
-- trigger stamps completed_at + writes order_status_history, and the AFTER triggers
-- we WANT (loyalty earn, customer metrics, realtime broadcast) fire normally.
-- Each swept row is stamped metadata.auto_completed=true as the audit trail
-- (there is no completed_by column).
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;  -- already enabled; harmless

CREATE OR REPLACE FUNCTION public.auto_complete_stale_ready_orders()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_count integer := 0;
BEGIN
  WITH swept AS (
    UPDATE public.orders o
       SET status   = 'completed',
           metadata = COALESCE(o.metadata, '{}'::jsonb)
                      || jsonb_build_object(
                           'auto_completed', true,
                           'auto_completed_source', 'daily_cron',
                           'auto_completed_at', now()
                         )
     WHERE o.status = 'ready'
       AND o.amount_due <= 0                          -- fully paid, nothing owed
       AND o.ready_at IS NOT NULL
       AND o.ready_at <  now() - interval '2 hours'   -- age guard: not just-marked-ready
       AND o.ready_at >  now() - interval '7 days'    -- blast-radius bound (esp. first run)
       AND o.order_type IN ('dine_in','takeout','catering','qr_dine_in')  -- in-house only
       AND o.delivery_platform IS NULL                -- exclude 3rd-party delivery-tagged
       AND NOT EXISTS (                               -- exclude anything in the online pipeline
             SELECT 1 FROM public.online_orders oo WHERE oo.order_id = o.id
           )
     RETURNING 1
  )
  SELECT count(*) INTO v_count FROM swept;

  RETURN v_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.auto_complete_stale_ready_orders() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.auto_complete_stale_ready_orders() TO service_role;

COMMENT ON FUNCTION public.auto_complete_stale_ready_orders() IS
  'Daily: completes in-house (dine_in/takeout/catering/qr_dine_in) orders that are fully paid '
  '(amount_due<=0) and have sat in status=ready >2h (within the last 7 days). Excludes online/'
  'delivery orders so no customer completion notification fires. Stamps metadata.auto_completed. '
  'Normal completion triggers (completed_at, status history, loyalty earn, customer metrics, realtime) run.';

-- Idempotent (re)schedule — daily at 08:00 UTC (overnight in the Americas).
DO $$
BEGIN
  PERFORM cron.unschedule('auto-complete-stale-ready-orders');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

SELECT cron.schedule(
  'auto-complete-stale-ready-orders',
  '0 8 * * *',
  $cron$SELECT public.auto_complete_stale_ready_orders()$cron$
);
