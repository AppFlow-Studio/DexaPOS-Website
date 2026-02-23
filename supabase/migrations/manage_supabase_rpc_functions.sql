CREATE OR REPLACE FUNCTION upsert_modifier_override(
    p_location_id UUID,
    p_modifier_item_id UUID,
    p_price_modifier DECIMAL DEFAULT NULL,
    p_is_active BOOLEAN DEFAULT NULL,
    p_stock_tracking_mode TEXT DEFAULT NULL,
    p_current_stock INTEGER DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_merchant_id UUID;
BEGIN
    -- 1. Get Merchant ID from the modifier item to ensure safety
    SELECT merchant_id INTO v_merchant_id
    FROM modifier_group_items WHERE id = p_modifier_item_id;

    -- 2. Upsert
    INSERT INTO location_modifier_item_overrides (
        location_id, modifier_group_item_id, merchant_id,
        price_modifier, is_active, 
        stock_tracking_mode, current_stock,
        updated_at
    ) VALUES (
        p_location_id, p_modifier_item_id, v_merchant_id,
        p_price_modifier, p_is_active,
        p_stock_tracking_mode, p_current_stock,
        NOW()
    )
    ON CONFLICT (location_id, modifier_group_item_id)
    DO UPDATE SET
        price_modifier = COALESCE(EXCLUDED.price_modifier, location_modifier_item_overrides.price_modifier),
        is_active = COALESCE(EXCLUDED.is_active, location_modifier_item_overrides.is_active),
        stock_tracking_mode = COALESCE(EXCLUDED.stock_tracking_mode, location_modifier_item_overrides.stock_tracking_mode),
        current_stock = COALESCE(EXCLUDED.current_stock, location_modifier_item_overrides.current_stock),
        updated_at = NOW();

    RETURN json_build_object('success', true);
END;
$$;

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
$$;

-- ============================================================================
-- FUNCTION: Get all items for a location (Items Library view)
-- ============================================================================
-- This is for your "Menu Items" page showing all items at a location level
-- NOT within a specific menu context
-- ============================================================================

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
$$;
-- CREATE OR REPLACE FUNCTION get_items_for_location(
--     p_merchant_id UUID,
--     p_location_id UUID DEFAULT NULL
-- )
-- RETURNS JSON
-- LANGUAGE plpgsql
-- SECURITY DEFINER
-- AS $$
-- BEGIN
--     RETURN (
--         SELECT COALESCE(json_agg(
--             json_build_object(
--                 'id', mi.id,
--                 'name', mi.name,
--                 'description', mi.description,
--                 'image', mi.image,
--                 'meal_types', mi.meal_types,
--                 'allergens', mi.allergens,
--                 'card_bg_color', mi.card_bg_color,
--                 'stock_tracking_mode', mi.stock_tracking_mode,
                
--                 -- Base prices (Level 1)
--                 'base_price', mi.price,
--                 'base_cash_price', mi.cash_price,
--                 'base_availability', mi.availability,
                
--                 -- Location override (Level 2)
--                 'location_override', CASE 
--                     WHEN lio.id IS NOT NULL THEN json_build_object(
--                         'id', lio.id,
--                         'custom_price', lio.custom_price,
--                         'custom_cash_price', lio.custom_cash_price,
--                         'price_modifier', lio.price_modifier,
--                         'price_modifier_type', lio.price_modifier_type,
--                         'is_available', lio.is_available,
--                         'stock_tracking_mode', lio.stock_tracking_mode,
--                         'current_stock', lio.current_stock,
--                         'low_stock_threshold', lio.low_stock_threshold
--                     )
--                     ELSE NULL
--                 END,
                
--                 -- Effective values
--                 'effective_price', COALESCE(lio.custom_price, mi.price),
--                 'effective_cash_price', COALESCE(lio.custom_cash_price, mi.cash_price),
--                 'effective_availability', COALESCE(lio.is_available, mi.availability),
                
--                 'has_location_override', (lio.id IS NOT NULL),
--                 'price_source', CASE
--                     WHEN lio.custom_price IS NOT NULL THEN 'location_override'
--                     ELSE 'base'
--                 END,
                
--                 -- NEW: Modifier Groups with Location Overrides
--                 'modifier_groups', (
--                     SELECT COALESCE(json_agg(
--                         json_build_object(
--                             'id', mg.id,
--                             'name', mg.name,
--                             'description', mg.description,
--                             'min_selections', mg.min_selections,
--                             'max_selections', mg.max_selections,
--                             'is_required', mg.is_required,
                            
--                             -- Group Availability: Location Override > Global Default
--                             'is_active', COALESCE(lmgo.is_active, true),
                            
--                             'items', (
--                                 SELECT COALESCE(json_agg(
--                                     json_build_object(
--                                         'id', mgi.id,
--                                         'name', mgi.name,
--                                         'description', mgi.description,
                                        
--                                         -- Price: Location Override > Global Base
--                                         'price_modifier', COALESCE(lmio_mod.price_modifier, mgi.price_modifier),
                                        
--                                         -- Availability: Location Override > Global Base
--                                         'is_active', (
--                                             mgi.is_active = true 
--                                             AND COALESCE(lmio_mod.is_active, true) = true
--                                         ),
                                        
--                                         -- Stock: Location Specific
--                                         'stock_tracking_mode', COALESCE(lmio_mod.stock_tracking_mode, 'in_stock'),
--                                         'current_stock', lmio_mod.current_stock
--                                     ) ORDER BY mgi.name ASC
--                                 ), '[]'::json)
--                                 FROM modifier_group_items mgi
--                                 -- JOIN: Location Item Overrides
--                                 LEFT JOIN location_modifier_item_overrides lmio_mod
--                                     ON lmio_mod.modifier_group_item_id = mgi.id 
--                                     AND lmio_mod.location_id = p_location_id
--                                 WHERE mgi.modifier_group_id = mg.id
--                                 -- We usually show even inactive items in the "Library" view so managers can enable them
--                                 -- But for simplicity, let's filter out globally deleted ones
--                             )
--                         ) ORDER BY mg.name ASC
--                     ), '[]'::json)
--                     FROM menu_item_modifier_groups mimg
--                     JOIN modifier_groups mg ON mg.id = mimg.modifier_group_id
--                     -- JOIN: Location Group Overrides
--                     LEFT JOIN location_modifier_group_overrides lmgo
--                         ON lmgo.modifier_group_id = mg.id 
--                         AND lmgo.location_id = p_location_id
--                     WHERE mimg.menu_item_id = mi.id
--                 ),

--                 -- Categories
--                 'categories', (
--                     SELECT COALESCE(json_agg(
--                         json_build_object('id', c.id, 'name', c.name)
--                     ), '[]'::json)
--                     FROM menu_item_categories mic
--                     JOIN categories c ON c.id = mic.category_id
--                     WHERE mic.menu_item_id = mi.id
--                 ),
                
--                 'menu_count', (SELECT COUNT(*) FROM menu_item_menus mim WHERE mim.menu_item_id = mi.id),
--                 'created_at', mi.created_at,
--                 'updated_at', mi.updated_at
--             )
--             ORDER BY mi.name ASC
--         ), '[]'::json)
--         FROM menu_items mi
--         LEFT JOIN location_item_overrides lio 
--             ON lio.menu_item_id = mi.id AND lio.location_id = p_location_id
--         WHERE mi.merchant_id = p_merchant_id
--     );
-- END;
-- $$;

-- ============================================================================
-- FUNCTION: Update item at appropriate level based on context
-- ============================================================================
-- This unified function handles ALL update scenarios:
--   - Merchant admin editing global item (Level 1)
--   - Merchant admin editing menu item price (Level 3)
--   - Location manager editing location base (Level 2)
--   - Location manager editing location+menu (Level 4)
--   - Location manager editing own menu (Level 5)
-- ============================================================================

CREATE OR REPLACE FUNCTION upsert_item_override(
    p_menu_item_id UUID,
    p_menu_id UUID DEFAULT NULL,        -- NULL = editing item library (not menu context)
    p_location_id UUID DEFAULT NULL,    -- NULL = merchant admin
    p_custom_price DECIMAL(10,2) DEFAULT NULL,
    p_custom_cash_price DECIMAL(10,2) DEFAULT NULL,
    p_is_available BOOLEAN DEFAULT NULL,
    p_price_modifier DECIMAL(10,2) DEFAULT NULL,
    p_price_modifier_type TEXT DEFAULT NULL,
    p_stock_tracking_mode TEXT DEFAULT NULL,
    p_current_stock INTEGER DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_menu_location_id UUID;
    v_menu_is_global BOOLEAN;
    v_update_level INTEGER;
    v_update_table TEXT;
    v_is_empty BOOLEAN;
BEGIN
    -- ========================================================================
    -- SCENARIO A: No menu context (Items Library view)
    -- ========================================================================
    IF p_menu_id IS NULL THEN
        
        IF p_location_id IS NULL THEN
            -- ────────────────────────────────────────────────────────────────
            -- LEVEL 1: Merchant admin editing global item base
            -- ────────────────────────────────────────────────────────────────
            v_update_level := 1;
            v_update_table := 'menu_items';
            
            UPDATE menu_items
            SET 
                price = COALESCE(p_custom_price, price),
                cash_price = COALESCE(p_custom_cash_price, cash_price),
                availability = COALESCE(p_is_available, availability),
                stock_tracking_mode = COALESCE(p_stock_tracking_mode, stock_tracking_mode),
                updated_at = NOW()
            WHERE id = p_menu_item_id;
            
        ELSE
            -- ────────────────────────────────────────────────────────────────
            -- LEVEL 2: Location manager editing location item base
            -- (This is what your screenshot shows!)
            -- ────────────────────────────────────────────────────────────────
            v_update_level := 2;
            v_update_table := 'location_item_overrides';
            
            -- Check if all values would be empty/default
            v_is_empty := (
                p_custom_price IS NULL AND 
                p_custom_cash_price IS NULL AND 
                p_price_modifier IS NULL AND
                (p_is_available IS NULL OR p_is_available = true) AND
                p_stock_tracking_mode IS NULL AND
                p_current_stock IS NULL
            );
            
            IF v_is_empty THEN
                -- Delete override (reset to global base)
                DELETE FROM location_item_overrides
                WHERE location_id = p_location_id AND menu_item_id = p_menu_item_id;
                
                RETURN json_build_object(
                    'success', true,
                    'action', 'deleted',
                    'level', v_update_level,
                    'table', v_update_table,
                    'message', 'Location override removed - using global base price'
                );
            ELSE
                -- Upsert the location item override
                INSERT INTO location_item_overrides (
                    location_id, menu_item_id,
                    custom_price, custom_cash_price,
                    price_modifier, price_modifier_type,
                    is_available, stock_tracking_mode,
                    current_stock, low_stock_threshold,
                    created_at, updated_at
                ) VALUES (
                    p_location_id, p_menu_item_id,
                    p_custom_price, p_custom_cash_price,
                    p_price_modifier, p_price_modifier_type,
                    p_is_available, p_stock_tracking_mode,
                    p_current_stock, NULL,
                    NOW(), NOW()
                )
                ON CONFLICT (location_id, menu_item_id) 
                DO UPDATE SET
                    custom_price = COALESCE(EXCLUDED.custom_price, location_item_overrides.custom_price),
                    custom_cash_price = COALESCE(EXCLUDED.custom_cash_price, location_item_overrides.custom_cash_price),
                    price_modifier = COALESCE(EXCLUDED.price_modifier, location_item_overrides.price_modifier),
                    price_modifier_type = COALESCE(EXCLUDED.price_modifier_type, location_item_overrides.price_modifier_type),
                    is_available = COALESCE(EXCLUDED.is_available, location_item_overrides.is_available),
                    stock_tracking_mode = COALESCE(EXCLUDED.stock_tracking_mode, location_item_overrides.stock_tracking_mode),
                    current_stock = COALESCE(EXCLUDED.current_stock, location_item_overrides.current_stock),
                    updated_at = NOW();
            END IF;
        END IF;
        
    -- ========================================================================
    -- SCENARIO B: Menu context (viewing/editing within a menu)
    -- ========================================================================
    ELSE
        -- Get menu info
        SELECT location_id, (location_id IS NULL)
        INTO v_menu_location_id, v_menu_is_global
        FROM menus WHERE id = p_menu_id;
        
        IF p_location_id IS NULL THEN
            -- ────────────────────────────────────────────────────────────────
            -- LEVEL 3: Merchant admin editing global menu price
            -- ────────────────────────────────────────────────────────────────
            v_update_level := 3;
            v_update_table := 'menu_item_menus';
            
            UPDATE menu_item_menus
            SET 
                custom_price = p_custom_price,
                custom_cash_price = p_custom_cash_price,
                is_available = COALESCE(p_is_available, is_available),
                updated_at = NOW()
            WHERE menu_id = p_menu_id AND menu_item_id = p_menu_item_id;
            
        ELSIF NOT v_menu_is_global THEN
            -- ────────────────────────────────────────────────────────────────
            -- LEVEL 5: Location's own menu
            -- ────────────────────────────────────────────────────────────────
            v_update_level := 5;
            v_update_table := 'menu_item_menus';
            
            -- Verify ownership
            IF v_menu_location_id != p_location_id THEN
                RETURN json_build_object(
                    'success', false,
                    'error', 'Menu does not belong to this location'
                );
            END IF;
            
            UPDATE menu_item_menus
            SET 
                custom_price = p_custom_price,
                custom_cash_price = p_custom_cash_price,
                is_available = COALESCE(p_is_available, is_available),
                updated_at = NOW()
            WHERE menu_id = p_menu_id AND menu_item_id = p_menu_item_id;
            
        ELSE
            -- ────────────────────────────────────────────────────────────────
            -- LEVEL 4: Location + Global Menu override
            -- ────────────────────────────────────────────────────────────────
            v_update_level := 4;
            v_update_table := 'location_menu_item_overrides';
            
            v_is_empty := (
                p_custom_price IS NULL AND 
                p_custom_cash_price IS NULL AND 
                (p_is_available IS NULL OR p_is_available = true)
            );
            
            IF v_is_empty THEN
                DELETE FROM location_menu_item_overrides
                WHERE location_id = p_location_id 
                  AND menu_id = p_menu_id 
                  AND menu_item_id = p_menu_item_id;
                  
                RETURN json_build_object(
                    'success', true,
                    'action', 'deleted',
                    'level', v_update_level,
                    'table', v_update_table,
                    'message', 'Override removed - using menu/location base price'
                );
            ELSE
                INSERT INTO location_menu_item_overrides (
                    location_id, menu_id, menu_item_id,
                    custom_price, custom_cash_price, is_available,
                    created_at, updated_at
                ) VALUES (
                    p_location_id, p_menu_id, p_menu_item_id,
                    p_custom_price, p_custom_cash_price, COALESCE(p_is_available, true),
                    NOW(), NOW()
                )
                ON CONFLICT (location_id, menu_id, menu_item_id) 
                DO UPDATE SET
                    custom_price = EXCLUDED.custom_price,
                    custom_cash_price = EXCLUDED.custom_cash_price,
                    is_available = EXCLUDED.is_available,
                    updated_at = NOW();
            END IF;
        END IF;
    END IF;

    -- Return result
    RETURN json_build_object(
        'success', true,
        'action', 'upserted',
        'level', v_update_level,
        'table', v_update_table,
        'menu_item_id', p_menu_item_id,
        'menu_id', p_menu_id,
        'location_id', p_location_id
    );
END;
$$;


-- ============================================================================
-- FUNCTION: Get menu with FULL cascade resolution
-- ============================================================================

CREATE OR REPLACE FUNCTION get_menu_for_location(
    p_menu_id UUID,
    p_location_id UUID DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    result JSON;
BEGIN
    SELECT json_build_object(
        'id', m.id,
        'merchant_id', m.merchant_id,
        'location_id', m.location_id,
        'name', m.name,
        'description', m.description,
        'is_active', m.is_active,
        'is_global', (m.location_id IS NULL),
        'is_location_owned', (m.location_id IS NOT NULL),
        'created_at', m.created_at,
        'updated_at', m.updated_at,
        
        'menu_categories', (
            SELECT COALESCE(json_agg(
                json_build_object(
                    'id', mc.id,
                    'category', json_build_object(
                        'id', c.id,
                        'name', c.name,
                        'description', c.description,
                        'image', c.image,
                        'is_active', COALESCE(lco.is_active, c.is_active),
                        'has_override', (lco.id IS NOT NULL)
                    )
                ) 
            ), '[]'::json)
            FROM menu_categories mc
            JOIN categories c ON c.id = mc.category_id
            LEFT JOIN location_category_overrides lco 
                ON lco.category_id = c.id AND lco.location_id = p_location_id
            WHERE mc.menu_id = m.id
        ),
        
        'menu_item_menus', (
            SELECT COALESCE(json_agg(
                json_build_object(
                    'id', mim.id,
                    
                    -- Level 3: Menu-level pricing
                    'custom_price', mim.custom_price,
                    'custom_cash_price', mim.custom_cash_price,
                    'is_available', mim.is_available,
                    
                    -- Level 4: Location + Menu override
                    'location_menu_override', CASE 
                        WHEN lmio.id IS NOT NULL THEN json_build_object(
                            'id', lmio.id,
                            'custom_price', lmio.custom_price,
                            'custom_cash_price', lmio.custom_cash_price,
                            'is_available', lmio.is_available
                        )
                        ELSE NULL
                    END,
                    
                    'menu_item', json_build_object(
                        'id', mi.id,
                        'name', mi.name,
                        'description', mi.description,
                        'image', mi.image,
                        'meal_types', mi.meal_types,
                        'allergens', mi.allergens,
                        'card_bg_color', mi.card_bg_color,
                        
                        -- Level 1: Global base
                        'price', mi.price,
                        'cash_price', mi.cash_price,
                        'availability', mi.availability,
                        
                        -- Level 2: Location item base override
                        'location_item_override', CASE 
                            WHEN lio.id IS NOT NULL THEN json_build_object(
                                'id', lio.id,
                                'custom_price', lio.custom_price,
                                'custom_cash_price', lio.custom_cash_price,
                                'price_modifier', lio.price_modifier,
                                'price_modifier_type', lio.price_modifier_type,
                                'is_available', lio.is_available,
                                'current_stock', lio.current_stock
                            )
                            ELSE NULL
                        END,
                        
                        -- ================================================
                        -- EFFECTIVE PRICE CALCULATION
                        -- Full cascade: Level 4 > Level 2 > Level 3 > Level 1
                        -- ================================================
                        'effective_price', CASE
                            -- Location-owned menu: just use menu price
                            WHEN m.location_id IS NOT NULL THEN 
                                COALESCE(mim.custom_price, mi.price)
                            -- Global menu with location context
                            ELSE COALESCE(
                                lmio.custom_price,                              -- Level 4
                                -- Level 2 with modifier logic
                                CASE 
                                    WHEN lio.price_modifier_type = 'add' AND lio.price_modifier IS NOT NULL THEN
                                        COALESCE(mim.custom_price, mi.price) + lio.price_modifier
                                    WHEN lio.price_modifier_type = 'percent' AND lio.price_modifier IS NOT NULL THEN
                                        COALESCE(mim.custom_price, mi.price) * (1 + lio.price_modifier / 100)
                                    WHEN lio.custom_price IS NOT NULL THEN
                                        lio.custom_price
                                    ELSE NULL
                                END,
                                mim.custom_price,                               -- Level 3
                                mi.price                                        -- Level 1
                            )
                        END,
                        
                        'effective_cash_price', CASE
                            WHEN m.location_id IS NOT NULL THEN 
                                COALESCE(mim.custom_cash_price, mi.cash_price)
                            ELSE COALESCE(
                                lmio.custom_cash_price,
                                CASE 
                                    WHEN lio.price_modifier_type = 'add' AND lio.price_modifier IS NOT NULL THEN
                                        COALESCE(mim.custom_cash_price, mi.cash_price) + lio.price_modifier
                                    WHEN lio.price_modifier_type = 'percent' AND lio.price_modifier IS NOT NULL THEN
                                        COALESCE(mim.custom_cash_price, mi.cash_price) * (1 + lio.price_modifier / 100)
                                    WHEN lio.custom_cash_price IS NOT NULL THEN
                                        lio.custom_cash_price
                                    ELSE NULL
                                END,
                                mim.custom_cash_price,
                                mi.cash_price
                            )
                        END,
                        
                        -- Availability: AND logic
                        'effective_availability', (
                            mi.availability = true
                            AND COALESCE(lio.is_available, true) = true
                            AND mim.is_available = true
                            AND COALESCE(lmio.is_available, true) = true
                        ),
                        
                        -- UI helper flags
                        'has_location_item_override', (lio.id IS NOT NULL),
                        'has_menu_override', (mim.custom_price IS NOT NULL),
                        'has_location_menu_override', (lmio.id IS NOT NULL),
                        
                        'price_source', CASE
                            WHEN m.location_id IS NOT NULL AND mim.custom_price IS NOT NULL 
                                THEN 'location_menu'
                            WHEN lmio.custom_price IS NOT NULL 
                                THEN 'location_menu_override'
                            WHEN lio.custom_price IS NOT NULL OR lio.price_modifier IS NOT NULL 
                                THEN 'location_item_override'
                            WHEN mim.custom_price IS NOT NULL 
                                THEN 'menu_override'
                            ELSE 'base'
                        END,
                        
                        -- Price breakdown for admin UI
                        'price_breakdown', json_build_object(
                            'level_1_base', mi.price,
                            'level_2_location_item', lio.custom_price,
                            'level_2_modifier', lio.price_modifier,
                            'level_2_modifier_type', lio.price_modifier_type,
                            'level_3_menu', mim.custom_price,
                            'level_4_location_menu', lmio.custom_price
                        ),
                        
                        'stock_tracking_mode', COALESCE(
                            NULLIF(lio.stock_tracking_mode, 'use_default'),
                            mi.stock_tracking_mode
                        ),
                        'current_stock', lio.current_stock,
--  3. NESTED MODIFIERS (The New Logic)
                        'modifier_groups', (
                            SELECT COALESCE(json_agg(
                                json_build_object(
                                    'id', mg.id,
                                    'name', mg.name,
                                    'min_selections', mg.min_selections,
                                    'max_selections', mg.max_selections,
                                    'is_required', mg.is_required,
                                    
                                    -- Group Availability Override
                                    'is_active', COALESCE(lmgo.is_active, true),
                                    
                                    'items', (
                                        SELECT COALESCE(json_agg(
                                            json_build_object(
                                                'id', mgi.id,
                                                'name', mgi.name,
                                                
                                                -- Modifier Price: Location Override > Global Base
                                                'price_modifier', COALESCE(lmio_mod.price_modifier, mgi.price_modifier),
                                                
                                                -- Modifier Availability: Location Override > Global Base
                                                'is_active', (
                                                    mgi.is_active = true 
                                                    AND COALESCE(lmio_mod.is_active, true) = true
                                                ),

                                                -- Stock Status (Location Specific)
                                                'stock_tracking_mode', COALESCE(lmio_mod.stock_tracking_mode, 'in_stock'),
                                                'current_stock', lmio_mod.current_stock
                                            ) ORDER BY mgi.name
                                        ), '[]'::json)
                                        FROM modifier_group_items mgi
                                        -- LEFT JOIN: Check for Item Override
                                        LEFT JOIN location_modifier_item_overrides lmio_mod
                                            ON lmio_mod.modifier_group_item_id = mgi.id 
                                            AND lmio_mod.location_id = p_location_id
                                        WHERE mgi.modifier_group_id = mg.id
                                    )
                                ) ORDER BY mg.name
                            ), '[]'::json)
                            FROM menu_item_modifier_groups mimg
                            JOIN modifier_groups mg ON mg.id = mimg.modifier_group_id
                            -- LEFT JOIN: Check for Group Override
                            LEFT JOIN location_modifier_group_overrides lmgo
                                ON lmgo.modifier_group_id = mg.id 
                                AND lmgo.location_id = p_location_id
                            WHERE mimg.menu_item_id = mi.id
                        )
                    )
                )
            ), '[]'::json)
            FROM menu_item_menus mim
            JOIN menu_items mi ON mi.id = mim.menu_item_id
            -- Level 2: Location item base
            LEFT JOIN location_item_overrides lio 
                ON lio.menu_item_id = mi.id AND lio.location_id = p_location_id
            -- Level 4: Location + Menu override
            LEFT JOIN location_menu_item_overrides lmio 
                ON lmio.menu_item_id = mi.id 
                AND lmio.menu_id = p_menu_id 
                AND lmio.location_id = p_location_id
            WHERE mim.menu_id = m.id
        ),
        
        'menu_schedules', (
            SELECT COALESCE(json_agg(
                json_build_object(
                    'id', ms.id,
                    'schedule', json_build_object(
                        'id', s.id,
                        'name', s.name,
                        'description', s.description,
                        'is_active', s.is_active,
                        'schedule_time_slots', (
                            SELECT COALESCE(json_agg(
                                json_build_object(
                                    'id', sts.id,
                                    'day_of_week', sts.day_of_week,
                                    'start_time', sts.start_time,
                                    'end_time', sts.end_time
                                )
                            ), '[]'::json)
                            FROM schedule_time_slots sts
                            WHERE sts.schedule_id = s.id
                        )
                    )
                )
            ), '[]'::json)
            FROM menu_schedules ms
            JOIN schedules s ON s.id = ms.schedule_id
            WHERE ms.menu_id = m.id
        )
    ) INTO result
    FROM menus m
    WHERE m.id = p_menu_id;
    
    RETURN result;
END;
$$;

--         'id', m.id,
--         'merchant_id', m.merchant_id,
--         'location_id', m.location_id,
--         'name', m.name,
--         'description', m.description,

--         'updated_at', m.updated_at,
-- CREATE OR REPLACE FUNCTION get_menu_for_location(
--     p_menu_id UUID,
--     p_location_id UUID DEFAULT NULL
-- )
-- RETURNS JSON
-- LANGUAGE plpgsql
-- SECURITY DEFINER
-- AS $$
-- DECLARE
--     result JSON;
-- BEGIN
--     SELECT json_build_object(
--         'id', m.id,
--         'name', m.name,
--         'description', m.description,
--         'is_active', m.is_active,
--         'updated_at', m.updated_at,
--         'is_active', m.is_active,
--         'is_global', (m.location_id IS NULL),
--         'is_location_owned', (m.location_id IS NOT NULL),
--         'created_at', m.created_at,
        
--         -- 1. CATEGORIES (Standard)
--         'menu_categories', (
--             SELECT COALESCE(json_agg(
--                 json_build_object(
--                     'id', mc.id,
--                     'category', json_build_object(
--                         'id', c.id,
--                         'name', c.name,
--                         'image', c.image,
--                         'is_active', COALESCE(lco.is_active, c.is_active)
--                     )
--                 ) ORDER BY mc.created_at
--             ), '[]'::json)
--             FROM menu_categories mc
--             JOIN categories c ON c.id = mc.category_id
--             LEFT JOIN location_category_overrides lco 
--                 ON lco.category_id = c.id AND lco.location_id = p_location_id
--             WHERE mc.menu_id = m.id
--         ),
        
--         -- 2. ITEMS
--         'menu_item_menus', (
--             SELECT COALESCE(json_agg(
--                 json_build_object(
--                     'id', mim.id,
--                     'custom_price', mim.custom_price,
                    
--                     'menu_item', json_build_object(
--                         'id', mi.id,
--                         'name', mi.name,
--                         'description', mi.description,
--                         'image', mi.image,
--                         'meal_types', mi.meal_types,
--                         'allergens', mi.allergens,
--                         'card_bg_color', mi.card_bg_color,
                        
--                         -- Effective Price (Menu > Location > Base)
--                         'effective_price', CASE
--                             WHEN m.location_id IS NOT NULL THEN COALESCE(mim.custom_price, mi.price)
--                             ELSE COALESCE(lmio.custom_price, mim.custom_price, mi.price) 
--                         END,
                        
--                         -- Effective Availability
--                         'effective_availability', (
--                             mi.availability = true 
--                             AND COALESCE(lio.is_available, true) = true
--                             AND mim.is_available = true
--                             AND COALESCE(lmio.is_available, true) = true
--                         ),
                        
--                         -- 3. NESTED MODIFIERS (The New Logic)
--                         'modifier_groups', (
--                             SELECT COALESCE(json_agg(
--                                 json_build_object(
--                                     'id', mg.id,
--                                     'name', mg.name,
--                                     'min_selections', mg.min_selections,
--                                     'max_selections', mg.max_selections,
--                                     'is_required', mg.is_required,
                                    
--                                     -- Group Availability Override
--                                     'is_active', COALESCE(lmgo.is_active, true),
                                    
--                                     'items', (
--                                         SELECT COALESCE(json_agg(
--                                             json_build_object(
--                                                 'id', mgi.id,
--                                                 'name', mgi.name,
                                                
--                                                 -- Modifier Price: Location Override > Global Base
--                                                 'price_modifier', COALESCE(lmio_mod.price_modifier, mgi.price_modifier),
                                                
--                                                 -- Modifier Availability: Location Override > Global Base
--                                                 'is_active', (
--                                                     mgi.is_active = true 
--                                                     AND COALESCE(lmio_mod.is_active, true) = true
--                                                 ),

--                                                 -- Stock Status (Location Specific)
--                                                 'stock_tracking_mode', COALESCE(lmio_mod.stock_tracking_mode, 'in_stock'),
--                                                 'current_stock', lmio_mod.current_stock
--                                             ) ORDER BY mgi.name
--                                         ), '[]'::json)
--                                         FROM modifier_group_items mgi
--                                         -- LEFT JOIN: Check for Item Override
--                                         LEFT JOIN location_modifier_item_overrides lmio_mod
--                                             ON lmio_mod.modifier_group_item_id = mgi.id 
--                                             AND lmio_mod.location_id = p_location_id
--                                         WHERE mgi.modifier_group_id = mg.id
--                                     )
--                                 ) ORDER BY mg.name
--                             ), '[]'::json)
--                             FROM menu_item_modifier_groups mimg
--                             JOIN modifier_groups mg ON mg.id = mimg.modifier_group_id
--                             -- LEFT JOIN: Check for Group Override
--                             LEFT JOIN location_modifier_group_overrides lmgo
--                                 ON lmgo.modifier_group_id = mg.id 
--                                 AND lmgo.location_id = p_location_id
--                             WHERE mimg.menu_item_id = mi.id
--                         )
--                     )
--                 ) ORDER BY mim.created_at
--             ), '[]'::json)
--             FROM menu_item_menus mim
--             JOIN menu_items mi ON mi.id = mim.menu_item_id
--             -- Joins for main item overrides...
--             LEFT JOIN location_item_overrides lio 
--                 ON lio.menu_item_id = mi.id AND lio.location_id = p_location_id
--             LEFT JOIN location_menu_item_overrides lmio 
--                 ON lmio.menu_item_id = mi.id AND lmio.menu_id = p_menu_id AND lmio.location_id = p_location_id
--             WHERE mim.menu_id = m.id
--         )
--     ) INTO result
--     FROM menus m
--     WHERE m.id = p_menu_id;
    
--     RETURN result;
-- END;
-- $$;

-- ============================================================================
-- FUNCTION: Reset item to specific level
-- ============================================================================

CREATE OR REPLACE FUNCTION reset_item_to_level(
    p_menu_item_id UUID,
    p_menu_id UUID DEFAULT NULL,
    p_location_id UUID DEFAULT NULL,
    p_target_level INTEGER DEFAULT 1  -- Reset TO this level (remove higher level overrides)
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_deleted_levels TEXT[] := '{}';
BEGIN
    -- Reset Level 4 (location + menu override)
    IF p_target_level < 4 AND p_location_id IS NOT NULL AND p_menu_id IS NOT NULL THEN
        DELETE FROM location_menu_item_overrides
        WHERE location_id = p_location_id 
          AND menu_id = p_menu_id 
          AND menu_item_id = p_menu_item_id;
        
        IF FOUND THEN
            v_deleted_levels := array_append(v_deleted_levels, 'level_4_location_menu');
        END IF;
    END IF;
    
    -- Reset Level 3 (menu override) - only if merchant admin
    IF p_target_level < 3 AND p_location_id IS NULL AND p_menu_id IS NOT NULL THEN
        UPDATE menu_item_menus
        SET custom_price = NULL, custom_cash_price = NULL, updated_at = NOW()
        WHERE menu_id = p_menu_id AND menu_item_id = p_menu_item_id;
        
        IF FOUND THEN
            v_deleted_levels := array_append(v_deleted_levels, 'level_3_menu');
        END IF;
    END IF;
    
    -- Reset Level 2 (location item override)
    IF p_target_level < 2 AND p_location_id IS NOT NULL THEN
        DELETE FROM location_item_overrides
        WHERE location_id = p_location_id AND menu_item_id = p_menu_item_id;
        
        IF FOUND THEN
            v_deleted_levels := array_append(v_deleted_levels, 'level_2_location_item');
        END IF;
    END IF;
    
    RETURN json_build_object(
        'success', true,
        'target_level', p_target_level,
        'deleted_overrides', v_deleted_levels
    );
END;
$$;


-- ============================================================================
-- GRANT PERMISSIONS
-- ============================================================================

GRANT EXECUTE ON FUNCTION get_items_for_location(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION upsert_item_override(UUID, UUID, UUID, DECIMAL, DECIMAL, BOOLEAN, DECIMAL, TEXT, TEXT, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION get_menu_for_location(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION reset_item_to_level(UUID, UUID, UUID, INTEGER) TO authenticated;