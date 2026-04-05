-- Discounts location scoping: indexes for merchant/location filtering and expiry lookups.
-- The discounts.location_id column already exists as nullable; this migration only adds
-- supporting indexes so location-scoped and expiry-aware queries perform well.

-- Compound index to speed up the merchant + location filter used by listDiscounts().
CREATE INDEX IF NOT EXISTS idx_discounts_merchant_location
  ON public.discounts (merchant_id, location_id);

-- Partial index on end_date so expiry filtering ("hide expired") stays cheap.
CREATE INDEX IF NOT EXISTS idx_discounts_end_date
  ON public.discounts (end_date)
  WHERE end_date IS NOT NULL;
