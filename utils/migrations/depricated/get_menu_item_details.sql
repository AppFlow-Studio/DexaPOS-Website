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
            'base_availability', mi.availability,
            
            -- Level 2: Location Override
            'location_override', CASE 
                WHEN lio.id IS NOT NULL THEN json_build_object(
                    'id', lio.id,
                    'custom_price', lio.custom_price,
                    'custom_cash_price', lio.custom_cash_price,
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

            -- NEW: Featured Menus List (Where is this item used?)
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

            -- NEW: Total Menu Count
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
