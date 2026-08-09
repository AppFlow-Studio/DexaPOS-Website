-- ============================================================================
-- idx_orders_history_keyset — supports get_previous_orders_page_v1
-- ============================================================================
-- Ticket: [POS-PERF] AUD-9 · Plan §4.1
--
-- The existing idx_orders_history_bootstrap (20260529130100) cannot serve this
-- query, for two independent reasons:
--
--   1. Predicate implication. That index is partial on
--      status IN ('completed','cancelled','void'). The RPC's history set also
--      includes 'refunded' and 'declined', so the query predicate does not
--      imply the index predicate and Postgres cannot match it.
--
--   2. Missing id. That index is (location_id, created_at DESC). The RPC
--      orders by (created_at DESC, id DESC) and seeks with the row-wise
--      comparison (created_at, id) < (?, ?). Without id in the index, ties on
--      created_at still need sorting and the keyset seek cannot be driven
--      cleanly off the index.
--
-- The predicate below MUST stay in sync with v_history_statuses in
-- 20260810120000_get_previous_orders_page_v1.sql. If that set changes and this
-- predicate does not, the index silently stops being used — a performance
-- regression with no functional symptom.
--
-- ---------------------------------------------------------------------------
-- ⚠ CREATE INDEX CONCURRENTLY cannot run inside a transaction block.
--    Run this file as a standalone statement. If the migration runner wraps
--    statements in a transaction, apply it manually via the SQL editor and
--    then `supabase migration repair --status applied <version>`.
--
-- ⚠ Per plan §8, this index must not be created until an EXPLAIN (ANALYZE,
--    BUFFERS) at Charcoal data volume justifies it (Step 3). It is written
--    here so the migration exists and is reviewable; do not apply it blind.
-- ============================================================================

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_orders_history_keyset
  ON public.orders (location_id, created_at DESC, id DESC)
  WHERE status IN ('completed', 'cancelled', 'void', 'refunded', 'declined');

COMMENT ON INDEX public.idx_orders_history_keyset IS
  'AUD-9: keyset + ordering support for get_previous_orders_page_v1. Predicate '
  'mirrors v_history_statuses in that function — change both together.';
