-- ============================================================================
-- Valor auto-batch webhook receiver (DB side)
-- ----------------------------------------------------------------------------
-- Turns a Valor `batch_summary` webhook (fired when the terminal closes its own
-- batch on the host — including the nightly auto-batch) into a closed
-- settlement_batches row, so the existing cascade + reconciliation machinery
-- flips the linked order_payments to is_settled and surfaces the batch on the
-- Batch Reconciliation dashboard. Keyed on EPI (payment_terminals.valor_epi),
-- matched to payments by batch_number.
--
-- See docs/VALOR-WEBHOOK-AUTO-BATCH-SETUP-AND-FLOW.md and the manual settle
-- invariants in 20260723170000_valor_settlement_rpcs.sql.
-- ============================================================================

-- 1. settlement_batches.origin — first-class auto-vs-manual provenance so
--    reconciliation can distinguish an automatic settle from a manual one
--    without digging through raw_response.
ALTER TABLE public.settlement_batches
    ADD COLUMN IF NOT EXISTS origin text;

ALTER TABLE public.settlement_batches DROP CONSTRAINT IF EXISTS chk_settlement_origin;
ALTER TABLE public.settlement_batches ADD CONSTRAINT chk_settlement_origin
    CHECK (origin IS NULL OR origin IN ('pos_manual','pos_auto','valor_webhook','hq_manual'));

-- 2. Idempotency backstop for the webhook path ONLY (Valor retries ≤3×, and can
--    redeliver). Scoped to origin='valor_webhook' so it never constrains the
--    manual prepare/finalize flow (which sets batch_number late and must remain
--    free to write any batch_number).
CREATE UNIQUE INDEX IF NOT EXISTS uq_valor_webhook_batch
    ON public.settlement_batches (payment_terminal_id, batch_number)
    WHERE origin = 'valor_webhook' AND batch_number IS NOT NULL;

-- ============================================================================
-- 3. record_valor_batch_webhook(p_payload jsonb)
--    Called by the valor-webhook edge function (service-role) AFTER it has
--    verified the HMAC signature. Idempotent, self-auditing.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.record_valor_batch_webhook(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_data           jsonb;
    v_epi            text;
    v_batch_no       text;
    v_trigger_source text;
    v_opened_at      timestamptz;
    v_closed_at      timestamptz;
    v_gross          numeric(12,2);
    v_tip            numeric(12,2);
    v_refund         numeric(12,2);
    v_terminal       record;
    v_existing       record;
    v_batch_uuid     uuid;
    v_batch_id       text;
    v_batch_seq      integer;
    v_linked_count   integer;
    v_linked_total   numeric(12,2);
    v_status         text;
    v_reason         text;
BEGIN
    -- Valor may wrap the summary under `data`; accept either shape.
    v_data := COALESCE(p_payload->'data', p_payload);
    v_epi      := NULLIF(v_data->>'epi_id', '');
    v_batch_no := NULLIF(v_data->>'batch_no', '');
    v_trigger_source := v_data->>'trigger_source';

    -- Missing join keys -> dead-letter, ack (no retry value).
    IF v_epi IS NULL OR v_batch_no IS NULL THEN
        INSERT INTO public.webhook_dead_letter_queue (source, event_type, raw_payload, error_message)
        VALUES ('valor', 'batch_summary', p_payload, 'Missing epi_id or batch_no');
        RETURN jsonb_build_object('ok', false, 'reason', 'missing_fields');
    END IF;

    -- Resolve terminal by EPI (the only join anchor for the webhook path).
    SELECT * INTO v_terminal
    FROM public.payment_terminals
    WHERE valor_epi = v_epi AND terminal_type = 'valor'
    ORDER BY is_active DESC
    LIMIT 1;

    IF NOT FOUND THEN
        INSERT INTO public.webhook_dead_letter_queue (source, event_type, raw_payload, error_message)
        VALUES ('valor', 'batch_summary', p_payload, format('Unknown Valor EPI: %s', v_epi));
        RETURN jsonb_build_object('ok', false, 'reason', 'unknown_epi', 'epi', v_epi);
    END IF;

    -- Defensive parse of amounts / timestamps; garbage -> dead-letter.
    BEGIN
        v_opened_at := NULLIF(v_data->>'batch_opened_at', '')::timestamptz;
        v_closed_at := NULLIF(v_data->>'batch_closed_at', '')::timestamptz;
        v_gross  := COALESCE(NULLIF(v_data->>'purchase_amount', '')::numeric, 0);
        v_tip    := COALESCE(NULLIF(v_data->>'tip_amount', '')::numeric, 0);
        v_refund := COALESCE(NULLIF(v_data->>'refund_amount', '')::numeric, 0);
    EXCEPTION WHEN others THEN
        INSERT INTO public.webhook_dead_letter_queue (source, event_type, raw_payload, error_message)
        VALUES ('valor', 'batch_summary', p_payload, 'Unparseable summary amounts/timestamps');
        RETURN jsonb_build_object('ok', false, 'reason', 'parse_error');
    END;

    -- Idempotency: an existing webhook batch for this (terminal, batch_no).
    SELECT * INTO v_existing
    FROM public.settlement_batches
    WHERE payment_terminal_id = v_terminal.id
      AND origin = 'valor_webhook'
      AND batch_number = v_batch_no
    ORDER BY created_at DESC
    LIMIT 1;

    IF FOUND AND v_existing.status = 'settled' THEN
        -- Already settled -> harmless no-op replay.
        RETURN jsonb_build_object('ok', true, 'idempotent_replay', true,
            'batch_id', v_existing.batch_id, 'status', 'settled');
    END IF;

    IF FOUND THEN
        v_batch_uuid := v_existing.id;
        v_batch_id   := v_existing.batch_id;
    ELSE
        SELECT COUNT(*) + 1 INTO v_batch_seq
        FROM public.settlement_batches WHERE payment_terminal_id = v_terminal.id;

        v_batch_id := 'VLR-' || UPPER(LEFT(REPLACE(v_terminal.id::text, '-', ''), 8))
            || '-' || TO_CHAR(COALESCE(v_closed_at, now()), 'YYYYMMDD')
            || '-' || LPAD(v_batch_seq::text, 3, '0');

        INSERT INTO public.settlement_batches (
            batch_id, processor, origin, merchant_id, location_id, payment_terminal_id, terminal_id,
            business_date, batch_number, status, opened_at, closed_at, created_at, updated_at
        ) VALUES (
            v_batch_id, 'valor', 'valor_webhook', v_terminal.merchant_id, v_terminal.location_id,
            v_terminal.id, v_terminal.id::text,
            COALESCE(v_closed_at::date, CURRENT_DATE), v_batch_no, 'pending',
            COALESCE(v_opened_at, now()), v_closed_at, now(), now()
        ) RETURNING id INTO v_batch_uuid;
    END IF;

    -- Link the terminal's unsettled captured Valor payments by batch_number.
    UPDATE public.order_payments
    SET settlement_batch_id = v_batch_uuid
    WHERE terminal_id = v_terminal.id::text
      AND terminal_type = 'valor'
      AND batch_number = v_batch_no
      AND is_settled = false
      AND settlement_batch_id IS NULL
      AND status IN ('captured', 'partially_refunded')
      AND NOT COALESCE(is_voided, false);

    SELECT COUNT(*), COALESCE(SUM(amount), 0)
    INTO v_linked_count, v_linked_total
    FROM public.order_payments WHERE settlement_batch_id = v_batch_uuid;

    -- Decide the outcome. A summary with money but no matched payments, or a
    -- material amount mismatch, is a discrepancy -> needs_review (mirrors the
    -- finalize_valor_settlement invariants), never a blind settle.
    IF v_gross > 0 AND v_linked_count = 0 THEN
        v_status := 'needs_review';
        v_reason := format('Auto-batch summary gross %s but no captured payments matched batch_number %s.',
            v_gross, v_batch_no);
    ELSIF v_linked_count > 0 AND v_gross > 0 AND abs(v_linked_total - v_gross) > 0.01 THEN
        v_status := 'needs_review';
        v_reason := format('Amount mismatch: linked payments %s vs summary gross %s (batch %s).',
            v_linked_total, v_gross, v_batch_no);
    ELSE
        v_status := 'settled';
        v_reason := NULL;
    END IF;

    UPDATE public.settlement_batches SET
        status = v_status,
        origin = 'valor_webhook',
        batch_number = v_batch_no,
        transaction_count = v_linked_count,
        sales_count = v_linked_count,
        gross_amount = v_gross,
        tip_amount = v_tip,
        refund_amount = v_refund,
        net_deposit = v_gross + v_tip - v_refund,
        opened_at = COALESCE(v_opened_at, opened_at),
        closed_at = COALESCE(v_closed_at, now()),
        settlement_date = COALESCE(v_closed_at::date, CURRENT_DATE),
        raw_response = p_payload,
        failure_reason = v_reason,
        updated_at = now()
    WHERE id = v_batch_uuid;
    -- trg_cascade_is_settled_on_batch_close flips is_settled=true on status='settled'.

    -- Self-audit: this RPC runs as service_role, which the settlement audit
    -- trigger deliberately skips, so log our own row here.
    BEGIN
        INSERT INTO public.audit_logs (
            actor_user_id, actor_role, action, action_category, severity,
            resource_type, resource_id, resource_name, merchant_id, location_id, status, metadata
        ) VALUES (
            NULL, 'system',
            CASE WHEN v_status = 'settled' THEN 'batch_settled' ELSE 'batch_settlement_needs_review' END,
            'settlement',
            CASE WHEN v_status = 'settled' THEN 'info' ELSE 'warning' END,
            'settlement_batch', v_batch_uuid, v_batch_id,
            v_terminal.merchant_id, v_terminal.location_id,
            CASE WHEN v_status = 'settled' THEN 'success' ELSE 'failed' END,
            jsonb_build_object(
                'source', 'valor_webhook', 'origin', 'valor_webhook', 'processor', 'valor',
                'trigger_source', v_trigger_source, 'batch_number', v_batch_no,
                'transaction_count', v_linked_count, 'gross_amount', v_gross, 'tip_amount', v_tip,
                'net_deposit', v_gross + v_tip - v_refund, 'batch_status', v_status,
                'failure_reason', v_reason
            )
        );
    EXCEPTION WHEN others THEN
        NULL; -- audit must never break the settle
    END;

    RETURN jsonb_build_object(
        'ok', true, 'batch_id', v_batch_id, 'batch_uuid', v_batch_uuid,
        'status', v_status, 'linked_count', v_linked_count,
        'trigger_source', v_trigger_source
    );
END;
$function$;

-- Only the service-role (edge function) may call this; strip the implicit PUBLIC grant.
REVOKE EXECUTE ON FUNCTION public.record_valor_batch_webhook(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_valor_batch_webhook(jsonb) TO service_role;

COMMENT ON FUNCTION public.record_valor_batch_webhook(jsonb) IS
    'Records a Valor batch_summary webhook as a settled settlement_batches row (EPI-keyed, batch_number-matched). Idempotent, self-auditing, dead-letters unknown EPIs. Called by the valor-webhook edge function after HMAC verification.';
