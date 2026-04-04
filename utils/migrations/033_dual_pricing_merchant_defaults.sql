-- ============================================================================
-- Migration: Dual Pricing Merchant Defaults
-- Adds merchant-level default pricing strategy that locations inherit
-- ============================================================================

-- 1. Add pricing columns to merchants table
ALTER TABLE merchants
  ADD COLUMN IF NOT EXISTS pricing_strategy TEXT NOT NULL DEFAULT 'manual'
    CHECK (pricing_strategy IN ('manual', 'dual')),
  ADD COLUMN IF NOT EXISTS dual_pricing_percentage NUMERIC(5,2) NOT NULL DEFAULT 4.0
    CHECK (dual_pricing_percentage >= 0 AND dual_pricing_percentage <= 100);

-- 2. Add use_merchant_pricing_defaults to locations table
ALTER TABLE locations
  ADD COLUMN IF NOT EXISTS use_merchant_pricing_defaults BOOLEAN NOT NULL DEFAULT true;

-- 3. Backfill: locations that already have dual pricing configured get use_merchant_pricing_defaults = false
UPDATE locations
SET use_merchant_pricing_defaults = false
WHERE pricing_strategy = 'dual';

-- 4. Create get_effective_pricing function
CREATE OR REPLACE FUNCTION get_effective_pricing(p_location_id UUID)
RETURNS TABLE (
  pricing_strategy TEXT,
  dual_pricing_percentage NUMERIC,
  source TEXT
) LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_location RECORD;
  v_merchant RECORD;
BEGIN
  -- Get location
  SELECT l.merchant_id, l.use_merchant_pricing_defaults,
         l.pricing_strategy AS loc_strategy, l.dual_pricing_percentage AS loc_percentage
  INTO v_location
  FROM locations l
  WHERE l.id = p_location_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- If location uses merchant defaults, return merchant values
  IF v_location.use_merchant_pricing_defaults THEN
    SELECT m.pricing_strategy, m.dual_pricing_percentage
    INTO v_merchant
    FROM merchants m
    WHERE m.id = v_location.merchant_id;

    pricing_strategy := v_merchant.pricing_strategy;
    dual_pricing_percentage := v_merchant.dual_pricing_percentage;
    source := 'merchant';
    RETURN NEXT;
  ELSE
    pricing_strategy := v_location.loc_strategy;
    dual_pricing_percentage := v_location.loc_percentage;
    source := 'location';
    RETURN NEXT;
  END IF;
END;
$$;
