-- =============================================================================
-- Migration: R-IMP-0 — Clover importer partial unique indexes
-- =============================================================================
-- Partial unique indexes that enforce (merchant_id, source_external_id)
-- uniqueness scoped per source_system. They are the on-disk guarantee behind
-- the importer's upsert path.
--
-- Also adds a unique constraint on category_items keyed on
-- (merchant_id, menu_id, category_id, menu_item_id). Today this join table
-- has no uniqueness — the importer needs a real upsert key to avoid duplicate
-- (item, category, menu) rows on re-import. Partial WHERE menu_id IS NOT NULL
-- so legacy rows with NULL menu_id remain valid.
--
-- NOTE on CONCURRENTLY:
--   The five source_* indexes target columns that were just added in
--   20260511130000 and contain no rows yet, so a non-CONCURRENT build is
--   instant and harmless. The category_items index briefly locks the table
--   while building — fine on dev/staging.
--   For production with traffic, prefer applying via the Supabase CLI
--   (`npx supabase migration up`) using a variant of this file that has
--   CONCURRENTLY back on each statement; the CLI auto-detects CONCURRENTLY
--   and skips the transaction wrapper. Studio's SQL editor wraps everything
--   in a transaction and chokes on CONCURRENTLY (error 25001).
-- =============================================================================

CREATE UNIQUE INDEX IF NOT EXISTS ux_menus_clover_source
    ON public.menus (merchant_id, source_external_id)
    WHERE source_system = 'clover' AND source_external_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_menu_items_clover_source
    ON public.menu_items (merchant_id, source_external_id)
    WHERE source_system = 'clover' AND source_external_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_categories_clover_source
    ON public.categories (merchant_id, source_external_id)
    WHERE source_system = 'clover' AND source_external_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_modifier_groups_clover_source
    ON public.modifier_groups (merchant_id, source_external_id)
    WHERE source_system = 'clover' AND source_external_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_modifier_group_items_clover_source
    ON public.modifier_group_items (merchant_id, source_external_id)
    WHERE source_system = 'clover' AND source_external_id IS NOT NULL;
-- category_items: dual-row pattern for (item × menu × category). Partial so
-- legacy rows with NULL menu_id remain valid; new importer-written rows always
-- supply menu_id, so this index is the real upsert key for the importer path.
CREATE UNIQUE INDEX IF NOT EXISTS ux_category_items_merchant_menu_category_item
    ON public.category_items (merchant_id, menu_id, category_id, menu_item_id)
    WHERE menu_id IS NOT NULL;
