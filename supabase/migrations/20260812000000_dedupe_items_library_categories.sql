-- =============================================================================
-- Fix duplicate categories returned by get_items_for_location_library
--
-- Bug: the 'categories' subquery joins through category_items, which holds one
--      row per (menu_item_id, category_id, menu_id). An item that sits in the
--      same category under two menus therefore comes back with that category
--      twice. The items library renders category badges keyed by category id,
--      so React reports "Encountered two children with the same key".
--
-- Fix: DISTINCT the category rows before aggregating. category_items carries
--      per-menu pricing columns, but this subquery reads none of them — it only
--      projects category identity — so collapsing duplicates loses nothing.
--
-- Everything else in the function is preserved verbatim from
-- 20260427005000_pricing_cascade_fix.sql (L2 > L1 pricing, no category prices).
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
                -- DISTINCT: category_items has one row per (item, category, menu),
                -- so an item in the same category under multiple menus would
                -- otherwise repeat that category.
                'categories', COALESCE(
                    (
                        SELECT json_agg(
                            json_build_object(
                                'id', dc.id,
                                'name', dc.name,
                                'location_id', dc.location_id,
                                'location_name', (SELECT l.name FROM locations l WHERE l.id = dc.location_id),
                                'is_global', dc.is_global
                            ) ORDER BY dc.name
                        )
                        FROM (
                            SELECT DISTINCT
                                c.id,
                                c.name,
                                c.location_id,
                                COALESCE(c.is_global, c.location_id IS NULL) AS is_global
                            FROM category_items ci
                            JOIN categories c ON c.id = ci.category_id
                            WHERE ci.menu_item_id = mi.id
                              AND c.merchant_id = p_merchant_id
                              AND (
                                  p_location_id IS NULL
                                  OR c.location_id IS NULL
                                  OR c.location_id = p_location_id
                              )
                        ) dc
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
