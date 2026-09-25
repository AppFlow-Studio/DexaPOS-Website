-- Rollback for 20260925120000_remove_kds_board_snapshots.sql
-- Restores the KDS board snapshot feature: tables, capture/drain/purge/HQ
-- functions, the order_items arrival triggers, both cron jobs, and the
-- bump RPC body that enqueues a snapshot. Snapshot history is NOT restored
-- (removed by decision).
--
-- The three source migrations are idempotent (IF NOT EXISTS / CREATE OR
-- REPLACE / DROP ... IF EXISTS), so the rollback re-runs them in timestamp
-- order, in one transaction. Order matters: 20260827150000 alone installs an
-- older bulk_update_order_item_status_v2 (no order lock, no lock_timeout);
-- 20260922120000 must run last so the final body keeps both.
--
-- psql (from supabase/migrations/rollback/):
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f 20260925120000_remove_kds_board_snapshots_rollback.sql
-- SQL editor: paste the three files below, in this order, into one run.

BEGIN;
\ir ../20260827150000_hq_kds_board_mirror.sql
\ir ../20260827170000_restore_board_snapshot_capture.sql
\ir ../20260922120000_kds_bump_snapshot_queue.sql
COMMIT;

NOTIFY pgrst, 'reload schema';
