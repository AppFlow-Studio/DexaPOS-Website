-- =============================================================================
-- Migration: Enforce uniqueness on (provider, provider_order_id) for online_orders
--
-- Why:
--   The create-online-order edge function previously generated a fresh
--   transactionReferenceId from Date.now() on every request, so client-supplied
--   idempotency keys were ignored. Retries (network blips, double-clicks, POS
--   tablet offline-queue replays, Orderout webhook redelivery) created duplicate
--   orders — a customer-double-charge risk.
--
--   The fix in supabase/functions/create-online-order/index.ts now reads the
--   client's Idempotency-Key header (or transaction_reference_id body field) and
--   stores it as provider_order_id. Client retries reuse the same key, so the
--   server can dedupe by (provider, provider_order_id).
--
--   This migration enforces uniqueness at the DB layer so that even if the
--   application-level Step 1.5 SELECT race-loses to a concurrent retry, the
--   second insert still cannot create a duplicate row.
--
-- The non-unique supporting index already exists from migration 20260425000000:
--   idx_online_orders_provider_order_id ON (provider, provider_order_id)
-- We promote it to a UNIQUE constraint here.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Pre-flight: detect any existing duplicates so the migration fails loudly
--    with a clear error instead of a generic "duplicate key" later.
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  v_dup_count INT;
BEGIN
  SELECT COUNT(*) INTO v_dup_count
  FROM (
    SELECT 1
    FROM public.online_orders
    WHERE provider IS NOT NULL AND provider_order_id IS NOT NULL
    GROUP BY provider, provider_order_id
    HAVING COUNT(*) > 1
  ) AS dups;

  IF v_dup_count > 0 THEN
    RAISE EXCEPTION
      'Cannot install unique constraint: % (provider, provider_order_id) groups have duplicates. '
      'Run this query to find them: SELECT provider, provider_order_id, COUNT(*) '
      'FROM public.online_orders WHERE provider IS NOT NULL AND provider_order_id IS NOT NULL '
      'GROUP BY 1, 2 HAVING COUNT(*) > 1;', v_dup_count;
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 2. Drop the old non-unique index (will be replaced by the unique one).
--    Safe to drop because the unique index below covers the same query shape.
-- -----------------------------------------------------------------------------
DROP INDEX IF EXISTS public.idx_online_orders_provider_order_id;
DROP INDEX IF EXISTS public.idx_online_orders_provider_order_id_uniq;
-- -----------------------------------------------------------------------------
-- 3. Create a UNIQUE index that doubles as the lookup index for Step 1.5.
--    Partial: only enforces uniqueness when both provider and provider_order_id
--    are non-null. This preserves backwards compatibility for any historical
--    rows where provider_order_id was nullable (pre-migration 20260425000000
--    rows may have NULLs). NULLs in unique indexes are not deduped by Postgres
--    by default, but the partial WHERE clause makes the intent explicit.
-- -----------------------------------------------------------------------------
CREATE UNIQUE INDEX idx_online_orders_provider_order_id_uniq
  ON public.online_orders (provider, provider_order_id)
  WHERE provider IS NOT NULL AND provider_order_id IS NOT NULL;
COMMENT ON INDEX public.idx_online_orders_provider_order_id_uniq IS
  'Enforces idempotency on online_orders. The create-online-order edge function reads client Idempotency-Key header and stores it as provider_order_id. Concurrent retries with the same key collide on this index — the second one is caught in the function and converted to a 200 OK with idempotent=true.';