-- Rollback for 20260511130300_clover_import_permission.sql
--
-- Removes:
--   1. The hq.merchant.menu.import permission grants on role_permissions.
--   2. The permission row itself from public.permissions.
--
-- Order matters: role_permissions.permission_code has an FK to permissions.code,
-- so we delete the grants first, then the parent row.
--
-- NOT applied automatically. Run manually if the forward migration must be
-- reverted.
--
-- Local:  psql "$DATABASE_URL" -f supabase/migrations/rollback/20260511130300_clover_import_permission_rollback.sql
-- Remote: paste into Supabase SQL editor and execute.
--
-- NOTE: This is pure data; no schema impact. Safe to re-run.

DELETE FROM public.role_permissions
 WHERE permission_code = 'hq.merchant.menu.import';

DELETE FROM public.permissions
 WHERE code = 'hq.merchant.menu.import';
