-- Fix reset_category_item_to_level: when resetting from menu context (L4/L5),
-- the L2 global category price should NOT be cleared.
-- Only clear L2 when p_menu_id IS NULL (non-menu context).

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

    -- Reset UI L4 (global menu category price — category_items WHERE menu_id IS NOT NULL)
    IF p_target_level < 4 AND p_menu_id IS NOT NULL AND p_location_id IS NULL AND p_category_id IS NOT NULL THEN
        DELETE FROM category_items
        WHERE menu_item_id = p_menu_item_id
          AND category_id = p_category_id
          AND menu_id = p_menu_id;

        IF FOUND THEN
            v_deleted_levels := array_append(v_deleted_levels, 'level_4_menu_category');
        END IF;
    END IF;

    -- Reset UI L3 (branch category — location_category_item_overrides)
    IF p_target_level < 3 AND p_location_id IS NOT NULL AND p_category_id IS NOT NULL THEN
        DELETE FROM location_category_item_overrides
        WHERE location_id = p_location_id
          AND category_id = p_category_id
          AND menu_item_id = p_menu_item_id;

        IF FOUND THEN
            v_deleted_levels := array_append(v_deleted_levels, 'level_4_location_category');
        END IF;
    END IF;

    -- Reset UI L2 (global category price — category_items WHERE menu_id IS NULL)
    -- Guard: only clear L2 when NOT in menu context (p_menu_id IS NULL).
    -- When resetting from L4/L5 (menu context), L2 is a prior-level baseline and must not be cleared.
    IF p_target_level < 2 AND p_location_id IS NULL AND p_category_id IS NOT NULL AND p_menu_id IS NULL THEN
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
GRANT EXECUTE ON FUNCTION reset_category_item_to_level(UUID, UUID, UUID, UUID, INTEGER) TO authenticated;
