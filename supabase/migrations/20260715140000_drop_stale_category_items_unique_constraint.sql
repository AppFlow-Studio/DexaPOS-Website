-- Fix: item edits fail with
--   "duplicate key value violates unique constraint
--    menu_item_categories_menu_item_id_category_id_key".
--
-- category_items legitimately holds the same (menu_item_id, category_id) twice for
-- L4 pricing: a global row (menu_id IS NULL) and a menu-specific row (menu_id set).
-- Correct uniqueness is enforced by the partial indexes
-- category_items_item_cat_nomenu_idx / category_items_item_cat_menu_idx.
--
-- The flat UNIQUE(menu_item_id, category_id) is stale drift: the original drop
-- (20260413030000) targeted the pre-rename table name `menu_item_categories`, so it
-- never dropped it on the real `category_items` table, and a later remote_schema dump
-- re-added it. Drop it here on the correct table (idempotent).

ALTER TABLE public.category_items
  DROP CONSTRAINT IF EXISTS menu_item_categories_menu_item_id_category_id_key;

DROP INDEX IF EXISTS public.menu_item_categories_menu_item_id_category_id_key;
