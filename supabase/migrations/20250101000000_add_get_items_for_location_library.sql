clear-- ============================================================================
-- NEW RPC: get_items_for_location_library
-- Purpose: Get items for Items Library view with ONLY L2 & L1 pricing
-- Category prices (L3, L4) are excluded from the effective_price cascade
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_items_for_location_library(
    p_merchant_id uuid,
    p_location_id uuid DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN (
        SELECT COALESCE(json_agg(
            json_build_object(
                'id', mi.id,
                'name', mi.name,
                'description', mi.description,
                'image', mi.image,
                'allergens', mi.allergens,
                'meal_types', mi.meal_types,
                'card_bg_color', mi.card_bg_color,

                -- Stock info
                'stock_tracking_mode', mi.stock_tracking_mode,

                -- Tax & Inventory Control (L1 - Base)
                'tax_category', mi.tax_category,
                'is_tax_exempt', mi.is_tax_exempt,
                'available_channels', mi.available_channels,

                -- Level 1: Base price
                'base_price', mi.price,
                'base_cash_price', mi.cash_price,
                'base_availability', mi.availability,

                -- Level 2: Location item override (if exists)
                'location_override', CASE
                    WHEN lio.id IS NOT NULL THEN json_build_object(
                        'id', lio.id,
                        'custom_price', lio.custom_price,
                        'custom_cash_price', lio.custom_cash_price,
                        'price_modifier', lio.price_modifier,
                        'price_modifier_type', lio.price_modifier_type,
                        'is_available', lio.is_available,
                        'stock_tracking_mode', lio.stock_tracking_mode,
                        'current_stock', lio.current_stock,
                        'tax_category', lio.tax_category,
                        'is_tax_exempt', lio.is_tax_exempt,
                        'available_channels', lio.available_channels
                    )
                    ELSE NULL
                END,

                -- ============================================================
                -- EFFECTIVE PRICE: L2 > L1 ONLY (NO CATEGORY PRICES!)
                -- ============================================================
                'effective_price', COALESCE(
                    lio.custom_price,            -- L2: Location item override
                    mi.price                     -- L1: Base
                ),

                'effective_cash_price', COALESCE(
                    lio.custom_cash_price,
                    mi.cash_price
                ),

                'effective_availability', COALESCE(
                    lio.is_available,
                    mi.availability
                ),

                -- Effective Tax & Inventory (L2 > L1)
                'effective_tax_category', COALESCE(
                    lio.tax_category,
                    mi.tax_category
                ),
                'effective_is_tax_exempt', COALESCE(
                    lio.is_tax_exempt,
                    mi.is_tax_exempt
                ),
                'effective_available_channels', COALESCE(
                    lio.available_channels,
                    mi.available_channels
                ),

                -- Price source indicator
                'price_source', CASE
                    WHEN lio.custom_price IS NOT NULL THEN 'location_item'
                    ELSE 'base'
                END,

                -- Override flags
                'has_location_override', (lio.id IS NOT NULL),

                -- Categories this item belongs to (for UI filtering/display)
                -- NOTE: We show categories but don't use their prices!
                'categories', COALESCE(
                    (
                        SELECT json_agg(
                            json_build_object(
                                'id', c.id,
                                'name', c.name,
                                'location_id', c.location_id,
                                'location_name', (SELECT l.name FROM locations l WHERE l.id = c.location_id),
                                'is_global', COALESCE(c.is_global, c.location_id IS NULL)
                            ) ORDER BY c.name
                        )
                        FROM category_items ci
                        JOIN categories c ON c.id = ci.category_id
                        WHERE ci.menu_item_id = mi.id
                          AND c.merchant_id = p_merchant_id
                          AND (
                              -- All categories if no location specified
                              p_location_id IS NULL
                              OR
                              -- Global + location-specific categories
                              c.location_id IS NULL
                              OR
                              c.location_id = p_location_id
                          )
                    ),
                    '[]'::json
                ),

                'created_at', mi.created_at,
                'updated_at', mi.updated_at
            )
            ORDER BY mi.name
        ), '[]'::json)
        FROM menu_items mi
        LEFT JOIN location_item_overrides lio
            ON lio.menu_item_id = mi.id
            AND lio.location_id = p_location_id
        WHERE mi.merchant_id = p_merchant_id
    );
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.get_items_for_location_library(uuid, uuid) TO authenticated;

COMMENT ON FUNCTION public.get_items_for_location_library IS
'Get items for Items Library view with L2 (location override) + L1 (base) pricing only. Category prices are excluded from effective_price calculation.';
