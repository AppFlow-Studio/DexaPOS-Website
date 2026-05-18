-- =============================================================================
-- COMBINED ROLLBACK: Clover Menu Importer (all 5 forward migrations)
-- =============================================================================
-- Runs every rollback step in the correct dependency order, in one file, so
-- you don't have to remember which order to apply the individual rollback
-- scripts in.
--
-- Dependency order (reverse of forward apply):
--   1. Drop functions       — they reference dry-runs table and source_* cols
--   2. Drop dry-runs table  — referenced only by the functions (now gone)
--   3. Delete permission    — pure data, no schema dep
--   4. Drop indexes         — target the source_* columns
--   5. Drop columns         — last; cascades clean up anything missed
--
-- USE WHEN: the forward migration chain partially or fully applied and you
-- need to revert in a single shot. Safe to run on a fresh DB too — every
-- statement uses IF EXISTS.
--
-- Local:  psql "$DATABASE_URL" -f supabase/migrations/rollback/20260511130000_clover_import_ALL_rollback.sql
-- Remote: paste into Supabase SQL editor and execute.
--
-- ⚠️  CAVEATS:
--   - DROP INDEX CONCURRENTLY is NOT used here because this combined script
--     runs inside one transaction. If you need to revert in production with
--     zero downtime, run the individual `_indexes_rollback.sql` first (which
--     uses CONCURRENTLY), then run this script — the IF EXISTS guards on the
--     index drops below will turn them into no-ops.
--   - Any Clover-imported menu data (rows where source_system='clover') will
--     remain in the menu tables after rollback. The source_system column is
--     dropped last, which erases the "this came from Clover" marker. If you
--     want a clean reset, run the DELETE block at the bottom of
--     20260511130000_clover_import_r_imp_0_columns_rollback.sql FIRST.
--   - The staged dry-runs table is dropped — historical record of committed
--     imports (file_hash dedup for FLAG-H) will be lost.
-- =============================================================================


-- ---------------------------------------------------------------------------
-- Step 1: Drop functions (130400)
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.import_clover_menu(uuid, jsonb, text, jsonb);
DROP FUNCTION IF EXISTS public._clover_should_overwrite(text, timestamptz, timestamptz, text);
DROP FUNCTION IF EXISTS public.compute_merchant_menu_fingerprint(uuid);


-- ---------------------------------------------------------------------------
-- Step 2: Drop dry-runs table + its cleanup helper (130200)
-- ---------------------------------------------------------------------------
DROP TABLE    IF EXISTS public.clover_import_dry_runs CASCADE;
DROP FUNCTION IF EXISTS public.cleanup_expired_clover_dry_runs();


-- ---------------------------------------------------------------------------
-- Step 3: Remove permission grants and the permission row (130300)
-- ---------------------------------------------------------------------------
DELETE FROM public.role_permissions
 WHERE permission_code = 'hq.merchant.menu.import';

DELETE FROM public.permissions
 WHERE code = 'hq.merchant.menu.import';


-- ---------------------------------------------------------------------------
-- Step 4: Drop partial unique indexes (130100)
-- Non-CONCURRENT drops; acceptable for rollback because we already dropped
-- the RPC that wrote to these tables, so contention is minimal. See header
-- caveat about CONCURRENTLY if you need zero-downtime revert.
-- ---------------------------------------------------------------------------
DROP INDEX IF EXISTS public.ux_menus_clover_source;
DROP INDEX IF EXISTS public.ux_menu_items_clover_source;
DROP INDEX IF EXISTS public.ux_categories_clover_source;
DROP INDEX IF EXISTS public.ux_modifier_groups_clover_source;
DROP INDEX IF EXISTS public.ux_modifier_group_items_clover_source;
DROP INDEX IF EXISTS public.ux_category_items_merchant_menu_category_item;


-- ---------------------------------------------------------------------------
-- Step 5: Drop source-tracking columns (130000) — last step
-- ---------------------------------------------------------------------------
ALTER TABLE public.menus
    DROP COLUMN IF EXISTS source_external_id,
    DROP COLUMN IF EXISTS source_system;

ALTER TABLE public.menu_items
    DROP COLUMN IF EXISTS source_external_id,
    DROP COLUMN IF EXISTS source_system;

ALTER TABLE public.categories
    DROP COLUMN IF EXISTS source_external_id,
    DROP COLUMN IF EXISTS source_system;

ALTER TABLE public.modifier_groups
    DROP COLUMN IF EXISTS source_external_id,
    DROP COLUMN IF EXISTS source_system;

ALTER TABLE public.modifier_group_items
    DROP COLUMN IF EXISTS source_external_id,
    DROP COLUMN IF EXISTS source_system;


-- ---------------------------------------------------------------------------
-- Verify: every one of these queries should return zero rows after rollback.
-- ---------------------------------------------------------------------------
-- SELECT to_regclass('public.clover_import_dry_runs');                            -- expect NULL
-- SELECT proname FROM pg_proc WHERE proname IN
--   ('import_clover_menu','_clover_should_overwrite',
--    'compute_merchant_menu_fingerprint','cleanup_expired_clover_dry_runs');     -- expect 0 rows
-- SELECT table_name, column_name FROM information_schema.columns
--  WHERE column_name IN ('source_external_id','source_system');                  -- expect 0 rows
-- SELECT 1 FROM public.permissions WHERE code = 'hq.merchant.menu.import';       -- expect 0 rows
-- SELECT indexname FROM pg_indexes WHERE indexname LIKE 'ux_%_clover_source'
--    OR indexname = 'ux_category_items_merchant_menu_category_item';             -- expect 0 rows
