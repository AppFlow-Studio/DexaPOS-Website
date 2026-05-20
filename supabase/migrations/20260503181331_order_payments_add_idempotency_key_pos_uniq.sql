-- Wave Cat-B partial unique index. NOTE: production deploy must use
-- CREATE UNIQUE INDEX CONCURRENTLY via direct psql — the Supabase MCP
-- tooling wraps in a tx, which CONCURRENTLY can't run inside. Staging
-- accepts the brief write lock on a 3.8K-row table.
CREATE UNIQUE INDEX IF NOT EXISTS
  order_payments_idempotency_key_pos_uniq
  ON public.order_payments (idempotency_key)
  WHERE idempotency_key IS NOT NULL AND payment_device_id IS NULL;

COMMENT ON INDEX public.order_payments_idempotency_key_pos_uniq IS
  'Wave Cat-B partial unique: enforces dedupe of order_payments rows written by process_payment_v9 (where payment_device_id is NULL). Complements NMI''s uq_order_payments_idempotency for the no-device subspace.';;
