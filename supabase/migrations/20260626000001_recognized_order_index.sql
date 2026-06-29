-- =============================================================================
-- Recognized-order partial index (companion to 20260626000000)
-- `orders` is the hottest table — build the index CONCURRENTLY so it does not
-- take a write lock or rewrite the table.
--
-- IMPORTANT: CREATE INDEX CONCURRENTLY cannot run inside a transaction block.
-- The Supabase CLI auto-detects CONCURRENTLY and skips the BEGIN/COMMIT
-- wrapper for this file. If apply_migration wraps statements (error 25001),
-- run this statement individually via psql instead.
-- =============================================================================

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_orders_reportable
  ON public.orders (merchant_id, location_id, created_at)
  WHERE payment_status IN ('paid','captured')
    AND status NOT IN ('draft','cancelled','void','refunded');
