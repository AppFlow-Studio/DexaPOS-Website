-- ============================================================
-- Pre-Auth Payment Functions v4 — Valor arm
-- ============================================================
-- Forks process_preauth_v3 / capture_preauth_v3 byte-for-byte and adds a
-- valor_transaction arm, mirroring the process_payment v16→v17 fix. Without it
-- a Valor pre-auth persisted with null card_last_four/card_type/authorization_code
-- (only rrn + terminal_type='valor' were correct), because v3 read card fields
-- solely from castles_transaction / dejavoo_transaction + PascalCase top-level keys.
--
-- Changes vs v3:
--   process_preauth_v4:
--     * v_rrn / v_auth_code / v_ref_id / v_card_type / v_card_last_four gain a
--       valor_transaction fallback (snake-case keys the Valor mapper emits).
--     * NEW v_tran_no := valor_transaction->>'tranNo' → stored in transaction_id
--       (the completion/void reference; matches where process_payment_v17 puts it).
--     * terminal_type CASE gains a 'valor' arm (belt-and-suspenders — the client
--       already passes p_terminal_type='valor', but this covers a null p_terminal_type).
--     * blob dual-stored in processor_response too (v3 stored terminal_response only),
--       so every client hydration path finds valor_transaction regardless of column.
--   capture_preauth_v4:
--     * v_result_code / v_result_message gain a valor_transaction arm.
--
-- update_preauth_amount stays at v3 (card-field-agnostic; Valor increment is
-- local-only tracking on the client). v1/v3 callers keep working unchanged.
-- ============================================================

CREATE OR REPLACE FUNCTION process_preauth_v4(
  p_order_id UUID,
  p_amount NUMERIC,
  p_terminal_response JSONB DEFAULT NULL,
  p_staff_id UUID DEFAULT NULL,
  p_terminal_type TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_order RECORD;
  v_existing_auth_count INT;
  v_payment_id UUID;
  v_rrn TEXT;
  v_auth_code TEXT;
  v_ref_id TEXT;
  v_tran_no TEXT;
  v_card_type TEXT;
  v_card_last_four TEXT;
  v_processor_fee_pct NUMERIC := 0;
BEGIN
  SELECT id, status, location_id, merchant_id
  INTO v_order
  FROM orders
  WHERE id = p_order_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order not found');
  END IF;

  IF v_order.status IN ('completed', 'cancelled', 'refunded', 'void') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order is not active');
  END IF;

  SELECT COUNT(*)
  INTO v_existing_auth_count
  FROM order_payments
  WHERE order_id = p_order_id
    AND status = 'authorized'
    AND (is_voided IS NULL OR is_voided = false);

  IF v_existing_auth_count > 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order already has an active pre-authorization');
  END IF;

  v_rrn := COALESCE(
    p_terminal_response->'castles_transaction'->>'rrn',
    p_terminal_response->'valor_transaction'->>'rrn',
    p_terminal_response->>'rrn', '');
  v_auth_code := COALESCE(
    p_terminal_response->'castles_transaction'->>'approvalCode',
    p_terminal_response->'valor_transaction'->>'approvalCode',
    p_terminal_response->>'AuthCode', '');
  v_ref_id := COALESCE(
    p_terminal_response->'castles_transaction'->>'referenceId',
    p_terminal_response->'valor_transaction'->>'reqTxnId',
    p_terminal_response->>'ReferenceId', '');
  -- Valor completion/void reference (the charge-slip "Trans" number).
  v_tran_no := p_terminal_response->'valor_transaction'->>'tranNo';
  v_card_type := COALESCE(
    p_terminal_response->'castles_transaction'->>'cardType',
    p_terminal_response->'raw_castles_response'->>'txnCardBrand',
    p_terminal_response->'valor_transaction'->>'cardType',
    p_terminal_response->'dejavoo_transaction'->>'CardType',
    NULL
  );
  v_card_last_four := COALESCE(
    p_terminal_response->'castles_transaction'->>'cardLast4',
    p_terminal_response->'valor_transaction'->>'cardLast4',
    p_terminal_response->'dejavoo_transaction'->>'Last4',
    NULL
  );

  -- Snapshot processor fee percentage at auth time (frozen for the auth's life).
  SELECT COALESCE(dual_pricing_percentage, 0) INTO v_processor_fee_pct
  FROM locations WHERE id = v_order.location_id;

  INSERT INTO order_payments (
    order_id, payment_method, amount, tip_amount, total_amount,
    status, authorized_at, captured_at, rrn, authorization_code,
    reference_number, transaction_id, terminal_response, processor_response,
    processed_by_staff_id, terminal_type,
    card_type, card_last_four, merchant_id, location_id, initiated_at,
    processor_fee_percentage_snapshot
  ) VALUES (
    p_order_id, 'card', p_amount, 0, p_amount,
    'authorized', NOW(), NULL, v_rrn, v_auth_code,
    v_ref_id, v_tran_no, p_terminal_response, p_terminal_response,
    p_staff_id,
    COALESCE(p_terminal_type, CASE
      WHEN p_terminal_response ? 'castles_transaction' THEN 'castles'
      WHEN p_terminal_response ? 'valor_transaction' THEN 'valor'
      ELSE 'dejavoo' END)::terminal_type,
    v_card_type, v_card_last_four, v_order.merchant_id, v_order.location_id, NOW(),
    v_processor_fee_pct
  )
  RETURNING id INTO v_payment_id;

  RETURN jsonb_build_object(
    'success', true,
    'payment_id', v_payment_id,
    'authorized_amount', p_amount,
    'processor_fee_percentage_snapshot', v_processor_fee_pct,
    'rrn', v_rrn,
    'auth_code', v_auth_code,
    'tran_no', v_tran_no
  );
END;
$$;

-- ============================================================
-- capture_preauth_v4 — adds a valor_transaction result-code arm
-- ============================================================

CREATE OR REPLACE FUNCTION capture_preauth_v4(
  p_payment_id UUID,
  p_capture_amount NUMERIC,
  p_tip_amount NUMERIC DEFAULT 0,
  p_terminal_response JSONB DEFAULT NULL,
  p_staff_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_payment RECORD;
  v_order RECORD;
  v_total_collected NUMERIC;
  v_new_amount_paid NUMERIC;
  v_new_amount_due NUMERIC;
  v_order_fully_paid BOOLEAN;
  v_new_paid_status TEXT;
  v_subtotal_portion NUMERIC := 0;
  v_tax_portion NUMERIC := 0;
  v_covered_items UUID[] := '{}';
  v_result_code TEXT;
  v_result_message TEXT;
  v_processor_fee_pct NUMERIC := 0;
  v_dual_pricing_fee NUMERIC := 0;
  v_tip_fee NUMERIC := 0;
BEGIN
  SELECT id, order_id, amount, status,
         COALESCE(processor_fee_percentage_snapshot, 0) AS pct_snapshot,
         location_id
  INTO v_payment
  FROM order_payments
  WHERE id = p_payment_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Payment not found');
  END IF;

  IF v_payment.status <> 'authorized' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Payment is not in authorized status');
  END IF;

  SELECT id, total_amount, amount_paid, amount_due,
         card_total, card_subtotal, cash_total, cash_subtotal,
         merchant_id, location_id
  INTO v_order
  FROM orders
  WHERE id = v_payment.order_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order not found');
  END IF;

  v_total_collected := p_capture_amount + COALESCE(p_tip_amount, 0);
  v_new_amount_paid := COALESCE(v_order.amount_paid, 0) + p_capture_amount;
  v_new_amount_due := GREATEST(COALESCE(v_order.total_amount, 0) - v_new_amount_paid, 0);
  v_order_fully_paid := v_new_amount_due <= 0;

  IF COALESCE(v_order.card_total, 0) > 0 THEN
    v_subtotal_portion := ROUND(p_capture_amount * (COALESCE(v_order.card_subtotal, 0) / v_order.card_total), 2);
  END IF;
  v_tax_portion := p_capture_amount - v_subtotal_portion;

  v_processor_fee_pct := v_payment.pct_snapshot;
  IF v_processor_fee_pct <= 0 THEN
    SELECT COALESCE(processor_fee_percentage, 0) INTO v_processor_fee_pct
    FROM locations WHERE id = v_order.location_id;
  END IF;

  v_dual_pricing_fee := ROUND(v_subtotal_portion * v_processor_fee_pct / 100, 2);
  v_tip_fee := ROUND(COALESCE(p_tip_amount, 0) * v_processor_fee_pct / 100, 2);

  IF v_order_fully_paid THEN
    SELECT COALESCE(array_agg(id), '{}')
    INTO v_covered_items
    FROM order_items
    WHERE order_id = v_payment.order_id
      AND (is_voided IS NULL OR is_voided = false)
      AND (quantity - COALESCE(paid_quantity, 0) + COALESCE(refunded_quantity, 0)) > 0;
  END IF;

  IF p_terminal_response IS NOT NULL THEN
    v_result_code := COALESCE(
      p_terminal_response->'castles_transaction'->>'resultCode',
      p_terminal_response->'valor_transaction'->>'resultCode',
      p_terminal_response->'dejavoo_transaction'->>'resultCode'
    );
    v_result_message := COALESCE(
      p_terminal_response->'castles_transaction'->>'statusMessage',
      p_terminal_response->'valor_transaction'->>'statusMessage',
      p_terminal_response->'dejavoo_transaction'->>'resultMessage'
    );
  END IF;

  UPDATE order_payments
  SET
    status = 'captured',
    amount = p_capture_amount,
    tip_amount = COALESCE(p_tip_amount, 0),
    total_amount = v_total_collected,
    captured_at = NOW(),
    terminal_response = COALESCE(p_terminal_response, terminal_response),
    processor_response = COALESCE(p_terminal_response, terminal_response),
    subtotal_portion = v_subtotal_portion,
    tax_portion = v_tax_portion,
    covers_items = CASE WHEN array_length(v_covered_items, 1) > 0 THEN v_covered_items ELSE NULL END,
    merchant_id = COALESCE(merchant_id, v_order.merchant_id),
    location_id = COALESCE(location_id, v_order.location_id),
    result_code = COALESCE(v_result_code, result_code),
    result_message = COALESCE(v_result_message, result_message),
    processed_by_staff_id = COALESCE(p_staff_id, processed_by_staff_id),
    processor_fee_percentage_snapshot = v_processor_fee_pct,
    dual_pricing_fee = v_dual_pricing_fee,
    tip_fee = v_tip_fee
  WHERE id = p_payment_id;

  IF v_order_fully_paid THEN
    v_new_paid_status := 'paid';
  ELSIF v_new_amount_paid > 0 THEN
    v_new_paid_status := 'partial';
  ELSE
    v_new_paid_status := 'pending';
  END IF;

  UPDATE orders
  SET
    amount_paid = v_new_amount_paid,
    amount_due = v_new_amount_due,
    payment_status = v_new_paid_status::payment_status,
    check_status = CASE WHEN v_order_fully_paid THEN 'Closed' ELSE check_status END,
    sync_version = sync_version + 1
  WHERE id = v_payment.order_id;

  IF v_order_fully_paid THEN
    UPDATE order_items
    SET paid_quantity = quantity,
        payment_id = p_payment_id
    WHERE order_id = v_payment.order_id
      AND (paid_quantity IS NULL OR paid_quantity < quantity)
      AND (is_voided IS NULL OR is_voided = false);
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'payment_id', p_payment_id,
    'captured_amount', p_capture_amount,
    'tip_amount', COALESCE(p_tip_amount, 0),
    'order_fully_paid', v_order_fully_paid,
    'order_amount_due', v_new_amount_due,
    'dual_pricing_fee', v_dual_pricing_fee,
    'tip_fee', v_tip_fee,
    'processor_fee_percentage_snapshot', v_processor_fee_pct
  );
END;
$$;

GRANT EXECUTE ON FUNCTION process_preauth_v4(UUID, NUMERIC, JSONB, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION capture_preauth_v4(UUID, NUMERIC, NUMERIC, JSONB, UUID) TO authenticated;
