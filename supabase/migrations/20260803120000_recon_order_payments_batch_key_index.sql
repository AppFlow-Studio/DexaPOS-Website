-- Fix ADM-016 batch reconciliation timeout (Postgres 57014 / statement_timeout).
--
-- get_admin_settlement_batches() and get_admin_settlement_batch_payments()
-- (defined in 20260510201336_admin_batch_rpcs_use_batch_number.sql) match
-- payments to settlement batches by the host batch number using the expression
--
--     COALESCE(op.batch_number, op.dejavoo_batch_number)
--
-- No index matched that expression, so the per-batch LATERAL in the list RPC
-- sequentially scanned the entire order_payments table once per batch (up to
-- ~250 times per request). As payment volume grew, total cost exceeded the
-- statement_timeout and the RPC was canceled (57014), surfacing in the HQ
-- Transactions > Batch Reconciliation panel.
--
-- This partial expression index makes that equality predicate sargable in both
-- RPCs. It introduces NO query-logic change, so reconciliation totals and
-- discrepancy flags are unaffected.
--
-- ---------------------------------------------------------------------------
-- PROD ROLLOUT NOTE
-- order_payments is on the live POS write path. A plain CREATE INDEX takes a
-- SHARE lock that blocks payment writes for the duration of the build. On prod,
-- build the index CONCURRENTLY out-of-band (outside any transaction) BEFORE this
-- migration runs, so the IF NOT EXISTS below becomes a no-op and no write lock
-- is taken:
--
--   CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_order_payments_recon_batch_key
--     ON public.order_payments (COALESCE(batch_number, dejavoo_batch_number))
--     WHERE COALESCE(batch_number, dejavoo_batch_number) IS NOT NULL;
--
-- On staging (low write volume) the plain build below is fine.
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_order_payments_recon_batch_key
  ON public.order_payments (COALESCE(batch_number, dejavoo_batch_number))
  WHERE COALESCE(batch_number, dejavoo_batch_number) IS NOT NULL;

COMMENT ON INDEX public.idx_order_payments_recon_batch_key IS
  'Sargability for get_admin_settlement_batches / get_admin_settlement_batch_payments host-batch-number match. Fixes ADM-016 reconciliation timeout (57014).';
