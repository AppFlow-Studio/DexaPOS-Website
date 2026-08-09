-- ============================================================================
-- ROLLBACK — AUD-9 get_previous_orders_page_v1 + idx_orders_history_keyset
-- ============================================================================
-- Reverses:
--   supabase/migrations/20260810120000_get_previous_orders_page_v1.sql
--   supabase/migrations/20260810120100_idx_orders_history_keyset.sql
--
-- Safe at any time: the function is read-only and additive, and nothing calls
-- it until the tablet client cuts over. No data is touched by either direction.
--
-- If the client HAS already cut over, dropping the function breaks Previous
-- Orders on every station — revert the client first.
-- ============================================================================

DROP FUNCTION IF EXISTS public.get_previous_orders_page_v1(
  uuid, date, public.order_type, text, jsonb, int
);

-- ⚠ CREATE/DROP INDEX CONCURRENTLY cannot run inside a transaction block.
--    Run this statement standalone.
--
-- Dropping is only correct if this index was created by the AUD-9 migration.
-- It is distinct from idx_orders_history_bootstrap (20260529130100), which
-- predates this ticket and must be left in place.
DROP INDEX CONCURRENTLY IF EXISTS public.idx_orders_history_keyset;
