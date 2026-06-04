-- =============================================================================
-- Modifier Display Order Alignment
-- Purpose:
--   1. Add per-location group display order support.
--   2. Make modifier group / option ordering consistent across menu feed RPCs.
--   3. Expose canonical reorder RPCs for item-level and option-level modifier ordering.
--
-- Notes:
--   - Display-order-only change set.
--   - No modifier pricing / assignment semantic changes.
--   - Backward-compatible wrapper kept for reorder_menu_item_modifier_groups.
-- =============================================================================

alter table public.location_modifier_group_overrides
  add column if not exists display_order integer;

comment on column public.location_modifier_group_overrides.display_order
  is 'Override display order for this modifier group at this location. NULL = use item-level global display_order';

CREATE OR REPLACE FUNCTION "public"."get_menu_with_categories"("p_menu_id" "uuid", "p_location_id" "uuid" DEFAULT NULL::"uuid") RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
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
$$;

CREATE OR REPLACE FUNCTION "public"."get_menu_for_location"("p_menu_id" "uuid", "p_location_id" "uuid" DEFAULT NULL::"uuid") RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
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
                    'custom_delivery_price', mim.custom_delivery_price,
                    'is_available', mim.is_available,

                    -- Level 4: Location + Menu override
                    'location_menu_override', CASE
                        WHEN lmio.id IS NOT NULL THEN json_build_object(
                            'id', lmio.id,
                            'custom_price', lmio.custom_price,
                            'custom_cash_price', lmio.custom_cash_price,
                            'custom_delivery_price', lmio.custom_delivery_price,
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
                        'delivery_price', mi.delivery_price,
                        'availability', mi.availability,

                        -- Level 2: Location item base override
                        'location_item_override', CASE
                            WHEN lio.id IS NOT NULL THEN json_build_object(
                                'id', lio.id,
                                'custom_price', lio.custom_price,
                                'custom_cash_price', lio.custom_cash_price,
                                'custom_delivery_price', lio.custom_delivery_price,
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
                        
                        'effective_delivery_price', CASE
                            WHEN m.location_id IS NOT NULL THEN
                                COALESCE(mim.custom_delivery_price, mi.delivery_price)
                            ELSE COALESCE(
                                lmio.custom_delivery_price,
                                lio.custom_delivery_price,
                                mim.custom_delivery_price,
                                mi.delivery_price
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
                            'level_1_delivery', mi.delivery_price,
                            'level_2_location_item', lio.custom_price,
                            'level_2_location_item_delivery', lio.custom_delivery_price,
                            'level_2_modifier', lio.price_modifier,
                            'level_2_modifier_type', lio.price_modifier_type,
                            'level_3_menu', mim.custom_price,
                            'level_3_menu_delivery', mim.custom_delivery_price,
                            'level_4_location_menu', lmio.custom_price,
                            'level_4_location_menu_delivery', lmio.custom_delivery_price
                        ),
                        
                        'stock_tracking_mode', COALESCE(
                            NULLIF(lio.stock_tracking_mode, 'use_default'),
                            mi.stock_tracking_mode
                        ),
                        'current_stock', lio.current_stock,
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
                                            ) ORDER BY COALESCE(lmio_mod.display_order, mgi.display_order), mgi.name
                                        ), '[]'::json)
                                        FROM modifier_group_items mgi
                                        -- LEFT JOIN: Check for Item Override
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
                            -- LEFT JOIN: Check for Group Override
                            LEFT JOIN location_modifier_group_overrides lmgo
                                ON lmgo.modifier_group_id = mg.id 
                                AND lmgo.location_id = p_location_id
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

CREATE OR REPLACE FUNCTION public.get_menu_item_details(
    p_item_id     UUID,
    p_location_id UUID DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
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

            -- Level 2: Location Override (raw, for edit form)
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

            -- Effective Values — L2 (with modifier math) > L1
            'effective_price', COALESCE(
                CASE
                    WHEN lio.price_modifier_type = 'add' AND lio.price_modifier IS NOT NULL
                    THEN mi.price + lio.price_modifier
                    WHEN lio.price_modifier_type = 'percent' AND lio.price_modifier IS NOT NULL
                    THEN mi.price * (1 + lio.price_modifier / 100)
                    ELSE lio.custom_price
                END,
                mi.price
            ),
            'effective_cash_price',     COALESCE(lio.custom_cash_price,     mi.cash_price),
            'effective_delivery_price', COALESCE(lio.custom_delivery_price, mi.delivery_price),
            'effective_availability',   COALESCE(lio.is_available,          mi.availability),

            -- UI Flags
            'has_location_override', (lio.id IS NOT NULL),
            'price_source', CASE
                WHEN lio.custom_price   IS NOT NULL
                  OR lio.price_modifier IS NOT NULL THEN 'location_override'
                ELSE 'base'
            END,

            -- Modifier groups
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
                                ) ORDER BY COALESCE(lmio_mod.display_order, mgi.display_order), mgi.name ASC
                            ), '[]'::json)
                            FROM modifier_group_items mgi
                            LEFT JOIN location_modifier_item_overrides lmio_mod
                                ON lmio_mod.modifier_group_item_id = mgi.id
                                AND lmio_mod.location_id = p_location_id
                            WHERE mgi.modifier_group_id = mg.id
                        )
                    ) ORDER BY COALESCE(lmgo.display_order, mimg.display_order), mg.name ASC
                ), '[]'::json)
                FROM (
                    SELECT modifier_group_id, display_order, 'global'::text AS source
                    FROM menu_item_modifier_groups WHERE menu_item_id = mi.id
                    UNION
                    SELECT modifier_group_id, display_order, 'location'::text AS source
                    FROM location_item_modifier_groups
                    WHERE menu_item_id = mi.id AND location_id = p_location_id
                ) mimg(modifier_group_id, display_order, source)
                JOIN modifier_groups mg ON mg.id = mimg.modifier_group_id
                LEFT JOIN location_modifier_group_overrides lmgo
                    ON lmgo.modifier_group_id = mg.id
                    AND lmgo.location_id = p_location_id
            ),

            -- Categories
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

create or replace function public.reorder_item_modifier_groups(
  p_menu_item_id uuid,
  p_group_orders jsonb,
  p_location_id uuid default null
) returns json
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_group record;
  v_menu_item record;
  v_assignment_exists boolean;
begin
  select id, merchant_id, location_id
  into v_menu_item
  from public.menu_items
  where id = p_menu_item_id;

  if v_menu_item.id is null then
    raise exception 'Menu item % not found', p_menu_item_id
      using errcode = 'P0002';
  end if;

  if p_location_id is null then
    if v_menu_item.location_id is not null then
      perform public.authorize_location_access(v_menu_item.location_id);
    else
      perform public.authorize_merchant_access(v_menu_item.merchant_id);
    end if;
  else
    perform public.authorize_location_access(p_location_id);
  end if;

  for v_group in
    select *
    from jsonb_to_recordset(p_group_orders) as x(modifier_group_id uuid, display_order integer)
  loop
    select exists(
      select 1
      from public.menu_item_modifier_groups mimg
      where mimg.menu_item_id = p_menu_item_id
        and mimg.modifier_group_id = v_group.modifier_group_id
      union
      select 1
      from public.location_item_modifier_groups limg
      where limg.menu_item_id = p_menu_item_id
        and limg.modifier_group_id = v_group.modifier_group_id
        and (p_location_id is null or limg.location_id = p_location_id)
    ) into v_assignment_exists;

    if not v_assignment_exists then
      raise exception 'Modifier group % is not assigned to menu item %',
        v_group.modifier_group_id,
        p_menu_item_id
        using errcode = '22023';
    end if;

    if p_location_id is null then
      update public.menu_item_modifier_groups
      set display_order = v_group.display_order
      where menu_item_id = p_menu_item_id
        and modifier_group_id = v_group.modifier_group_id;
    else
      insert into public.location_modifier_group_overrides (
        location_id,
        modifier_group_id,
        merchant_id,
        display_order,
        updated_at
      ) values (
        p_location_id,
        v_group.modifier_group_id,
        v_menu_item.merchant_id,
        v_group.display_order,
        now()
      )
      on conflict (location_id, modifier_group_id)
      do update
      set display_order = excluded.display_order,
          updated_at = now();
    end if;
  end loop;

  return json_build_object('success', true);
end;
$$;

grant all on function public.reorder_item_modifier_groups(uuid, jsonb, uuid) to anon;
grant all on function public.reorder_item_modifier_groups(uuid, jsonb, uuid) to authenticated;
grant all on function public.reorder_item_modifier_groups(uuid, jsonb, uuid) to service_role;

create or replace function public.reorder_modifier_group_items(
  p_modifier_group_id uuid,
  p_item_orders jsonb,
  p_location_id uuid default null
) returns json
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_item record;
  v_merchant_id uuid;
  v_valid_item_id uuid;
begin
  select merchant_id
  into v_merchant_id
  from public.modifier_groups
  where id = p_modifier_group_id;

  if v_merchant_id is null then
    raise exception 'Modifier group % not found', p_modifier_group_id
      using errcode = 'P0002';
  end if;

  if p_location_id is null then
    perform public.authorize_merchant_access(v_merchant_id);
  else
    perform public.authorize_location_access(p_location_id);
  end if;

  for v_item in
    select *
    from jsonb_to_recordset(p_item_orders) as x(modifier_group_item_id uuid, display_order integer)
  loop
    select id
    into v_valid_item_id
    from public.modifier_group_items
    where id = v_item.modifier_group_item_id
      and modifier_group_id = p_modifier_group_id;

    if v_valid_item_id is null then
      raise exception 'Modifier item % does not belong to modifier group %',
        v_item.modifier_group_item_id,
        p_modifier_group_id
        using errcode = '22023';
    end if;

    if p_location_id is null then
      update public.modifier_group_items
      set
        display_order = v_item.display_order,
        updated_at = now()
      where id = v_item.modifier_group_item_id
        and modifier_group_id = p_modifier_group_id;
    else
      insert into public.location_modifier_item_overrides (
        location_id,
        modifier_group_item_id,
        merchant_id,
        display_order,
        updated_at
      )
      values (
        p_location_id,
        v_item.modifier_group_item_id,
        v_merchant_id,
        v_item.display_order,
        now()
      )
      on conflict (location_id, modifier_group_item_id)
      do update
      set
        display_order = excluded.display_order,
        updated_at = now();
    end if;
  end loop;

  return json_build_object('success', true);
end;
$$;

grant all on function public.reorder_modifier_group_items(uuid, jsonb, uuid) to anon;
grant all on function public.reorder_modifier_group_items(uuid, jsonb, uuid) to authenticated;
grant all on function public.reorder_modifier_group_items(uuid, jsonb, uuid) to service_role;

create or replace function public.reorder_menu_item_modifier_groups(
  p_menu_item_id uuid,
  p_group_orders jsonb
) returns json
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  return public.reorder_item_modifier_groups(p_menu_item_id, p_group_orders, null);
end;
$$;

grant all on function public.reorder_menu_item_modifier_groups(uuid, jsonb) to anon;
grant all on function public.reorder_menu_item_modifier_groups(uuid, jsonb) to authenticated;
grant all on function public.reorder_menu_item_modifier_groups(uuid, jsonb) to service_role;
