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
-- IMPORTANT — HOW THIS FILE WAS APPLIED (do NOT rely on `supabase db push`):
-- `supabase db push` in this repo wraps each migration in a pipeline/transaction,
-- and CREATE/DROP INDEX CONCURRENTLY cannot run inside one (error 25001:
-- "cannot be executed within a pipeline"). So the two statements below were run
-- out-of-band, one at a time, in the Supabase SQL Editor, then the migration
-- history was reconciled with:
--     npx supabase migration repair --status applied 20260629120000
-- If you are setting up a fresh DB, apply these two statements manually the same
-- way (each on its own — CONCURRENTLY cannot share a transaction).
-- =============================================================================

-- Drop the literal-predicate index (no longer matchable by the function gate).
DROP INDEX CONCURRENTLY IF EXISTS public.idx_orders_reportable;

-- Recreate on the function expression so `WHERE is_order_reportable(...)` matches.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_orders_reportable
  ON public.orders (merchant_id, location_id, created_at)
  WHERE is_order_reportable(status, payment_status);
