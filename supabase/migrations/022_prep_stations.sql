-- ============================================================================
-- Migration 022: Prep Stations
-- Description: Location-scoped prep stations for KDS item routing.
-- Allows merchants to define managed prep stations (Grill, Fryer, Bar, etc.)
-- and assign them to items/categories for routing to KDS displays.
--
-- Resolution chain: Item override > Category default > Expo (catch-all)
-- ============================================================================

-- ============================================================================
-- 1. prep_stations table — location-scoped managed prep stations
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.prep_stations (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    merchant_id UUID NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
    location_id UUID NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    color TEXT NOT NULL DEFAULT '#3B82F6',
    display_order INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Unique station name per location
    CONSTRAINT uq_prep_station_location_name UNIQUE (location_id, name)
);

-- Partial index for active stations per location (common query pattern)
CREATE INDEX IF NOT EXISTS idx_prep_stations_location_active
    ON public.prep_stations (location_id)
    WHERE is_active = true;

-- Merchant lookup index
CREATE INDEX IF NOT EXISTS idx_prep_stations_merchant
    ON public.prep_stations (merchant_id);

-- ============================================================================
-- 2. Add prep_station_id to location_item_overrides (Level 2)
-- ============================================================================
ALTER TABLE public.location_item_overrides
ADD COLUMN IF NOT EXISTS prep_station_id UUID REFERENCES public.prep_stations(id) ON DELETE SET NULL;

-- Index for items assigned to a prep station
CREATE INDEX IF NOT EXISTS idx_location_item_overrides_prep_station
    ON public.location_item_overrides (prep_station_id)
    WHERE prep_station_id IS NOT NULL;

-- ============================================================================
-- 3. location_category_prep_defaults — category-level default routing
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.location_category_prep_defaults (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    location_id UUID NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
    category_id UUID NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
    prep_station_id UUID NOT NULL REFERENCES public.prep_stations(id) ON DELETE CASCADE,
    merchant_id UUID NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- One default per category per location
    CONSTRAINT uq_location_category_prep_default UNIQUE (location_id, category_id)
);

-- Lookup indexes
CREATE INDEX IF NOT EXISTS idx_loc_cat_prep_defaults_location
    ON public.location_category_prep_defaults (location_id);

CREATE INDEX IF NOT EXISTS idx_loc_cat_prep_defaults_category
    ON public.location_category_prep_defaults (category_id);

CREATE INDEX IF NOT EXISTS idx_loc_cat_prep_defaults_station
    ON public.location_category_prep_defaults (prep_station_id);

-- ============================================================================
-- 4. Row Level Security
-- ============================================================================

-- Enable RLS
ALTER TABLE public.prep_stations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.location_category_prep_defaults ENABLE ROW LEVEL SECURITY;

-- ----- prep_stations RLS -----

-- SELECT: Merchant members can view their prep stations
CREATE POLICY prep_stations_select ON public.prep_stations
    FOR SELECT
    USING (
        is_merchant_admin(merchant_id)
        OR is_location_member(location_id)
    );

-- INSERT: Merchant admins can create prep stations
CREATE POLICY prep_stations_insert ON public.prep_stations
    FOR INSERT
    WITH CHECK (
        is_merchant_admin(merchant_id)
    );

-- UPDATE: Merchant admins or location managers with permission
CREATE POLICY prep_stations_update ON public.prep_stations
    FOR UPDATE
    USING (
        is_merchant_admin(merchant_id)
        OR user_has_location_permission(location_id, 'location.manage')
    );

-- DELETE: Merchant admins only
CREATE POLICY prep_stations_delete ON public.prep_stations
    FOR DELETE
    USING (
        is_merchant_admin(merchant_id)
    );

-- ----- location_category_prep_defaults RLS -----

-- SELECT: Merchant members can view
CREATE POLICY loc_cat_prep_defaults_select ON public.location_category_prep_defaults
    FOR SELECT
    USING (
        is_merchant_admin(merchant_id)
        OR is_location_member(location_id)
    );

-- INSERT: Merchant admins can create
CREATE POLICY loc_cat_prep_defaults_insert ON public.location_category_prep_defaults
    FOR INSERT
    WITH CHECK (
        is_merchant_admin(merchant_id)
    );

-- UPDATE: Merchant admins or location managers
CREATE POLICY loc_cat_prep_defaults_update ON public.location_category_prep_defaults
    FOR UPDATE
    USING (
        is_merchant_admin(merchant_id)
        OR user_has_location_permission(location_id, 'location.manage')
    );

-- DELETE: Merchant admins
CREATE POLICY loc_cat_prep_defaults_delete ON public.location_category_prep_defaults
    FOR DELETE
    USING (
        is_merchant_admin(merchant_id)
    );

-- ============================================================================
-- 5. updated_at triggers (reuse existing function)
-- ============================================================================

CREATE TRIGGER trg_prep_stations_updated_at
    BEFORE UPDATE ON public.prep_stations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_loc_cat_prep_defaults_updated_at
    BEFORE UPDATE ON public.location_category_prep_defaults
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- 6. RPC: resolve_item_prep_station
-- Returns the resolved prep station NAME (TEXT) for order creation.
-- Resolution: Item override → Category default → NULL (Expo catch-all)
-- Called by POS at order creation to populate order_items.prep_station
-- ============================================================================

CREATE OR REPLACE FUNCTION resolve_item_prep_station(
    p_item_id UUID,
    p_location_id UUID,
    p_category_id UUID DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
    v_station_name TEXT;
BEGIN
    -- 1. Check item-level override (location_item_overrides.prep_station_id)
    SELECT ps.name INTO v_station_name
    FROM location_item_overrides lio
    JOIN prep_stations ps ON ps.id = lio.prep_station_id
    WHERE lio.menu_item_id = p_item_id
      AND lio.location_id = p_location_id
      AND ps.is_active = true;

    IF v_station_name IS NOT NULL THEN
        RETURN v_station_name;
    END IF;

    -- 2. Check category-level default (if category provided)
    IF p_category_id IS NOT NULL THEN
        SELECT ps.name INTO v_station_name
        FROM location_category_prep_defaults lcpd
        JOIN prep_stations ps ON ps.id = lcpd.prep_station_id
        WHERE lcpd.category_id = p_category_id
          AND lcpd.location_id = p_location_id
          AND ps.is_active = true;

        IF v_station_name IS NOT NULL THEN
            RETURN v_station_name;
        END IF;
    END IF;

    -- 3. No assignment → return NULL (routes to Expo via catch-all)
    RETURN NULL;
END;
$$;

COMMENT ON FUNCTION resolve_item_prep_station(UUID, UUID, UUID) IS
'Resolves the effective prep station name for a menu item at a location. '
'Resolution chain: Item override > Category default > NULL (Expo catch-all). '
'Called by POS at order creation to populate order_items.prep_station.';

-- ============================================================================
-- 7. Comments
-- ============================================================================
COMMENT ON TABLE public.prep_stations IS
'Location-scoped prep stations (Grill, Fryer, Bar, etc.) for KDS item routing.';

COMMENT ON TABLE public.location_category_prep_defaults IS
'Category-level default prep station assignments per location. Items in this category inherit the prep station unless they have an item-level override.';
