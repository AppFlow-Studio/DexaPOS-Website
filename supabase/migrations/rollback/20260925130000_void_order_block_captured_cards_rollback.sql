-- Rollback for 20260925130000_void_order_block_captured_cards.sql
--
-- This file is NOT applied automatically; run it manually if the forward
-- migration must be reverted.
--
-- Local:  psql "$DATABASE_URL" -f supabase/migrations/rollback/20260925130000_void_order_block_captured_cards_rollback.sql
-- Remote: paste into the Supabase SQL editor and execute.
--
-- Restores void_order to the body that was live on PROD (hifouuofcaytijrkbvcy)
-- on 2026-09-26 before the forward migration, captured verbatim with
-- pg_get_functiondef so the result is byte-identical to the previous function:
--   md5(pg_get_functiondef) = 6abf392941e50a5c0754ed3324bb22b3
-- (The duplicated 'public' in search_path below is how prod had it; kept for
-- fidelity — it is harmless.)
--
-- Effect: voiding an order with a captured card payment is ALLOWED again
-- (SQLSTATE P0010 / ORDER_HAS_CAPTURED_CARD_PAYMENTS is no longer raised).
-- The POS client on or after commit a8d10c41 still refuses locally when it
-- knows about the card payment, so rolling the DB back does not require an
-- OTA rollback — it only removes the server-side backstop.
--
-- Safe at any time: no schema objects were added by the forward migration.

CREATE OR REPLACE FUNCTION public.void_order(p_order_id uuid, p_void_reason text DEFAULT 'Order cancelled'::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'public', 'pg_temp'
AS $function$DECLARE
  v_order RECORD;
  v_voided_items_count INTEGER;
  v_voided_payments_count INTEGER;
  v_refund_amount NUMERIC(10, 2) := 0;
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
  -- We allow voiding 'pending', 'preparing', 'ready', 'served'.
  -- We only block if it's already 'void'.
  IF v_order.status = 'void' THEN
    RAISE EXCEPTION 'Order is already voided';
  END IF;

  -- 3. Void all items
  -- This is critical for KDS: The kitchen needs to see 'is_voided' flip to TRUE
  UPDATE public.order_items
  SET 
    is_voided = TRUE,
    voided_at = NOW(),
    voided_by = user_staff_profile_id(),
    void_reason = p_void_reason,
    updated_at = NOW()
  WHERE order_id = p_order_id AND is_voided = FALSE;

  GET DIAGNOSTICS v_voided_items_count = ROW_COUNT;

  -- 4. Handle Payments (Paid vs Unpaid Logic)
  SELECT COALESCE(SUM(amount), 0) INTO v_refund_amount
  FROM public.order_payments
  WHERE order_id = p_order_id 
    AND status = 'captured'
    AND is_voided = FALSE;

  -- Void the payment records so they don't count towards daily sales
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
END;$function$;
