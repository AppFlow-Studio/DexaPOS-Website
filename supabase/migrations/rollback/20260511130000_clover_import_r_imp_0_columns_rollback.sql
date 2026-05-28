-- Rollback for 20260511130000_clover_import_r_imp_0_columns.sql
--
-- Drops the (source_external_id, source_system) columns from the five
-- menu-domain tables touched by the forward migration:
--   - public.menus
--   - public.menu_items
--   - public.categories
--   - public.modifier_groups
--   - public.modifier_group_items
--
-- NOT applied automatically. Run manually if the forward migration must be
-- reverted. Run LAST in the rollback chain — after the indexes rollback (which
-- targets these columns) and after the dry-runs/function rollbacks (which
-- reference them transitively via payload joins).
--
-- Local:  psql "$DATABASE_URL" -f supabase/migrations/rollback/20260511130000_clover_import_r_imp_0_columns_rollback.sql
-- Remote: paste into Supabase SQL editor and execute.
--
-- WARNING: Dropping these columns destroys the link between Dexa rows and
-- their Clover origin. Any merchant data already imported via the Clover
-- importer will remain in the menu tables but will no longer be re-syncable
-- by Clover ID — re-importing the same file will create duplicates instead
-- of updating in place. Purge clover-owned rows BEFORE running this script
-- if you want a clean reset:
--
--   DELETE FROM public.menu_categories
--    WHERE menu_id IN (SELECT id FROM public.menus WHERE source_system='clover');
--   DELETE FROM public.category_items
--    WHERE menu_id IN (SELECT id FROM public.menus WHERE source_system='clover');
--   DELETE FROM public.menu_item_menus
--    WHERE menu_id IN (SELECT id FROM public.menus WHERE source_system='clover');
--   DELETE FROM public.menu_item_modifier_groups
--    WHERE menu_item_id IN (SELECT id FROM public.menu_items WHERE source_system='clover');
--   DELETE FROM public.modifier_group_items WHERE source_system='clover';
--   DELETE FROM public.modifier_groups      WHERE source_system='clover';
--   DELETE FROM public.menu_items           WHERE source_system='clover';
--   DELETE FROM public.categories           WHERE source_system='clover';
--   DELETE FROM public.menus                WHERE source_system='clover';
--
-- ALTER TABLE ... DROP COLUMN cascades to any constraints/indexes still on
-- those columns, so any index this rollback chain forgot to drop will be
-- cleaned up here as well.

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
