-- =============================================================================
-- Fix: Drop the old non-partial unique constraint on category_items
--
-- Migration 20260413000000 added menu_id to category_items and created two
-- partial unique indexes:
--   - category_items_item_cat_nomenu_idx  → (menu_item_id, category_id) WHERE menu_id IS NULL
--   - category_items_item_cat_menu_idx    → (menu_item_id, category_id, menu_id) WHERE menu_id IS NOT NULL
--
-- BUT it never dropped the old non-partial constraint:
--   menu_item_categories_menu_item_id_category_id_key → UNIQUE (menu_item_id, category_id)
--
-- That old constraint covers ALL rows regardless of menu_id, so inserting a new
-- L4 row (menu_id IS NOT NULL) for an item that already has an L2 row (menu_id IS NULL)
-- with the same (menu_item_id, category_id) violates it — even though the partial
-- indexes correctly treat them as distinct rows.
-- =============================================================================

ALTER TABLE public.category_items
  DROP CONSTRAINT IF EXISTS menu_item_categories_menu_item_id_category_id_key;

-- Also drop the old non-partial index if it exists as an index (not a constraint)
DROP INDEX IF EXISTS public.menu_item_categories_menu_item_id_category_id_key;
