-- Online-order cancellations run in an Edge Function with the service role.
-- Preserve merchant tenant checks for authenticated clients while allowing the
-- trusted server caller to persist an NMI reversal that already succeeded.
CREATE OR REPLACE FUNCTION public.apply_refund_to_payment(
  p_payment_id uuid,
  p_refund_amount numeric,
  p_reversal_type public.reversal_type,
  p_return_rrn text DEFAULT NULL,
  p_return_auth_code text DEFAULT NULL,
  p_return_reference_id text DEFAULT NULL,
  p_return_number text DEFAULT NULL,
  p_return_reason text DEFAULT NULL,
  p_initiated_by uuid DEFAULT NULL,
  p_restore_paid_quantity boolean DEFAULT false
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public', 'pg_temp'
AS $function$
DECLARE
  v_payment record;
  v_new_refunded numeric;
  v_new_status public.payment_status;
  v_ci record;
  v_is_service_role boolean := COALESCE(auth.role(), '') = 'service_role';
BEGIN
  IF p_refund_amount <= 0 THEN
    RAISE EXCEPTION 'Refund amount must be greater than zero';
  END IF;

  SELECT op.*, o.id AS o_order_id
  INTO v_payment
  FROM public.order_payments op
  JOIN public.orders o ON o.id = op.order_id
  WHERE op.id = p_payment_id
    AND (
      v_is_service_role
      OR (
        o.merchant_id = public.user_merchant_id()
        AND o.location_id = ANY(public.user_location_ids())
      )
    )
  FOR UPDATE OF op;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment not found or access denied';
  END IF;

  v_new_refunded := COALESCE(v_payment.refunded_amount, 0) + p_refund_amount;

  IF p_reversal_type = 'void' THEN
    v_new_status := 'void'::public.payment_status;
  ELSIF v_new_refunded + 0.0001 >= v_payment.amount THEN
    v_new_status := 'refunded'::public.payment_status;
  ELSE
    v_new_status := 'partially_refunded'::public.payment_status;
  END IF;

  UPDATE public.order_payments
  SET refunded_amount = v_new_refunded,
      refunded_at = now(),
      status = v_new_status,
      is_voided = (p_reversal_type = 'void'),
      is_returned = true,
      returned_at = now(),
      returned_by = COALESCE(p_initiated_by, returned_by),
      return_amount = v_new_refunded,
      return_rrn = COALESCE(p_return_rrn, return_rrn),
      return_auth_code = COALESCE(p_return_auth_code, return_auth_code),
      return_reference_id = COALESCE(p_return_reference_id, return_reference_id),
      return_number = COALESCE(p_return_number, return_number),
      return_reason = COALESCE(p_return_reason, return_reason)
  WHERE id = p_payment_id;

  IF p_restore_paid_quantity THEN
    UPDATE public.order_items oi
    SET paid_quantity = GREATEST(COALESCE(oi.paid_quantity, 0) - opi.quantity_paid, 0)
    FROM public.order_payment_items opi
    WHERE opi.order_payment_id = p_payment_id
      AND opi.order_item_id = oi.id;

    IF NOT EXISTS (
      SELECT 1
      FROM public.order_payment_items
      WHERE order_payment_id = p_payment_id
    ) AND v_payment.covers_items IS NOT NULL THEN
      FOR v_ci IN SELECT unnest(v_payment.covers_items) AS item_id LOOP
        UPDATE public.order_items
        SET paid_quantity = GREATEST(COALESCE(paid_quantity, 0) - 1, 0)
        WHERE id = v_ci.item_id::uuid;
      END LOOP;
    END IF;
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.apply_refund_to_payment(
  uuid, numeric, public.reversal_type, text, text, text, text, text, uuid, boolean
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.apply_refund_to_payment(
  uuid, numeric, public.reversal_type, text, text, text, text, text, uuid, boolean
) TO authenticated, service_role;

COMMENT ON FUNCTION public.apply_refund_to_payment(
  uuid, numeric, public.reversal_type, text, text, text, text, text, uuid, boolean
) IS
  'Records a payment reversal. Merchant callers are tenant-scoped; service_role supports trusted online-order gateway reversals.';
