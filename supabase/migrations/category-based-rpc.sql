-- ============================================================================
-- FUNCTION: Get Categories with Items for a location
-- ============================================================================

CREATE OR REPLACE FUNCTION get_categories_for_location(
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
                'id', c.id,
                'name', c.name,
                'description', c.description,
                'image', c.image,
                'display_order', c.display_order,
                
                -- Global availability
                'is_active', c.is_active,
                
                -- Location override
                'location_override', CASE 
                    WHEN lco.id IS NOT NULL THEN json_build_object(
                        'id', lco.id,
                        'is_active', lco.is_active,
                        'display_order', lco.display_order,
                        'custom_title', lco.custom_title
                    )
                    ELSE NULL
                END,
                
                -- Effective values
                'effective_is_active', COALESCE(lco.is_active, c.is_active),
                'effective_display_order', COALESCE(lco.display_order, c.display_order),
                
                -- Items in this category
                'items', (
                    SELECT COALESCE(json_agg(
                        json_build_object(
                            'id', ci.id,
                            'menu_item_id', mi.id,
                            'display_order', ci.display_order,
                            'is_featured', ci.is_featured,
                            
                            -- Category-level price
                            'category_price', ci.custom_price,
                            'category_cash_price', ci.custom_cash_price,
                            'category_is_available', ci.is_available,
                            
                            'menu_item', json_build_object(
                                'id', mi.id,
                                'name', mi.name,
                                'description', mi.description,
                                'image', mi.image,
                                'allergens', mi.allergens,
                                'meal_types', mi.meal_types,
                                'card_bg_color', mi.card_bg_color,
                                
                                -- Level 1: Base price
                                'base_price', mi.price,
                                'base_cash_price', mi.cash_price,
                                'base_availability', mi.availability,
                                
                                -- Level 2: Location item override
                                'location_item_override', CASE 
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
                                
                                -- Level 4: Location + Category override
                                'location_category_override', CASE 
                                    WHEN lcio.id IS NOT NULL THEN json_build_object(
                                        'id', lcio.id,
                                        'custom_price', lcio.custom_price,
                                        'custom_cash_price', lcio.custom_cash_price,
                                        'is_available', lcio.is_available
                                    )
                                    ELSE NULL
                                END,
                                
                                -- Effective price (full cascade)
                                'effective_price', COALESCE(
                                    lcio.custom_price,           -- L4: Location + Category
                                    ci.custom_price,             -- L3: Category
                                    lio.custom_price,            -- L2: Location item
                                    mi.price                     -- L1: Base
                                ),
                                
                                'effective_cash_price', COALESCE(
                                    lcio.custom_cash_price,
                                    ci.custom_cash_price,
                                    lio.custom_cash_price,
                                    mi.cash_price
                                ),
                                
                                -- Availability (AND logic)
                                'effective_availability', (
                                    mi.availability = true
                                    AND COALESCE(lio.is_available, true) = true
                                    AND COALESCE(ci.is_available, true) = true
                                    AND COALESCE(lcio.is_available, true) = true
                                ),
                                
                                -- Price source
                                'price_source', CASE
                                    WHEN lcio.custom_price IS NOT NULL THEN 'location_category'
                                    WHEN ci.custom_price IS NOT NULL THEN 'category'
                                    WHEN lio.custom_price IS NOT NULL THEN 'location_item'
                                    ELSE 'base'
                                END,
                                
                                -- Override flags
                                'has_location_item_override', (lio.id IS NOT NULL),
                                'has_category_price', (ci.custom_price IS NOT NULL),
                                'has_location_category_override', (lcio.id IS NOT NULL)
                            )
                        ) ORDER BY COALESCE(lcio.display_order, ci.display_order)
                    ), '[]'::json)
                    FROM category_items ci
                    JOIN menu_items mi ON mi.id = ci.menu_item_id
                    LEFT JOIN location_item_overrides lio 
                        ON lio.menu_item_id = mi.id 
                        AND lio.location_id = p_location_id
                    LEFT JOIN location_category_item_overrides lcio 
                        ON lcio.menu_item_id = mi.id 
                        AND lcio.category_id = c.id
                        AND lcio.location_id = p_location_id
                    WHERE ci.category_id = c.id
                ),
                
                -- Item count
                'item_count', (
                    SELECT COUNT(*) FROM category_items ci WHERE ci.category_id = c.id
                ),
                
                -- Menu count (how many menus use this category)
                'menu_count', (
                    SELECT COUNT(*) FROM menu_categories mc WHERE mc.category_id = c.id
                ),
                
                'created_at', c.created_at,
                'updated_at', c.updated_at
            ) ORDER BY COALESCE(lco.display_order, c.display_order)
        ), '[]'::json)
        FROM categories c
        LEFT JOIN location_category_overrides lco 
            ON lco.category_id = c.id 
            AND lco.location_id = p_location_id
        WHERE c.merchant_id = p_merchant_id
    );
END;
$$;


-- ============================================================================
-- FUNCTION: Get Menu with Category-Centric structure
-- ============================================================================

CREATE OR REPLACE FUNCTION get_menu_with_categories(
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
        
        -- Categories with items (Uber Eats / DoorDash style)
        'categories', (
            SELECT COALESCE(json_agg(
                json_build_object(
                    'id', mc.id,
                    'category_id', c.id,
                    'display_order', COALESCE(
                        lmco.display_order, 
                        lco.display_order, 
                        mc.display_order
                    ),
                    'is_active', COALESCE(
                        lmco.is_active, 
                        lco.is_active, 
                        mc.is_active, 
                        true
                    ),
                    
                    'category', json_build_object(
                        'id', c.id,
                        'name', COALESCE(lmco.custom_title, mc.custom_title, c.name),
                        'description', c.description,
                        'image', COALESCE(mc.custom_image, c.image),
                        'has_location_override', (lco.id IS NOT NULL),
                        'has_menu_category_override', (lmco.id IS NOT NULL),
                        'location_id', c.location_id
                    ),
                    
                    -- Items in this category on this menu
                    'items', (
                        SELECT COALESCE(json_agg(
                            json_build_object(
                                'id', ci.id,
                                'menu_item_id', mi.id,
                                'category_id', c.id,
                                'display_order', COALESCE(lcio.display_order, ci.display_order),
                                'is_featured', COALESCE(lcio.is_featured, ci.is_featured),
                                
                                'menu_item', json_build_object(
                                    'id', mi.id,
                                    'name', mi.name,
                                    'description', mi.description,
                                    'image', mi.image,
                                    'allergens', mi.allergens,
                                    'meal_types', mi.meal_types,
                                    'card_bg_color', mi.card_bg_color,
                                    
                                    -- ============================================
                                    -- PRICE BREAKDOWN (All Levels)
                                    -- ============================================
                                    'price_levels', json_build_object(
                                        'level_1_base', mi.price,
                                        'level_2_location_item', lio.custom_price,
                                        'level_2_modifier', lio.price_modifier,
                                        'level_2_modifier_type', lio.price_modifier_type,
                                        'level_3_category', ci.custom_price,
                                        'level_4_location_category', lcio.custom_price,
                                        'level_5_location_menu', lmio.custom_price
                                    ),
                                    
                                    -- ============================================
                                    -- EFFECTIVE PRICE (Full Cascade)
                                    -- L5 > L4 > L3 > L2 > L1
                                    -- ============================================
                                    'effective_price', CASE
                                        -- Location-owned menu: simplified cascade
                                        WHEN m.location_id IS NOT NULL THEN 
                                            COALESCE(
                                                ci.custom_price, 
                                                mi.price
                                            )
                                        -- Global menu with location context
                                        ELSE COALESCE(
                                            lmio.custom_price,                    -- L5: Location + Menu
                                            lcio.custom_price,                    -- L4: Location + Category
                                            ci.custom_price,                      -- L3: Category
                                            -- L2 with modifier logic
                                            CASE 
                                                WHEN lio.price_modifier_type = 'add' 
                                                     AND lio.price_modifier IS NOT NULL 
                                                THEN mi.price + lio.price_modifier
                                                WHEN lio.price_modifier_type = 'percent' 
                                                     AND lio.price_modifier IS NOT NULL 
                                                THEN mi.price * (1 + lio.price_modifier / 100)
                                                WHEN lio.custom_price IS NOT NULL 
                                                THEN lio.custom_price
                                                ELSE NULL
                                            END,
                                            mi.price                              -- L1: Base
                                        )
                                    END,
                                    
                                    'effective_cash_price', CASE
                                        WHEN m.location_id IS NOT NULL THEN 
                                            COALESCE(ci.custom_cash_price, mi.cash_price)
                                        ELSE COALESCE(
                                            lmio.custom_cash_price,
                                            lcio.custom_cash_price,
                                            ci.custom_cash_price,
                                            lio.custom_cash_price,
                                            mi.cash_price
                                        )
                                    END,
                                    
                                    -- ============================================
                                    -- AVAILABILITY (AND Logic through all levels)
                                    -- ============================================
                                    'effective_availability', (
                                        mi.availability = true                           -- L1
                                        AND COALESCE(lio.is_available, true) = true      -- L2
                                        AND COALESCE(ci.is_available, true) = true       -- L3
                                        AND COALESCE(lcio.is_available, true) = true     -- L4
                                        AND COALESCE(lmio.is_available, true) = true     -- L5
                                    ),
                                    
                                    -- Price source indicator for UI
                                    'price_source', CASE
                                        WHEN lmio.custom_price IS NOT NULL THEN 'location_menu'
                                        WHEN lcio.custom_price IS NOT NULL THEN 'location_category'
                                        WHEN ci.custom_price IS NOT NULL THEN 'category'
                                        WHEN lio.custom_price IS NOT NULL OR lio.price_modifier IS NOT NULL 
                                            THEN 'location_item'
                                        ELSE 'base'
                                    END,
                                    
                                    -- Override flags for UI
                                    'has_location_item_override', (lio.id IS NOT NULL),
                                    'has_category_override', (ci.custom_price IS NOT NULL),
                                    'has_location_category_override', (lcio.id IS NOT NULL),
                                    'has_location_menu_override', (lmio.id IS NOT NULL),
                                    
                                    -- Stock info
                                    'stock_tracking_mode', COALESCE(
                                        NULLIF(lio.stock_tracking_mode, 'use_default'),
                                        mi.stock_tracking_mode
                                    ),
                                    'current_stock', lio.current_stock,
                                    
                                    -- Modifiers (with location overrides)
                                    'modifier_groups', (
                                        SELECT COALESCE(json_agg(
                                            json_build_object(
                                                'id', mg.id,
                                                'name', mg.name,
                                                'min_selections', mg.min_selections,
                                                'max_selections', mg.max_selections,
                                                'is_required', mg.is_required,
                                                'is_active', COALESCE(lmgo.is_active, true),
                                                
                                                'items', (
                                                    SELECT COALESCE(json_agg(
                                                        json_build_object(
                                                            'id', mgi.id,
                                                            'name', mgi.name,
                                                            'price_modifier', COALESCE(
                                                                lmio_mod.price_modifier, 
                                                                mgi.price_modifier
                                                            ),
                                                            'is_active', (
                                                                mgi.is_active = true 
                                                                AND COALESCE(lmio_mod.is_active, true) = true
                                                            ),
                                                            'stock_tracking_mode', COALESCE(
                                                                lmio_mod.stock_tracking_mode, 
                                                                'in_stock'
                                                            ),
                                                            'current_stock', lmio_mod.current_stock
                                                        ) ORDER BY mgi.display_order, mgi.name
                                                    ), '[]'::json)
                                                    FROM modifier_group_items mgi
                                                    LEFT JOIN location_modifier_item_overrides lmio_mod
                                                        ON lmio_mod.modifier_group_item_id = mgi.id 
                                                        AND lmio_mod.location_id = p_location_id
                                                    WHERE mgi.modifier_group_id = mg.id
                                                )
                                            ) ORDER BY mg.display_order, mg.name
                                        ), '[]'::json)
                                        FROM menu_item_modifier_groups mimg
                                        JOIN modifier_groups mg ON mg.id = mimg.modifier_group_id
                                        LEFT JOIN location_modifier_group_overrides lmgo
                                            ON lmgo.modifier_group_id = mg.id 
                                            AND lmgo.location_id = p_location_id
                                        WHERE mimg.menu_item_id = mi.id
                                    )
                                )
                            ) ORDER BY COALESCE(lcio.display_order, ci.display_order)
                        ), '[]'::json)
                        FROM category_items ci
                        JOIN menu_items mi ON mi.id = ci.menu_item_id
                        -- L2: Location item override
                        LEFT JOIN location_item_overrides lio 
                            ON lio.menu_item_id = mi.id 
                            AND lio.location_id = p_location_id
                        -- L4: Location + Category override
                        LEFT JOIN location_category_item_overrides lcio 
                            ON lcio.menu_item_id = mi.id 
                            AND lcio.category_id = c.id
                            AND lcio.location_id = p_location_id
                        -- L5: Location + Menu override
                        LEFT JOIN location_menu_item_overrides lmio 
                            ON lmio.menu_item_id = mi.id 
                            AND lmio.menu_id = m.id
                            AND lmio.category_id = c.id
                            AND lmio.location_id = p_location_id
                        WHERE ci.category_id = c.id
                          AND COALESCE(ci.is_available, true) = true
                    )
                ) ORDER BY COALESCE(lmco.display_order, lco.display_order, mc.display_order)
            ), '[]'::json)
            FROM menu_categories mc
            JOIN categories c ON c.id = mc.category_id
            LEFT JOIN location_category_overrides lco 
                ON lco.category_id = c.id 
                AND lco.location_id = p_location_id
            LEFT JOIN location_menu_category_overrides lmco
                ON lmco.category_id = c.id
                AND lmco.menu_id = m.id
                AND lmco.location_id = p_location_id
            WHERE mc.menu_id = m.id
              AND COALESCE(lmco.is_active, lco.is_active, mc.is_active, true) = true
        ),
        
        -- Schedules
        'schedules', (
            SELECT COALESCE(json_agg(
                json_build_object(
                    'id', ms.id,
                    'schedule', json_build_object(
                        'id', s.id,
                        'name', s.name,
                        'description', s.description,
                        'is_active', s.is_active,
                        'time_slots', (
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


-- ============================================================================
-- FUNCTION: Upsert item override (updated for category-centric)
-- ============================================================================

CREATE OR REPLACE FUNCTION upsert_category_item_override(
    p_menu_item_id UUID,
    p_category_id UUID DEFAULT NULL,     -- Required for category context
    p_menu_id UUID DEFAULT NULL,         -- Optional: for menu-specific override
    p_location_id UUID DEFAULT NULL,     -- NULL = merchant admin
    p_custom_price DECIMAL(10,2) DEFAULT NULL,
    p_custom_cash_price DECIMAL(10,2) DEFAULT NULL,
    p_is_available BOOLEAN DEFAULT NULL,
    p_price_modifier DECIMAL(10,2) DEFAULT NULL,
    p_price_modifier_type TEXT DEFAULT NULL,
    p_display_order INTEGER DEFAULT NULL,
    p_is_featured BOOLEAN DEFAULT NULL,
    p_stock_tracking_mode TEXT DEFAULT NULL,
    p_current_stock INTEGER DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_update_level INTEGER;
    v_update_table TEXT;
    v_is_empty BOOLEAN;
    v_menu_location_id UUID;
BEGIN
    -- ========================================================================
    -- SCENARIO A: No category context (Items Library - base item only)
    -- ========================================================================
    IF p_category_id IS NULL THEN
        
        IF p_location_id IS NULL THEN
            -- Level 1: Update base item
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
            -- Level 2: Location item override
            v_update_level := 2;
            v_update_table := 'location_item_overrides';
            
            v_is_empty := (
                p_custom_price IS NULL AND 
                p_custom_cash_price IS NULL AND 
                p_price_modifier IS NULL AND
                (p_is_available IS NULL OR p_is_available = true) AND
                p_stock_tracking_mode IS NULL AND
                p_current_stock IS NULL
            );
            
            IF v_is_empty THEN
                DELETE FROM location_item_overrides
                WHERE location_id = p_location_id AND menu_item_id = p_menu_item_id;
                
                RETURN json_build_object(
                    'success', true,
                    'action', 'deleted',
                    'level', v_update_level,
                    'table', v_update_table
                );
            ELSE
                INSERT INTO location_item_overrides (
                    location_id, menu_item_id,
                    custom_price, custom_cash_price,
                    price_modifier, price_modifier_type,
                    is_available, stock_tracking_mode, current_stock,
                    created_at, updated_at
                ) VALUES (
                    p_location_id, p_menu_item_id,
                    p_custom_price, p_custom_cash_price,
                    p_price_modifier, p_price_modifier_type,
                    p_is_available, p_stock_tracking_mode, p_current_stock,
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
    -- SCENARIO B: Category context
    -- ========================================================================
    ELSE
        
        IF p_location_id IS NULL AND p_menu_id IS NULL THEN
            -- Level 3: Category item price (global)
            v_update_level := 3;
            v_update_table := 'category_items';
            
            UPDATE category_items
            SET 
                custom_price = p_custom_price,
                custom_cash_price = p_custom_cash_price,
                is_available = COALESCE(p_is_available, is_available),
                display_order = COALESCE(p_display_order, display_order),
                is_featured = COALESCE(p_is_featured, is_featured),
                updated_at = NOW()
            WHERE category_id = p_category_id AND menu_item_id = p_menu_item_id;
            
        ELSIF p_location_id IS NOT NULL AND p_menu_id IS NULL THEN
            -- Level 4: Location + Category override
            v_update_level := 4;
            v_update_table := 'location_category_item_overrides';
            
            v_is_empty := (
                p_custom_price IS NULL AND 
                p_custom_cash_price IS NULL AND 
                (p_is_available IS NULL OR p_is_available = true) AND
                p_display_order IS NULL AND
                p_is_featured IS NULL
            );
            
            IF v_is_empty THEN
                DELETE FROM location_category_item_overrides
                WHERE location_id = p_location_id 
                  AND category_id = p_category_id 
                  AND menu_item_id = p_menu_item_id;
                  
                RETURN json_build_object(
                    'success', true,
                    'action', 'deleted',
                    'level', v_update_level,
                    'table', v_update_table
                );
            ELSE
                INSERT INTO location_category_item_overrides (
                    location_id, category_id, menu_item_id,
                    custom_price, custom_cash_price, is_available,
                    display_order, is_featured,
                    created_at, updated_at
                ) VALUES (
                    p_location_id, p_category_id, p_menu_item_id,
                    p_custom_price, p_custom_cash_price, p_is_available,
                    p_display_order, p_is_featured,
                    NOW(), NOW()
                )
                ON CONFLICT (location_id, category_id, menu_item_id) 
                DO UPDATE SET
                    custom_price = EXCLUDED.custom_price,
                    custom_cash_price = EXCLUDED.custom_cash_price,
                    is_available = EXCLUDED.is_available,
                    display_order = EXCLUDED.display_order,
                    is_featured = EXCLUDED.is_featured,
                    updated_at = NOW();
            END IF;
            
        ELSIF p_location_id IS NOT NULL AND p_menu_id IS NOT NULL THEN
            -- Level 5: Location + Menu + Category override
            v_update_level := 5;
            v_update_table := 'location_menu_item_overrides';
            
            -- Check if this is a location-owned menu
            SELECT location_id INTO v_menu_location_id FROM menus WHERE id = p_menu_id;
            
            IF v_menu_location_id IS NOT NULL THEN
                -- Location's own menu - they have full control
                RETURN json_build_object(
                    'success', false,
                    'error', 'Use category_items for location-owned menus'
                );
            END IF;
            
            v_is_empty := (
                p_custom_price IS NULL AND 
                p_custom_cash_price IS NULL AND 
                (p_is_available IS NULL OR p_is_available = true)
            );
            
            IF v_is_empty THEN
                DELETE FROM location_menu_item_overrides
                WHERE location_id = p_location_id 
                  AND menu_id = p_menu_id 
                  AND category_id = p_category_id
                  AND menu_item_id = p_menu_item_id;
                  
                RETURN json_build_object(
                    'success', true,
                    'action', 'deleted',
                    'level', v_update_level,
                    'table', v_update_table
                );
            ELSE
                INSERT INTO location_menu_item_overrides (
                    location_id, menu_id, category_id, menu_item_id,
                    custom_price, custom_cash_price, is_available,
                    created_at, updated_at
                ) VALUES (
                    p_location_id, p_menu_id, p_category_id, p_menu_item_id,
                    p_custom_price, p_custom_cash_price, COALESCE(p_is_available, true),
                    NOW(), NOW()
                )
                ON CONFLICT (location_id, menu_id, category_id, menu_item_id) 
                DO UPDATE SET
                    custom_price = EXCLUDED.custom_price,
                    custom_cash_price = EXCLUDED.custom_cash_price,
                    is_available = EXCLUDED.is_available,
                    updated_at = NOW();
            END IF;
        END IF;
    END IF;

    RETURN json_build_object(
        'success', true,
        'action', 'upserted',
        'level', v_update_level,
        'table', v_update_table,
        'menu_item_id', p_menu_item_id,
        'category_id', p_category_id,
        'menu_id', p_menu_id,
        'location_id', p_location_id
    );
END;
$$;


-- ============================================================================
-- FUNCTION: Add item to category
-- ============================================================================

CREATE OR REPLACE FUNCTION add_item_to_category(
    p_category_id UUID,
    p_menu_item_id UUID,
    p_display_order INTEGER DEFAULT 0,
    p_custom_price DECIMAL(10,2) DEFAULT NULL,
    p_is_featured BOOLEAN DEFAULT false
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    INSERT INTO category_items (
        category_id, menu_item_id, display_order, 
        custom_price, is_featured, is_available,
        created_at, updated_at
    ) VALUES (
        p_category_id, p_menu_item_id, p_display_order,
        p_custom_price, p_is_featured, true,
        NOW(), NOW()
    )
    ON CONFLICT (category_id, menu_item_id) 
    DO UPDATE SET
        display_order = EXCLUDED.display_order,
        custom_price = COALESCE(EXCLUDED.custom_price, category_items.custom_price),
        is_featured = EXCLUDED.is_featured,
        updated_at = NOW();
    
    RETURN json_build_object(
        'success', true,
        'category_id', p_category_id,
        'menu_item_id', p_menu_item_id
    );
END;
$$;


-- ============================================================================
-- FUNCTION: Remove item from category
-- ============================================================================

CREATE OR REPLACE FUNCTION remove_item_from_category(
    p_category_id UUID,
    p_menu_item_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Remove the item from category
    DELETE FROM category_items
    WHERE category_id = p_category_id AND menu_item_id = p_menu_item_id;
    
    -- Also clean up any location overrides for this category+item
    DELETE FROM location_category_item_overrides
    WHERE category_id = p_category_id AND menu_item_id = p_menu_item_id;
    
    RETURN json_build_object(
        'success', true,
        'category_id', p_category_id,
        'menu_item_id', p_menu_item_id
    );
END;
$$;


-- ============================================================================
-- FUNCTION: Add category to menu
-- ============================================================================

CREATE OR REPLACE FUNCTION add_category_to_menu(
    p_menu_id UUID,
    p_category_id UUID,
    p_display_order INTEGER DEFAULT 0,
    p_custom_title TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    INSERT INTO menu_categories (
        menu_id, category_id, display_order, 
        custom_title, is_active,
        created_at, updated_at
    ) VALUES (
        p_menu_id, p_category_id, p_display_order,
        p_custom_title, true,
        NOW(), NOW()
    )
    ON CONFLICT (menu_id, category_id) 
    DO UPDATE SET
        display_order = EXCLUDED.display_order,
        custom_title = COALESCE(EXCLUDED.custom_title, menu_categories.custom_title),
        is_active = true,
        updated_at = NOW();
    
    RETURN json_build_object(
        'success', true,
        'menu_id', p_menu_id,
        'category_id', p_category_id
    );
END;
$$;


-- ============================================================================
-- FUNCTION: Remove category from menu
-- ============================================================================

CREATE OR REPLACE FUNCTION remove_category_from_menu(
    p_menu_id UUID,
    p_category_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    DELETE FROM menu_categories
    WHERE menu_id = p_menu_id AND category_id = p_category_id;
    
    -- Also clean up location overrides
    DELETE FROM location_menu_category_overrides
    WHERE menu_id = p_menu_id AND category_id = p_category_id;
    
    RETURN json_build_object(
        'success', true,
        'menu_id', p_menu_id,
        'category_id', p_category_id
    );
END;
$$;


-- ============================================================================
-- FUNCTION: Reset item to specific level (updated)
-- ============================================================================

CREATE OR REPLACE FUNCTION reset_category_item_to_level(
    p_menu_item_id UUID,
    p_category_id UUID DEFAULT NULL,
    p_menu_id UUID DEFAULT NULL,
    p_location_id UUID DEFAULT NULL,
    p_target_level INTEGER DEFAULT 1
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_deleted_levels TEXT[] := '{}';
BEGIN
    -- Reset Level 5 (location + menu + category)
    IF p_target_level < 5 AND p_location_id IS NOT NULL AND p_menu_id IS NOT NULL THEN
        DELETE FROM location_menu_item_overrides
        WHERE location_id = p_location_id 
          AND menu_id = p_menu_id 
          AND menu_item_id = p_menu_item_id
          AND (p_category_id IS NULL OR category_id = p_category_id);
        
        IF FOUND THEN
            v_deleted_levels := array_append(v_deleted_levels, 'level_5_location_menu');
        END IF;
    END IF;
    
    -- Reset Level 4 (location + category)
    IF p_target_level < 4 AND p_location_id IS NOT NULL AND p_category_id IS NOT NULL THEN
        DELETE FROM location_category_item_overrides
        WHERE location_id = p_location_id 
          AND category_id = p_category_id 
          AND menu_item_id = p_menu_item_id;
        
        IF FOUND THEN
            v_deleted_levels := array_append(v_deleted_levels, 'level_4_location_category');
        END IF;
    END IF;
    
    -- Reset Level 3 (category price) - only if merchant admin
    IF p_target_level < 3 AND p_location_id IS NULL AND p_category_id IS NOT NULL THEN
        UPDATE category_items
        SET custom_price = NULL, custom_cash_price = NULL, updated_at = NOW()
        WHERE category_id = p_category_id AND menu_item_id = p_menu_item_id;
        
        IF FOUND THEN
            v_deleted_levels := array_append(v_deleted_levels, 'level_3_category');
        END IF;
    END IF;
    
    -- Reset Level 2 (location item)
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

GRANT EXECUTE ON FUNCTION get_categories_for_location(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_menu_with_categories(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION upsert_category_item_override(UUID, UUID, UUID, UUID, DECIMAL, DECIMAL, BOOLEAN, DECIMAL, TEXT, INTEGER, BOOLEAN, TEXT, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION add_item_to_category(UUID, UUID, INTEGER, DECIMAL, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION remove_item_from_category(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION add_category_to_menu(UUID, UUID, INTEGER, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION remove_category_from_menu(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION reset_category_item_to_level(UUID, UUID, UUID, UUID, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION migrate_menu_items_to_categories() TO authenticated;