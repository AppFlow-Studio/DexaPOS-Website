-- =============================================================================
-- Fix: Drop all overloaded versions of upsert_category_item_override and
-- create a single clean version with the L4 branch using correct NUMERIC types.
--
-- Previous migration used DECIMAL(10,2) which created a 3rd overload instead of
-- replacing the existing 14-param NUMERIC version — leaving L4 branch dead.
-- =============================================================================

-- Drop ALL versions to start clean (CASCADE removes dependent grants)
DROP FUNCTION IF EXISTS public.upsert_category_item_override(UUID, UUID, UUID, UUID, NUMERIC, NUMERIC, BOOLEAN, NUMERIC, TEXT, INTEGER, BOOLEAN, TEXT, INTEGER);
DROP FUNCTION IF EXISTS public.upsert_category_item_override(UUID, UUID, UUID, UUID, NUMERIC, NUMERIC, BOOLEAN, NUMERIC, TEXT, INTEGER, BOOLEAN, TEXT, INTEGER, NUMERIC);
DROP FUNCTION IF EXISTS public.upsert_category_item_override(UUID, UUID, UUID, UUID, DECIMAL, DECIMAL, BOOLEAN, DECIMAL, TEXT, INTEGER, BOOLEAN, TEXT, INTEGER, DECIMAL);

-- Recreate with correct NUMERIC types and L4 branch
CREATE OR REPLACE FUNCTION public.upsert_category_item_override(
    p_menu_item_id UUID,
    p_category_id UUID DEFAULT NULL,
    p_menu_id UUID DEFAULT NULL,
    p_location_id UUID DEFAULT NULL,
    p_custom_price NUMERIC DEFAULT NULL,
    p_custom_cash_price NUMERIC DEFAULT NULL,
    p_is_available BOOLEAN DEFAULT NULL,
    p_price_modifier NUMERIC DEFAULT NULL,
    p_price_modifier_type TEXT DEFAULT NULL,
    p_display_order INTEGER DEFAULT NULL,
    p_is_featured BOOLEAN DEFAULT NULL,
    p_stock_tracking_mode TEXT DEFAULT NULL,
    p_current_stock INTEGER DEFAULT NULL,
    p_custom_delivery_price NUMERIC DEFAULT NULL
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
            -- UI L1: Update base item
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
            -- Location item override
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
                    'success', true, 'action', 'deleted',
                    'level', v_update_level, 'table', v_update_table
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
            v_update_level := 3;
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
            -- Separate row from L2 — does not affect global category price.
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
                    'success', true, 'action', 'deleted',
                    'level', v_update_level, 'table', v_update_table
                );
            ELSE
                SELECT merchant_id INTO v_merchant_id
                FROM menu_items WHERE id = p_menu_item_id;

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
            v_update_level := 4; -- old internal numbering kept for audit logs
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
                    'success', true, 'action', 'deleted',
                    'level', v_update_level, 'table', v_update_table
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
                    'success', true, 'action', 'deleted',
                    'level', v_update_level, 'table', v_update_table
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

GRANT EXECUTE ON FUNCTION public.upsert_category_item_override(UUID, UUID, UUID, UUID, NUMERIC, NUMERIC, BOOLEAN, NUMERIC, TEXT, INTEGER, BOOLEAN, TEXT, INTEGER, NUMERIC) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_category_item_override(UUID, UUID, UUID, UUID, NUMERIC, NUMERIC, BOOLEAN, NUMERIC, TEXT, INTEGER, BOOLEAN, TEXT, INTEGER, NUMERIC) TO anon;
GRANT EXECUTE ON FUNCTION public.upsert_category_item_override(UUID, UUID, UUID, UUID, NUMERIC, NUMERIC, BOOLEAN, NUMERIC, TEXT, INTEGER, BOOLEAN, TEXT, INTEGER, NUMERIC) TO service_role;
