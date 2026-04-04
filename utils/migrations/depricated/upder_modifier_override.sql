CREATE OR REPLACE FUNCTION upsert_modifier_override(
    p_location_id UUID,
    p_modifier_item_id UUID,
    p_price_modifier DECIMAL DEFAULT NULL,
    p_is_active BOOLEAN DEFAULT NULL,
    p_stock_tracking_mode TEXT DEFAULT NULL,
    p_current_stock INTEGER DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_merchant_id UUID;
BEGIN
    -- 1. Get Merchant ID from the modifier item to ensure safety
    SELECT merchant_id INTO v_merchant_id
    FROM modifier_group_items WHERE id = p_modifier_item_id;

    -- 2. Upsert
    INSERT INTO location_modifier_item_overrides (
        location_id, modifier_group_item_id, merchant_id,
        price_modifier, is_active, 
        stock_tracking_mode, current_stock,
        updated_at
    ) VALUES (
        p_location_id, p_modifier_item_id, v_merchant_id,
        p_price_modifier, p_is_active,
        p_stock_tracking_mode, p_current_stock,
        NOW()
    )
    ON CONFLICT (location_id, modifier_group_item_id)
    DO UPDATE SET
        price_modifier = COALESCE(EXCLUDED.price_modifier, location_modifier_item_overrides.price_modifier),
        is_active = COALESCE(EXCLUDED.is_active, location_modifier_item_overrides.is_active),
        stock_tracking_mode = COALESCE(EXCLUDED.stock_tracking_mode, location_modifier_item_overrides.stock_tracking_mode),
        current_stock = COALESCE(EXCLUDED.current_stock, location_modifier_item_overrides.current_stock),
        updated_at = NOW();

    RETURN json_build_object('success', true);
END;
