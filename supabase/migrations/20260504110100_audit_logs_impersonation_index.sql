-- =============================================================================
-- Migration: Partial index on audit_logs for impersonation queries
-- =============================================================================
-- Companion to 20260504110000_hq_merchant_impersonation.sql.
--
-- Why a separate file:
--   CREATE INDEX CONCURRENTLY cannot run inside a transaction. Supabase wraps
--   every migration file in a transaction by default, so this index must be
--   the only statement in its file. The Supabase migration runner detects
--   CONCURRENTLY and skips the BEGIN/COMMIT wrapper for it.
--
-- Why a partial index:
--   The only query pattern that needs this index is "show impersonation
--   activity for merchant X" — i.e. WHERE is_impersonation = true AND
--   merchant_id = ?. Indexing the full table would be wasteful: the vast
--   majority of audit_logs rows are non-impersonation (is_impersonation=false)
--   and would be skipped at query time anyway. The partial index is orders of
--   magnitude smaller and matches the predicate exactly.
--
-- Sort order: created_at DESC matches the default sort of the audit UI.
-- Column verified against audit_logs definition in
-- supabase/migrations/20260413215901_remote_schema.sql:31840.
-- =============================================================================

CREATE INDEX CONCURRENTLY IF NOT EXISTS audit_logs_impersonation_idx
    ON public.audit_logs (merchant_id, created_at DESC)
    WHERE is_impersonation = true;
