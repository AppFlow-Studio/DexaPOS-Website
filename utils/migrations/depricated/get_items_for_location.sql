CREATE OR REPLACE FUNCTION get_items_for_location(
    p_merchant_id UUID,
    p_location_id UUID DEFAULT NULL  -- NULL = merchant admin viewing all items
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
                'base_availability', mi.availability,
                
                -- Location override (Level 2)
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
                        'low_stock_threshold', lio.low_stock_threshold
                    )
                    ELSE NULL
                END,
                
                -- Effective values
                'effective_price', COALESCE(lio.custom_price, mi.price),
                'effective_cash_price', COALESCE(lio.custom_cash_price, mi.cash_price),
                'effective_availability', COALESCE(lio.is_available, mi.availability),
                
                -- UI flags
                'has_location_override', (lio.id IS NOT NULL),
                'price_source', CASE
                    WHEN lio.custom_price IS NOT NULL THEN 'location_override'
                    ELSE 'base'
                END,
--   NEW: Modifier Groups with Location Overrides
                'modifier_groups', (
                    SELECT COALESCE(json_agg(
                        json_build_object(
                            'id', mg.id,
                            'name', mg.name,
                            'description', mg.description,
                            'min_selections', mg.min_selections,
                            'max_selections', mg.max_selections,
                            'is_required', mg.is_required,
                            
                            -- Group Availability: Location Override > Global Default
                            'is_active', COALESCE(lmgo.is_active, true),
                            
                            'items', (
                                SELECT COALESCE(json_agg(
                                    json_build_object(
                                        'id', mgi.id,
                                        'name', mgi.name,
                                        'description', mgi.description,
                                        
                                        -- Price: Location Override > Global Base
                                        'price_modifier', COALESCE(lmio_mod.price_modifier, mgi.price_modifier),
                                        
                                        -- Availability: Location Override > Global Base
                                        'is_active', (
                                            mgi.is_active = true 
                                            AND COALESCE(lmio_mod.is_active, true) = true
                                        ),
                                        
                                        -- Stock: Location Specific
                                        'stock_tracking_mode', COALESCE(lmio_mod.stock_tracking_mode, 'in_stock'),
                                        'current_stock', lmio_mod.current_stock
                                    ) ORDER BY mgi.name ASC
                                ), '[]'::json)
                                FROM modifier_group_items mgi
                                -- JOIN: Location Item Overrides
                                LEFT JOIN location_modifier_item_overrides lmio_mod
                                    ON lmio_mod.modifier_group_item_id = mgi.id 
                                    AND lmio_mod.location_id = p_location_id
                                WHERE mgi.modifier_group_id = mg.id
                                -- We usually show even inactive items in the "Library" view so managers can enable them
                                -- But for simplicity, let's filter out globally deleted ones
                            )
                        ) ORDER BY mg.name ASC
                    ), '[]'::json)
                    FROM menu_item_modifier_groups mimg
                    JOIN modifier_groups mg ON mg.id = mimg.modifier_group_id
                    -- JOIN: Location Group Overrides
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
            -- FIX: ORDER BY moved inside the aggregation
            ORDER BY mi.name ASC
        ), '[]'::json)
        FROM menu_items mi
        LEFT JOIN location_item_overrides lio 
            ON lio.menu_item_id = mi.id 
            AND lio.location_id = p_location_id
        WHERE mi.merchant_id = p_merchant_id
    );
END;
