-- Lane G2: void_payment.payment_status recompute fix.
--
-- Bug: when the LAST captured payment is voided, payment_status can stay on
-- 'paid' instead of dropping to 'pending'. The current CASE evaluates
-- amount_due first:
--
--   CASE
--     WHEN amount_due <= 0 THEN 'paid'
--     WHEN amount_paid > 0 THEN 'partial'
--     ELSE 'pending'
--   END
--
-- After voiding the last payment, calculate_order_totals_fast may leave
-- amount_due at 0 (e.g. on already-zero totals or stale cache), which trips
-- the first arm and the order is "paid" with no payments behind it. This is
-- the source of the 3 orphan orders identified in the audit.
--
-- Fix: require amount_paid > 0 to claim 'paid'. Reordering also makes the
-- intent explicit — no payments = no payment status.
--
-- Surface area: only the trailing UPDATE in void_payment. Body is reproduced
-- verbatim from 20260430154421_qualify_empty_search_path_rpc_bodies.sql with
-- the CASE rewritten.

CREATE OR REPLACE FUNCTION public.void_payment(
  p_payment_id    uuid,
  p_void_reason   text DEFAULT 'User voided'::text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_payment       record;
  v_order_id      uuid;
  v_voided_amount numeric;
  v_item          record;
BEGIN
  SELECT op.*, o.id AS o_order_id
  INTO   v_payment
  FROM   public.order_payments op
  JOIN   public.orders         o ON o.id = op.order_id
  WHERE  op.id         = p_payment_id
    AND  o.merchant_id = public.user_merchant_id()
    AND  o.location_id = ANY(public.user_location_ids());

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment not found or access denied';
  END IF;

  IF v_payment.is_voided IS TRUE THEN RETURN; END IF;

  v_order_id      := v_payment.order_id;
  v_voided_amount := COALESCE(v_payment.amount, 0)
                   + COALESCE(v_payment.tip_amount, 0);

  UPDATE public.order_payments
  SET    is_voided   = true,
         status      = 'void'::public.payment_status,
         voided_at   = now(),
         void_reason = p_void_reason
  WHERE  id = p_payment_id;

  UPDATE public.order_items oi
  SET    paid_quantity = GREATEST(
           COALESCE(oi.paid_quantity, 0) - opi.quantity_paid, 0)
  FROM   public.order_payment_items opi
  WHERE  opi.order_payment_id = p_payment_id
    AND  opi.order_item_id    = oi.id;

  IF NOT EXISTS (
    SELECT 1 FROM public.order_payment_items
    WHERE  order_payment_id = p_payment_id
  ) AND v_payment.covers_items IS NOT NULL THEN
    FOR v_item IN SELECT unnest(v_payment.covers_items) AS item_id LOOP
      UPDATE public.order_items
      SET    paid_quantity = GREATEST(COALESCE(paid_quantity, 0) - 1, 0)
      WHERE  id = v_item.item_id::uuid;
    END LOOP;
  END IF;

  UPDATE public.orders
  SET    amount_paid = GREATEST(COALESCE(amount_paid, 0) - v_voided_amount, 0)
  WHERE  id = v_order_id;

  PERFORM public.calculate_order_totals_fast(v_order_id);

  -- G2 fix: 'paid' requires amount_paid > 0. Without this guard, a fully
  -- voided order with zero amount_due (free / fully discounted / cached zero)
  -- remained 'paid' even after every payment row was voided.
  UPDATE public.orders o
  SET    payment_status =
           CASE
             WHEN COALESCE(o.amount_paid, 0) > 0.01
                  AND COALESCE(o.amount_due, 0) <= 0.01
               THEN 'paid'::public.payment_status
             WHEN COALESCE(o.amount_paid, 0) > 0.01
               THEN 'partial'::public.payment_status
             ELSE 'pending'::public.payment_status
           END
  WHERE  o.id = v_order_id;

END;
$function$;

COMMENT ON FUNCTION public.void_payment(uuid, text) IS
  'Voids a payment, restores paid_quantity on covered items, recomputes order totals, and resets payment_status. G2 fix: payment_status no longer claims ''paid'' when amount_paid is zero.';
