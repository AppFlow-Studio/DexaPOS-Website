-- =============================================================
-- Migration: add 12 functions missing from prod
-- All use CREATE OR REPLACE — fully idempotent
-- =============================================================

-- ── cancel_reservation_for_voided_order ──
CREATE OR REPLACE FUNCTION public.cancel_reservation_for_voided_order(p_order_id uuid, p_reason text DEFAULT 'Order voided'::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'public', 'pg_temp'
AS $function$
DECLARE
  v_order_status TEXT;
  v_cancelled_count INTEGER := 0;
BEGIN
  SELECT o.status
  INTO v_order_status
  FROM public.orders o
  WHERE o.id = p_order_id
    AND o.merchant_id = user_merchant_id()
    AND o.location_id = ANY(user_location_ids());

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  IF v_order_status <> 'void' THEN
    RETURN json_build_object(
      'success', false,
      'order_id', p_order_id,
      'message', 'Order is not void'
    );
  END IF;

  UPDATE public.reservations r
  SET
    status = 'cancelled',
    cancelled_at = COALESCE(r.cancelled_at, NOW()),
    cancellation_reason = COALESCE(r.cancellation_reason, p_reason)
  WHERE r.seated_session_id IN (
    SELECT ts.id
    FROM public.table_sessions ts
    WHERE ts.order_id = p_order_id
  )
    AND r.status = 'seated';

  GET DIAGNOSTICS v_cancelled_count = ROW_COUNT;

  RETURN json_build_object(
    'success', true,
    'order_id', p_order_id,
    'cancelled_count', v_cancelled_count
  );
END;
$function$;

-- ── finalize_castles_settlement ──
CREATE OR REPLACE FUNCTION public.finalize_castles_settlement(p_batch_uuid uuid, p_merchant_id uuid, p_castles_response jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'public', 'pg_temp'
AS $function$
DECLARE
  v_batch             record;
  v_return_code       text;
  v_final_status      text;
  v_settle_entry      jsonb;
  v_all_acquirers_ok  boolean := true;
  v_any_acquirer_ok   boolean := false;
  v_failed_acquirers  jsonb   := '[]'::jsonb;
  v_settled_acquirers jsonb   := '[]'::jsonb;
BEGIN
  SELECT * INTO v_batch
  FROM public.settlement_batches
  WHERE id = p_batch_uuid
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Settlement batch not found: %', p_batch_uuid;
  END IF;

  IF v_batch.merchant_id != p_merchant_id THEN
    RAISE EXCEPTION 'Access denied: batch % does not belong to merchant %',
      p_batch_uuid, p_merchant_id;
  END IF;

  IF v_batch.status = 'settled' THEN
    RAISE EXCEPTION 'Batch % is already settled. Cannot finalize again.', p_batch_uuid;
  END IF;

  IF v_batch.status NOT IN ('pending', 'settling', 'retry', 'failed') THEN
    RAISE EXCEPTION 'Batch % is in status %. Expected pending/settling/retry/failed.',
      p_batch_uuid, v_batch.status;
  END IF;

  v_return_code := p_castles_response->>'txnReturnCode';

  IF p_castles_response ? 'txnSettleInfo' THEN
    FOR v_settle_entry IN
      SELECT value FROM jsonb_array_elements(p_castles_response->'txnSettleInfo')
    LOOP
      IF (v_settle_entry->>'txnReturnCode') = '00000000' THEN
        v_any_acquirer_ok   := true;
        v_settled_acquirers := v_settled_acquirers || jsonb_build_array(
          v_settle_entry->>'txnAcquirerName'
        );
      ELSE
        v_all_acquirers_ok := false;
        v_failed_acquirers := v_failed_acquirers || jsonb_build_array(
          jsonb_build_object(
            'acquirer',    v_settle_entry->>'txnAcquirerName',
            'return_code', v_settle_entry->>'txnReturnCode',
            'message',     v_settle_entry->>'txnHostMsg'
          )
        );
      END IF;
    END LOOP;
  ELSE
    v_all_acquirers_ok := (v_return_code = '00000000');
    v_any_acquirer_ok  := v_all_acquirers_ok;
  END IF;

  v_final_status := CASE
    WHEN v_all_acquirers_ok                       THEN 'settled'
    WHEN v_any_acquirer_ok AND NOT v_all_acquirers_ok THEN 'partial_failure'
    WHEN v_return_code = 'E000002A'               THEN 'retry'
    ELSE                                               'failed'
  END;

  UPDATE public.settlement_batches
  SET
    status               = v_final_status,
    closed_at            = CASE WHEN v_final_status IN ('settled', 'partial_failure') THEN NOW() ELSE closed_at END,
    settlement_date      = CASE WHEN v_final_status IN ('settled', 'partial_failure') THEN CURRENT_DATE ELSE settlement_date END,
    retry_count          = retry_count + 1,
    last_attempt_at      = NOW(),
    castles_return_code  = v_return_code,
    castles_batch_num    = p_castles_response->>'txnBatchNum',
    castles_settle_info  = p_castles_response->'txnSettleInfo',
    raw_response         = p_castles_response,
    failure_reason       = CASE
      WHEN v_final_status IN ('settled')     THEN NULL
      WHEN v_final_status = 'partial_failure'
        THEN 'Partial settlement: '
          || array_to_string(ARRAY(SELECT jsonb_array_elements_text(v_failed_acquirers)), ', ')
          || ' failed. Contact processor support.'
      WHEN v_return_code = 'E000002A'        THEN 'Castles requested a retry (E000002A). Call prepare again with a new txnPosTxnId.'
      ELSE p_castles_response->>'txnHostMsg'
    END,
    updated_at           = NOW()
  WHERE id = p_batch_uuid;

  IF v_final_status IN ('settled', 'partial_failure') THEN
    UPDATE public.order_payments
    SET
      is_settled          = true,
      settled_at          = NOW(),
      batch_number        = v_batch.batch_id
    WHERE
      settlement_batch_id = p_batch_uuid;
  END IF;

  IF v_final_status IN ('retry', 'failed') THEN
    UPDATE public.order_payments
    SET settlement_batch_id = NULL
    WHERE settlement_batch_id = p_batch_uuid;
  END IF;

  RETURN jsonb_build_object(
    'success',             v_final_status IN ('settled', 'partial_failure'),
    'status',              v_final_status,
    'return_code',         v_return_code,
    'batch_id',            v_batch.batch_id,
    'settled_acquirers',   v_settled_acquirers,
    'failed_acquirers',    v_failed_acquirers,
    'should_retry',        (v_final_status = 'retry'),
    'requires_support',    (v_final_status = 'partial_failure')
  );
END;
$function$;

-- ── get_business_day_bounds ──
CREATE OR REPLACE FUNCTION public.get_business_day_bounds(p_location_id uuid, p_start_date date DEFAULT NULL::date, p_end_date date DEFAULT NULL::date)
 RETURNS TABLE(start_ts timestamp with time zone, end_ts timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_tz text;
  v_start_hour int;
BEGIN
  SELECT timezone, COALESCE(business_day_start_hour, 0)
    INTO v_tz, v_start_hour
    FROM locations WHERE id = p_location_id;

  IF v_tz IS NULL THEN
    v_tz := 'UTC';
  END IF;

  IF p_start_date IS NULL THEN
    start_ts := (date_trunc('day', now() AT TIME ZONE v_tz)
                 + make_interval(hours => v_start_hour))
                AT TIME ZONE v_tz;
    IF (now() AT TIME ZONE v_tz)::time < make_time(v_start_hour, 0, 0) THEN
      start_ts := start_ts - interval '1 day';
    END IF;
    end_ts := start_ts + interval '1 day';
  ELSE
    start_ts := (p_start_date::timestamp
                 + make_interval(hours => v_start_hour))
                AT TIME ZONE v_tz;
    end_ts := ((COALESCE(p_end_date, p_start_date) + 1)::timestamp
               + make_interval(hours => v_start_hour))
              AT TIME ZONE v_tz;
  END IF;

  RETURN NEXT;
END;
$function$;

-- ── get_unsettled_summary_by_terminal ──
CREATE OR REPLACE FUNCTION public.get_unsettled_summary_by_terminal(p_merchant_id uuid, p_location_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(terminal_uuid uuid, terminal_name text, terminal_type text, castles_ip_address text, castles_port integer, is_active boolean, is_connected boolean, payment_count bigint, gross_amount numeric, tip_amount numeric, total_amount numeric, oldest_payment_date date, newest_payment_date date, day_span integer, has_stuck_batch boolean, stuck_batch_status text, stuck_batch_uuid uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'public', 'pg_temp'
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    pt.id                                       AS terminal_uuid,
    pt.terminal_name                            AS terminal_name,
    pt.terminal_type                            AS terminal_type,
    pt.castles_ip_address                       AS castles_ip_address,
    pt.castles_port                             AS castles_port,
    pt.is_active                                AS is_active,
    pt.is_connected                             AS is_connected,

    COUNT(op.id)                                AS payment_count,
    COALESCE(SUM(op.amount),      0)            AS gross_amount,
    COALESCE(SUM(op.tip_amount),  0)            AS tip_amount,
    COALESCE(SUM(op.total_amount),0)            AS total_amount,
    MIN(op.approved_at::date)                   AS oldest_payment_date,
    MAX(op.approved_at::date)                   AS newest_payment_date,

    COALESCE(
      (MAX(op.approved_at::date) - MIN(op.approved_at::date)) + 1,
      0
    )::integer                                  AS day_span,

    (EXISTS (
      SELECT 1 FROM public.settlement_batches sb
      WHERE sb.payment_terminal_id = pt.id
        AND sb.status IN ('failed', 'retry', 'terminal_unavailable')
    ))                                          AS has_stuck_batch,

    (SELECT sb.status::text FROM public.settlement_batches sb
     WHERE sb.payment_terminal_id = pt.id
       AND sb.status IN ('failed', 'retry', 'terminal_unavailable')
     ORDER BY sb.opened_at DESC
     LIMIT 1)                                   AS stuck_batch_status,

    (SELECT sb.id FROM public.settlement_batches sb
     WHERE sb.payment_terminal_id = pt.id
       AND sb.status IN ('failed', 'retry', 'terminal_unavailable')
     ORDER BY sb.opened_at DESC
     LIMIT 1)                                   AS stuck_batch_uuid

  FROM public.payment_terminals pt
  LEFT JOIN public.order_payments op ON
    op.terminal_id       = pt.id::text
    AND op.terminal_type = 'castles'
    AND op.is_settled    = false
    AND op.status        = 'captured'

  WHERE
    pt.merchant_id = p_merchant_id
    AND pt.terminal_type = 'castles'
    AND pt.is_active = true
    AND (p_location_id IS NULL OR pt.location_id = p_location_id)

  GROUP BY
    pt.id, pt.terminal_name, pt.terminal_type,
    pt.castles_ip_address, pt.castles_port,
    pt.is_active, pt.is_connected;
END;
$function$;

-- ── mark_dlq_replay_success ──
CREATE OR REPLACE FUNCTION public.mark_dlq_replay_success(p_id uuid)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'public', 'pg_temp'
AS $function$
  UPDATE public.webhook_dead_letter_queue
  SET status = 'resolved',
      resolved_at = now(),
      retry_count = retry_count + 1,
      updated_at = now()
  WHERE id = p_id;
$function$;

-- ── merge_orderout_connected_channels ──
CREATE OR REPLACE FUNCTION public.merge_orderout_connected_channels(p_restaurant_id uuid, p_updates jsonb)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'public', 'pg_temp'
AS $function$
  UPDATE public.orderout_restaurants
  SET connected_channels = COALESCE(connected_channels, '{}'::jsonb) || p_updates,
      updated_at = now()
  WHERE id = p_restaurant_id;
$function$;

-- ── merge_orderout_platform_statuses ──
CREATE OR REPLACE FUNCTION public.merge_orderout_platform_statuses(p_link_id uuid, p_updates jsonb)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'public', 'pg_temp'
AS $function$
  UPDATE public.orderout_menu_links
  SET platform_statuses = COALESCE(platform_statuses, '{}'::jsonb) || p_updates,
      updated_at = now()
  WHERE id = p_link_id;
$function$;

-- ── prepare_castles_settlement ──
CREATE OR REPLACE FUNCTION public.prepare_castles_settlement(p_terminal_id uuid, p_merchant_id uuid, p_initiated_by text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'public', 'pg_temp'
AS $function$
DECLARE
  v_terminal          record;
  v_payment_count     integer;
  v_date_start        date;
  v_date_end          date;
  v_gross             numeric(10,2);
  v_tips              numeric(10,2);
  v_total             numeric(10,2);
  v_batch_seq         integer;
  v_batch_id          text;
  v_batch_uuid        uuid;
  v_pos_txn_id        text;
  v_next_pos_txn_int  integer;
BEGIN
  SELECT * INTO v_terminal
  FROM public.payment_terminals
  WHERE id = p_terminal_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Terminal not found: %', p_terminal_id;
  END IF;

  IF v_terminal.merchant_id != p_merchant_id THEN
    RAISE EXCEPTION 'Access denied: terminal % does not belong to merchant %',
      p_terminal_id, p_merchant_id;
  END IF;

  UPDATE public.settlement_batches
  SET
    status         = 'failed',
    failure_reason = 'Auto-reset: prepare was called but the Castles device was never contacted (app crash or timeout). Safe to retry.',
    updated_at     = NOW()
  WHERE
    payment_terminal_id = p_terminal_id
    AND status = 'pending'
    AND opened_at < (NOW() - INTERVAL '10 minutes');

  UPDATE public.order_payments op
  SET settlement_batch_id = NULL
  FROM public.settlement_batches sb
  WHERE
    op.settlement_batch_id = sb.id
    AND sb.payment_terminal_id = p_terminal_id
    AND sb.status = 'failed';

  IF EXISTS (
    SELECT 1
    FROM public.settlement_batches
    WHERE payment_terminal_id = p_terminal_id
      AND status IN ('pending', 'settling')
  ) THEN
    RAISE EXCEPTION 'A settlement is already in progress for terminal %. Wait or check for a stuck batch.', p_terminal_id;
  END IF;

  SELECT
    COUNT(*),
    MIN(op.approved_at::date),
    MAX(op.approved_at::date),
    COALESCE(SUM(op.amount),     0),
    COALESCE(SUM(op.tip_amount), 0),
    COALESCE(SUM(op.total_amount),0)
  INTO
    v_payment_count, v_date_start, v_date_end,
    v_gross, v_tips, v_total
  FROM public.order_payments op
  WHERE
    op.terminal_id         = p_terminal_id::text
    AND op.terminal_type   = 'castles'
    AND op.is_settled      = false
    AND op.status          = 'captured'
    AND op.settlement_batch_id IS NULL;

  IF v_payment_count = 0 THEN
    RAISE EXCEPTION 'No unsettled captured payments found for terminal %. All transactions may already be settled or none have been captured yet.', p_terminal_id;
  END IF;

  SELECT COUNT(*) + 1
  INTO v_batch_seq
  FROM public.settlement_batches
  WHERE payment_terminal_id = p_terminal_id;

  v_batch_id := 'DEXA-'
    || UPPER(LEFT(REPLACE(p_terminal_id::text, '-', ''), 8))
    || '-'
    || TO_CHAR(NOW() AT TIME ZONE 'America/New_York', 'YYYYMMDD')
    || '-'
    || LPAD(v_batch_seq::text, 3, '0');

  v_next_pos_txn_int := (
    (COALESCE(v_terminal.castles_last_pos_txn_id, '000000')::integer % 999999) + 1
  );
  v_pos_txn_id := LPAD(v_next_pos_txn_int::text, 6, '0');

  UPDATE public.payment_terminals
  SET
    castles_last_pos_txn_id = v_pos_txn_id,
    updated_at              = NOW()
  WHERE id = p_terminal_id;

  INSERT INTO public.settlement_batches (
    batch_id,
    merchant_id,
    location_id,
    payment_terminal_id,
    terminal_id,
    business_date,
    business_date_start,
    business_date_end,
    transaction_count,
    gross_amount,
    tip_amount,
    net_deposit,
    status,
    castles_pos_txn_id,
    opened_at,
    created_at,
    updated_at
  )
  VALUES (
    v_batch_id,
    p_merchant_id,
    v_terminal.location_id,
    p_terminal_id,
    p_terminal_id::text,
    (NOW() AT TIME ZONE 'America/New_York')::date,
    v_date_start,
    v_date_end,
    v_payment_count,
    v_gross,
    v_tips,
    v_total,
    'pending',
    v_pos_txn_id,
    NOW(),
    NOW(),
    NOW()
  )
  RETURNING id INTO v_batch_uuid;

  UPDATE public.order_payments
  SET
    settlement_batch_id = v_batch_uuid
  WHERE
    terminal_id            = p_terminal_id::text
    AND terminal_type      = 'castles'
    AND is_settled         = false
    AND status             = 'captured'
    AND settlement_batch_id IS NULL;

  RETURN jsonb_build_object(
    'batch_uuid',         v_batch_uuid,
    'batch_id',           v_batch_id,
    'payment_count',      v_payment_count,
    'gross_amount',       v_gross,
    'tip_amount',         v_tips,
    'total_amount',       v_total,
    'date_range', jsonb_build_object(
      'start', v_date_start,
      'end',   v_date_end
    ),
    'castles_request', jsonb_build_object(
      'txnPosTxnId', v_pos_txn_id,
      'txnType',     'settlement'
    )
  );
END;
$function$;

-- ── touch_dlq_replay_failure ──
CREATE OR REPLACE FUNCTION public.touch_dlq_replay_failure(p_id uuid, p_error_message text)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'public', 'pg_temp'
AS $function$
  UPDATE public.webhook_dead_letter_queue
  SET error_message = p_error_message,
      status = 'pending',
      retry_count = retry_count + 1,
      updated_at = now()
  WHERE id = p_id;
$function$;

-- ── void_order_and_cancel_reservation ──
CREATE OR REPLACE FUNCTION public.void_order_and_cancel_reservation(p_order_id uuid, p_void_reason text DEFAULT 'Order cancelled'::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'public', 'pg_temp'
AS $function$
DECLARE
  v_void_result JSONB;
  v_cancelled_count INTEGER := 0;
  v_session_ids UUID[];
BEGIN
  -- Snapshot linked session IDs before void_order in case underlying logic
  -- clears/relinks table_sessions.order_id during close.
  SELECT COALESCE(array_agg(ts.id), ARRAY[]::UUID[])
  INTO v_session_ids
  FROM public.table_sessions ts
  WHERE ts.order_id = p_order_id;

  -- Reuse existing void logic unchanged.
  v_void_result := COALESCE(
    public.void_order(p_order_id, p_void_reason)::JSONB,
    '{}'::JSONB
  );

  -- Fallback: if nothing was linked pre-void, try post-void linkage.
  IF array_length(v_session_ids, 1) IS NULL THEN
    SELECT COALESCE(array_agg(ts.id), ARRAY[]::UUID[])
    INTO v_session_ids
    FROM public.table_sessions ts
    WHERE ts.order_id = p_order_id;
  END IF;

  -- Cancel seated reservation(s) linked to this order's table session(s).
  UPDATE public.reservations r
  SET
    status = 'cancelled',
    cancelled_at = COALESCE(r.cancelled_at, NOW()),
    cancellation_reason = COALESCE(r.cancellation_reason, p_void_reason)
  WHERE r.seated_session_id = ANY(v_session_ids)
    AND r.status = 'seated';

  GET DIAGNOSTICS v_cancelled_count = ROW_COUNT;

  RETURN (
    v_void_result || jsonb_build_object(
      'reservation_cancelled_count', v_cancelled_count
    )
  )::JSON;
END;
$function$;

-- ── void_payment ──
CREATE OR REPLACE FUNCTION public.void_payment(p_payment_id uuid, p_void_reason text DEFAULT 'User voided'::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_payment       record;
  v_order_id      uuid;
  v_voided_amount numeric;
  v_item          record;
BEGIN
  -- ── 1. Authorization guard ────────────────────────────────────────────────
  SELECT op.*, o.id AS o_order_id
  INTO   v_payment
  FROM   public.order_payments op
  JOIN   public.orders         o ON o.id = op.order_id
  WHERE  op.id         = p_payment_id
    AND  o.merchant_id = user_merchant_id()
    AND  o.location_id = ANY(user_location_ids());

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment not found or access denied';
  END IF;

  -- Idempotent: already voided — return cleanly
  IF v_payment.is_voided IS TRUE THEN RETURN; END IF;

  v_order_id      := v_payment.order_id;
  -- Include tip in voided amount to match how voidPayment() store code
  -- sums amount + tip_amount into amount_paid
  v_voided_amount := COALESCE(v_payment.amount, 0)
                   + COALESCE(v_payment.tip_amount, 0);

  -- ── 2. Mark payment voided ────────────────────────────────────────────────
  UPDATE public.order_payments
  SET    is_voided   = true,
         status      = 'void'::payment_status,
         voided_at   = now(),
         void_reason = p_void_reason
  WHERE  id = p_payment_id;

  -- ── 3a. Restore paid_quantity — precise path via order_payment_items ──────
  -- Decrement by the exact quantity_paid recorded at payment time.
  -- GREATEST(..., 0) prevents negative quantities from data anomalies.
  -- UPDATE ... FROM JOIN: zero rows updated = no-op when no junction records exist.
  UPDATE public.order_items oi
  SET    paid_quantity = GREATEST(
           COALESCE(oi.paid_quantity, 0) - opi.quantity_paid, 0)
  FROM   public.order_payment_items opi
  WHERE  opi.order_payment_id = p_payment_id
    AND  opi.order_item_id    = oi.id;

  -- ── 3b. Fallback: covers_items UUID array ────────────────────────────────
  -- Only activates for payments with no order_payment_items rows
  -- (legacy split-even payments inserted before the junction table existed).
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

  -- ── 4. Update orders.amount_paid ──────────────────────────────────────────
  UPDATE public.orders
  SET    amount_paid = GREATEST(COALESCE(amount_paid, 0) - v_voided_amount, 0)
  WHERE  id = v_order_id;

  -- ── 5. Recalculate totals via the authoritative fast totals function ───────
  -- After setting is_voided=true the payment appears in v_payment_voided inside
  -- calculate_order_totals_fast, which disables the fully-paid guard and allows
  -- amount_due to correctly reflect the restored unpaid balance.
  PERFORM calculate_order_totals_fast(v_order_id);

  -- ── 6. Update payment_status ──────────────────────────────────────────────
  UPDATE public.orders
  SET    payment_status =
           CASE
             WHEN (SELECT COALESCE(amount_due,  0) FROM public.orders WHERE id = v_order_id) <= 0
               THEN 'paid'::payment_status
             WHEN (SELECT COALESCE(amount_paid, 0) FROM public.orders WHERE id = v_order_id) > 0
               THEN 'partial'::payment_status
             ELSE 'pending'::payment_status
           END
  WHERE  id = v_order_id;

END;
$function$;
-- ── calculate_tip_distribution_v2 ──
CREATE OR REPLACE FUNCTION public.calculate_tip_distribution_v2(p_merchant_id uuid, p_location_id uuid, p_session_date date, p_shift_period text DEFAULT NULL::text, p_calculated_by uuid DEFAULT NULL::uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'public', 'pg_temp'
AS $function$
DECLARE
  v_session_id       UUID;
  v_total_collected   NUMERIC;
  v_total_distributed NUMERIC;
  v_total_pooled      NUMERIC;
  v_total_tipouts     NUMERIC;
  v_pool              RECORD;
  v_rule              RECORD;
  v_role_share        RECORD;
  v_pool_total        NUMERIC;
  v_role_count        INTEGER;
  v_total_hours       NUMERIC;
  v_total_points      NUMERIC;
  v_tipout_total      NUMERIC;
  v_giver_count       INTEGER;
  v_receiver_count    INTEGER;
BEGIN

  -- Advisory lock to prevent concurrent runs for same location/date
  PERFORM pg_advisory_xact_lock(
    hashtext(p_location_id::text || p_session_date::text)
  );

  -- =========================================================
  -- STEP 1: CREATE OR RESET SESSION
  -- =========================================================
  INSERT INTO tip_distribution_sessions(
    merchant_id, location_id, session_date, shift_period
  )
  VALUES(p_merchant_id, p_location_id, p_session_date, p_shift_period)
  ON CONFLICT(location_id, session_date, shift_period)
  DO UPDATE SET updated_at = now(), status = 'draft'
  RETURNING id INTO v_session_id;

  DELETE FROM tip_distribution_details WHERE session_id = v_session_id;

  -- =========================================================
  -- STEP 2: POPULATE EMPLOYEE DATA FROM DAILY TIPS
  -- =========================================================
  INSERT INTO tip_distribution_details(
    session_id, staff_profile_id, staff_name, role_code,
    hours_worked, gross_sales,
    charged_tips, cash_tips, individual_tips_earned
  )
  SELECT
    v_session_id,
    edt.staff_profile_id,
    COALESCE(sp.display_name, sp.first_name || ' ' || sp.last_name, 'Unknown'),
    lm.role_code,
    COALESCE(edt.hours_worked, 0),
    COALESCE(edt.gross_sales, 0),
    COALESCE(edt.charged_tips, 0),
    COALESCE(edt.cash_tips_declared, 0),
    COALESCE(edt.charged_tips, 0) + COALESCE(edt.cash_tips_declared, 0)
  FROM employee_daily_tips edt
  JOIN location_members lm
    ON lm.staff_profile_id = edt.staff_profile_id
    AND lm.location_id = edt.location_id
  JOIN staff_profiles sp
    ON sp.id = edt.staff_profile_id
  WHERE edt.location_id = p_location_id
    AND edt.shift_date = p_session_date;

  -- =========================================================
  -- STEP 3: CALCULATE TOTAL COLLECTED
  -- =========================================================
  SELECT COALESCE(SUM(individual_tips_earned), 0)
  INTO v_total_collected
  FROM tip_distribution_details
  WHERE session_id = v_session_id;

  -- =========================================================
  -- STEP 4: CREATE TEMP TABLE FOR PER‑POOL CONTRIBUTIONS
  -- =========================================================
  CREATE TEMP TABLE temp_pool_contrib (
    pool_id UUID,
    staff_profile_id UUID,
    amount NUMERIC
  ) ON COMMIT DROP;

  -- =========================================================
  -- STEP 5: PROCESS EACH ACTIVE TIP POOL – CONTRIBUTIONS
  -- =========================================================
  FOR v_pool IN
    SELECT * FROM tip_pool_configs
    WHERE location_id = p_location_id
      AND is_active = true
      AND effective_date <= p_session_date
      AND (end_date IS NULL OR end_date >= p_session_date)
  LOOP
    -- Insert contributions into temp table (per pool)
    IF v_pool.tip_source = 'charged_tips' THEN
      INSERT INTO temp_pool_contrib (pool_id, staff_profile_id, amount)
      SELECT v_pool.id, dd.staff_profile_id,
             ROUND(dd.charged_tips * (v_pool.source_percentage / 100.0), 2)
      FROM tip_distribution_details dd
      WHERE dd.session_id = v_session_id
        AND dd.role_code = ANY(v_pool.contributing_role_codes);

    ELSIF v_pool.tip_source = 'all_tips' THEN
      INSERT INTO temp_pool_contrib (pool_id, staff_profile_id, amount)
      SELECT v_pool.id, dd.staff_profile_id,
             ROUND(dd.individual_tips_earned * (v_pool.source_percentage / 100.0), 2)
      FROM tip_distribution_details dd
      WHERE dd.session_id = v_session_id
        AND dd.role_code = ANY(v_pool.contributing_role_codes);

    ELSIF v_pool.tip_source = 'cash_only' THEN
      INSERT INTO temp_pool_contrib (pool_id, staff_profile_id, amount)
      SELECT v_pool.id, dd.staff_profile_id,
             ROUND(dd.cash_tips * (v_pool.source_percentage / 100.0), 2)
      FROM tip_distribution_details dd
      WHERE dd.session_id = v_session_id
        AND dd.role_code = ANY(v_pool.contributing_role_codes);
    END IF;
  END LOOP;

  -- =========================================================
  -- STEP 6: UPDATE tip_pool_contributed FROM TEMP TABLE
  -- =========================================================
  UPDATE tip_distribution_details dd
  SET tip_pool_contributed = COALESCE((
    SELECT SUM(amount) FROM temp_pool_contrib t
    WHERE t.staff_profile_id = dd.staff_profile_id
  ), 0)
  WHERE session_id = v_session_id;

  -- =========================================================
  -- STEP 7: REDISTRIBUTE EACH POOL (accumulate receipts)
  -- =========================================================
  FOR v_pool IN
    SELECT * FROM tip_pool_configs
    WHERE location_id = p_location_id
      AND is_active = true
      AND effective_date <= p_session_date
      AND (end_date IS NULL OR end_date >= p_session_date)
  LOOP
    -- Get total contributed to this pool from the temp table
    SELECT COALESCE(SUM(amount), 0) INTO v_pool_total
    FROM temp_pool_contrib
    WHERE pool_id = v_pool.id;

    -- Skip if nothing to distribute
    IF v_pool_total = 0 THEN
      CONTINUE;
    END IF;

    -- ----- DISTRIBUTION BY METHOD -----
    IF v_pool.distribution_method = 'percentage' THEN
      -- Percentage split by role, equally among employees of that role
      FOR v_role_share IN
        SELECT prs.role_code, prs.share_percentage
        FROM tip_pool_role_shares prs
        WHERE prs.tip_pool_config_id = v_pool.id
          AND prs.is_eligible = true
          AND prs.share_percentage IS NOT NULL
          AND prs.share_percentage > 0
      LOOP
        SELECT COUNT(*) INTO v_role_count
        FROM tip_distribution_details
        WHERE session_id = v_session_id
          AND role_code = v_role_share.role_code;

        IF v_role_count > 0 THEN
          UPDATE tip_distribution_details
          SET tip_pool_received = tip_pool_received +
            ROUND((v_pool_total * (v_role_share.share_percentage / 100.0)) / v_role_count, 2)
          WHERE session_id = v_session_id
            AND role_code = v_role_share.role_code;
        END IF;
      END LOOP;

    ELSIF v_pool.distribution_method = 'equal_split' THEN
      -- Equal split only among employees whose roles are eligible for this pool
      SELECT COUNT(*) INTO v_role_count
      FROM tip_distribution_details dd
      WHERE dd.session_id = v_session_id
        AND EXISTS (
          SELECT 1 FROM tip_pool_role_shares prs
          WHERE prs.tip_pool_config_id = v_pool.id
            AND prs.role_code = dd.role_code
            AND prs.is_eligible = true
        );

      IF v_role_count > 0 THEN
        UPDATE tip_distribution_details dd
        SET tip_pool_received = tip_pool_received +
          ROUND(v_pool_total / v_role_count, 2)
        WHERE dd.session_id = v_session_id
          AND EXISTS (
            SELECT 1 FROM tip_pool_role_shares prs
            WHERE prs.tip_pool_config_id = v_pool.id
              AND prs.role_code = dd.role_code
              AND prs.is_eligible = true
          );
      END IF;

    ELSIF v_pool.distribution_method = 'hours_weighted' THEN
      -- Hours‑weighted only for eligible roles
      SELECT COALESCE(SUM(dd.hours_worked), 0) INTO v_total_hours
      FROM tip_distribution_details dd
      WHERE dd.session_id = v_session_id
        AND EXISTS (
          SELECT 1 FROM tip_pool_role_shares prs
          WHERE prs.tip_pool_config_id = v_pool.id
            AND prs.role_code = dd.role_code
            AND prs.is_eligible = true
        );

      IF v_total_hours > 0 THEN
        UPDATE tip_distribution_details dd
        SET tip_pool_received = tip_pool_received +
          ROUND(v_pool_total * (dd.hours_worked / v_total_hours), 2)
        WHERE dd.session_id = v_session_id
          AND EXISTS (
            SELECT 1 FROM tip_pool_role_shares prs
            WHERE prs.tip_pool_config_id = v_pool.id
              AND prs.role_code = dd.role_code
              AND prs.is_eligible = true
          );
      END IF;

    ELSIF v_pool.distribution_method = 'points' THEN
      -- Points‑based: role's points_per_hour * employee's hours
      SELECT COALESCE(SUM(prs.points_per_hour * dd.hours_worked), 0) INTO v_total_points
      FROM tip_distribution_details dd
      JOIN tip_pool_role_shares prs
        ON prs.tip_pool_config_id = v_pool.id
        AND prs.role_code = dd.role_code
        AND prs.is_eligible = true
      WHERE dd.session_id = v_session_id;

      IF v_total_points > 0 THEN
        UPDATE tip_distribution_details dd
        SET tip_pool_received = tip_pool_received +
          ROUND(v_pool_total * ((prs_sub.points_per_hour * dd.hours_worked) / v_total_points), 2)
        FROM tip_pool_role_shares prs_sub
        WHERE dd.session_id = v_session_id
          AND prs_sub.tip_pool_config_id = v_pool.id
          AND prs_sub.role_code = dd.role_code
          AND prs_sub.is_eligible = true;
      END IF;
    END IF;
  END LOOP;

  -- =========================================================
  -- STEP 8: TIP‑OUT RULES (all three types)
  -- =========================================================
  FOR v_rule IN
    SELECT * FROM tip_out_rules
    WHERE location_id = p_location_id
      AND is_active = true
      AND effective_date <= p_session_date
      AND (end_date IS NULL OR end_date >= p_session_date)
  LOOP
    -- How many receivers for this rule?
    SELECT COUNT(*) INTO v_receiver_count
    FROM tip_distribution_details
    WHERE session_id = v_session_id
      AND role_code = v_rule.to_role_code;

    IF v_rule.tip_out_type = 'percentage_of_sales' THEN
      -- Deduct from givers
      UPDATE tip_distribution_details dd
      SET tip_out_given = tip_out_given +
        ROUND(dd.gross_sales * (v_rule.tip_out_value / 100.0), 2)
      WHERE dd.session_id = v_session_id
        AND dd.role_code = v_rule.from_role_code;

      -- Total given (for crediting receivers)
      SELECT COALESCE(SUM(ROUND(dd.gross_sales * (v_rule.tip_out_value / 100.0), 2)), 0)
      INTO v_tipout_total
      FROM tip_distribution_details dd
      WHERE dd.session_id = v_session_id
        AND dd.role_code = v_rule.from_role_code;

      -- Credit receivers equally
      IF v_receiver_count > 0 THEN
        UPDATE tip_distribution_details
        SET tip_out_received = tip_out_received +
          ROUND(v_tipout_total / v_receiver_count, 2)
        WHERE session_id = v_session_id
          AND role_code = v_rule.to_role_code;
      END IF;

    ELSIF v_rule.tip_out_type = 'percentage_of_tips' THEN
      UPDATE tip_distribution_details dd
      SET tip_out_given = tip_out_given +
        ROUND(dd.individual_tips_earned * (v_rule.tip_out_value / 100.0), 2)
      WHERE dd.session_id = v_session_id
        AND dd.role_code = v_rule.from_role_code;

      SELECT COALESCE(SUM(ROUND(dd.individual_tips_earned * (v_rule.tip_out_value / 100.0), 2)), 0)
      INTO v_tipout_total
      FROM tip_distribution_details dd
      WHERE dd.session_id = v_session_id
        AND dd.role_code = v_rule.from_role_code;

      IF v_receiver_count > 0 THEN
        UPDATE tip_distribution_details
        SET tip_out_received = tip_out_received +
          ROUND(v_tipout_total / v_receiver_count, 2)
        WHERE session_id = v_session_id
          AND role_code = v_rule.to_role_code;
      END IF;

    ELSIF v_rule.tip_out_type = 'flat_amount' THEN
      UPDATE tip_distribution_details dd
      SET tip_out_given = tip_out_given + v_rule.tip_out_value
      WHERE dd.session_id = v_session_id
        AND dd.role_code = v_rule.from_role_code;

      SELECT COUNT(*) INTO v_giver_count
      FROM tip_distribution_details
      WHERE session_id = v_session_id
        AND role_code = v_rule.from_role_code;

      v_tipout_total := v_giver_count * v_rule.tip_out_value;

      IF v_receiver_count > 0 THEN
        UPDATE tip_distribution_details
        SET tip_out_received = tip_out_received +
          ROUND(v_tipout_total / v_receiver_count, 2)
        WHERE session_id = v_session_id
          AND role_code = v_rule.to_role_code;
      END IF;
    END IF;
  END LOOP;

  -- =========================================================
  -- STEP 9: CALCULATE NET TIPS FOR EACH EMPLOYEE
  -- =========================================================
  UPDATE tip_distribution_details
  SET net_tips =
    individual_tips_earned
    - tip_pool_contributed
    + tip_pool_received
    - tip_out_given
    + tip_out_received
    + manual_adjustment
  WHERE session_id = v_session_id;

  -- =========================================================
  -- STEP 10: AGGREGATE SESSION TOTALS
  -- =========================================================
  SELECT
    COALESCE(SUM(net_tips), 0),
    COALESCE(SUM(tip_pool_contributed), 0),
    COALESCE(SUM(tip_out_given), 0)
  INTO v_total_distributed, v_total_pooled, v_total_tipouts
  FROM tip_distribution_details
  WHERE session_id = v_session_id;

  UPDATE tip_distribution_sessions
  SET
    status = 'calculated',
    total_tips_collected = v_total_collected,
    total_tips_pooled = v_total_pooled,
    total_tip_outs = v_total_tipouts,
    total_distributed = v_total_distributed,
    rounding_adjustment = v_total_collected - v_total_distributed,
    calculated_at = now(),
    calculated_by = p_calculated_by
  WHERE id = v_session_id;

  RETURN json_build_object(
    'success', true,
    'session_id', v_session_id,
    'total_collected', v_total_collected,
    'total_distributed', v_total_distributed,
    'total_tips_pooled', v_total_pooled,
    'total_tip_outs', v_total_tipouts,
    'details', (
      SELECT json_agg(
        json_build_object(
          'id', id,
          'staff_profile_id', staff_profile_id,
          'staff_name', staff_name,
          'role_code', role_code,
          'gross_sales', gross_sales,
          'charged_tips', charged_tips,
          'cash_tips', cash_tips,
          'individual_tips_earned', individual_tips_earned,
          'tip_pool_contributed', tip_pool_contributed,
          'tip_pool_received', tip_pool_received,
          'tip_out_given', tip_out_given,
          'tip_out_received', tip_out_received,
          'manual_adjustment', manual_adjustment,
          'net_tips', net_tips,
          'hours_worked', hours_worked
        )
      )
      FROM tip_distribution_details
      WHERE session_id = v_session_id
    )
  );

END;
$function$;

