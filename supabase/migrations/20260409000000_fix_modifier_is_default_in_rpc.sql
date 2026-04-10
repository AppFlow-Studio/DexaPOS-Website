-- Fix: include is_default field for modifier_group_items in get_menu_with_categories RPC
-- This enables the storefront to pre-select default options when a modifier group is required.

CREATE OR REPLACE FUNCTION public.get_menu_with_categories(p_menu_id uuid, p_location_id uuid DEFAULT NULL::uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
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
                                        'level_5_location_menu', lmio.custom_price,
                                        'level_1_delivery', mi.delivery_price,
                                        'level_2_location_item_delivery', lio.custom_delivery_price,
                                        'level_3_category_delivery', ci.custom_delivery_price,
                                        'level_4_location_category_delivery', lcio.custom_delivery_price,
                                        'level_5_location_menu_delivery', lmio.custom_delivery_price
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

                                    'effective_delivery_price', CASE
                                        WHEN m.location_id IS NOT NULL THEN
                                            COALESCE(ci.custom_delivery_price, mi.delivery_price)
                                        ELSE COALESCE(
                                            lmio.custom_delivery_price,
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
                                        mi.availability = true                           -- L1
                                        AND COALESCE(lio.is_available, true) = true      -- L2
                                        AND COALESCE(ci.is_available, true) = true       -- L3
                                        AND COALESCE(lcio.is_available, true) = true     -- L4
                                        AND COALESCE(lmio.is_available, true) = true     -- L5
                                    ),

                                    -- Item badges (location-specific)
                                    -- is_new: stored per-branch in location_item_overrides
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
                        -- Removed: AND COALESCE(ci.is_available, true) = true
                        -- Sold-out items now pass through with effective_availability = false
                        -- so the storefront can render them grayed out with a "Sold Out" label.
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
    )
    INTO result
    FROM menus m
    WHERE m.id = p_menu_id;

    RETURN result;
END;
$function$;
