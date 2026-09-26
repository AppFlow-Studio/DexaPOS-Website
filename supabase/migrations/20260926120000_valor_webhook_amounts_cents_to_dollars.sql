-- Fix: Valor batch-summary webhook amounts stored 100x too large (cents -> dollars).
--
-- Valor sends batch-summary money fields (purchase_amount / tip_amount / refund_amount)
-- in CENTS (minor units), consistent with the sale API (_shared/valor.ts:formatMinorUnits)
-- and the HQ terminal modal (PaymentDeviceDetailView.tsx:centsToUsd, "Valor sends money in CENTS").
-- record_valor_batch_webhook was casting them straight to numeric and writing them into
-- settlement_batches.{gross_amount,tip_amount,refund_amount,net_deposit} (numeric(10,2) dollars)
-- WITHOUT dividing by 100 -- so a real $87.38 deposit was stored/reported as $8,738.00.
--
-- Empirically confirmed: backend processor deposit $87.38 = 8738 / 100. Valor's batch-summary
-- webhook units are not explicitly documented, so the /100 is justified by evidence + codebase
-- precedent rather than an explicit Valor spec.
--
-- This migration:
--   1. CREATE OR REPLACE record_valor_batch_webhook -- body identical to
--      20260816200000_valor_prepare_adopt_open_batch.sql, with ONLY the three amount casts
--      divided by 100 (so stored amounts are dollars, aligned with order_payments.amount).
--   2. One-time backfill: divide existing origin='valor_webhook' batch amounts by 100.
--      NOT idempotent -- must run exactly once. Manual settlement rows use a different origin
--      and are untouched.

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
    v_data := COALESCE(p_payload->'data', p_payload);
    v_epi      := NULLIF(v_data->>'epi_id', '');
    v_batch_no := NULLIF(v_data->>'batch_no', '');
    v_trigger_source := v_data->>'trigger_source';

    IF v_epi IS NULL OR v_batch_no IS NULL THEN
        INSERT INTO public.webhook_dead_letter_queue (source, event_type, raw_payload, error_message)
        VALUES ('valor', 'batch_summary', p_payload, 'Missing epi_id or batch_no');
        RETURN jsonb_build_object('ok', false, 'reason', 'missing_fields');
    END IF;

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

    -- Short-circuit: if the MOST RECENT batch for this (terminal, batch_number) is
    -- already settled — e.g. the POS on-terminal batch-out just closed it — this
    -- webhook is the host's confirmation of the same close, so do NOT mint a second
    -- row. Scoped to the latest row (not "any settled row") so Valor batch_number
    -- reuse across epochs still works: a newer OPEN batch #8 is not short-circuited
    -- by an older SETTLED batch #8.
    IF (
        SELECT status FROM public.settlement_batches
        WHERE payment_terminal_id = v_terminal.id AND batch_number = v_batch_no
        ORDER BY created_at DESC LIMIT 1
    ) = 'settled' THEN
        RETURN jsonb_build_object('ok', true, 'idempotent_replay', true,
            'reason', 'already_settled', 'batch_number', v_batch_no);
    END IF;

    BEGIN
        v_opened_at := NULLIF(v_data->>'batch_opened_at', '')::timestamptz;
        v_closed_at := NULLIF(v_data->>'batch_closed_at', '')::timestamptz;
        -- Valor sends these in CENTS (minor units); settlement_batches columns are dollars.
        v_gross  := COALESCE(NULLIF(v_data->>'purchase_amount', '')::numeric, 0) / 100;
        v_tip    := COALESCE(NULLIF(v_data->>'tip_amount', '')::numeric, 0) / 100;
        v_refund := COALESCE(NULLIF(v_data->>'refund_amount', '')::numeric, 0) / 100;
    EXCEPTION WHEN others THEN
        INSERT INTO public.webhook_dead_letter_queue (source, event_type, raw_payload, error_message)
        VALUES ('valor', 'batch_summary', p_payload, 'Unparseable summary amounts/timestamps');
        RETURN jsonb_build_object('ok', false, 'reason', 'parse_error');
    END;

    -- Adopt an already-open batch for this (terminal, batch_number) if one exists.
    -- lazy-link opens one on first capture (and the backfill may have too). Prefer
    -- an existing origin='valor_webhook' row first so a genuine replay short-circuits
    -- below and we never create a 2nd webhook row (uq_valor_webhook_batch). When no
    -- webhook row exists yet, adopt the most-recent non-settled open/pending/review row.
    SELECT * INTO v_existing
    FROM public.settlement_batches
    WHERE payment_terminal_id = v_terminal.id
      AND batch_number = v_batch_no
      AND (origin = 'valor_webhook'
           OR status IN ('open','pending','settling','retry','needs_review'))
    ORDER BY (origin = 'valor_webhook') DESC NULLS LAST, created_at DESC
    LIMIT 1;

    IF FOUND AND v_existing.status = 'settled' THEN
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

    IF v_gross > 0 AND v_linked_count = 0 THEN
        v_status := 'needs_review';
        v_reason := format('Auto-batch summary gross %s but no captured payments matched batch_number %s.', v_gross, v_batch_no);
    ELSIF v_linked_count > 0 AND v_gross > 0 AND abs(v_linked_total - v_gross) > 0.01 THEN
        v_status := 'needs_review';
        v_reason := format('Amount mismatch: linked payments %s vs summary gross %s (batch %s).', v_linked_total, v_gross, v_batch_no);
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
        NULL;
    END;

    RETURN jsonb_build_object(
        'ok', true, 'batch_id', v_batch_id, 'batch_uuid', v_batch_uuid,
        'status', v_status, 'linked_count', v_linked_count,
        'trigger_source', v_trigger_source
    );
END;
$function$;

-- One-time backfill: repair existing webhook-origin batches stored 100x too large.
-- Scoped to origin='valor_webhook' (manual settlement uses a different origin). NOT idempotent —
-- runs exactly once as part of this migration; do NOT re-run.
UPDATE public.settlement_batches
SET gross_amount  = gross_amount  / 100,
    tip_amount    = tip_amount    / 100,
    refund_amount = refund_amount / 100,
    net_deposit   = net_deposit   / 100,
    updated_at    = now()
WHERE origin = 'valor_webhook';
