-- Rollback for 20260511130100_clover_import_r_imp_0_indexes.sql
--
-- Drops the six partial unique indexes created by the forward migration:
--   - ux_menus_clover_source
--   - ux_menu_items_clover_source
--   - ux_categories_clover_source
--   - ux_modifier_groups_clover_source
--   - ux_modifier_group_items_clover_source
--   - ux_category_items_merchant_menu_category_item
--
-- Uses plain DROP INDEX (no CONCURRENTLY) so this script works under the
-- Studio SQL editor and any other runner that wraps statements in a
-- transaction.
--
-- For zero-downtime production revert, manually re-run each statement with
-- the CONCURRENTLY keyword via the Supabase CLI instead — the CLI auto-
-- detects CONCURRENTLY and skips the transaction wrapper:
--
--   DROP INDEX CONCURRENTLY IF EXISTS public.ux_menus_clover_source;
--   (etc.)
--
-- NOT applied automatically. Run manually if the forward migration must be
-- reverted. Run BEFORE the columns rollback — once the columns are dropped
-- these indexes would be cascade-dropped anyway, but doing it explicitly is
-- cleaner.
--
-- Local:  psql "$DATABASE_URL" -f supabase/migrations/rollback/20260511130100_clover_import_r_imp_0_indexes_rollback.sql
-- Remote: paste into Supabase SQL editor and execute.

DROP INDEX IF EXISTS public.ux_menus_clover_source;
DROP INDEX IF EXISTS public.ux_menu_items_clover_source;
DROP INDEX IF EXISTS public.ux_categories_clover_source;
DROP INDEX IF EXISTS public.ux_modifier_groups_clover_source;
DROP INDEX IF EXISTS public.ux_modifier_group_items_clover_source;
DROP INDEX IF EXISTS public.ux_category_items_merchant_menu_category_item;
