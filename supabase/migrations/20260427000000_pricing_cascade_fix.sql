-- =============================================================================
-- Migration: Pricing Cascade Fix (B1)
-- =============================================================================
-- Fixes the 5-level price cascade across all affected functions:
--
--  1. Creates get_effective_price() as a canonical single-item price resolver.
--     Used by the create-online-order edge function for server-side verification
--     and as the source-of-truth reference for all future price lookups.
--
--  2. Fixes get_categories_for_location — effective_price at L2 ignored
--     price_modifier/price_modifier_type (add/percent math). An item with a
--     "+$2 location modifier" was resolving to L1 base price in this function.
--     Also fixes price_source to correctly report 'location_item' when only
--     a modifier (not a custom_price) is set.
--
--  3. Fixes get_menu_item_details — same L2 modifier omission.
--
--  4. Fixes get_items_for_location_library — same L2 modifier omission.
--     This function is used in the merchant dashboard and HQ admin items library.
--     It intentionally only applies L2>L1 (no category prices) — that is kept —
--     but modifier math was missing so items with add/percent overrides showed
--     the wrong price to admins browsing the items library.
--
-- Note: get_menu_with_categories is already correct (fixed in 20260410000000).
-- =============================================================================


-- =============================================================================
-- PART 1 — get_effective_price()
-- Canonical price resolver for a single item in a given context.
-- All params except p_item_id are optional — pass NULL to skip that level.
-- Returns JSONB: { effective_price, effective_cash_price,
--                  effective_delivery_price, price_source }
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_effective_price(
    p_item_id     UUID,
    p_location_id UUID DEFAULT NULL,
    p_menu_id     UUID DEFAULT NULL,
    p_category_id UUID DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
    -- L1 base
    v_base_price       NUMERIC;
    v_base_cash        NUMERIC;
    v_base_delivery    NUMERIC;

    -- L2 location item override
    v_l2_custom        NUMERIC;
    v_l2_cash          NUMERIC;
    v_l2_delivery      NUMERIC;
    v_l2_modifier      NUMERIC;
    v_l2_modifier_type TEXT;
    v_l2_effective     NUMERIC;  -- resolved after modifier math

    -- L3 category
    v_l3_price         NUMERIC;
    v_l3_cash          NUMERIC;
    v_l3_delivery      NUMERIC;

    -- L4 location + category
    v_l4_price         NUMERIC;
    v_l4_cash          NUMERIC;
    v_l4_delivery      NUMERIC;

    -- L5 location + menu + category
    v_l5_price         NUMERIC;
    v_l5_cash          NUMERIC;
    v_l5_delivery      NUMERIC;

    v_price_source TEXT;
BEGIN
    -- L1: global base item price
    SELECT price, cash_price, delivery_price
    INTO v_base_price, v_base_cash, v_base_delivery
    FROM menu_items
    WHERE id = p_item_id;

    -- L2: location item override (only if location context provided)
    IF p_location_id IS NOT NULL THEN
        SELECT custom_price, custom_cash_price, custom_delivery_price,
               price_modifier, price_modifier_type
        INTO v_l2_custom, v_l2_cash, v_l2_delivery, v_l2_modifier, v_l2_modifier_type
        FROM location_item_overrides
        WHERE menu_item_id = p_item_id
          AND location_id  = p_location_id
        LIMIT 1;
    END IF;

    -- Resolve L2 effective price (modifier math or flat custom_price)
    IF v_l2_modifier_type = 'add' AND v_l2_modifier IS NOT NULL THEN
        v_l2_effective := v_base_price + v_l2_modifier;
    ELSIF v_l2_modifier_type = 'percent' AND v_l2_modifier IS NOT NULL THEN
        v_l2_effective := v_base_price * (1 + v_l2_modifier / 100);
    ELSE
        v_l2_effective := v_l2_custom;  -- NULL if no override row exists
    END IF;

    -- L3: category price (no location context required)
    IF p_category_id IS NOT NULL THEN
        SELECT custom_price, custom_cash_price, custom_delivery_price
        INTO v_l3_price, v_l3_cash, v_l3_delivery
        FROM category_items
        WHERE menu_item_id = p_item_id
          AND category_id  = p_category_id
        LIMIT 1;
    END IF;

    -- L4: location + category override
    IF p_location_id IS NOT NULL AND p_category_id IS NOT NULL THEN
        SELECT custom_price, custom_cash_price, custom_delivery_price
        INTO v_l4_price, v_l4_cash, v_l4_delivery
        FROM location_category_item_overrides
        WHERE menu_item_id = p_item_id
          AND location_id  = p_location_id
          AND category_id  = p_category_id
        LIMIT 1;
    END IF;

    -- L5: location + menu + category override (most specific)
    IF p_location_id IS NOT NULL AND p_menu_id IS NOT NULL AND p_category_id IS NOT NULL THEN
        SELECT custom_price, custom_cash_price, custom_delivery_price
        INTO v_l5_price, v_l5_cash, v_l5_delivery
        FROM location_menu_item_overrides
        WHERE menu_item_id = p_item_id
          AND location_id  = p_location_id
          AND menu_id      = p_menu_id
          AND category_id  = p_category_id
        LIMIT 1;
    END IF;

    -- Determine the winning level for price_source
    v_price_source := CASE
        WHEN v_l5_price    IS NOT NULL                              THEN 'location_menu'
        WHEN v_l4_price    IS NOT NULL                              THEN 'location_category'
        WHEN v_l3_price    IS NOT NULL                              THEN 'category'
        WHEN v_l2_custom   IS NOT NULL OR v_l2_modifier IS NOT NULL THEN 'location_item'
        ELSE 'base'
    END;

    RETURN jsonb_build_object(
        'effective_price',          COALESCE(v_l5_price,    v_l4_price,    v_l3_price,    v_l2_effective, v_base_price),
        'effective_cash_price',     COALESCE(v_l5_cash,     v_l4_cash,     v_l3_cash,     v_l2_cash,      v_base_cash),
        'effective_delivery_price', COALESCE(v_l5_delivery, v_l4_delivery, v_l3_delivery, v_l2_delivery,  v_base_delivery),
        'price_source',             v_price_source
    );
END;
$$;


-- =============================================================================
-- PART 2 — Fix get_categories_for_location
-- Bug: effective_price L2 used only lio.custom_price, ignoring price_modifier.
--      price_source showed 'base' when only a modifier (not custom_price) was set.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_categories_for_location(
    p_merchant_id UUID,
    p_location_id UUID DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
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

                                -- Level 2: Location item override (raw, for edit form)
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

                                -- Level 4: Location + Category override (raw, for edit form)
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

                                -- ==================================================
                                -- EFFECTIVE PRICE — L4 > L3 > L2 (with modifier) > L1
                                -- (L5 does not apply in categories view — no menu ctx)
                                -- ==================================================
                                'effective_price', COALESCE(
                                    lcio.custom_price,                -- L4: Location + Category
                                    ci.custom_price,                  -- L3: Category
                                    -- L2: modifier math or flat custom_price
                                    CASE
                                        WHEN lio.price_modifier_type = 'add'
                                             AND lio.price_modifier IS NOT NULL
                                        THEN mi.price + lio.price_modifier
                                        WHEN lio.price_modifier_type = 'percent'
                                             AND lio.price_modifier IS NOT NULL
                                        THEN mi.price * (1 + lio.price_modifier / 100)
                                        ELSE lio.custom_price
                                    END,
                                    mi.price                          -- L1: Base
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

                                -- Availability (AND logic across all applicable levels)
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

                                -- Price source: include modifier-only L2 case
                                'price_source', CASE
                                    WHEN lcio.custom_price IS NOT NULL THEN 'location_category'
                                    WHEN ci.custom_price   IS NOT NULL THEN 'category'
                                    WHEN lio.custom_price  IS NOT NULL
                                      OR lio.price_modifier IS NOT NULL THEN 'location_item'
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
                                        SELECT modifier_group_id, 'global'::text AS source
                                        FROM menu_item_modifier_groups
                                        WHERE menu_item_id = mi.id
                                        UNION
                                        SELECT modifier_group_id, 'location'::text AS source
                                        FROM location_item_modifier_groups
                                        WHERE menu_item_id = mi.id
                                          AND location_id = p_location_id
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
              OR (
                  c.location_id IS NULL
                  OR c.location_id = p_location_id
              )
          )
    );
END;$$;


-- =============================================================================
-- PART 3 — Fix get_menu_item_details
-- Bug: effective_price used COALESCE(lio.custom_price, mi.price), ignoring
--      price_modifier. Admin item detail view showed wrong price for modifier-
--      only L2 overrides.
-- =============================================================================

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
                    SELECT modifier_group_id, 'global'::text AS source
                    FROM menu_item_modifier_groups WHERE menu_item_id = mi.id
                    UNION
                    SELECT modifier_group_id, 'location'::text AS source
                    FROM location_item_modifier_groups
                    WHERE menu_item_id = mi.id AND location_id = p_location_id
                ) mimg(modifier_group_id, source)
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


-- =============================================================================
-- PART 4 — Fix get_items_for_location_library
-- Bug: effective_price used COALESCE(lio.custom_price, mi.price), ignoring
--      price_modifier. Admins browsing the items library see the wrong price
--      for items with modifier-only L2 overrides.
-- Intent preserved: this function intentionally shows L2>L1 only (no category
-- prices). Only the modifier math within L2 is fixed.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_items_for_location_library(
    p_merchant_id UUID,
    p_location_id UUID DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
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

                -- Level 2: Location item override (raw, for edit form)
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
                -- EFFECTIVE PRICE: L2 (with modifier math) > L1
                -- Intentionally excludes L3-L5 (items library, no category ctx)
                -- ============================================================
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

                'effective_cash_price', COALESCE(
                    lio.custom_cash_price,
                    mi.cash_price
                ),

                'effective_delivery_price', COALESCE(
                    lio.custom_delivery_price,
                    mi.delivery_price
                ),

                'effective_availability', COALESCE(
                    lio.is_available,
                    mi.availability
                ),

                -- Effective Tax & Inventory (L2 > L1)
                'effective_tax_category',      COALESCE(lio.tax_category,       mi.tax_category),
                'effective_is_tax_exempt',     COALESCE(lio.is_tax_exempt,      mi.is_tax_exempt),
                'effective_available_channels', COALESCE(lio.available_channels, mi.available_channels),

                -- Price source: include modifier-only case
                'price_source', CASE
                    WHEN lio.custom_price   IS NOT NULL
                      OR lio.price_modifier IS NOT NULL THEN 'location_item'
                    ELSE 'base'
                END,

                -- Override flags
                'has_location_override', (lio.id IS NOT NULL),

                -- Modifier groups (with location overrides)
                'modifier_groups', COALESCE(
                    (
                        SELECT json_agg(
                            json_build_object(
                                'id', mg.id,
                                'name', mg.name,
                                'description', mg.description,
                                'base_min_selections', mg.min_selections,
                                'base_max_selections', mg.max_selections,
                                'base_is_required', mg.is_required,
                                'base_is_active', mg.is_active,
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
                                'items', COALESCE(
                                    (
                                        SELECT json_agg(
                                            json_build_object(
                                                'id', mgi.id,
                                                'name', mgi.name,
                                                'description', mgi.description,
                                                'base_price', mgi.price_modifier,
                                                'base_is_default', mgi.is_default,
                                                'base_is_active', mgi.is_active,
                                                'location_override', CASE
                                                    WHEN lmio.id IS NOT NULL THEN json_build_object(
                                                        'id', lmio.id,
                                                        'custom_price', lmio.price_modifier,
                                                        'is_active', lmio.is_active
                                                    )
                                                    ELSE NULL
                                                END,
                                                'effective_price',     COALESCE(lmio.price_modifier, mgi.price_modifier),
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
                            SELECT modifier_group_id, 'global'::text AS source
                            FROM menu_item_modifier_groups WHERE menu_item_id = mi.id
                            UNION
                            SELECT modifier_group_id, 'location'::text AS source
                            FROM location_item_modifier_groups
                            WHERE menu_item_id = mi.id AND location_id = p_location_id
                        ) mimg(modifier_group_id, source)
                        JOIN modifier_groups mg ON mg.id = mimg.modifier_group_id
                        LEFT JOIN location_modifier_group_overrides lmgo
                            ON lmgo.modifier_group_id = mg.id
                            AND lmgo.location_id = p_location_id
                    ),
                    '[]'::json
                ),

                -- Categories this item belongs to (for UI filtering — prices NOT used)
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
                              p_location_id IS NULL
                              OR c.location_id IS NULL
                              OR c.location_id = p_location_id
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
