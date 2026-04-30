-- =============================================================================
-- Migration: Add 'source' field to modifier_groups in all RPCs
-- Changes: Each modifier_groups JSON object now includes a 'source' field
--          indicating whether the modifier group was assigned at the 'global'
--          level (menu_item_modifier_groups) or the 'location' level
--          (location_item_modifier_groups).
-- Affected RPCs:
--   1. get_menu_with_categories
--   2. get_categories_for_location
--   3. get_items_for_location_library
--   4. get_menu_item_details
-- =============================================================================

-- 1. get_menu_with_categories
CREATE OR REPLACE FUNCTION "public"."get_menu_with_categories"("p_menu_id" "uuid", "p_location_id" "uuid" DEFAULT NULL::"uuid") RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
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
                                        -- L2: global category price (menu_id IS NULL)
                                        'level_3_category', ci.custom_price,
                                        'level_3_category_cash', ci.custom_cash_price,
                                        'level_3_category_delivery', ci.custom_delivery_price,
                                        -- L4: global menu category price (menu_id = p_menu_id)
                                        'level_3_menu_category', ci_menu.custom_price,
                                        'level_3_menu_category_cash', ci_menu.custom_cash_price,
                                        'level_3_menu_category_delivery', ci_menu.custom_delivery_price,
                                        -- L3: branch category price
                                        'level_4_location_category', lcio.custom_price,
                                        'level_4_location_category_cash', lcio.custom_cash_price,
                                        'level_4_location_category_delivery', lcio.custom_delivery_price,
                                        -- L5: branch menu price
                                        'level_5_location_menu', lmio.custom_price,
                                        'level_5_location_menu_cash', lmio.custom_cash_price,
                                        'level_5_location_menu_delivery', lmio.custom_delivery_price,
                                        'level_1_delivery', mi.delivery_price,
                                        'level_1_cash', mi.cash_price,
                                        'level_2_location_item_delivery', lio.custom_delivery_price
                                    ),

                                    -- ============================================
                                    -- EFFECTIVE PRICE (Full Cascade)
                                    -- UI: L5 > L4 > L3 > L2 > L1
                                    -- DB: lmio > ci_menu > lcio > ci > lio/mi
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
                                            lmio.custom_price,          -- UI L5: Location + Menu
                                            ci_menu.custom_price,       -- UI L4: Global Menu Category
                                            lcio.custom_price,          -- UI L3: Location + Category
                                            ci.custom_price,            -- UI L2: Global Category
                                            -- UI L1 with modifier logic
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
                                            mi.price                    -- UI L1: Base
                                        )
                                    END,

                                    'effective_cash_price', CASE
                                        WHEN m.location_id IS NOT NULL THEN
                                            COALESCE(ci.custom_cash_price, mi.cash_price)
                                        ELSE COALESCE(
                                            lmio.custom_cash_price,
                                            ci_menu.custom_cash_price,
                                            lcio.custom_cash_price,
                                            ci.custom_cash_price,
                                            lio.custom_cash_price,
                                            mi.cash_price
                                        )
                                    END,

                                    'effective_delivery_price', CASE
                                        WHEN m.location_id IS NOT NULL THEN
                                            COALESCE(ci.custom_delivery_price, mi.delivery_price)
                                        ELSE COALESCE(
                                            lmio.custom_delivery_price,
                                            ci_menu.custom_delivery_price,
                                            lcio.custom_delivery_price,
                                            ci.custom_delivery_price,
                                            lio.custom_delivery_price,
                                            mi.delivery_price
                                        )
                                    END,

                                    -- ============================================
                                    -- AVAILABILITY (AND Logic through all levels)
                                    -- ============================================
                                    'effective_availability', (
                                        mi.availability = true
                                        AND COALESCE(lio.is_available, true) = true
                                        AND COALESCE(ci.is_available, true) = true
                                        AND COALESCE(ci_menu.is_available, true) = true
                                        AND COALESCE(lcio.is_available, true) = true
                                        AND COALESCE(lmio.is_available, true) = true
                                    ),

                                    -- Item badges (location-specific)
                                    'is_new', COALESCE(lio.is_new, false),
                                    'is_popular', (
                                        COALESCE(lio.is_popular, false)
                                        OR (
                                            p_location_id IS NOT NULL
                                            AND (
                                                SELECT COUNT(*) >= 10
                                                FROM order_items oi
                                                JOIN orders o ON o.id = oi.order_id
                                                WHERE oi.menu_item_id = mi.id
                                                  AND o.location_id = p_location_id
                                                  AND o.status = 'completed'
                                                  AND o.completed_at > NOW() - INTERVAL '30 days'
                                                  AND oi.is_voided = false
                                            )
                                        )
                                    ),

                                    -- Price source indicator for UI
                                    'price_source', CASE
                                        WHEN lmio.custom_price IS NOT NULL THEN 'location_menu'
                                        WHEN ci_menu.custom_price IS NOT NULL THEN 'menu_category'
                                        WHEN lcio.custom_price IS NOT NULL THEN 'location_category'
                                        WHEN ci.custom_price IS NOT NULL THEN 'category'
                                        WHEN lio.custom_price IS NOT NULL OR lio.price_modifier IS NOT NULL
                                            THEN 'location_item'
                                        ELSE 'base'
                                    END,

                                    -- Override flags for UI
                                    'has_location_item_override', (lio.id IS NOT NULL),
                                    'has_category_override', (ci.custom_price IS NOT NULL),
                                    'has_menu_category_override', (ci_menu.id IS NOT NULL),
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
                                                'source', mimg.source,

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
                                        FROM (
                                            SELECT modifier_group_id, 'global'::text AS source FROM menu_item_modifier_groups WHERE menu_item_id = mi.id
                                            UNION
                                            SELECT modifier_group_id, 'location'::text AS source FROM location_item_modifier_groups
                                            WHERE menu_item_id = mi.id AND location_id = p_location_id
                                        ) mimg(modifier_group_id, source)
                                        JOIN modifier_groups mg ON mg.id = mimg.modifier_group_id
                                        LEFT JOIN location_modifier_group_overrides lmgo
                                            ON lmgo.modifier_group_id = mg.id
                                            AND lmgo.location_id = p_location_id
                                    )
                                )
                            ) ORDER BY COALESCE(lcio.display_order, ci.display_order)
                        ), '[]'::json)
                        -- L2: global category rows (menu_id IS NULL)
                        FROM category_items ci
                        JOIN menu_items mi ON mi.id = ci.menu_item_id
                        -- L4: menu-specific global category rows
                        LEFT JOIN category_items ci_menu
                            ON ci_menu.menu_item_id = ci.menu_item_id
                            AND ci_menu.category_id = ci.category_id
                            AND ci_menu.menu_id = m.id
                        -- Location item override
                        LEFT JOIN location_item_overrides lio
                            ON lio.menu_item_id = mi.id
                            AND lio.location_id = p_location_id
                        -- Branch category override (UI L3)
                        LEFT JOIN location_category_item_overrides lcio
                            ON lcio.menu_item_id = mi.id
                            AND lcio.category_id = c.id
                            AND lcio.location_id = p_location_id
                        -- Branch menu override (UI L5)
                        LEFT JOIN location_menu_item_overrides lmio
                            ON lmio.menu_item_id = mi.id
                            AND lmio.menu_id = m.id
                            AND lmio.category_id = c.id
                            AND lmio.location_id = p_location_id
                        WHERE ci.category_id = c.id
                          AND ci.menu_id IS NULL
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
                    'schedule', (
                        SELECT json_build_object(
                            'id', s.id,
                            'name', s.name,
                            'time_slots', (
                                SELECT COALESCE(json_agg(
                                    json_build_object(
                                        'id', ts.id,
                                        'day_of_week', ts.day_of_week,
                                        'start_time', ts.start_time,
                                        'end_time', ts.end_time
                                    ) ORDER BY ts.day_of_week, ts.start_time
                                ), '[]'::json)
                                FROM schedule_time_slots ts WHERE ts.schedule_id = s.id
                            )
                        )
                        FROM schedules s WHERE s.id = ms.schedule_id
                    )
                )
            ), '[]'::json)
            FROM menu_schedules ms WHERE ms.menu_id = m.id
        )
    )
    INTO result
    FROM menus m
    WHERE m.id = p_menu_id;

    RETURN result;
END;
$$;
-- 2. get_categories_for_location
CREATE OR REPLACE FUNCTION "public"."get_categories_for_location"("p_merchant_id" "uuid", "p_location_id" "uuid" DEFAULT NULL::"uuid") RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$BEGIN
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
                    WHEN c.location_id IS NOT NULL THEN c.is_active
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
                            'category_delivery_price', ci.custom_delivery_price,
                            'category_is_available', ci.is_available,

                            'menu_item', json_build_object(
                                'id', mi.id,
                                'name', mi.name,
                                'description', mi.description,
                                'image', mi.image,
                                'allergens', mi.allergens,
                                'meal_types', mi.meal_types,
                                'card_bg_color', mi.card_bg_color,
                                'location_id', mi.location_id,
                                -- Level 1: Base price
                                'base_price', mi.price,
                                'base_cash_price', mi.cash_price,
                                'base_delivery_price', mi.delivery_price,
                                'base_availability', mi.availability,

                                -- Level 2: Location item override
                                'location_item_override', CASE
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

                                -- Level 4: Location + Category override
                                'location_category_override', CASE
                                    WHEN lcio.id IS NOT NULL THEN json_build_object(
                                        'id', lcio.id,
                                        'custom_price', lcio.custom_price,
                                        'custom_cash_price', lcio.custom_cash_price,
                                        'custom_delivery_price', lcio.custom_delivery_price,
                                        'is_available', lcio.is_available
                                    )
                                    ELSE NULL
                                END,

                                -- Effective price (L4 > L3 > L2 > L1, no L5 in categories view)
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

                                'effective_delivery_price', COALESCE(
                                    lcio.custom_delivery_price,
                                    ci.custom_delivery_price,
                                    lio.custom_delivery_price,
                                    mi.delivery_price
                                ),

                                -- Availability (AND logic)
                                'effective_availability', (
                                    mi.availability = true
                                    AND COALESCE(lio.is_available, true) = true
                                    AND COALESCE(ci.is_available, true) = true
                                    AND COALESCE(lcio.is_available, true) = true
                                ),

                                'is_new', COALESCE(lio.is_new, false),
                                'is_popular', (
                                    COALESCE(lio.is_popular, false)
                                    OR (
                                        p_location_id IS NOT NULL
                                        AND (
                                            SELECT COUNT(*) >= 10
                                            FROM order_items oi
                                            JOIN orders o ON o.id = oi.order_id
                                            WHERE oi.menu_item_id = mi.id
                                              AND o.location_id = p_location_id
                                              AND o.status = 'completed'
                                              AND o.completed_at > NOW() - INTERVAL '30 days'
                                              AND oi.is_voided = false
                                        )
                                    )
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
                                'has_location_category_override', (lcio.id IS NOT NULL),

                                -- Modifier groups (with location overrides)
                                'modifier_groups', (
                                    SELECT COALESCE(json_agg(
                                        json_build_object(
                                            'id', mg.id,
                                            'name', mg.name,
                                            'min_selections', mg.min_selections,
                                            'max_selections', mg.max_selections,
                                            'is_required', mg.is_required,
                                            'is_active', COALESCE(lmgo.is_active, true),
                                            'source', mimg.source,

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
                                                        'is_default', mgi.is_default,
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
                                    FROM (
                                        SELECT modifier_group_id, 'global'::text AS source FROM menu_item_modifier_groups WHERE menu_item_id = mi.id
                                        UNION
                                        SELECT modifier_group_id, 'location'::text AS source FROM location_item_modifier_groups
                                        WHERE menu_item_id = mi.id AND location_id = p_location_id
                                    ) mimg(modifier_group_id, source)
                                    JOIN modifier_groups mg ON mg.id = mimg.modifier_group_id
                                    LEFT JOIN location_modifier_group_overrides lmgo
                                        ON lmgo.modifier_group_id = mg.id
                                        AND lmgo.location_id = p_location_id
                                )
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

                -- Menu count
                'menu_count', (
                    SELECT COUNT(*) FROM menu_categories mc WHERE mc.category_id = c.id
                ),

                -- Has location override
                'has_location_override', (lco.id IS NOT NULL),

                'created_at', c.created_at,
                'updated_at', c.updated_at
            ) ORDER BY
                CASE WHEN c.location_id IS NULL THEN 0 ELSE 1 END,
                COALESCE(lco.display_order, c.display_order) NULLS LAST,
                c.name
        ), '[]'::json)
        FROM categories c
        LEFT JOIN location_category_overrides lco
            ON lco.category_id = c.id
            AND lco.location_id = p_location_id
            AND c.location_id IS NULL
        WHERE c.merchant_id = p_merchant_id
          AND (
              p_location_id IS NULL
              OR
              (
                  c.location_id IS NULL
                  OR
                  c.location_id = p_location_id
              )
          )
    );
END;$$;
-- 3. get_items_for_location_library
CREATE OR REPLACE FUNCTION "public"."get_items_for_location_library"("p_merchant_id" "uuid", "p_location_id" "uuid" DEFAULT NULL::"uuid") RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'public', 'pg_temp'
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
                'base_delivery_price', mi.delivery_price,
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
                        'available_channels', lio.available_channels,
                        'custom_delivery_price', lio.custom_delivery_price
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
                    lio.custom_delivery_price,       -- L2: Location item override
                    mi.delivery_price                -- L1: Base
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

                -- ============================================================
                -- MODIFIER GROUPS WITH ITEMS
                -- All groups assigned to this item, with location overrides.
                -- Shown in the Edit Item dialog (read-only when location-scoped).
                -- ============================================================
                'modifier_groups', COALESCE(
                    (
                        SELECT json_agg(
                            json_build_object(
                                'id', mg.id,
                                'name', mg.name,
                                'description', mg.description,

                                -- Base selection rules
                                'base_min_selections', mg.min_selections,
                                'base_max_selections', mg.max_selections,
                                'base_is_required', mg.is_required,
                                'base_is_active', mg.is_active,

                                -- Location override
                                'location_override', CASE
                                    WHEN lmgo.id IS NOT NULL THEN json_build_object(
                                        'id', lmgo.id,
                                        'is_available', lmgo.is_active
                                    )
                                    ELSE NULL
                                END,

                                'effective_availability', COALESCE(lmgo.is_active, mg.is_active),
                                'has_location_override', (lmgo.id IS NOT NULL),
                                'source', mimg.source,

                                -- Modifier items
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
                                                    )
                                                    ELSE NULL
                                                END,

                                                -- Effective values
                                                'effective_price', COALESCE(lmio.price_modifier, mgi.price_modifier),
                                                'effective_is_active', COALESCE(lmio.is_active, mgi.is_active),
                                                'has_location_override', (lmio.id IS NOT NULL)
                                            )
                                            ORDER BY mgi.name
                                        )
                                        FROM modifier_group_items mgi
                                        LEFT JOIN location_modifier_item_overrides lmio
                                            ON lmio.modifier_group_item_id = mgi.id
                                            AND lmio.location_id = p_location_id
                                        WHERE mgi.modifier_group_id = mg.id
                                    ),
                                    '[]'::json
                                )
                            )
                            ORDER BY mg.name
                        )
                        FROM (
                            SELECT modifier_group_id, 'global'::text AS source FROM menu_item_modifier_groups WHERE menu_item_id = mi.id
                            UNION
                            SELECT modifier_group_id, 'location'::text AS source FROM location_item_modifier_groups
                            WHERE menu_item_id = mi.id AND location_id = p_location_id
                        ) mimg(modifier_group_id, source)
                        JOIN modifier_groups mg ON mg.id = mimg.modifier_group_id
                        LEFT JOIN location_modifier_group_overrides lmgo
                            ON lmgo.modifier_group_id = mg.id
                            AND lmgo.location_id = p_location_id
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
$$;
-- 4. get_menu_item_details (Pattern B: adds UNION + source)
CREATE OR REPLACE FUNCTION "public"."get_menu_item_details"("p_item_id" "uuid", "p_location_id" "uuid" DEFAULT NULL::"uuid") RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'public', 'pg_temp'
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
                    'current_stock', lio.current_stock,
                    'is_popular', lio.is_popular
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

            -- Modifiers
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
                        'source', mimg.source,
                        'items', (
                            SELECT COALESCE(json_agg(
                                json_build_object(
                                    'id', mgi.id,
                                    'name', mgi.name,
                                    'description', mgi.description,
                                    'price_modifier', COALESCE(lmio_mod.price_modifier, mgi.price_modifier),
                                    'is_active', (mgi.is_active = true AND COALESCE(lmio_mod.is_active, true) = true),
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
                FROM (
                    SELECT modifier_group_id, 'global'::text AS source FROM menu_item_modifier_groups WHERE menu_item_id = mi.id
                    UNION
                    SELECT modifier_group_id, 'location'::text AS source FROM location_item_modifier_groups
                    WHERE menu_item_id = mi.id AND location_id = p_location_id
                ) mimg(modifier_group_id, source)
                JOIN modifier_groups mg ON mg.id = mimg.modifier_group_id
                LEFT JOIN location_modifier_group_overrides lmgo
                    ON lmgo.modifier_group_id = mg.id
                    AND lmgo.location_id = p_location_id
            ),

            -- Categories (fixed: was menu_item_categories, now category_items)
            'categories', (
                SELECT COALESCE(json_agg(
                    json_build_object('id', c.id, 'name', c.name)
                ), '[]'::json)
                FROM category_items ci
                JOIN categories c ON c.id = ci.category_id
                WHERE ci.menu_item_id = mi.id
            ),

            -- Menus
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
