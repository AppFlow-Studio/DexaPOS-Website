-- ============================================================================
-- Migration 035: Add delivery_price to RPC functions
-- Adds delivery_price fields to get_items_for_location_library,
-- get_menu_item_details, get_items_for_location, and get_menu_for_location
-- ============================================================================

-- ============================================================================
-- 1. get_items_for_location_library (Items Library view - L2 + L1 only)
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
                'base_delivery_price', mi.delivery_price,
                'base_availability', mi.availability,

                -- Level 2: Location item override (if exists)
                'location_override', CASE
                    WHEN lio.id IS NOT NULL THEN json_build_object(
                        'id', lio.id,
                        'custom_price', lio.custom_price,
                        'custom_cash_price', lio.custom_cash_price,
                        'custom_delivery_price', lio.custom_delivery_price,
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

                'effective_delivery_price', COALESCE(
                    lio.custom_delivery_price,   -- L2: Location item override
                    mi.delivery_price            -- L1: Base
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
                              p_location_id IS NULL
                              OR c.location_id IS NULL
                              OR c.location_id = p_location_id
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

-- ============================================================================
-- 2. get_menu_item_details (Single item detail view)
-- ============================================================================
CREATE OR REPLACE FUNCTION get_menu_item_details(
    p_item_id UUID,
    p_location_id UUID DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN (
        SELECT json_build_object(
            'id', mi.id,
            'name', mi.name,
            'description', mi.description,
            'image', mi.image,
            'meal_types', mi.meal_types,
            'allergens', mi.allergens,
            'card_bg_color', mi.card_bg_color,
            'stock_tracking_mode', mi.stock_tracking_mode,

            -- Level 1: Global Base
            'base_price', mi.price,
            'base_cash_price', mi.cash_price,
            'base_delivery_price', mi.delivery_price,
            'base_availability', mi.availability,

            -- Level 2: Location Override
            'location_override', CASE
                WHEN lio.id IS NOT NULL THEN json_build_object(
                    'id', lio.id,
                    'custom_price', lio.custom_price,
                    'custom_cash_price', lio.custom_cash_price,
                    'custom_delivery_price', lio.custom_delivery_price,
                    'price_modifier', lio.price_modifier,
                    'price_modifier_type', lio.price_modifier_type,
                    'is_available', lio.is_available,
                    'stock_tracking_mode', lio.stock_tracking_mode,
                    'current_stock', lio.current_stock
                )
                ELSE NULL
            END,

            -- Effective Values (Computed)
            'effective_price', COALESCE(lio.custom_price, mi.price),
            'effective_cash_price', COALESCE(lio.custom_cash_price, mi.cash_price),
            'effective_delivery_price', COALESCE(lio.custom_delivery_price, mi.delivery_price),
            'effective_availability', COALESCE(lio.is_available, mi.availability),

            -- UI Flags
            'has_location_override', (lio.id IS NOT NULL),
            'price_source', CASE
                WHEN lio.custom_price IS NOT NULL THEN 'location_override'
                ELSE 'base'
            END,

            -- Modifiers (With Location Overrides)
            'modifier_groups', (
                SELECT COALESCE(json_agg(
                    json_build_object(
                        'id', mg.id,
                        'name', mg.name,
                        'description', mg.description,
                        'min_selections', mg.min_selections,
                        'max_selections', mg.max_selections,
                        'is_required', mg.is_required,

                        -- Group Active Status (Override > Global)
                        'is_active', COALESCE(lmgo.is_active, true),

                        'items', (
                            SELECT COALESCE(json_agg(
                                json_build_object(
                                    'id', mgi.id,
                                    'name', mgi.name,
                                    'description', mgi.description,

                                    -- Price (Override > Global)
                                    'price_modifier', COALESCE(lmio_mod.price_modifier, mgi.price_modifier),

                                    -- Active (Override > Global)
                                    'is_active', (mgi.is_active = true AND COALESCE(lmio_mod.is_active, true) = true),

                                    -- Stock (Location Specific)
                                    'stock_tracking_mode', COALESCE(lmio_mod.stock_tracking_mode, 'in_stock'),
                                    'current_stock', lmio_mod.current_stock
                                ) ORDER BY mgi.name ASC
                            ), '[]'::json)
                            FROM modifier_group_items mgi
                            LEFT JOIN location_modifier_item_overrides lmio_mod
                                ON lmio_mod.modifier_group_item_id = mgi.id
                                AND lmio_mod.location_id = p_location_id
                            WHERE mgi.modifier_group_id = mg.id
                        )
                    ) ORDER BY mg.name ASC
                ), '[]'::json)
                FROM menu_item_modifier_groups mimg
                JOIN modifier_groups mg ON mg.id = mimg.modifier_group_id
                LEFT JOIN location_modifier_group_overrides lmgo
                    ON lmgo.modifier_group_id = mg.id
                    AND lmgo.location_id = p_location_id
                WHERE mimg.menu_item_id = mi.id
            ),

            -- Categories
            'categories', (
                SELECT COALESCE(json_agg(
                    json_build_object('id', c.id, 'name', c.name)
                ), '[]'::json)
                FROM menu_item_categories mic
                JOIN categories c ON c.id = mic.category_id
                WHERE mic.menu_item_id = mi.id
            ),

            -- Menus List
            'menus', (
                SELECT COALESCE(json_agg(
                    json_build_object(
                        'id', m.id,
                        'name', m.name,
                        'is_active', m.is_active,
                        'is_global', (m.location_id IS NULL),
                        'location_id', m.location_id
                    ) ORDER BY m.name ASC
                ), '[]'::json)
                FROM menu_item_menus mim
                JOIN menus m ON m.id = mim.menu_id
                WHERE mim.menu_item_id = mi.id
            ),

            -- Total Menu Count
            'menu_count', (
                SELECT COUNT(*)
                FROM menu_item_menus mim
                WHERE mim.menu_item_id = mi.id
            )
        )
        FROM menu_items mi
        LEFT JOIN location_item_overrides lio
            ON lio.menu_item_id = mi.id AND lio.location_id = p_location_id
        WHERE mi.id = p_item_id
    );
END;
$$;

-- ============================================================================
-- 3. get_items_for_location (Legacy Items Library view)
-- ============================================================================
CREATE OR REPLACE FUNCTION get_items_for_location(
    p_merchant_id UUID,
    p_location_id UUID DEFAULT NULL
)
RETURNS JSON
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
                'meal_types', mi.meal_types,
                'allergens', mi.allergens,
                'card_bg_color', mi.card_bg_color,
                'stock_tracking_mode', mi.stock_tracking_mode,

                -- Base prices (Level 1)
                'base_price', mi.price,
                'base_cash_price', mi.cash_price,
                'base_delivery_price', mi.delivery_price,
                'base_availability', mi.availability,

                -- Location override (Level 2)
                'location_override', CASE
                    WHEN lio.id IS NOT NULL THEN json_build_object(
                        'id', lio.id,
                        'custom_price', lio.custom_price,
                        'custom_cash_price', lio.custom_cash_price,
                        'custom_delivery_price', lio.custom_delivery_price,
                        'price_modifier', lio.price_modifier,
                        'price_modifier_type', lio.price_modifier_type,
                        'is_available', lio.is_available,
                        'stock_tracking_mode', lio.stock_tracking_mode,
                        'current_stock', lio.current_stock,
                        'low_stock_threshold', lio.low_stock_threshold
                    )
                    ELSE NULL
                END,

                -- Effective values
                'effective_price', COALESCE(lio.custom_price, mi.price),
                'effective_cash_price', COALESCE(lio.custom_cash_price, mi.cash_price),
                'effective_delivery_price', COALESCE(lio.custom_delivery_price, mi.delivery_price),
                'effective_availability', COALESCE(lio.is_available, mi.availability),

                -- UI flags
                'has_location_override', (lio.id IS NOT NULL),
                'price_source', CASE
                    WHEN lio.custom_price IS NOT NULL THEN 'location_override'
                    ELSE 'base'
                END,

                -- Modifier Groups with Location Overrides
                'modifier_groups', (
                    SELECT COALESCE(json_agg(
                        json_build_object(
                            'id', mg.id,
                            'name', mg.name,
                            'description', mg.description,
                            'min_selections', mg.min_selections,
                            'max_selections', mg.max_selections,
                            'is_required', mg.is_required,

                            'is_active', COALESCE(lmgo.is_active, true),

                            'items', (
                                SELECT COALESCE(json_agg(
                                    json_build_object(
                                        'id', mgi.id,
                                        'name', mgi.name,
                                        'description', mgi.description,
                                        'price_modifier', COALESCE(lmio_mod.price_modifier, mgi.price_modifier),
                                        'is_active', (
                                            mgi.is_active = true
                                            AND COALESCE(lmio_mod.is_active, true) = true
                                        ),
                                        'stock_tracking_mode', COALESCE(lmio_mod.stock_tracking_mode, 'in_stock'),
                                        'current_stock', lmio_mod.current_stock
                                    ) ORDER BY mgi.name ASC
                                ), '[]'::json)
                                FROM modifier_group_items mgi
                                LEFT JOIN location_modifier_item_overrides lmio_mod
                                    ON lmio_mod.modifier_group_item_id = mgi.id
                                    AND lmio_mod.location_id = p_location_id
                                WHERE mgi.modifier_group_id = mg.id
                            )
                        ) ORDER BY mg.name ASC
                    ), '[]'::json)
                    FROM menu_item_modifier_groups mimg
                    JOIN modifier_groups mg ON mg.id = mimg.modifier_group_id
                    LEFT JOIN location_modifier_group_overrides lmgo
                        ON lmgo.modifier_group_id = mg.id
                        AND lmgo.location_id = p_location_id
                    WHERE mimg.menu_item_id = mi.id
                ),

                -- Categories
                'categories', (
                    SELECT COALESCE(json_agg(
                        json_build_object(
                            'id', c.id,
                            'name', c.name
                        )
                    ), '[]'::json)
                    FROM menu_item_categories mic
                    JOIN categories c ON c.id = mic.category_id
                    WHERE mic.menu_item_id = mi.id
                ),

                -- Menu Count
                'menu_count', (
                    SELECT COUNT(*)
                    FROM menu_item_menus mim
                    WHERE mim.menu_item_id = mi.id
                ),

                'created_at', mi.created_at,
                'updated_at', mi.updated_at
            )
            ORDER BY mi.name ASC
        ), '[]'::json)
        FROM menu_items mi
        LEFT JOIN location_item_overrides lio
            ON lio.menu_item_id = mi.id
            AND lio.location_id = p_location_id
        WHERE mi.merchant_id = p_merchant_id
    );
END;
$$;
