-- void_order: refuse while card money is still on the order.
--
-- Incident 2026-09-25 (460 Bread and Butter, Register 1 Valor): a card was
-- charged $15.13, the payment was still queued on the tablet, and staff voided
-- the order. void_order never refunds a card — it only flags order_payments
-- is_voided and zeroes amount_paid — and process_payment refuses void orders,
-- so the charge was stranded with no record anywhere in Dexa.
--
-- New rule: an order with a captured (or partially refunded) card payment that
-- still has money on it cannot be voided. Refund the card first (status becomes
-- 'refunded' / is_returned), then void. Cash, in-kind and external payments are
-- unaffected — voiding still voids those records as before.
--
-- Raised as SQLSTATE P0010 with message ORDER_HAS_CAPTURED_CARD_PAYMENTS so the
-- POS can show operator copy. Body is otherwise identical to the live function.
--
-- Applied to staging 2026-09-25 (version 20260925130000; md5(pg_get_functiondef)
-- = 835d4bdb387c86c2025072bb10c43a03). Prod pending. Rollback restores the
-- pre-change prod body: rollback/20260925130000_void_order_block_captured_cards_rollback.sql

CREATE OR REPLACE FUNCTION public.void_order(p_order_id uuid, p_void_reason text DEFAULT 'Order cancelled'::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_order RECORD;
  v_voided_items_count INTEGER;
  v_voided_payments_count INTEGER;
  v_refund_amount NUMERIC(10, 2) := 0;
  v_card_outstanding NUMERIC(10, 2) := 0;
  v_card_count INTEGER := 0;
  v_result JSON;
  v_new_sync_version integer;
BEGIN
  -- 1. Get order details
  SELECT * INTO v_order
  FROM public.orders
  WHERE id = p_order_id
    AND merchant_id = user_merchant_id()
    AND location_id = ANY(user_location_ids());

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  -- 2. Business Logic Checks
  IF v_order.status = 'void' THEN
    RAISE EXCEPTION 'Order is already voided';
  END IF;

  -- 2b. Card money still on the order blocks the void (see header).
  SELECT COUNT(*),
         COALESCE(SUM(COALESCE(total_amount, amount) - COALESCE(refunded_amount, 0)), 0)
    INTO v_card_count, v_card_outstanding
  FROM public.order_payments
  WHERE order_id = p_order_id
    AND payment_method = 'card'
    AND status IN ('captured', 'partially_refunded')
    AND is_voided = FALSE
    AND COALESCE(is_returned, FALSE) = FALSE
    AND COALESCE(total_amount, amount) - COALESCE(refunded_amount, 0) > 0.004;

  IF v_card_count > 0 THEN
    RAISE EXCEPTION 'ORDER_HAS_CAPTURED_CARD_PAYMENTS'
      USING ERRCODE = 'P0010',
            DETAIL = format('%s card payment(s), $%s still charged. Refund before voiding.',
                            v_card_count, v_card_outstanding);
  END IF;

  -- 3. Void all items
  UPDATE public.order_items
  SET
    is_voided = TRUE,
    voided_at = NOW(),
    voided_by = user_staff_profile_id(),
    void_reason = p_void_reason,
    updated_at = NOW()
  WHERE order_id = p_order_id AND is_voided = FALSE;

  GET DIAGNOSTICS v_voided_items_count = ROW_COUNT;

  -- 4. Handle Payments
  SELECT COALESCE(SUM(amount), 0) INTO v_refund_amount
  FROM public.order_payments
  WHERE order_id = p_order_id
    AND status = 'captured'
    AND is_voided = FALSE;

  UPDATE public.order_payments
  SET
    is_voided = TRUE,
    voided_by = user_staff_profile_id(),
    void_reason = p_void_reason,
    voided_at = NOW()
  WHERE order_id = p_order_id AND is_voided = FALSE;

  GET DIAGNOSTICS v_voided_payments_count = ROW_COUNT;

  -- 5. Update Order Status
  UPDATE public.orders
  SET
    status = 'void',
    amount_paid = 0,
    voided_at = NOW(),
    voided_by = user_staff_profile_id(),
    void_reason = p_void_reason,
    updated_at = NOW(),
    check_status = 'Closed',
    payment_status = 'void'
  WHERE id = p_order_id;

  -- 6. Release the Table
  UPDATE public.table_sessions
  SET
    is_active = FALSE,
    status = 'available',
    closed_at = NOW(),
    closed_by = user_staff_profile_id()
  WHERE order_id = p_order_id AND is_active = TRUE;

  -- 7. Record History
  INSERT INTO public.order_status_history (
    order_id,
    from_status,
    to_status,
    changed_by_staff_id,
    notes
  ) VALUES (
    p_order_id,
    v_order.status,
    'void',
    user_staff_profile_id(),
    p_void_reason
  );

  v_new_sync_version := increment_order_sync_version(p_order_id);

  -- 8. Return Result
  SELECT json_build_object(
    'success', true,
    'order_id', p_order_id,
    'previous_status', v_order.status,
    'refund_amount', v_refund_amount,
    'void_reason', p_void_reason,
    'sync_version', v_new_sync_version
  ) INTO v_result;

  RETURN v_result;
END;
$function$;
