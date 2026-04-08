-- Fix RLS policies for item_sizes and item_addons.
-- The original policies assumed merchant_id is always set, but the CHECK
-- constraint enforces (merchant_id XOR menu_item_id).  When rows are
-- inserted with menu_item_id only, the old policies would fail.
-- This migration replaces them with CASE-based policies that resolve
-- the merchant through menu_items when merchant_id is NULL.

-- ============================================================================
-- 1. Drop old policies
-- ============================================================================
DROP POLICY IF EXISTS "item_sizes_manage"  ON public.item_sizes;
DROP POLICY IF EXISTS "item_sizes_view"    ON public.item_sizes;
DROP POLICY IF EXISTS "item_addons_manage" ON public.item_addons;
DROP POLICY IF EXISTS "item_addons_view"   ON public.item_addons;

-- ============================================================================
-- 2. Recreate with dual-path merchant resolution
-- ============================================================================

-- item_sizes
CREATE POLICY "item_sizes_manage" ON public.item_sizes
  USING (
    CASE
      WHEN merchant_id IS NOT NULL THEN public.check_merchant_access(merchant_id, 'merchant.products.manage'::text)
      ELSE public.check_merchant_access(
        (SELECT mi.merchant_id FROM public.menu_items mi WHERE mi.id = menu_item_id),
        'merchant.products.manage'::text)
    END
  );

CREATE POLICY "item_sizes_view" ON public.item_sizes
  FOR SELECT USING (
    CASE
      WHEN merchant_id IS NOT NULL THEN public.check_merchant_access(merchant_id, NULL::text)
      ELSE public.check_merchant_access(
        (SELECT mi.merchant_id FROM public.menu_items mi WHERE mi.id = menu_item_id),
        NULL::text)
    END
  );

-- item_addons
CREATE POLICY "item_addons_manage" ON public.item_addons
  USING (
    CASE
      WHEN merchant_id IS NOT NULL THEN public.check_merchant_access(merchant_id, 'merchant.products.manage'::text)
      ELSE public.check_merchant_access(
        (SELECT mi.merchant_id FROM public.menu_items mi WHERE mi.id = menu_item_id),
        'merchant.products.manage'::text)
    END
  );

CREATE POLICY "item_addons_view" ON public.item_addons
  FOR SELECT USING (
    CASE
      WHEN merchant_id IS NOT NULL THEN public.check_merchant_access(merchant_id, NULL::text)
      ELSE public.check_merchant_access(
        (SELECT mi.merchant_id FROM public.menu_items mi WHERE mi.id = menu_item_id),
        NULL::text)
    END
  );
