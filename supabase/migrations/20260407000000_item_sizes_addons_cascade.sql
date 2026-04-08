-- Migration: Add ON DELETE CASCADE to item_sizes, item_addons, and other
-- child tables of menu_items so that deleting a menu item properly
-- cleans up all related records.
--
-- NOTE: order_items.selected_size_id is intentionally SET NULL so that
-- historical order data is preserved when a size is deleted.

-- ============================================================================
-- 1. item_sizes → menu_items  (CASCADE)
-- ============================================================================
ALTER TABLE public.item_sizes
  DROP CONSTRAINT item_sizes_menu_item_id_fkey,
  ADD CONSTRAINT item_sizes_menu_item_id_fkey
    FOREIGN KEY (menu_item_id) REFERENCES public.menu_items(id) ON DELETE CASCADE;

-- ============================================================================
-- 2. item_addons → menu_items  (CASCADE)
-- ============================================================================
ALTER TABLE public.item_addons
  DROP CONSTRAINT item_addons_menu_item_id_fkey,
  ADD CONSTRAINT item_addons_menu_item_id_fkey
    FOREIGN KEY (menu_item_id) REFERENCES public.menu_items(id) ON DELETE CASCADE;

-- ============================================================================
-- 3. order_items.selected_size_id → item_sizes  (SET NULL)
--    Preserve historical orders when a size is removed.
-- ============================================================================
ALTER TABLE public.order_items
  DROP CONSTRAINT order_items_selected_size_id_fkey,
  ADD CONSTRAINT order_items_selected_size_id_fkey
    FOREIGN KEY (selected_size_id) REFERENCES public.item_sizes(id) ON DELETE SET NULL;

-- ============================================================================
-- 4. RLS policies for item_sizes and item_addons
--    Matches the pattern used by menu_items:
--      _manage → check_merchant_access(merchant_id, 'merchant.products.manage')
--      _view   → check_merchant_access(merchant_id, NULL)  (SELECT only)
-- ============================================================================

-- item_sizes
ALTER TABLE public.item_sizes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "item_sizes_manage" ON public.item_sizes
  USING (public.check_merchant_access(merchant_id, 'merchant.products.manage'::text));

CREATE POLICY "item_sizes_view" ON public.item_sizes
  FOR SELECT USING (public.check_merchant_access(merchant_id, NULL::text));

-- item_addons
ALTER TABLE public.item_addons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "item_addons_manage" ON public.item_addons
  USING (public.check_merchant_access(merchant_id, 'merchant.products.manage'::text));

CREATE POLICY "item_addons_view" ON public.item_addons
  FOR SELECT USING (public.check_merchant_access(merchant_id, NULL::text));

-- ============================================================================
-- 5. updated_at triggers (use IF NOT EXISTS to avoid errors if already created)
-- ============================================================================
DROP TRIGGER IF EXISTS update_item_sizes_updated_at ON public.item_sizes;
CREATE TRIGGER update_item_sizes_updated_at
  BEFORE UPDATE ON public.item_sizes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_item_addons_updated_at ON public.item_addons;
CREATE TRIGGER update_item_addons_updated_at
  BEFORE UPDATE ON public.item_addons
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
