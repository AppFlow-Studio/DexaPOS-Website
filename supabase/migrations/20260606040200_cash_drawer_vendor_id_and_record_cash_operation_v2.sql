-- Adds the vendor-aware path to cash drawer operations:
--   - cash_drawer_operations.vendor_id uuid column
--   - record_cash_operation(...) overload with the trailing p_vendor_id arg
--
-- Mirrors the staging pair: `add_vendor_id_to_cash_drawer_operations` +
-- `add_vendor_to_record_cash_operation` (POS repo, May 2026). Clients calling
-- the 10-arg variant on prod fail today because the function doesn't exist
-- and the column they want to write into is missing.

ALTER TABLE public.cash_drawer_operations
  ADD COLUMN IF NOT EXISTS vendor_id uuid;

CREATE OR REPLACE FUNCTION public.record_cash_operation(p_cash_drawer_id uuid, p_session_id uuid, p_operation_type text, p_amount numeric, p_performed_by uuid, p_order_id uuid DEFAULT NULL::uuid, p_payment_id uuid DEFAULT NULL::uuid, p_reason text DEFAULT NULL::text, p_approved_by uuid DEFAULT NULL::uuid, p_vendor_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_session RECORD;
  v_current_balance NUMERIC;
  v_balance_after NUMERIC;
  v_should_kick_drawer BOOLEAN := false;
  v_op_id UUID;
BEGIN
  -- Lock the session row to serialize concurrent operations against this drawer.
  -- Any other RPC touching this session blocks here until our transaction commits.
  SELECT * INTO v_session
  FROM public.cash_drawer_sessions
  WHERE id = p_session_id AND status = 'open'
  FOR UPDATE;

  IF v_session IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'No open session found'
    );
  END IF;

  -- Calculate current balance from operations (now safe — no other writer can
  -- insert against this session until we commit).
  SELECT v_session.opening_amount + COALESCE(SUM(
    CASE
      WHEN operation_type IN ('cash_sale', 'pay_in') THEN amount
      WHEN operation_type IN ('cash_refund', 'pay_out', 'cash_drop', 'tip_out') THEN -amount
      ELSE 0
    END
  ), 0)
  INTO v_current_balance
  FROM public.cash_drawer_operations
  WHERE session_id = p_session_id;

  v_balance_after := CASE
    WHEN p_operation_type IN ('cash_sale', 'pay_in') THEN v_current_balance + p_amount
    WHEN p_operation_type IN ('cash_refund', 'pay_out', 'cash_drop', 'tip_out') THEN v_current_balance - p_amount
    ELSE v_current_balance
  END;

  v_should_kick_drawer := p_operation_type IN ('no_sale', 'pay_in', 'pay_out', 'cash_drop');

  INSERT INTO public.cash_drawer_operations (
    cash_drawer_id,
    session_id,
    operation_type,
    amount,
    performed_by,
    performed_at,
    order_id,
    payment_id,
    balance_after,
    reason,
    approved_by,
    vendor_id
  ) VALUES (
    p_cash_drawer_id,
    p_session_id,
    p_operation_type,
    p_amount,
    p_performed_by,
    NOW(),
    p_order_id,
    p_payment_id,
    v_balance_after,
    p_reason,
    p_approved_by,
    p_vendor_id
  )
  RETURNING id INTO v_op_id;

  IF p_operation_type NOT IN ('no_sale', 'opening_count', 'closing_count') THEN
    UPDATE public.cash_drawer_sessions
    SET expected_cash = v_balance_after
    WHERE id = p_session_id;
  END IF;

  IF p_operation_type = 'no_sale' THEN
    INSERT INTO public.audit_logs (
      action,
      action_category,
      severity,
      resource_type,
      resource_id,
      resource_name,
      staff_profile_id,
      location_id,
      merchant_id,
      metadata,
      status
    ) VALUES (
      'cash_drawer_no_sale',
      'cash_management',
      'warning',
      'cash_drawer_operation',
      v_op_id,
      'No Sale - Drawer Pop',
      p_performed_by,
      v_session.location_id,
      v_session.merchant_id,
      jsonb_build_object(
        'session_id', p_session_id,
        'cash_drawer_id', p_cash_drawer_id,
        'reason', COALESCE(p_reason, 'none'),
        'approved_by', p_approved_by,
        'balance_at_time', v_balance_after
      ),
      'success'
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'operation_id', v_op_id,
    'balance_after', v_balance_after,
    'should_kick_drawer', v_should_kick_drawer
  );
END;
$function$;

