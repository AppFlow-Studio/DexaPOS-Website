-- ============================================================================
-- Fix: log_waste() — block over-waste, never raise insufficient_stock.
-- ============================================================================
-- Phase 1 (20260325) defined log_waste() to call decrement_location_stock(),
-- which at the time floored stock with GREATEST(0, ...).
--
-- Migration 20260501000000_atomic_inventory_decrement.sql then rewrote
-- decrement_location_stock() to RAISE 'P0002 insufficient_stock' when stock is
-- below the requested quantity (correct for SALES — prevents overselling).
--
-- Side effect: logging waste for an item at/near zero stock — or with no
-- location_inventory_stock row yet — failed with a cryptic
-- "Insufficient stock for item % at location %" error.
--
-- Business rule (decided): a user must NOT be able to waste more than the
-- quantity on hand. If more physically spoiled than the system shows, the
-- stock count itself is wrong and must be corrected first (via a stock
-- adjustment or a count sheet). Over-waste would also corrupt later
-- food-cost math (actual usage = beginning + purchases - ending - waste).
--
-- This recreates log_waste() to:
--   * reject the waste with a clear message when p_quantity > stock on hand
--     (returns success=false JSON — NOT a raised exception),
--   * otherwise subtract stock via set_location_stock(),
--   * never raise insufficient_stock. The GREATEST(0, ...) floor remains only
--     as a defensive backstop and is not normally reached.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.log_waste(
    p_merchant_id           UUID,
    p_location_id           UUID,
    p_inventory_item_id     UUID,
    p_quantity              NUMERIC,
    p_reason                TEXT,
    p_notes                 TEXT,
    p_logged_by_user_id     TEXT,
    p_logged_by_name        TEXT,
    p_waste_date            DATE DEFAULT CURRENT_DATE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_waste_log_id      UUID;
    v_cost_per_unit     NUMERIC;
    v_estimated_cost    NUMERIC;
    v_prev_stock        NUMERIC;
    v_new_stock         NUMERIC;
BEGIN
    -- Validate quantity
    IF p_quantity <= 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Quantity must be greater than zero.');
    END IF;

    -- Fetch cost_per_unit for estimated_cost calculation
    SELECT COALESCE(cost_per_unit, 0)
    INTO   v_cost_per_unit
    FROM   inventory_items
    WHERE  id = p_inventory_item_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Inventory item not found.');
    END IF;

    -- Capture current stock (0 when no location_inventory_stock row exists)
    SELECT stock_quantity
    INTO   v_prev_stock
    FROM   location_inventory_stock
    WHERE  location_id       = p_location_id
      AND  inventory_item_id = p_inventory_item_id;

    v_prev_stock := COALESCE(v_prev_stock, 0);

    -- Business rule: cannot waste more than is on hand. The caller must fix
    -- the stock count first if more physically spoiled than the system shows.
    IF p_quantity > v_prev_stock THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', format(
                'Cannot waste %s — only %s on hand. Correct the stock count first.',
                p_quantity, v_prev_stock
            )
        );
    END IF;

    v_estimated_cost := ROUND(v_cost_per_unit * p_quantity, 4);

    -- Insert waste record
    INSERT INTO waste_logs (
        merchant_id, location_id, inventory_item_id,
        quantity, reason, notes,
        waste_date, estimated_cost,
        logged_by_user_id, logged_by_name
    ) VALUES (
        p_merchant_id, p_location_id, p_inventory_item_id,
        p_quantity, p_reason, p_notes,
        p_waste_date, v_estimated_cost,
        p_logged_by_user_id, p_logged_by_name
    )
    RETURNING id INTO v_waste_log_id;

    -- Subtract stock. set_location_stock() UPSERTs the location_inventory_stock
    -- row. GREATEST(0, ...) is a defensive backstop — not normally reached
    -- because over-waste is already rejected above.
    v_new_stock := GREATEST(0, v_prev_stock - p_quantity);
    PERFORM public.set_location_stock(p_inventory_item_id, p_location_id, v_new_stock);

    -- Audit log — change_amount reflects the actual stock movement.
    INSERT INTO stock_update_log (
        merchant_id, location_id, inventory_item_id,
        previous_stock, new_stock, change_amount,
        update_reason, update_source,
        updated_by_user_id, updated_by_name
    ) VALUES (
        p_merchant_id, p_location_id, p_inventory_item_id,
        v_prev_stock, v_new_stock, v_new_stock - v_prev_stock,
        'waste_spoilage', 'waste',
        p_logged_by_user_id, p_logged_by_name
    );

    RETURN jsonb_build_object(
        'success',        true,
        'waste_log_id',   v_waste_log_id,
        'estimated_cost', v_estimated_cost,
        'new_stock',      v_new_stock
    );
END;
$$;
COMMENT ON FUNCTION public.log_waste IS
    'Records a waste event. Rejects (success=false) when the quantity exceeds '
    'stock on hand; otherwise subtracts stock and appends to stock_update_log. '
    'Never raises insufficient_stock.';
