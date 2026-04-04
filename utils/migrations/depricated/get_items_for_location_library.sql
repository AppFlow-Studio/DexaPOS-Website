
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
                'location_id', mi.location_id,
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
                
                -- ============================================
                -- MODIFIER GROUPS WITH ITEMS
                -- ============================================
                'modifier_groups', COALESCE(
                    (
                        SELECT json_agg(
                            json_build_object(
                                'id', mg.id,
                                'name', mg.name,
                                -- 'display_name', mg.display_name,
                                'description', mg.description,
                                
                                -- Base selection rules
                                -- 'base_selection_type', mg.selection_type,
                                'base_min_selections', mg.min_selections,
                                'base_max_selections', mg.max_selections,
                                'base_is_required', mg.is_required,
                                
                                -- Menu item link overrides
                                -- 'item_link_min_override', mimg.min_selections_override,
                                -- 'item_link_max_override', mimg.max_selections_override,
                                -- 'item_link_is_required_override', mimg.is_required_override,
                                
                                -- Location overrides
                                'location_override', CASE
                                    WHEN lmgo.id IS NOT NULL THEN json_build_object(
                                        'id', lmgo.id,
                                        'is_available', lmgo.is_active
                                        -- 'min_selections_override', lmgo.min_selections_override,
                                        -- 'max_selections_override', lmgo.max_selections_override,
                                        -- 'is_required_override', lmgo.is_required_override
                                    )
                                    ELSE NULL
                                END,
                                
                                -- EFFECTIVE VALUES (Location > Item Link > Base)
                                'effective_is_active', COALESCE(lmgo.is_active, mg.is_active),
                                -- 'effective_min_selections', COALESCE(
                                --     -- lmgo.min_selections_override,
                                --     -- mimg.min_selections_override,
                                --     mg.min_selections
                                -- ),
                                -- 'effective_max_selections', COALESCE(
                                --     -- lmgo.max_selections_override,
                                --     -- mimg.max_selections_override,
                                --     mg.max_selections
                                -- ),
                                -- 'effective_is_required', COALESCE(
                                --     -- lmgo.is_required_override,
                                --     -- mimg.is_required_override,
                                --     mg.is_required
                                -- ),
                                -- 'effective_selection_type', mg.selection_type,
                                
                                -- 'sort_order', mimg.sort_order,
                                'has_location_override', (lmgo.id IS NOT NULL),
                                
                                -- MODIFIER ITEMS
                                'items', COALESCE(
                                    (
                                        SELECT json_agg(
                                            json_build_object(
                                                'id', mgi.id,
                                                'name', mgi.name,
                                                'description', mgi.description,
                                                
                                                -- Base prices
                                                'base_price', mgi.price_modifier,
                                                'base_is_default', mgi.is_default,
                                                'base_is_active', mgi.is_active,
                                                
                                                -- Location override
                                                'location_override', CASE
                                                    WHEN lmio.id IS NOT NULL THEN json_build_object(
                                                        'id', lmio.id,
                                                        'custom_price', lmio.price_modifier,
                                                        'is_active', lmio.is_active
                                                        -- 'is_default_override', lmio.is_default_override
                                                    )
                                                    ELSE NULL
                                                END,
                                                
                                                -- EFFECTIVE VALUES
                                                'effective_price', COALESCE(lmio.price_modifier, mgi.price_modifier),
                                                -- 'effective_cash_price', COALESCE(
                                                --     lmio.custom_cash_price,
                                                --     lmio.custom_price,  -- Fall back to custom card price
                                                --     mgi.cash_price,
                                                --     mgi.price           -- Fall back to base card price
                                                -- ),
                                                'effective_is_active', COALESCE(lmio.is_active, mgi.is_active),
                                                -- 'effective_is_default', COALESCE(lmio.is_default_override, mgi.is_default),
                                                
                                                'has_location_override', (lmio.id IS NOT NULL)
                                                -- 'sort_order', mgi.sort_order,
                                                -- 'calories', mgi.calories
                                            )
                                            ORDER BY mgi.name
                                        )
                                        FROM modifier_group_items mgi
                                        LEFT JOIN location_modifier_item_overrides lmio
                                            ON lmio.modifier_group_item_id= mgi.id
                                            AND lmio.location_id = p_location_id
                                        WHERE mgi.modifier_group_id = mg.id
                                          AND mgi.is_active = true
                                    ),
                                    '[]'::json
                                )
                            )
                            ORDER BY mg.name
                        )
                        FROM menu_item_modifier_groups mimg
                        JOIN modifier_groups mg ON mg.id = mimg.modifier_group_id
                        LEFT JOIN location_modifier_group_overrides lmgo
                            ON lmgo.modifier_group_id = mg.id
                            AND lmgo.location_id = p_location_id
                        WHERE mimg.menu_item_id = mi.id
                          AND mg.is_active = true
                          -- Filter out unavailable groups at location level
                          AND COALESCE(lmgo.is_active, true) = true
                    ),
                    '[]'::json
                ),

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