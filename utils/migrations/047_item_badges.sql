-- Migration 047: Add location-specific item badges
-- Both are stored booleans set manually per branch.

ALTER TABLE public.location_item_overrides
  ADD COLUMN IF NOT EXISTS is_popular boolean NOT NULL DEFAULT false;

ALTER TABLE public.location_item_overrides
  ADD COLUMN IF NOT EXISTS is_new boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.location_item_overrides.is_popular IS 'Flag this item as Popular at this specific branch';
COMMENT ON COLUMN public.location_item_overrides.is_new IS 'Flag this item as New at this specific branch';
