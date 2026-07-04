-- =============================================================================
-- Recognized-order index, function-expression form
--
-- Why: the original partial index (20260626000001) was written with literal
-- predicates:
--     WHERE payment_status IN ('paid','captured')
--       AND status NOT IN ('draft','cancelled','void','refunded')
-- but every reporting query gates via is_order_reportable(status, payment_status).
-- Postgres does NOT inline a function body when matching a partial-index
-- predicate, so it could not prove `WHERE is_order_reportable(...)` implies the
-- literal predicate — and skipped the index (EXPLAIN showed a post-Filter on a
-- different composite index instead).
--
-- Fix: define the partial index ON the function expression itself, so the
-- planner matches `WHERE is_order_reportable(...)` directly. This also keeps a
-- single source of truth: index and queries both reference the same function.
--
-- is_order_reportable is IMMUTABLE, which is required for use in an index.
--
-- NOTE: this migration intentionally does NOT use CREATE/DROP INDEX
-- CONCURRENTLY. `supabase db push`/`db reset` wrap each migration in a
-- transaction/pipeline, and CONCURRENTLY cannot run inside one (error 25001:
-- "cannot be executed within a pipeline"). Plain (transactional) index DDL is
-- safe here: fresh DBs have a small/empty `orders` table so the brief lock is a
-- non-issue, and production already had this index built out-of-band and its
-- migration history reconciled, so this file will not re-run there.
-- =============================================================================

-- Drop the literal-predicate index (no longer matchable by the function gate).
DROP INDEX IF EXISTS public.idx_orders_reportable;

-- Recreate on the function expression so `WHERE is_order_reportable(...)` matches.
CREATE INDEX IF NOT EXISTS idx_orders_reportable
  ON public.orders (merchant_id, location_id, created_at)
  WHERE is_order_reportable(status, payment_status);
