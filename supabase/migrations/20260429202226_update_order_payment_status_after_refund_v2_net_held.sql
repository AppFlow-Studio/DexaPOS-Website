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
  v_total_paid_in numeric;
  v_total_returned numeric;
  v_net_held numeric;
BEGIN
  SELECT * INTO v_order
  FROM orders
  WHERE id = p_order_id
    AND merchant_id = user_merchant_id()
    AND location_id = ANY(user_location_ids())
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found or access denied';
  END IF;

  PERFORM calculate_order_totals_fast(p_order_id);

  SELECT * INTO v_order FROM orders WHERE id = p_order_id;

  -- Net-held formulation. Cash refunds and voidable card refunds run through
  -- apply_refund_to_payment_v2 with reversal_type='void', which sets the row
  -- to status='void' AND is_voided=true AND is_returned=true. True payment
  -- voids (cancel before settlement) go through void_payment.sql, which
  -- leaves is_returned=false. We discriminate using is_returned: a row is
  -- "real money flow" when it isn't a true void.
  SELECT
    COALESCE(SUM(amount) FILTER (
      WHERE NOT (status = 'void' AND COALESCE(is_returned, false) = false)
    ), 0),
    COALESCE(SUM(COALESCE(refunded_amount, 0)) FILTER (
      WHERE NOT (status = 'void' AND COALESCE(is_returned, false) = false)
    ), 0),
    COALESCE(SUM(amount - COALESCE(refunded_amount, 0)) FILTER (
      WHERE NOT (status = 'void' AND COALESCE(is_returned, false) = false)
    ), 0)
  INTO v_total_paid_in, v_total_returned, v_net_held
  FROM order_payments
  WHERE order_id = p_order_id;

  IF v_total_paid_in > 0
     AND v_total_returned > 0
     AND v_net_held <= 0.0001 THEN
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
