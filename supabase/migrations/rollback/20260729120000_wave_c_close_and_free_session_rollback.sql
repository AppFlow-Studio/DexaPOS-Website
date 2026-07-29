-- Rollback for Wave C — close_and_free_session + paid_at backfill.
--
-- Drops the RPC. The paid_at backfill is a CORRECTNESS fix (paid_at was
-- wrongly NULL) and is intentionally NOT auto-reverted — re-NULLing it would
-- re-blind turn-time analytics. If a revert is genuinely required, the
-- commented statement below re-NULLs only rows this migration could have
-- stamped (paid_at exactly equals the order's max capture time); run it
-- deliberately, not as part of an automatic rollback.

DROP FUNCTION IF EXISTS public.close_and_free_session(uuid, uuid, uuid, text);

-- Optional, manual-only paid_at revert (DO NOT run unless you must):
-- UPDATE public.table_sessions ts
-- SET paid_at = NULL
-- FROM (
--   SELECT o.session_id, MAX(op.captured_at) AS max_captured
--   FROM public.orders o
--   JOIN public.order_payments op ON op.order_id = o.id
--   WHERE op.status = 'captured' AND o.payment_status = 'paid'
--     AND o.session_id IS NOT NULL
--   GROUP BY o.session_id
-- ) src
-- WHERE ts.id = src.session_id AND ts.paid_at = src.max_captured;
