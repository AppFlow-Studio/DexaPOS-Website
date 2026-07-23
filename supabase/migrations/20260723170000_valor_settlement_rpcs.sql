-- ============================================================================
-- Valor batch-out (on-terminal settlement) — Wave 2
-- ============================================================================
-- Adds prepare_valor_settlement / finalize_valor_settlement, mirroring the
-- Castles NON-host-keyed settlement model for Valor terminals (TRAN_MODE 0 /
-- TRAN_CODE 9). Valor's on-terminal settlement response is thin (STATE, EPI,
-- SERIAL_NO, AMOUNT, BATCH_NO, TOTAL_TRAN_COUNT) — no per-acquirer hosts — so
-- gross/tip/net come from the pinned order_payments rows and the terminal's
-- AMOUNT/TOTAL_TRAN_COUNT are used only as a cross-check.
--
-- Correctness invariants:
--   1. Membership pinned at prepare (settlement_batch_id stamped on the exact
--      snapshot rows); finalize only ever touches WHERE settlement_batch_id=batch.
--   2. is_settled flips on STATE=success + pinned membership ONLY, never on totals.
--      A terminal/pinned count mismatch => status 'needs_review', no blanket flip.
--   3. Unknown/indeterminate STATE => 'needs_review', never a silent success.
--   4. finalize is idempotent (replay-safe): already-settled => no-op success.
--   5. EPI identity guard: the settlement response carries EPI; mismatch vs the
--      terminal's stored valor_epi => 'needs_review', not marked.
-- ============================================================================

-- 1. settlement_batches: processor discriminator + allow 'needs_review' status.
ALTER TABLE public.settlement_batches
    ADD COLUMN IF NOT EXISTS processor text NOT NULL DEFAULT 'castles';

ALTER TABLE public.settlement_batches DROP CONSTRAINT IF EXISTS chk_settlement_status;
ALTER TABLE public.settlement_batches ADD CONSTRAINT chk_settlement_status
    CHECK ((status)::text = ANY (ARRAY[
        'open','pending','settling','settled','partial_failure','retry',
        'failed','terminal_unavailable','closed','needs_review'
    ]::text[]));

-- 2. pending_finalize_journal: generalize for multi-processor replay (Wave 3b).
ALTER TABLE public.pending_finalize_journal
    ADD COLUMN IF NOT EXISTS processor text NOT NULL DEFAULT 'castles',
    ADD COLUMN IF NOT EXISTS response jsonb;
ALTER TABLE public.pending_finalize_journal ALTER COLUMN castles_response DROP NOT NULL;

-- ============================================================================
-- 3. prepare_valor_settlement
-- ============================================================================
CREATE OR REPLACE FUNCTION public.prepare_valor_settlement(
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

    -- Reset a stale pending Valor batch (prepare ran but the terminal was never
    -- settled — crash/timeout) and release its pinned payments so a retry is safe.
    UPDATE public.settlement_batches
    SET status = 'failed',
        failure_reason = 'Auto-reset: prepare ran but the Valor terminal was never settled (crash/timeout). Safe to retry.',
        updated_at = NOW()
    WHERE payment_terminal_id = p_terminal_id AND processor = 'valor'
      AND status = 'pending' AND opened_at < (NOW() - INTERVAL '10 minutes');

    UPDATE public.order_payments op SET settlement_batch_id = NULL
    FROM public.settlement_batches sb
    WHERE op.settlement_batch_id = sb.id
      AND sb.payment_terminal_id = p_terminal_id
      AND sb.processor = 'valor' AND sb.status = 'failed';

    -- Concurrency guard: only one Valor settle in flight per terminal.
    IF EXISTS (
        SELECT 1 FROM public.settlement_batches
        WHERE payment_terminal_id = p_terminal_id AND processor = 'valor'
          AND status IN ('pending','settling') AND merchant_id = p_merchant_id
    ) THEN
        RAISE EXCEPTION 'A settlement is already in progress for Valor terminal %. Wait or resolve the stuck batch.', p_terminal_id;
    END IF;

    SELECT COUNT(*) + 1 INTO v_batch_seq FROM public.settlement_batches WHERE payment_terminal_id = p_terminal_id;
    v_batch_id := 'VLR-' || UPPER(LEFT(REPLACE(p_terminal_id::text, '-', ''), 8))
        || '-' || TO_CHAR(NOW() AT TIME ZONE 'America/New_York', 'YYYYMMDD')
        || '-' || LPAD(v_batch_seq::text, 3, '0');

    -- Create the batch first (counts filled after pinning) so membership is the
    -- authoritative source of the counts (race-free vs. concurrent captures).
    INSERT INTO public.settlement_batches (
        batch_id, processor, merchant_id, location_id, payment_terminal_id, terminal_id,
        business_date, status, opened_at, created_at, updated_at
    ) VALUES (
        v_batch_id, 'valor', p_merchant_id, v_terminal.location_id, p_terminal_id, p_terminal_id::text,
        (NOW() AT TIME ZONE 'America/New_York')::date, 'pending', NOW(), NOW(), NOW()
    ) RETURNING id INTO v_batch_uuid;

    -- PIN membership: stamp settlement_batch_id on exactly the unsettled captured
    -- Valor payments for this terminal.
    UPDATE public.order_payments SET settlement_batch_id = v_batch_uuid
    WHERE terminal_id = p_terminal_id::text
      AND terminal_type = 'valor'
      AND merchant_id = p_merchant_id
      AND is_settled = false
      AND status IN ('captured','partially_refunded')
      AND NOT COALESCE(is_voided, false)
      AND settlement_batch_id IS NULL;

    -- Authoritative counts/totals FROM the pinned set.
    SELECT COUNT(*), MIN(captured_at::date), MAX(captured_at::date),
           COALESCE(SUM(amount),0), COALESCE(SUM(tip_amount),0), COALESCE(SUM(total_amount),0)
    INTO v_count, v_date_start, v_date_end, v_gross, v_tips, v_total
    FROM public.order_payments WHERE settlement_batch_id = v_batch_uuid;

    IF v_count = 0 THEN
        -- Rolls back the batch insert + (empty) pin.
        RAISE EXCEPTION 'No unsettled captured Valor payments found for terminal %.', p_terminal_id;
    END IF;

    UPDATE public.settlement_batches
    SET transaction_count = v_count, sales_count = v_count,
        gross_amount = v_gross, tip_amount = v_tips, net_deposit = v_total,
        business_date_start = v_date_start, business_date_end = v_date_end, updated_at = NOW()
    WHERE id = v_batch_uuid;

    RETURN jsonb_build_object(
        'batch_uuid', v_batch_uuid, 'batch_id', v_batch_id, 'processor', 'valor',
        'payment_count', v_count, 'gross_amount', v_gross, 'tip_amount', v_tips, 'total_amount', v_total,
        'date_range', jsonb_build_object('start', v_date_start, 'end', v_date_end)
    );
END;
$$;

-- ============================================================================
-- 4. finalize_valor_settlement
-- ============================================================================
CREATE OR REPLACE FUNCTION public.finalize_valor_settlement(
    p_batch_uuid uuid,
    p_merchant_id uuid,
    p_valor_response jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
    v_batch       record;
    v_state       text;
    v_batch_no    text;
    v_tran_count  integer;
    v_resp_epi    text;
    v_stored_epi  text;
    v_reason      text;
BEGIN
    SELECT * INTO v_batch FROM public.settlement_batches WHERE id = p_batch_uuid FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Settlement batch not found: %', p_batch_uuid; END IF;
    IF v_batch.merchant_id != p_merchant_id THEN
        RAISE EXCEPTION 'Access denied: batch % does not belong to merchant %', p_batch_uuid, p_merchant_id;
    END IF;
    IF v_batch.processor <> 'valor' THEN
        RAISE EXCEPTION 'Batch % is not a Valor batch (processor=%).', p_batch_uuid, v_batch.processor;
    END IF;

    v_state    := p_valor_response->>'STATE';
    v_batch_no := p_valor_response->>'BATCH_NO';
    v_resp_epi := NULLIF(p_valor_response->>'EPI', '');
    BEGIN
        v_tran_count := NULLIF(p_valor_response->>'TOTAL_TRAN_COUNT', '')::integer;
    EXCEPTION WHEN others THEN v_tran_count := NULL;
    END;

    -- Idempotent replay: already settled.
    IF v_batch.status = 'settled' THEN
        IF v_state = '0' THEN
            UPDATE public.settlement_batches
            SET raw_response = COALESCE(raw_response, p_valor_response),
                batch_number = COALESCE(batch_number, v_batch_no), updated_at = NOW()
            WHERE id = p_batch_uuid;
            RETURN jsonb_build_object('success', true, 'status', 'settled', 'batch_id', v_batch.batch_id,
                'processor', 'valor', 'should_retry', false, 'requires_support', false, 'idempotent_replay', true);
        END IF;
        RAISE EXCEPTION 'Batch % is already settled; cannot finalize again with a non-success response.', p_batch_uuid;
    END IF;

    IF v_batch.status NOT IN ('pending','settling','retry','failed','needs_review') THEN
        RAISE EXCEPTION 'Batch % is in status %. Expected pending/settling/retry/failed/needs_review.', p_batch_uuid, v_batch.status;
    END IF;

    -- Identity guard: the settlement response carries EPI; it must match the terminal.
    SELECT valor_epi INTO v_stored_epi FROM public.payment_terminals WHERE id = v_batch.payment_terminal_id;
    IF v_resp_epi IS NOT NULL AND v_stored_epi IS NOT NULL AND v_resp_epi <> v_stored_epi THEN
        v_reason := format('EPI mismatch: response EPI %s != terminal EPI %s. Not marking settled.', v_resp_epi, v_stored_epi);
        UPDATE public.settlement_batches
        SET status = 'needs_review', raw_response = p_valor_response, failure_reason = v_reason,
            last_attempt_at = NOW(), retry_count = retry_count + 1, updated_at = NOW()
        WHERE id = p_batch_uuid;
        RETURN jsonb_build_object('success', false, 'status', 'needs_review', 'batch_id', v_batch.batch_id,
            'processor', 'valor', 'should_retry', false, 'requires_support', true, 'error', v_reason);
    END IF;

    IF v_state = '0' THEN
        -- Cross-check terminal-reported count vs pinned membership.
        IF v_tran_count IS NOT NULL AND v_tran_count <> COALESCE(v_batch.transaction_count, 0) THEN
            v_reason := format('Count mismatch: terminal settled %s txns, batch pinned %s. Manual review required.',
                v_tran_count, COALESCE(v_batch.transaction_count, 0));
            UPDATE public.settlement_batches
            SET status = 'needs_review', raw_response = p_valor_response, batch_number = v_batch_no,
                failure_reason = v_reason, last_attempt_at = NOW(), retry_count = retry_count + 1, updated_at = NOW()
            WHERE id = p_batch_uuid;
            RETURN jsonb_build_object('success', false, 'status', 'needs_review', 'batch_id', v_batch.batch_id,
                'processor', 'valor', 'should_retry', false, 'requires_support', true, 'error', v_reason);
        END IF;

        UPDATE public.settlement_batches
        SET status = 'settled', closed_at = NOW(), settlement_date = CURRENT_DATE,
            batch_number = v_batch_no, raw_response = p_valor_response,
            last_attempt_at = NOW(), retry_count = retry_count + 1, failure_reason = NULL, updated_at = NOW()
        WHERE id = p_batch_uuid;

        -- Mark the pinned payments (the _cascade trigger also covers this on the
        -- status->settled transition; explicit here for independence/clarity).
        UPDATE public.order_payments SET is_settled = true, settled_at = NOW()
        WHERE settlement_batch_id = p_batch_uuid AND is_settled = false;

        RETURN jsonb_build_object('success', true, 'status', 'settled', 'batch_id', v_batch.batch_id,
            'processor', 'valor', 'batch_number', v_batch_no, 'should_retry', false, 'requires_support', false);
    END IF;

    IF v_state = '-1' THEN
        -- Terminal declined the settle (e.g. no open batch). Release the pin.
        UPDATE public.settlement_batches
        SET status = 'failed', raw_response = p_valor_response,
            failure_reason = COALESCE(p_valor_response->>'ERROR_MSG', 'Valor settlement declined'),
            last_attempt_at = NOW(), retry_count = retry_count + 1, updated_at = NOW()
        WHERE id = p_batch_uuid;
        UPDATE public.order_payments SET settlement_batch_id = NULL WHERE settlement_batch_id = p_batch_uuid;
        RETURN jsonb_build_object('success', false, 'status', 'failed', 'batch_id', v_batch.batch_id,
            'processor', 'valor', 'should_retry', true, 'requires_support', false,
            'error', COALESCE(p_valor_response->>'ERROR_MSG', 'declined'));
    END IF;

    -- Unknown / indeterminate STATE ('-2' or missing): never a silent success.
    v_reason := format('Indeterminate settlement (STATE=%s). Manual review required.', COALESCE(v_state, 'null'));
    UPDATE public.settlement_batches
    SET status = 'needs_review', raw_response = p_valor_response, failure_reason = v_reason,
        last_attempt_at = NOW(), retry_count = retry_count + 1, updated_at = NOW()
    WHERE id = p_batch_uuid;
    RETURN jsonb_build_object('success', false, 'status', 'needs_review', 'batch_id', v_batch.batch_id,
        'processor', 'valor', 'should_retry', false, 'requires_support', true, 'error', v_reason);
END;
$$;

GRANT EXECUTE ON FUNCTION public.prepare_valor_settlement(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_valor_settlement(uuid, uuid, jsonb) TO authenticated;

-- ============================================================================
-- 5. get_unsettled_summary_by_terminal — include Valor terminals/payments.
--    (Was hard-filtered to 'castles'.) Broadened to IN ('castles','valor');
--    per-terminal terminal_id linkage keeps each terminal's aggregate correct.
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
        AND op.terminal_type::text IN ('castles','valor')
        AND op.is_settled    = false
        AND op.status IN ('captured', 'partially_refunded')
        AND NOT COALESCE(op.is_voided, false)
    WHERE
        pt.merchant_id = p_merchant_id
        AND pt.terminal_type IN ('castles','valor')
        AND pt.is_active = true
        AND (p_location_id IS NULL OR pt.location_id = p_location_id)
    GROUP BY
        pt.id, pt.terminal_name, pt.terminal_type,
        pt.castles_ip_address, pt.castles_port,
        pt.is_active, pt.is_connected;
END;
$function$;
