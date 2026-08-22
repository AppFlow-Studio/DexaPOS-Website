-- =====================================================================
-- Valor batch-out ↔ webhook auto-settle: make both paths coexist
-- =====================================================================
-- Problem: 20260816171810 extended _lazy_settlement_batch_link (BEFORE INSERT on
-- order_payments) to Valor, so every Valor capture is born pinned to an 'open'
-- serial-keyed batch (LAZY-VALOR-<serial>-<batchNo>-E<epoch>). The POS on-terminal
-- batch-out (prepare_valor_settlement) still pins only settlement_batch_id IS NULL
-- rows and only auto-resets 'pending' batches, so it now finds 0 rows and raises
-- "No unsettled captured Valor payments found for terminal" for every Valor batch.
--
-- Goal: support BOTH the POS on-terminal batch-out AND the webhook auto-settle,
-- converging on the SAME settlement_batches row (no duplicate rows, no double
-- settle). prepare ADOPTS the open batch instead of minting a second one; POS
-- stamps origin='pos_manual' so the webhook recognizes a POS-owned batch; the
-- webhook short-circuits when a (terminal, batch_number) is already settled.
--
-- Backward-compatible by construction: prepare branches on DATA STATE, not env.
-- On prod (Valor lazy-link not yet applied) there is no open Valor batch, so
-- prepare falls back to the legacy mint-new-VLR + pin-IS-NULL path unchanged.
-- =====================================================================

-- 1a) prepare_valor_settlement: adopt the open batch, else mint (legacy) --------
CREATE OR REPLACE FUNCTION public.prepare_valor_settlement(p_terminal_id uuid, p_merchant_id uuid, p_initiated_by text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_terminal      record;
    v_batch         record;
    v_open_count    integer;
    v_batch_uuid    uuid;
    v_batch_id      text;
    v_batch_seq     integer;
    v_count         integer;
    v_date_start    date;
    v_date_end      date;
    v_gross         numeric(10,2);
    v_tips          numeric(10,2);
    v_total         numeric(10,2);
    v_branch        text;
BEGIN
    SELECT * INTO v_terminal FROM public.payment_terminals WHERE id = p_terminal_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Terminal not found: %', p_terminal_id; END IF;
    IF v_terminal.merchant_id != p_merchant_id THEN
        RAISE EXCEPTION 'Access denied: terminal % does not belong to merchant %', p_terminal_id, p_merchant_id;
    END IF;

    -- Crash recovery: a POS settle that moved a batch to 'settling' but never
    -- finalized (crash/timeout) reverts to 'open' so the webhook or a manual retry
    -- can pick it up (payments stay pinned).
    UPDATE public.settlement_batches
    SET status = 'open', updated_at = NOW()
    WHERE payment_terminal_id = p_terminal_id AND processor = 'valor'
      AND status = 'settling' AND updated_at < (NOW() - INTERVAL '10 minutes');

    -- Legacy: reset a stale 'pending' POS Valor batch and release its pins so the
    -- mint branch below can re-pin. Never touch webhook-owned rows.
    UPDATE public.settlement_batches
    SET status = 'failed',
        failure_reason = 'Auto-reset: prepare ran but the Valor terminal was never settled (crash/timeout). Safe to retry.',
        updated_at = NOW()
    WHERE payment_terminal_id = p_terminal_id AND processor = 'valor'
      AND status = 'pending' AND opened_at < (NOW() - INTERVAL '10 minutes')
      AND origin IS DISTINCT FROM 'valor_webhook';
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

    -- Branch on how many OPEN Valor batches this terminal has.
    SELECT COUNT(*) INTO v_open_count
    FROM public.settlement_batches
    WHERE payment_terminal_id = p_terminal_id AND processor = 'valor' AND status = 'open';

    IF v_open_count > 1 THEN
        -- Ambiguous: we can't know which host batch the terminal will close.
        RETURN jsonb_build_object(
            'branch', 'needs_manual', 'nothing_to_settle', false, 'payment_count', 0,
            'message', format('Multiple open Valor batches (%s) for this terminal. Reconcile manually.', v_open_count)
        );
    ELSIF v_open_count = 1 THEN
        -- ADOPT: lazy-link (or backfill) opened a batch on capture. Settle that row.
        v_branch := 'adopted_open';
        SELECT * INTO v_batch
        FROM public.settlement_batches
        WHERE payment_terminal_id = p_terminal_id AND processor = 'valor' AND status = 'open'
        LIMIT 1 FOR UPDATE;
        v_batch_uuid := v_batch.id;
        v_batch_id   := v_batch.batch_id;

        -- Sweep stragglers: unpinned captured Valor payments for this terminal and
        -- the same host batch_number that lazy-link hasn't linked yet.
        UPDATE public.order_payments SET settlement_batch_id = v_batch_uuid
        WHERE terminal_id = p_terminal_id::text
          AND terminal_type = 'valor'
          AND merchant_id = p_merchant_id
          AND is_settled = false
          AND status IN ('captured','partially_refunded')
          AND NOT COALESCE(is_voided, false)
          AND settlement_batch_id IS NULL
          AND (v_batch.batch_number IS NULL OR batch_number = v_batch.batch_number);
    ELSE
        -- MINT (legacy / prod-without-Valor-lazy-link, or all already settled):
        -- create a fresh VLR- batch and pin the currently-unpinned captured rows.
        v_branch := 'minted_new';
        SELECT COUNT(*) + 1 INTO v_batch_seq FROM public.settlement_batches WHERE payment_terminal_id = p_terminal_id;
        v_batch_id := 'VLR-' || UPPER(LEFT(REPLACE(p_terminal_id::text, '-', ''), 8))
            || '-' || TO_CHAR(NOW() AT TIME ZONE 'America/New_York', 'YYYYMMDD')
            || '-' || LPAD(v_batch_seq::text, 3, '0');
        INSERT INTO public.settlement_batches (
            batch_id, processor, origin, merchant_id, location_id, payment_terminal_id, terminal_id,
            business_date, status, opened_at, created_at, updated_at
        ) VALUES (
            v_batch_id, 'valor', 'pos_manual', p_merchant_id, v_terminal.location_id, p_terminal_id, p_terminal_id::text,
            (NOW() AT TIME ZONE 'America/New_York')::date, 'settling', NOW(), NOW(), NOW()
        ) RETURNING id INTO v_batch_uuid;

        UPDATE public.order_payments SET settlement_batch_id = v_batch_uuid
        WHERE terminal_id = p_terminal_id::text
          AND terminal_type = 'valor'
          AND merchant_id = p_merchant_id
          AND is_settled = false
          AND status IN ('captured','partially_refunded')
          AND NOT COALESCE(is_voided, false)
          AND settlement_batch_id IS NULL;
    END IF;

    -- Authoritative counts/totals FROM the pinned membership.
    SELECT COUNT(*), MIN(captured_at::date), MAX(captured_at::date),
           COALESCE(SUM(amount),0), COALESCE(SUM(tip_amount),0), COALESCE(SUM(total_amount),0)
    INTO v_count, v_date_start, v_date_end, v_gross, v_tips, v_total
    FROM public.order_payments
    WHERE settlement_batch_id = v_batch_uuid
      AND is_settled = false
      AND status IN ('captured','partially_refunded')
      AND NOT COALESCE(is_voided, false);

    IF v_count = 0 THEN
        -- Nothing settle-able. Roll back a just-minted empty batch; leave an
        -- adopted (still-open) batch untouched for the webhook / a later retry.
        IF v_branch = 'minted_new' THEN
            DELETE FROM public.settlement_batches WHERE id = v_batch_uuid;
        END IF;
        RETURN jsonb_build_object(
            'branch', 'nothing_to_settle', 'nothing_to_settle', true, 'payment_count', 0,
            'batch_uuid', CASE WHEN v_branch = 'adopted_open' THEN v_batch_uuid ELSE NULL END
        );
    END IF;

    -- Stamp counts + move to 'settling'; mark POS ownership so the webhook
    -- recognizes this batch as POS-owned and won't mint a duplicate.
    UPDATE public.settlement_batches
    SET status = 'settling', origin = COALESCE(origin, 'pos_manual'),
        transaction_count = v_count, sales_count = v_count,
        gross_amount = v_gross, tip_amount = v_tips, net_deposit = v_total,
        business_date_start = v_date_start, business_date_end = v_date_end, updated_at = NOW()
    WHERE id = v_batch_uuid;

    RETURN jsonb_build_object(
        'branch', v_branch, 'nothing_to_settle', false,
        'batch_uuid', v_batch_uuid, 'batch_id', v_batch_id, 'processor', 'valor',
        'payment_count', v_count, 'gross_amount', v_gross, 'tip_amount', v_tips, 'total_amount', v_total,
        'date_range', jsonb_build_object('start', v_date_start, 'end', v_date_end)
    );
END;
$function$;

-- 1b) finalize_valor_settlement: adopt-safe (open guard, batch_number assert, ---
--     idempotent-when-already-settled, decline reverts to open) -----------------
CREATE OR REPLACE FUNCTION public.finalize_valor_settlement(p_batch_uuid uuid, p_merchant_id uuid, p_valor_response jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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

    -- Idempotent replay: already settled (POS re-fire OR the webhook won the race).
    -- The money is settled; never RAISE, regardless of this response's STATE.
    IF v_batch.status = 'settled' THEN
        UPDATE public.settlement_batches
        SET raw_response = COALESCE(raw_response, p_valor_response),
            batch_number = COALESCE(batch_number, v_batch_no), updated_at = NOW()
        WHERE id = p_batch_uuid;
        RETURN jsonb_build_object('success', true, 'status', 'settled', 'batch_id', v_batch.batch_id,
            'processor', 'valor', 'should_retry', false, 'requires_support', false, 'idempotent_replay', true);
    END IF;

    IF v_batch.status NOT IN ('open','pending','settling','retry','failed','needs_review') THEN
        RAISE EXCEPTION 'Batch % is in status %. Expected open/pending/settling/retry/failed/needs_review.', p_batch_uuid, v_batch.status;
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

        -- When the adopted row already carries a host batch_number, the terminal's
        -- closed BATCH_NO must agree — otherwise we'd settle the wrong membership.
        IF v_batch.batch_number IS NOT NULL AND v_batch_no IS NOT NULL AND v_batch_no <> v_batch.batch_number THEN
            v_reason := format('Batch number mismatch: terminal closed %s, batch pinned %s. Manual review required.',
                v_batch_no, v_batch.batch_number);
            UPDATE public.settlement_batches
            SET status = 'needs_review', raw_response = p_valor_response,
                failure_reason = v_reason, last_attempt_at = NOW(), retry_count = retry_count + 1, updated_at = NOW()
            WHERE id = p_batch_uuid;
            RETURN jsonb_build_object('success', false, 'status', 'needs_review', 'batch_id', v_batch.batch_id,
                'processor', 'valor', 'should_retry', false, 'requires_support', true, 'error', v_reason);
        END IF;

        UPDATE public.settlement_batches
        SET status = 'settled', origin = COALESCE(origin, 'pos_manual'),
            closed_at = NOW(), settlement_date = CURRENT_DATE,
            batch_number = COALESCE(batch_number, v_batch_no), raw_response = p_valor_response,
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
        -- Terminal declined (often: already auto-batched host-side). Revert to
        -- 'open' and KEEP the pins so the Valor webhook settles it on the host
        -- auto-batch, or a manual retry re-adopts it. No auto-retry.
        UPDATE public.settlement_batches
        SET status = 'open', raw_response = p_valor_response,
            failure_reason = COALESCE(p_valor_response->>'ERROR_MSG', 'Valor settlement declined; reverted to open for webhook/retry.'),
            last_attempt_at = NOW(), retry_count = retry_count + 1, updated_at = NOW()
        WHERE id = p_batch_uuid;
        RETURN jsonb_build_object('success', false, 'status', 'open', 'batch_id', v_batch.batch_id,
            'processor', 'valor', 'should_retry', false, 'requires_support', false,
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
$function$;

-- 1c) record_valor_batch_webhook: recognize a POS-settled batch (no duplicate) --
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
        v_gross  := COALESCE(NULLIF(v_data->>'purchase_amount', '')::numeric, 0);
        v_tip    := COALESCE(NULLIF(v_data->>'tip_amount', '')::numeric, 0);
        v_refund := COALESCE(NULLIF(v_data->>'refund_amount', '')::numeric, 0);
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
