-- Rollback for 20260511130200_clover_import_dry_runs.sql
--
-- Drops:
--   1. The clover_import_dry_runs table (CASCADE also drops the cleanup
--      trigger and the RLS policy attached to it).
--   2. The cleanup_expired_clover_dry_runs() function — the trigger went away
--      with the table but the function lives separately and must be dropped
--      explicitly.
--
-- NOT applied automatically. Run manually if the forward migration must be
-- reverted. Run AFTER the import_clover_menu_fn rollback (the RPC reads from
-- this table; dropping the table while the function still references it would
-- leave the function in a broken state — it would still load but fail at
-- runtime).
--
-- Local:  psql "$DATABASE_URL" -f supabase/migrations/rollback/20260511130200_clover_import_dry_runs_rollback.sql
-- Remote: paste into Supabase SQL editor and execute.
--
-- WARNING: All staged dry-runs and the historical record of committed imports
-- (used by FLAG-H for file-hash dedup) will be lost. Re-importing the same
-- Clover file after rollback + re-apply will NOT raise FLAG-H.

DROP TABLE IF EXISTS public.clover_import_dry_runs CASCADE;

DROP FUNCTION IF EXISTS public.cleanup_expired_clover_dry_runs();
