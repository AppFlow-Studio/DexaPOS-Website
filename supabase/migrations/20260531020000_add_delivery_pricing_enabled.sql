-- Adds a store-level toggle for separate online/delivery pricing.
--
-- When TRUE (default, preserves current behavior): online orders use each
-- menu item's delivery_price (the online upcharge).
-- When FALSE: online orders use the regular menu price (no online upcharge).
--
-- Consumed by the storefront display, cart, checkout, order tracking, and the
-- create-online-order edge function so the price shown always matches the
-- price charged.

ALTER TABLE public.online_store_config
  ADD COLUMN IF NOT EXISTS delivery_pricing_enabled boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.online_store_config.delivery_pricing_enabled IS
  'When true, online orders use menu_items.delivery_price; when false, use the regular price. Default true preserves existing behavior.';
