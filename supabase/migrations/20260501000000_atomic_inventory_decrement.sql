-- Fix: decrement_location_stock must refuse oversell atomically.
-- Previous impl used GREATEST(0, qty - p_qty) which silently clamps to zero,
-- allowing two concurrent sales of a 1-unit SKU to both succeed.
-- New impl raises 'P0002' (insufficient_stock) when stock < requested qty.
-- Caller (process_order_inventory_deduction) will propagate the exception.

CREATE OR REPLACE FUNCTION public.decrement_location_stock(
    p_inventory_item_id uuid,
    p_location_id       uuid,
    p_quantity          numeric
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
    v_new_qty numeric;
BEGIN
    UPDATE location_inventory_stock
       SET stock_quantity = stock_quantity - p_quantity,
           updated_at     = now()
     WHERE inventory_item_id = p_inventory_item_id
       AND location_id       = p_location_id
       AND stock_quantity    >= p_quantity
     RETURNING stock_quantity INTO v_new_qty;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Insufficient stock for item % at location %',
            p_inventory_item_id, p_location_id
            USING ERRCODE = 'P0002';
    END IF;

    -- Sync legacy aggregate
    UPDATE inventory_items
       SET current_stock = (
               SELECT COALESCE(SUM(stock_quantity), 0)
               FROM location_inventory_stock
               WHERE inventory_item_id = p_inventory_item_id
           ),
           updated_at = now()
     WHERE id = p_inventory_item_id;
END;
$$;
