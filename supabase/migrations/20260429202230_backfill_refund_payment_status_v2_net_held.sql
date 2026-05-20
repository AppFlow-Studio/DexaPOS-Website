DO $$
DECLARE
  r record;
  v_total_paid_in numeric;
  v_total_returned numeric;
  v_net_held numeric;
  v_fixed_count integer := 0;
BEGIN
  FOR r IN
    SELECT DISTINCT o.id
    FROM orders o
    JOIN order_payments op ON op.order_id = o.id
    WHERE o.payment_status <> 'refunded'
      AND COALESCE(op.refunded_amount, 0) > 0
  LOOP
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
    WHERE order_id = r.id;

    IF v_total_paid_in > 0
       AND v_total_returned > 0
       AND v_net_held <= 0.0001 THEN
      UPDATE orders
      SET payment_status = 'refunded'::payment_status
      WHERE id = r.id;
      v_fixed_count := v_fixed_count + 1;
    END IF;
  END LOOP;

  RAISE NOTICE 'backfill_refund_payment_status_v1: fixed % orders', v_fixed_count;
END $$;
