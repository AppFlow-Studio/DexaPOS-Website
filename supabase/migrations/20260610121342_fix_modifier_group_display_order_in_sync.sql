-- Fix: get_menu_with_categories was ordering modifier_groups correctly by per-item
-- display_order, but never embedding that field into the JSON it returned. The POS
-- client (stores/useMenuStore.ts:mapSyncItem) then re-sorted the array on
-- display_order; with every value undefined, every group tied and the secondary
-- alphabetical fallback won — so a Bacon Breakfast Wrap saved as
-- "Sides, Dipping Sauce, Toppings" rendered on the POS as
-- "Dipping Sauce, Sides, Toppings".
--
-- This migration recreates get_menu_with_categories with one added key
-- ('display_order') inside the modifier_groups json_build_object. Source is
-- COALESCE(lmgo.display_order, mimg.display_order), matching what the existing
-- ORDER BY already uses. The ORDER BY is unchanged.

CREATE OR REPLACE FUNCTION public.get_menu_with_categories(p_menu_id uuid, p_location_id uuid DEFAULT NULL::uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
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
                                    'dietary_flags', mi.dietary_flags,
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
                                                -- Per-item ordering surfaced for client (POS sort path)
                                                'display_order', COALESCE(lmgo.display_order, mimg.display_order),

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
                                                        ) ORDER BY COALESCE(lmio_mod.display_order, mgi.display_order), mgi.name
                                                    ), '[]'::json)
                                                    FROM modifier_group_items mgi
                                                    LEFT JOIN location_modifier_item_overrides lmio_mod
                                                        ON lmio_mod.modifier_group_item_id = mgi.id
                                                        AND lmio_mod.location_id = p_location_id
                                                    WHERE mgi.modifier_group_id = mg.id
                                                )
                                            ) ORDER BY COALESCE(lmgo.display_order, mimg.display_order), mg.name
                                        ), '[]'::json)
                                        FROM (
                                            SELECT modifier_group_id, display_order
                                            FROM menu_item_modifier_groups
                                            WHERE menu_item_id = mi.id
                                            UNION
                                            SELECT modifier_group_id, display_order
                                            FROM location_item_modifier_groups
                                            WHERE menu_item_id = mi.id
                                              AND location_id = p_location_id
                                        ) mimg(modifier_group_id, display_order)
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
$function$;
