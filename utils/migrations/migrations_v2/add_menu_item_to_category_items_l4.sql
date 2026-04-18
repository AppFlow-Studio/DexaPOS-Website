-- =============================================================================
-- Migration: Add menu_id to category_items for L4 (global menu category) pricing
--
-- The 5-level price cascade:
--   L1 = Global item base              (menu_items)
--   L2 = Global category item base     (category_items WHERE menu_id IS NULL)
--   L3 = Branch category item base     (location_category_item_overrides)
--   L4 = Global menu category base     (category_items WHERE menu_id IS NOT NULL)  ← NEW
--   L5 = Branch menu category base     (location_menu_item_overrides)
-- =============================================================================

-- -- Step 1: Add menu_id column (nullable) to category_items
ALTER TABLE public.category_items
  ADD COLUMN IF NOT EXISTS menu_id uuid REFERENCES public.menus(id) ON DELETE CASCADE;
-- Step 2: Partial unique indexes to differentiate L2 rows (no menu) from L4 rows (with menu)
-- L2: one row per (item, category) globally
CREATE UNIQUE INDEX IF NOT EXISTS category_items_item_cat_nomenu_idx
  ON public.category_items (menu_item_id, category_id)
  WHERE menu_id IS NULL;
-- L4: one row per (item, category, menu)
CREATE UNIQUE INDEX IF NOT EXISTS category_items_item_cat_menu_idx
  ON public.category_items (menu_item_id, category_id, menu_id)
  WHERE menu_id IS NOT NULL;
-- =============================================================================
-- Step 3: Update upsert_category_item_override to handle L4
-- =============================================================================
CREATE OR REPLACE FUNCTION upsert_category_item_override(
    p_menu_item_id UUID,
    p_category_id UUID DEFAULT NULL,
    p_menu_id UUID DEFAULT NULL,
    p_location_id UUID DEFAULT NULL,
    p_custom_price DECIMAL(10,2) DEFAULT NULL,
    p_custom_cash_price DECIMAL(10,2) DEFAULT NULL,
    p_is_available BOOLEAN DEFAULT NULL,
    p_price_modifier DECIMAL(10,2) DEFAULT NULL,
    p_price_modifier_type TEXT DEFAULT NULL,
    p_display_order INTEGER DEFAULT NULL,
    p_is_featured BOOLEAN DEFAULT NULL,
    p_stock_tracking_mode TEXT DEFAULT NULL,
    p_current_stock INTEGER DEFAULT NULL,
    p_custom_delivery_price DECIMAL(10,2) DEFAULT NULL
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
    v_merchant_id UUID;
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
                delivery_price = COALESCE(p_custom_delivery_price, delivery_price),
                updated_at = NOW()
            WHERE id = p_menu_item_id;

        ELSE
            -- Level 2: Location item override
            v_update_level := 2;
            v_update_table := 'location_item_overrides';

            v_is_empty := (
                p_custom_price IS NULL AND
                p_custom_cash_price IS NULL AND
                p_custom_delivery_price IS NULL AND
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
                    custom_price, custom_cash_price, custom_delivery_price,
                    price_modifier, price_modifier_type,
                    is_available, stock_tracking_mode, current_stock,
                    created_at, updated_at
                ) VALUES (
                    p_location_id, p_menu_item_id,
                    p_custom_price, p_custom_cash_price, p_custom_delivery_price,
                    p_price_modifier, p_price_modifier_type,
                    p_is_available, p_stock_tracking_mode, p_current_stock,
                    NOW(), NOW()
                )
                ON CONFLICT (location_id, menu_item_id)
                DO UPDATE SET
                    custom_price = COALESCE(EXCLUDED.custom_price, location_item_overrides.custom_price),
                    custom_cash_price = COALESCE(EXCLUDED.custom_cash_price, location_item_overrides.custom_cash_price),
                    custom_delivery_price = COALESCE(EXCLUDED.custom_delivery_price, location_item_overrides.custom_delivery_price),
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
            -- UI L2: Global category price (category_items WHERE menu_id IS NULL)
            v_update_level := 3; -- old internal level numbering
            v_update_table := 'category_items';

            UPDATE category_items
            SET
                custom_price = p_custom_price,
                custom_cash_price = p_custom_cash_price,
                custom_delivery_price = p_custom_delivery_price,
                is_available = COALESCE(p_is_available, is_available),
                display_order = COALESCE(p_display_order, display_order),
                is_featured = COALESCE(p_is_featured, is_featured),
                updated_at = NOW()
            WHERE category_id = p_category_id
              AND menu_item_id = p_menu_item_id
              AND menu_id IS NULL;

        ELSIF p_location_id IS NULL AND p_menu_id IS NOT NULL THEN
            -- UI L4: Global menu category price (category_items WHERE menu_id = p_menu_id)
            -- This is a separate row from the L2 global category row.
            v_update_level := 4;
            v_update_table := 'category_items';

            v_is_empty := (
                p_custom_price IS NULL AND
                p_custom_cash_price IS NULL AND
                p_custom_delivery_price IS NULL
            );

            IF v_is_empty THEN
                DELETE FROM category_items
                WHERE category_id = p_category_id
                  AND menu_item_id = p_menu_item_id
                  AND menu_id = p_menu_id;

                RETURN json_build_object(
                    'success', true,
                    'action', 'deleted',
                    'level', v_update_level,
                    'table', v_update_table
                );
            ELSE
                -- Fetch merchant_id to satisfy NOT NULL constraint on category_items
                SELECT merchant_id INTO v_merchant_id FROM menu_items WHERE id = p_menu_item_id;

                INSERT INTO category_items (
                    menu_item_id, category_id, menu_id, merchant_id,
                    custom_price, custom_cash_price, custom_delivery_price,
                    is_available, display_order, is_featured,
                    created_at, updated_at
                ) VALUES (
                    p_menu_item_id, p_category_id, p_menu_id, v_merchant_id,
                    p_custom_price, p_custom_cash_price, p_custom_delivery_price,
                    COALESCE(p_is_available, true),
                    COALESCE(p_display_order, 0),
                    COALESCE(p_is_featured, false),
                    NOW(), NOW()
                )
                ON CONFLICT (menu_item_id, category_id, menu_id) WHERE menu_id IS NOT NULL
                DO UPDATE SET
                    custom_price = EXCLUDED.custom_price,
                    custom_cash_price = EXCLUDED.custom_cash_price,
                    custom_delivery_price = EXCLUDED.custom_delivery_price,
                    is_available = COALESCE(EXCLUDED.is_available, category_items.is_available),
                    display_order = COALESCE(EXCLUDED.display_order, category_items.display_order),
                    is_featured = COALESCE(EXCLUDED.is_featured, category_items.is_featured),
                    updated_at = NOW();
            END IF;

        ELSIF p_location_id IS NOT NULL AND p_menu_id IS NULL THEN
            -- UI L3: Branch category price (location_category_item_overrides)
            v_update_level := 4; -- old internal level numbering
            v_update_table := 'location_category_item_overrides';

            v_is_empty := (
                p_custom_price IS NULL AND
                p_custom_cash_price IS NULL AND
                p_custom_delivery_price IS NULL AND
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
                    custom_price, custom_cash_price, custom_delivery_price, is_available,
                    display_order, is_featured,
                    created_at, updated_at
                ) VALUES (
                    p_location_id, p_category_id, p_menu_item_id,
                    p_custom_price, p_custom_cash_price, p_custom_delivery_price, p_is_available,
                    p_display_order, p_is_featured,
                    NOW(), NOW()
                )
                ON CONFLICT (location_id, category_id, menu_item_id)
                DO UPDATE SET
                    custom_price = EXCLUDED.custom_price,
                    custom_cash_price = EXCLUDED.custom_cash_price,
                    custom_delivery_price = EXCLUDED.custom_delivery_price,
                    is_available = EXCLUDED.is_available,
                    display_order = EXCLUDED.display_order,
                    is_featured = EXCLUDED.is_featured,
                    updated_at = NOW();
            END IF;

        ELSIF p_location_id IS NOT NULL AND p_menu_id IS NOT NULL THEN
            -- UI L5: Branch menu category price (location_menu_item_overrides)
            v_update_level := 5;
            v_update_table := 'location_menu_item_overrides';

            -- Check if this is a location-owned menu
            SELECT location_id INTO v_menu_location_id FROM menus WHERE id = p_menu_id;

            IF v_menu_location_id IS NOT NULL THEN
                RETURN json_build_object(
                    'success', false,
                    'error', 'Use category_items for location-owned menus'
                );
            END IF;

            v_is_empty := (
                p_custom_price IS NULL AND
                p_custom_cash_price IS NULL AND
                p_custom_delivery_price IS NULL AND
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
                    custom_price, custom_cash_price, custom_delivery_price, is_available,
                    created_at, updated_at
                ) VALUES (
                    p_location_id, p_menu_id, p_category_id, p_menu_item_id,
                    p_custom_price, p_custom_cash_price, p_custom_delivery_price, COALESCE(p_is_available, true),
                    NOW(), NOW()
                )
                ON CONFLICT (location_id, menu_id, category_id, menu_item_id)
                DO UPDATE SET
                    custom_price = EXCLUDED.custom_price,
                    custom_cash_price = EXCLUDED.custom_cash_price,
                    custom_delivery_price = EXCLUDED.custom_delivery_price,
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
-- =============================================================================
-- Step 4: Update get_menu_with_categories to expose L4 price
-- Adds ci_menu join (menu-specific category_items) and level_3_menu_category field.
-- Updates effective_price cascade: L5 > L4 > L3 > L2 > L1
-- =============================================================================
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
-- =============================================================================
-- Step 5: Update reset_category_item_to_level to handle UI L4 reset
-- =============================================================================
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
    -- Reset UI L5 (location + menu + category)
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

    -- Reset UI L4 (global menu category price in category_items WHERE menu_id IS NOT NULL)
    IF p_target_level < 4 AND p_menu_id IS NOT NULL AND p_location_id IS NULL AND p_category_id IS NOT NULL THEN
        DELETE FROM category_items
        WHERE menu_item_id = p_menu_item_id
          AND category_id = p_category_id
          AND menu_id = p_menu_id;

        IF FOUND THEN
            v_deleted_levels := array_append(v_deleted_levels, 'level_4_menu_category');
        END IF;
    END IF;

    -- Reset UI L3 (location + category)
    IF p_target_level < 3 AND p_location_id IS NOT NULL AND p_category_id IS NOT NULL THEN
        DELETE FROM location_category_item_overrides
        WHERE location_id = p_location_id
          AND category_id = p_category_id
          AND menu_item_id = p_menu_item_id;

        IF FOUND THEN
            v_deleted_levels := array_append(v_deleted_levels, 'level_4_location_category');
        END IF;
    END IF;

    -- Reset UI L2 (global category price in category_items WHERE menu_id IS NULL)
    IF p_target_level < 2 AND p_location_id IS NULL AND p_category_id IS NOT NULL THEN
        UPDATE category_items
        SET custom_price = NULL, custom_cash_price = NULL, custom_delivery_price = NULL, updated_at = NOW()
        WHERE category_id = p_category_id
          AND menu_item_id = p_menu_item_id
          AND menu_id IS NULL;

        IF FOUND THEN
            v_deleted_levels := array_append(v_deleted_levels, 'level_3_category');
        END IF;
    END IF;

    -- Reset location item override
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
-- Grants
GRANT EXECUTE ON FUNCTION upsert_category_item_override(UUID, UUID, UUID, UUID, DECIMAL, DECIMAL, BOOLEAN, DECIMAL, TEXT, INTEGER, BOOLEAN, TEXT, INTEGER, DECIMAL) TO authenticated;
GRANT EXECUTE ON FUNCTION get_menu_with_categories(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION reset_category_item_to_level(UUID, UUID, UUID, UUID, INTEGER) TO authenticated;