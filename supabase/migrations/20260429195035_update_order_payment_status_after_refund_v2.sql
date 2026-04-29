CREATE OR REPLACE FUNCTION update_order_payment_status_after_refund(
  p_order_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_order record;
  v_payment_status payment_status;
  v_total_refunded numeric;
  v_total_active_paid numeric;
BEGIN
  -- Verify order access AND lock the row for the duration of this txn.
  SELECT * INTO v_order
  FROM orders
  WHERE id = p_order_id
    AND merchant_id = user_merchant_id()
    AND location_id = ANY(user_location_ids())
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found or access denied';
  END IF;

  -- Recalculate amount_due / amount_paid / totals from item & payment state.
  PERFORM calculate_order_totals_fast(p_order_id);

  -- Refresh order data after recalculation.
  SELECT * INTO v_order FROM orders WHERE id = p_order_id;

  -- Aggregate refund signal across all payments on this order.
  SELECT
    COALESCE(SUM(COALESCE(refunded_amount, 0)), 0),
    COALESCE(SUM(amount) FILTER (
      WHERE status IN ('captured', 'partially_refunded', 'refunded')
        AND COALESCE(is_voided, false) = false
    ), 0)
  INTO v_total_refunded, v_total_active_paid
  FROM order_payments
  WHERE order_id = p_order_id;

  -- Decide payment_status. Full-refund branch is NEW; remaining branches preserved.
  IF v_total_active_paid > 0
     AND v_total_refunded + 0.0001 >= v_total_active_paid THEN
    v_payment_status := 'refunded'::payment_status;
  ELSIF COALESCE(v_order.amount_due, 0) <= 0 THEN
    v_payment_status := 'paid'::payment_status;
  ELSIF COALESCE(v_order.amount_paid, 0) > 0 THEN
    v_payment_status := 'partial'::payment_status;
  ELSE
    v_payment_status := 'refunded'::payment_status;
  END IF;

  UPDATE orders
  SET payment_status = v_payment_status
  WHERE id = p_order_id;
END;
$$;

GRANT EXECUTE ON FUNCTION update_order_payment_status_after_refund(uuid) TO authenticated;;
