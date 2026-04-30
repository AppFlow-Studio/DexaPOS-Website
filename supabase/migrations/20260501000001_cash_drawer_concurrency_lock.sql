-- Lane B: Cash drawer concurrency lock
--
-- Race condition: close_cash_drawer_session and record_cash_operation both
-- (a) SUM cash_drawer_operations to compute expected_cash, then
-- (b) UPDATE cash_drawer_sessions.expected_cash
-- without holding a row lock on the session. Two concurrent calls interleave
-- their SELECT/UPDATE windows and the last UPDATE wins, leaving expected_cash
-- out of sync with SUM(operations).
--
-- Fix: SELECT ... FROM cash_drawer_sessions WHERE id = p_session_id FOR UPDATE
-- at the top of both RPCs. Postgres row-level lock serializes them; the second
-- waits until the first commits and re-evaluates session.status.
--
-- Also: emit an audit_logs entry on close documenting that expected_cash was
-- computed from SUM(cash_drawer_operations) — provides the variance audit
-- trail Lane B3 requires.

-- ============================================================================
-- record_cash_operation — add FOR UPDATE lock at top
-- ============================================================================
CREATE OR REPLACE FUNCTION record_cash_operation(
  p_cash_drawer_id UUID,
  p_session_id UUID,
  p_operation_type TEXT,
  p_amount NUMERIC,
  p_performed_by UUID,
  p_order_id UUID DEFAULT NULL,
  p_payment_id UUID DEFAULT NULL,
  p_reason TEXT DEFAULT NULL,
  p_approved_by UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_session RECORD;
  v_current_balance NUMERIC;
  v_balance_after NUMERIC;
  v_should_kick_drawer BOOLEAN := false;
  v_op_id UUID;
BEGIN
  -- Lock the session row to serialize concurrent operations against this drawer.
  -- Any other RPC touching this session (close, record, etc.) will block here
  -- until our transaction commits.
  SELECT * INTO v_session
  FROM cash_drawer_sessions
  WHERE id = p_session_id AND status = 'open'
  FOR UPDATE;

  IF v_session IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'No open session found'
    );
  END IF;

  -- Calculate current balance from operations (now safe — no other writer can
  -- insert against this session until we commit)
  SELECT v_session.opening_amount + COALESCE(SUM(
    CASE
      WHEN operation_type IN ('cash_sale', 'pay_in') THEN amount
      WHEN operation_type IN ('cash_refund', 'pay_out', 'cash_drop', 'tip_out') THEN -amount
      ELSE 0
    END
  ), 0)
  INTO v_current_balance
  FROM cash_drawer_operations
  WHERE session_id = p_session_id;

  v_balance_after := CASE
    WHEN p_operation_type IN ('cash_sale', 'pay_in') THEN v_current_balance + p_amount
    WHEN p_operation_type IN ('cash_refund', 'pay_out', 'cash_drop', 'tip_out') THEN v_current_balance - p_amount
    ELSE v_current_balance
  END;

  v_should_kick_drawer := p_operation_type IN ('no_sale', 'pay_in', 'pay_out', 'cash_drop');

  INSERT INTO cash_drawer_operations (
    cash_drawer_id, session_id, operation_type,
    amount, performed_by, performed_at,
    order_id, payment_id, balance_after,
    reason, approved_by
  ) VALUES (
    p_cash_drawer_id, p_session_id, p_operation_type,
    p_amount, p_performed_by, NOW(),
    p_order_id, p_payment_id, v_balance_after,
    p_reason, p_approved_by
  )
  RETURNING id INTO v_op_id;

  IF p_operation_type NOT IN ('no_sale', 'opening_count', 'closing_count') THEN
    UPDATE cash_drawer_sessions
    SET expected_cash = v_balance_after
    WHERE id = p_session_id;
  END IF;

  IF p_operation_type = 'no_sale' THEN
    INSERT INTO audit_logs (
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
$$;

-- ============================================================================
-- close_cash_drawer_session — add FOR UPDATE lock + variance audit log
-- ============================================================================
CREATE OR REPLACE FUNCTION public.close_cash_drawer_session(
  p_session_id uuid,
  p_cash_drawer_id uuid,
  p_closed_by uuid,
  p_closing_amount numeric,
  p_closing_count_details jsonb DEFAULT NULL,
  p_variance_notes text DEFAULT NULL,
  p_is_blind_count boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_session RECORD;
  v_expected_cash NUMERIC;
  v_variance NUMERIC;
  v_op_count INT;
BEGIN
  -- Lock the session row. Any concurrent record_cash_operation will block until
  -- this close commits. After we commit, that RPC will find status='closed'
  -- and reject — which is the correct behavior.
  SELECT * INTO v_session
  FROM cash_drawer_sessions
  WHERE id = p_session_id AND status = 'open'
  FOR UPDATE;

  IF v_session IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Session not found or not open'
    );
  END IF;

  -- Compute expected_cash from SUM(cash_drawer_operations) — the source of
  -- truth. Lock above ensures no in-flight operation will sneak in between
  -- this SELECT and our UPDATE.
  SELECT
    v_session.opening_amount + COALESCE(SUM(
      CASE
        WHEN operation_type IN ('cash_sale', 'pay_in') THEN amount
        WHEN operation_type IN ('cash_refund', 'pay_out', 'cash_drop', 'tip_out') THEN -amount
        ELSE 0
      END
    ), 0),
    COUNT(*)
  INTO v_expected_cash, v_op_count
  FROM cash_drawer_operations
  WHERE session_id = p_session_id;

  v_variance := p_closing_amount - v_expected_cash;

  INSERT INTO cash_drawer_operations (
    cash_drawer_id, session_id, operation_type,
    amount, performed_by, performed_at,
    balance_after
  ) VALUES (
    p_cash_drawer_id, p_session_id, 'closing_count',
    p_closing_amount, p_closed_by, NOW(),
    v_expected_cash
  );

  UPDATE cash_drawer_sessions
  SET
    closed_by = p_closed_by,
    closed_at = NOW(),
    closing_amount = p_closing_amount,
    closing_count_details = p_closing_count_details,
    closing_count_verified = (p_closing_count_details IS NOT NULL),
    expected_cash = v_expected_cash,
    variance = v_variance,
    variance_notes = p_variance_notes,
    is_blind_count = p_is_blind_count,
    status = 'closed'
  WHERE id = p_session_id;

  UPDATE cash_drawers
  SET is_open = false, current_session_id = NULL
  WHERE id = p_cash_drawer_id;

  -- B3: Audit log — document that expected_cash was derived from
  -- SUM(cash_drawer_operations) under row lock.
  INSERT INTO audit_logs (
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
    'cash_drawer_session_closed',
    'cash_management',
    CASE WHEN ABS(v_variance) > 0.01 THEN 'warning' ELSE 'info' END,
    'cash_drawer_session',
    p_session_id,
    'Cash Drawer Session Close',
    p_closed_by,
    v_session.location_id,
    v_session.merchant_id,
    jsonb_build_object(
      'cash_drawer_id', p_cash_drawer_id,
      'opening_amount', v_session.opening_amount,
      'closing_amount', p_closing_amount,
      'expected_cash', v_expected_cash,
      'variance', v_variance,
      'operations_counted', v_op_count,
      'computation_source', 'SUM(cash_drawer_operations) under FOR UPDATE row lock',
      'is_blind_count', p_is_blind_count,
      'variance_notes', p_variance_notes
    ),
    'success'
  );

  RETURN jsonb_build_object(
    'success', true,
    'expected_cash', v_expected_cash,
    'closing_amount', p_closing_amount,
    'variance', v_variance
  );
END;
$$;

COMMENT ON FUNCTION public.record_cash_operation(uuid, uuid, text, numeric, uuid, uuid, uuid, text, uuid)
  IS 'Records a cash drawer operation. Acquires FOR UPDATE row lock on cash_drawer_sessions to serialize concurrent writes against the same session.';

COMMENT ON FUNCTION public.close_cash_drawer_session(uuid, uuid, uuid, numeric, jsonb, text, boolean)
  IS 'Closes a cash drawer session. Acquires FOR UPDATE row lock so expected_cash always equals SUM(cash_drawer_operations) at close time. Emits audit_logs entry documenting variance computation source.';
