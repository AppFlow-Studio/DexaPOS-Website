DO $$
DECLARE
  r record;
  v_total_refunded numeric;
  v_total_active_paid numeric;
  v_fixed_count integer := 0;
BEGIN
  FOR r IN
    SELECT DISTINCT o.id
    FROM orders o
    JOIN order_payments op ON op.order_id = o.id
    WHERE o.payment_status = 'partial'
      AND COALESCE(op.refunded_amount, 0) > 0
  LOOP
    SELECT
      COALESCE(SUM(COALESCE(refunded_amount, 0)), 0),
      COALESCE(SUM(amount) FILTER (
        WHERE status IN ('captured', 'partially_refunded', 'refunded')
          AND COALESCE(is_voided, false) = false
      ), 0)
    INTO v_total_refunded, v_total_active_paid
    FROM order_payments
    WHERE order_id = r.id;

    IF v_total_active_paid > 0
       AND v_total_refunded + 0.0001 >= v_total_active_paid THEN
      UPDATE orders
      SET payment_status = 'refunded'::payment_status
      WHERE id = r.id;
      v_fixed_count := v_fixed_count + 1;
    END IF;
  END LOOP;

  RAISE NOTICE 'backfill_refund_payment_status_v1: fixed % orders', v_fixed_count;
END $$;
