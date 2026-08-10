-- ============================================================================
-- idx_orders_history_keyset — supports get_previous_orders_page_v1
-- ============================================================================
-- Ticket: [POS-PERF] AUD-9 · Plan §4.1
--
-- ⚠ DO NOT APPLY BEFORE THE STEP 3 EXPLAIN. This file exists so the candidate
--   is reviewable, not so it can be run. Every index here must be justified by
--   an EXPLAIN (ANALYZE, BUFFERS) row at Charcoal data volume first.
--
-- ---------------------------------------------------------------------------
-- Why the existing indexes do not serve this query
-- ---------------------------------------------------------------------------
-- idx_orders_history_bootstrap (20260529130100) is
--   (location_id, created_at DESC) WHERE status IN ('completed','cancelled','void')
--
-- Its partial predicate cannot be matched. An earlier draft of this ticket
-- assumed the RPC would filter to a fixed set of terminal statuses, which would
-- have implied that predicate. It does not: the screen applies NO status filter
-- by default (see A2 in the function), so the query cannot imply any partial
-- predicate on status. The bootstrap index is therefore unusable here — and it
-- is left in place untouched, because the active-orders path still uses it.
--
-- It also lacks `id`, which both the sort and the keyset seek need.
--
-- ---------------------------------------------------------------------------
-- Direction matters, and rules out a single index
-- ---------------------------------------------------------------------------
-- The tiebreaker is `id ASC` under every sort, including the DESC ones (this
-- mirrors historyOrderFilters.ts). A btree can be scanned backwards, but that
-- inverts BOTH columns: reading (created_at DESC, id ASC) backwards yields
-- (created_at ASC, id DESC) — which is not what date_asc asks for. So each
-- sort direction needs its own index, or accepts a sort step.
--
-- Only the DEFAULT sort is indexed below. date_desc is what the screen opens
-- on and is the overwhelming majority of traffic; the other three should be
-- added only if the Step 3 EXPLAIN shows they actually hurt at real volume.
-- Adding four indexes to `orders` on speculation is a worse trade than a sort
-- on a filtered subset.
--
-- ⚠ CREATE INDEX CONCURRENTLY cannot run inside a transaction block. Run each
--   statement standalone. If the migration runner wraps statements, apply via
--   the SQL editor and then `supabase migration repair --status applied`.
-- ============================================================================

-- Default sort: date_desc → ORDER BY created_at DESC, id ASC
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_orders_history_keyset
  ON public.orders (location_id, created_at DESC, id ASC);

COMMENT ON INDEX public.idx_orders_history_keyset IS
  'AUD-9: keyset + ordering support for get_previous_orders_page_v1 default sort '
  '(date_desc, id ASC tiebreak). Not partial — the RPC applies no unconditional '
  'status filter, so no partial predicate can be implied.';

-- ---------------------------------------------------------------------------
-- Candidates for the non-default sorts. Left commented deliberately: add only
-- with an EXPLAIN row justifying each.
-- ---------------------------------------------------------------------------
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_orders_history_keyset_date_asc
--   ON public.orders (location_id, created_at ASC, id ASC);
--
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_orders_history_keyset_amt_desc
--   ON public.orders (location_id, total_amount DESC, id ASC);
--
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_orders_history_keyset_amt_asc
--   ON public.orders (location_id, total_amount ASC, id ASC);
