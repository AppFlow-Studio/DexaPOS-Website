-- ============================================================================

CREATE OR REPLACE FUNCTION get_categories_for_location(
    p_merchant_id UUID,
    p_location_id UUID DEFAULT NULL
)
BEGIN
    RETURN (
        SELECT COALESCE(json_agg(
            json_build_object(
                'id', c.id,
                'name', c.name,
                'description', c.description,
                'image', c.image,
                'display_order', c.display_order,
                
                -- Ownership info
                'location_id', c.location_id,
                'is_global', COALESCE(c.is_global, c.location_id IS NULL),
                'is_location_specific', (c.location_id IS NOT NULL),
                'location_name', (
                    SELECT l.name FROM locations l WHERE l.id = c.location_id
                ),
                'created_by', c.created_by,
                
                -- Global availability
                'is_active', c.is_active,
                
                -- Location override (only applies to global categories)
                'location_override', CASE 
                    WHEN c.location_id IS NULL AND lco.id IS NOT NULL THEN json_build_object(
                        'id', lco.id,
                        'is_active', lco.is_active,
                        'display_order', lco.display_order,
                        'custom_title', lco.custom_title
                    )
                    ELSE NULL
                END,
                
                -- Effective values
                'effective_is_active', CASE
                    -- Location-specific category: use its own is_active
                    WHEN c.location_id IS NOT NULL THEN c.is_active
                    -- Global category: check for location override
                    ELSE COALESCE(lco.is_active, c.is_active)
                END,
                'effective_display_order', CASE
                    WHEN c.location_id IS NOT NULL THEN c.display_order
                    ELSE COALESCE(lco.display_order, c.display_order)
                END,
                'effective_name', CASE
                    WHEN c.location_id IS NOT NULL THEN c.name
                    ELSE COALESCE(lco.custom_title, c.name)
                END,
                
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
                
                -- Has location override
                'has_location_override', (lco.id IS NOT NULL),
                
                'created_at', c.created_at,
                'updated_at', c.updated_at
            ) ORDER BY 
                -- Sort: Global categories first, then location-specific
                CASE WHEN c.location_id IS NULL THEN 0 ELSE 1 END,
                COALESCE(lco.display_order, c.display_order) NULLS LAST,
                c.name
        ), '[]'::json)
        FROM categories c
        -- Only join location overrides if we have a location context
        LEFT JOIN location_category_overrides lco 
            ON lco.category_id = c.id 
            AND lco.location_id = p_location_id
            AND c.location_id IS NULL  -- Only global categories can have overrides
        WHERE c.merchant_id = p_merchant_id
          AND (
              -- If no location specified: return ALL categories (admin view)
              p_location_id IS NULL
              OR
              -- If location specified: return global + this location's categories
              (
                  c.location_id IS NULL  -- Global categories
                  OR 
                  c.location_id = p_location_id  -- This location's specific categories
              )
          )
    );
END;
