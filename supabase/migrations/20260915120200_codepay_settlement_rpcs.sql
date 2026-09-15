-- ============================================================================
-- CodePay batch-out (on-terminal settlement)
-- ============================================================================
-- Adds prepare_codepay_settlement / finalize_codepay_settlement, mirroring the
-- Valor NON-host-keyed settlement model (20260723170000_valor_settlement_rpcs).
-- CodePay closes the open batch on the terminal via an Android Intent
-- (topic ecrhub.pay.batch.close); its response is thin (response_code "000" =
-- success). Gross/tip/net therefore come from the pinned order_payments rows.
--
-- Correctness invariants (identical to Valor):
--   1. Membership pinned at prepare (settlement_batch_id stamped on the snapshot
--      rows); finalize only ever touches WHERE settlement_batch_id = batch.
--   2. is_settled flips on response_code "000" + pinned membership ONLY.
--   3. Explicit non-"000" decline => 'failed' + release pins (safe retry — the
--      batch did NOT close).
--   4. Indeterminate (response_code null) => 'needs_review' and KEEP the pins
--      (the batch MAY have closed; never re-close / double-cut).
--   5. finalize is idempotent (replay-safe): already-settled => no-op success.
--   6. Optional count cross-check: only when the terminal returns a numeric
--      count (biz.count) — a mismatch routes to 'needs_review', never a blind flip.
-- CodePay has no EPI, so there is no EPI identity guard (unlike Valor).
-- ============================================================================

-- Reuse the multi-processor columns added by the Valor migration
-- (settlement_batches.processor, pending_finalize_journal.processor/response,
-- chk_settlement_status incl. 'needs_review'). No schema change needed here.

-- ============================================================================
-- 1. prepare_codepay_settlement
-- ============================================================================
CREATE OR REPLACE FUNCTION public.prepare_codepay_settlement(
    p_terminal_id uuid,
    p_merchant_id uuid,
    p_initiated_by text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
    v_terminal      record;
    v_batch_uuid    uuid;
    v_batch_id      text;
    v_batch_seq     integer;
    v_count         integer;
    v_date_start    date;
    v_date_end      date;
    v_gross         numeric(10,2);
    v_tips          numeric(10,2);
    v_total         numeric(10,2);
BEGIN
    SELECT * INTO v_terminal FROM public.payment_terminals WHERE id = p_terminal_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Terminal not found: %', p_terminal_id; END IF;
    IF v_terminal.merchant_id != p_merchant_id THEN
        RAISE EXCEPTION 'Access denied: terminal % does not belong to merchant %', p_terminal_id, p_merchant_id;
    END IF;

    -- Reset a stale pending CodePay batch (prepare ran but the terminal was never
    -- settled — crash/timeout) and release its pinned payments so a retry is safe.
    UPDATE public.settlement_batches
    SET status = 'failed',
        failure_reason = 'Auto-reset: prepare ran but the CodePay terminal was never settled (crash/timeout). Safe to retry.',
        updated_at = NOW()
    WHERE payment_terminal_id = p_terminal_id AND processor = 'codepay'
      AND status = 'pending' AND opened_at < (NOW() - INTERVAL '10 minutes');

    UPDATE public.order_payments op SET settlement_batch_id = NULL
    FROM public.settlement_batches sb
    WHERE op.settlement_batch_id = sb.id
      AND sb.payment_terminal_id = p_terminal_id
      AND sb.processor = 'codepay' AND sb.status = 'failed';

    -- Concurrency guard: only one CodePay settle in flight per terminal.
    IF EXISTS (
        SELECT 1 FROM public.settlement_batches
        WHERE payment_terminal_id = p_terminal_id AND processor = 'codepay'
          AND status IN ('pending','settling') AND merchant_id = p_merchant_id
    ) THEN
        RAISE EXCEPTION 'A settlement is already in progress for CodePay terminal %. Wait or resolve the stuck batch.', p_terminal_id;
    END IF;

    SELECT COUNT(*) + 1 INTO v_batch_seq FROM public.settlement_batches WHERE payment_terminal_id = p_terminal_id;
    v_batch_id := 'CDP-' || UPPER(LEFT(REPLACE(p_terminal_id::text, '-', ''), 8))
        || '-' || TO_CHAR(NOW() AT TIME ZONE 'America/New_York', 'YYYYMMDD')
        || '-' || LPAD(v_batch_seq::text, 3, '0');

    INSERT INTO public.settlement_batches (
        batch_id, processor, merchant_id, location_id, payment_terminal_id, terminal_id,
        business_date, status, opened_at, created_at, updated_at
    ) VALUES (
        v_batch_id, 'codepay', p_merchant_id, v_terminal.location_id, p_terminal_id, p_terminal_id::text,
        (NOW() AT TIME ZONE 'America/New_York')::date, 'pending', NOW(), NOW(), NOW()
    ) RETURNING id INTO v_batch_uuid;

    -- PIN membership: stamp settlement_batch_id on exactly the unsettled captured
    -- CodePay payments for this terminal.
    UPDATE public.order_payments SET settlement_batch_id = v_batch_uuid
    WHERE terminal_id = p_terminal_id::text
      AND terminal_type = 'codepay'
      AND merchant_id = p_merchant_id
      AND is_settled = false
      AND status IN ('captured','partially_refunded')
      AND NOT COALESCE(is_voided, false)
      AND settlement_batch_id IS NULL;

    SELECT COUNT(*), MIN(captured_at::date), MAX(captured_at::date),
           COALESCE(SUM(amount),0), COALESCE(SUM(tip_amount),0), COALESCE(SUM(total_amount),0)
    INTO v_count, v_date_start, v_date_end, v_gross, v_tips, v_total
    FROM public.order_payments WHERE settlement_batch_id = v_batch_uuid;

    IF v_count = 0 THEN
        -- Rolls back the batch insert + (empty) pin. Message matches the client's
        -- nothing_to_settle regex in runCodePaySettlement.
        RAISE EXCEPTION 'No unsettled captured CodePay payments found for terminal %.', p_terminal_id;
    END IF;

    UPDATE public.settlement_batches
    SET transaction_count = v_count, sales_count = v_count,
        gross_amount = v_gross, tip_amount = v_tips, net_deposit = v_total,
        business_date_start = v_date_start, business_date_end = v_date_end, updated_at = NOW()
    WHERE id = v_batch_uuid;

    RETURN jsonb_build_object(
        'batch_uuid', v_batch_uuid, 'batch_id', v_batch_id, 'processor', 'codepay',
        'payment_count', v_count, 'gross_amount', v_gross, 'tip_amount', v_tips, 'total_amount', v_total,
        'date_range', jsonb_build_object('start', v_date_start, 'end', v_date_end)
    );
END;
$$;

-- ============================================================================
-- 2. finalize_codepay_settlement
-- ============================================================================
CREATE OR REPLACE FUNCTION public.finalize_codepay_settlement(
    p_batch_uuid uuid,
    p_merchant_id uuid,
    p_codepay_response jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
    v_batch       record;
    v_code        text;
    v_msg         text;
    v_tran_count  integer;
    v_reason      text;
BEGIN
    SELECT * INTO v_batch FROM public.settlement_batches WHERE id = p_batch_uuid FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Settlement batch not found: %', p_batch_uuid; END IF;
    IF v_batch.merchant_id != p_merchant_id THEN
        RAISE EXCEPTION 'Access denied: batch % does not belong to merchant %', p_batch_uuid, p_merchant_id;
    END IF;
    IF v_batch.processor <> 'codepay' THEN
        RAISE EXCEPTION 'Batch % is not a CodePay batch (processor=%).', p_batch_uuid, v_batch.processor;
    END IF;

    v_code := p_codepay_response->>'response_code';
    v_msg  := p_codepay_response->>'response_msg';
    -- Optional terminal-reported count (biz.count), if the terminal returns one.
    BEGIN
        v_tran_count := NULLIF(p_codepay_response->'biz'->>'count', '')::integer;
    EXCEPTION WHEN others THEN v_tran_count := NULL;
    END;

    -- Idempotent replay: already settled.
    IF v_batch.status = 'settled' THEN
        IF v_code = '000' THEN
            UPDATE public.settlement_batches
            SET raw_response = COALESCE(raw_response, p_codepay_response), updated_at = NOW()
            WHERE id = p_batch_uuid;
            RETURN jsonb_build_object('success', true, 'status', 'settled', 'batch_id', v_batch.batch_id,
                'processor', 'codepay', 'should_retry', false, 'requires_support', false, 'idempotent_replay', true);
        END IF;
        RAISE EXCEPTION 'Batch % is already settled; cannot finalize again with a non-success response.', p_batch_uuid;
    END IF;

    IF v_batch.status NOT IN ('pending','settling','retry','failed','needs_review') THEN
        RAISE EXCEPTION 'Batch % is in status %. Expected pending/settling/retry/failed/needs_review.', p_batch_uuid, v_batch.status;
    END IF;

    -- SUCCESS: response_code "000".
    IF v_code = '000' THEN
        -- Optional cross-check: only when the terminal reported a numeric count.
        IF v_tran_count IS NOT NULL AND v_tran_count <> COALESCE(v_batch.transaction_count, 0) THEN
            v_reason := format('Count mismatch: terminal settled %s txns, batch pinned %s. Manual review required.',
                v_tran_count, COALESCE(v_batch.transaction_count, 0));
            UPDATE public.settlement_batches
            SET status = 'needs_review', raw_response = p_codepay_response,
                failure_reason = v_reason, last_attempt_at = NOW(), retry_count = retry_count + 1, updated_at = NOW()
            WHERE id = p_batch_uuid;
            RETURN jsonb_build_object('success', false, 'status', 'needs_review', 'batch_id', v_batch.batch_id,
                'processor', 'codepay', 'should_retry', false, 'requires_support', true, 'error', v_reason);
        END IF;

        UPDATE public.settlement_batches
        SET status = 'settled', closed_at = NOW(), settlement_date = CURRENT_DATE,
            raw_response = p_codepay_response,
            last_attempt_at = NOW(), retry_count = retry_count + 1, failure_reason = NULL, updated_at = NOW()
        WHERE id = p_batch_uuid;

        UPDATE public.order_payments SET is_settled = true, settled_at = NOW()
        WHERE settlement_batch_id = p_batch_uuid AND is_settled = false;

        RETURN jsonb_build_object('success', true, 'status', 'settled', 'batch_id', v_batch.batch_id,
            'processor', 'codepay', 'should_retry', false, 'requires_support', false);
    END IF;

    -- EXPLICIT DECLINE: response_code present but not "000" (e.g. no open batch).
    -- The batch did NOT close — release the pin so a retry is safe.
    IF v_code IS NOT NULL THEN
        UPDATE public.settlement_batches
        SET status = 'failed', raw_response = p_codepay_response,
            failure_reason = COALESCE(v_msg, 'CodePay batch close declined (code ' || v_code || ')'),
            last_attempt_at = NOW(), retry_count = retry_count + 1, updated_at = NOW()
        WHERE id = p_batch_uuid;
        UPDATE public.order_payments SET settlement_batch_id = NULL WHERE settlement_batch_id = p_batch_uuid;
        RETURN jsonb_build_object('success', false, 'status', 'failed', 'batch_id', v_batch.batch_id,
            'processor', 'codepay', 'should_retry', true, 'requires_support', false,
            'error', COALESCE(v_msg, 'declined'));
    END IF;

    -- INDETERMINATE: response_code null (Intent timed out / no readable result).
    -- The batch MAY have closed — never a silent success and NEVER release the pin
    -- (re-closing would double-cut). Route to needs_review for manual reconcile.
    v_reason := format('Indeterminate CodePay settlement (no response_code). Manual review required. %s',
        COALESCE(v_msg, ''));
    UPDATE public.settlement_batches
    SET status = 'needs_review', raw_response = p_codepay_response, failure_reason = v_reason,
        last_attempt_at = NOW(), retry_count = retry_count + 1, updated_at = NOW()
    WHERE id = p_batch_uuid;
    RETURN jsonb_build_object('success', false, 'status', 'needs_review', 'batch_id', v_batch.batch_id,
        'processor', 'codepay', 'should_retry', false, 'requires_support', true, 'error', v_reason);
END;
$$;

GRANT EXECUTE ON FUNCTION public.prepare_codepay_settlement(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_codepay_settlement(uuid, uuid, jsonb) TO authenticated;

-- ============================================================================
-- 3. get_unsettled_summary_by_terminal — include CodePay terminals/payments.
--    Broadened from IN ('castles','valor') to add 'codepay'. Re-declared in full
--    from 20260723170000_valor_settlement_rpcs.sql (the current definition) with
--    only the two IN-lists changed.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_unsettled_summary_by_terminal(
    p_merchant_id uuid,
    p_location_id uuid DEFAULT NULL::uuid
)
RETURNS TABLE(
    terminal_uuid uuid, terminal_name text, terminal_type text,
    castles_ip_address text, castles_port integer,
    is_active boolean, is_connected boolean,
    payment_count bigint, gross_amount numeric, tip_amount numeric, total_amount numeric,
    oldest_payment_date date, newest_payment_date date, day_span integer,
    has_stuck_batch boolean, stuck_batch_status text, stuck_batch_uuid uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
    RETURN QUERY
    SELECT
        pt.id                       AS terminal_uuid,
        pt.terminal_name            AS terminal_name,
        pt.terminal_type            AS terminal_type,
        pt.castles_ip_address       AS castles_ip_address,
        pt.castles_port             AS castles_port,
        pt.is_active                AS is_active,
        pt.is_connected             AS is_connected,
        COUNT(op.id)                AS payment_count,
        COALESCE(SUM(op.amount), 0)       AS gross_amount,
        COALESCE(SUM(op.tip_amount), 0)   AS tip_amount,
        COALESCE(SUM(op.total_amount - COALESCE(op.refunded_amount, 0)), 0) AS total_amount,
        MIN(op.approved_at::date)   AS oldest_payment_date,
        MAX(op.approved_at::date)   AS newest_payment_date,
        COALESCE((MAX(op.approved_at::date) - MIN(op.approved_at::date)) + 1, 0)::integer AS day_span,
        (EXISTS (
            SELECT 1 FROM public.settlement_batches sb
            WHERE sb.payment_terminal_id = pt.id
              AND sb.status IN ('failed', 'retry', 'terminal_unavailable', 'needs_review')
        )) AS has_stuck_batch,
        (SELECT sb.status::text FROM public.settlement_batches sb
         WHERE sb.payment_terminal_id = pt.id
           AND sb.status IN ('failed', 'retry', 'terminal_unavailable', 'needs_review')
         ORDER BY sb.opened_at DESC LIMIT 1) AS stuck_batch_status,
        (SELECT sb.id FROM public.settlement_batches sb
         WHERE sb.payment_terminal_id = pt.id
           AND sb.status IN ('failed', 'retry', 'terminal_unavailable', 'needs_review')
         ORDER BY sb.opened_at DESC LIMIT 1) AS stuck_batch_uuid
    FROM public.payment_terminals pt
    LEFT JOIN public.order_payments op ON
        op.terminal_id       = pt.id::text
        AND op.terminal_type::text IN ('castles','valor','codepay')
        AND op.is_settled    = false
        AND op.status IN ('captured', 'partially_refunded')
        AND NOT COALESCE(op.is_voided, false)
    WHERE
        pt.merchant_id = p_merchant_id
        AND pt.terminal_type IN ('castles','valor','codepay')
        AND pt.is_active = true
        AND (p_location_id IS NULL OR pt.location_id = p_location_id)
    GROUP BY
        pt.id, pt.terminal_name, pt.terminal_type,
        pt.castles_ip_address, pt.castles_port,
        pt.is_active, pt.is_connected;
END;
$function$;
