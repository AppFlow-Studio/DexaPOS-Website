-- Settle Valor online-order payments from the batch webhook.
--
-- Problem: record_valor_batch_webhook resolved the EPI only against
-- payment_terminals. An online order has no terminal; its EPI lives on
-- merchant_processor_accounts (purpose = 'online_order'). Every batch summary
-- for such an EPI was dead-lettered as unknown_epi, so online Valor payments
-- were captured but never marked settled (prod 2026-09-29: 0 of 5).
--
-- Change:
--   * New record_valor_online_batch_webhook(jsonb): resolves the EPI to its
--     online-order account, finds or creates the settlement batch, links the
--     payments and settles it. The existing cascade trigger then flips
--     is_settled. No schema change: the batch is keyed by a synthetic serial
--     ('VT-' || epi), which the existing host-key unique index already covers.
--   * record_valor_batch_webhook: when no terminal owns the EPI it now delegates
--     to the function above instead of dead-lettering. The terminal path is
--     otherwise byte-identical to the function live on staging and prod.
--
-- Online payments are stored with batch_number NULL; Valor's sale response
-- carries batch_no, so the match uses either and records it while linking.

CREATE OR REPLACE FUNCTION public.record_valor_online_batch_webhook(p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_data           jsonb;
    v_epi            text;
    v_batch_no       text;
    v_batches_id     text;
    v_trigger_source text;
    v_opened_at      timestamptz;
    v_closed_at      timestamptz;
    v_gross          numeric(12,2);
    v_tip            numeric(12,2);
    v_refund         numeric(12,2);
    v_account_count  integer;
    v_account        record;
    v_serial         text;
    v_existing       record;
    v_adopt          boolean := false;
    v_epoch          integer := 1;
    v_batch_uuid     uuid;
    v_batch_id       text;
    v_batch_seq      integer;
    v_linked_count   integer;
    v_linked_total   numeric(12,2);
    v_status         text;
    v_reason         text;
BEGIN
    v_data := COALESCE(p_payload->'data', p_payload);
    v_epi        := NULLIF(v_data->>'epi_id', '');
    v_batch_no   := NULLIF(v_data->>'batch_no', '');
    v_batches_id := NULLIF(v_data->>'batches_id', '');
    v_trigger_source := v_data->>'trigger_source';

    IF v_epi IS NULL OR v_batch_no IS NULL THEN
        INSERT INTO public.webhook_dead_letter_queue (source, event_type, raw_payload, error_message)
        VALUES ('valor', 'batch_summary', p_payload, 'Missing epi_id or batch_no');
        RETURN jsonb_build_object('ok', false, 'reason', 'missing_fields');
    END IF;

    SELECT COUNT(*) INTO v_account_count
    FROM public.merchant_processor_accounts a
    WHERE a.processor = 'valor'
      AND a.purpose = 'online_order'
      AND a.is_active
      AND a.valor_epi = v_epi;

    IF v_account_count = 0 THEN
        INSERT INTO public.webhook_dead_letter_queue (source, event_type, raw_payload, error_message)
        VALUES ('valor', 'batch_summary', p_payload, format('Unknown Valor EPI: %s', v_epi));
        RETURN jsonb_build_object('ok', false, 'reason', 'unknown_epi', 'epi', v_epi);
    END IF;

    -- One Valor batch becomes one settlement batch, which belongs to one
    -- location. An EPI shared by several accounts cannot be attributed.
    IF v_account_count > 1 THEN
        INSERT INTO public.webhook_dead_letter_queue (source, event_type, raw_payload, error_message)
        VALUES ('valor', 'batch_summary', p_payload,
            format('Valor EPI %s is shared by %s online-order accounts', v_epi, v_account_count));
        RETURN jsonb_build_object('ok', false, 'reason', 'ambiguous_epi', 'epi', v_epi);
    END IF;

    SELECT a.id, a.merchant_id, a.location_id INTO v_account
    FROM public.merchant_processor_accounts a
    WHERE a.processor = 'valor'
      AND a.purpose = 'online_order'
      AND a.is_active
      AND a.valor_epi = v_epi;

    IF v_account.location_id IS NULL THEN
        INSERT INTO public.webhook_dead_letter_queue (source, event_type, raw_payload, error_message)
        VALUES ('valor', 'batch_summary', p_payload,
            format('Online-order account for Valor EPI %s has no location', v_epi));
        RETURN jsonb_build_object('ok', false, 'reason', 'account_without_location', 'epi', v_epi);
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

    -- An online order has no device, so the EPI stands in for the serial number.
    -- That puts these batches under uq_settlement_batches_host_key like any other.
    v_serial := 'VT-' || v_epi;

    SELECT * INTO v_existing
    FROM public.settlement_batches
    WHERE merchant_id = v_account.merchant_id
      AND serial_number = v_serial
      AND batch_number = v_batch_no
    ORDER BY batch_epoch DESC, created_at DESC
    LIMIT 1;

    IF FOUND THEN
        IF v_existing.status = 'settled' THEN
            -- Valor's batches_id names one batch. Same id (or none to compare) is a
            -- redelivery; a different id means the host's batch counter restarted.
            IF v_batches_id IS NULL
               OR COALESCE(v_existing.raw_response->'data'->>'batches_id',
                           v_existing.raw_response->>'batches_id') IS NOT DISTINCT FROM v_batches_id THEN
                RETURN jsonb_build_object('ok', true, 'idempotent_replay', true,
                    'batch_id', v_existing.batch_id, 'status', 'settled');
            END IF;
            v_epoch := v_existing.batch_epoch + 1;
        ELSE
            v_adopt := true;
        END IF;
    END IF;

    IF v_adopt THEN
        v_batch_uuid := v_existing.id;
        v_batch_id   := v_existing.batch_id;
    ELSE
        SELECT COUNT(*) + 1 INTO v_batch_seq
        FROM public.settlement_batches
        WHERE merchant_id = v_account.merchant_id AND serial_number = v_serial;

        v_batch_id := 'VLR-VT' || RIGHT(v_epi, 6)
            || '-' || TO_CHAR(COALESCE(v_closed_at, now()), 'YYYYMMDD')
            || '-' || LPAD(v_batch_seq::text, 3, '0');

        INSERT INTO public.settlement_batches (
            batch_id, processor, origin, acquirer, merchant_id, location_id,
            payment_terminal_id, terminal_id, serial_number,
            business_date, batch_number, batch_epoch, status, opened_at, closed_at, created_at, updated_at
        ) VALUES (
            v_batch_id, 'valor', 'valor_webhook', 'VALOR', v_account.merchant_id, v_account.location_id,
            NULL, NULL, v_serial,
            COALESCE(v_closed_at::date, CURRENT_DATE), v_batch_no, v_epoch, 'pending',
            COALESCE(v_opened_at, now()), v_closed_at, now(), now()
        ) RETURNING id INTO v_batch_uuid;
    END IF;

    -- Online payments are stored without batch_number; Valor's sale response
    -- carries it, so match on either and record it on the way through.
    UPDATE public.order_payments op
    SET settlement_batch_id = v_batch_uuid,
        batch_number = COALESCE(op.batch_number, v_batch_no)
    WHERE op.terminal_id IS NULL
      AND op.processor_name = 'valor'
      AND op.merchant_id = v_account.merchant_id
      AND op.location_id = v_account.location_id
      AND op.processor_response->>'epi' = v_epi
      AND COALESCE(op.batch_number, op.processor_response->>'batch_no') = v_batch_no
      AND op.is_settled = false
      AND op.settlement_batch_id IS NULL
      AND op.status IN ('captured', 'partially_refunded')
      AND NOT COALESCE(op.is_voided, false);

    SELECT COUNT(*), COALESCE(SUM(amount), 0)
    INTO v_linked_count, v_linked_total
    FROM public.order_payments WHERE settlement_batch_id = v_batch_uuid;

    -- order_payments.amount is the full charge, tip included. Valor may report
    -- that as purchase_amount alone or split across purchase_amount + tip_amount.
    IF v_gross > 0 AND v_linked_count = 0 THEN
        v_status := 'needs_review';
        v_reason := format('Auto-batch summary gross %s but no captured online payments matched batch_number %s.', v_gross, v_batch_no);
    ELSIF v_linked_count > 0 AND v_gross > 0
          AND abs(v_linked_total - v_gross) > 0.01
          AND abs(v_linked_total - (v_gross + v_tip)) > 0.01 THEN
        v_status := 'needs_review';
        v_reason := format('Amount mismatch: linked payments %s vs summary gross %s + tip %s (batch %s).', v_linked_total, v_gross, v_tip, v_batch_no);
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
            v_account.merchant_id, v_account.location_id,
            CASE WHEN v_status = 'settled' THEN 'success' ELSE 'failed' END,
            jsonb_build_object(
                'source', 'valor_webhook', 'origin', 'valor_webhook', 'processor', 'valor',
                'channel', 'online_order', 'processor_account_id', v_account.id,
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
        'trigger_source', v_trigger_source, 'channel', 'online_order'
    );
END;
$function$;

revoke all on function public.record_valor_online_batch_webhook(jsonb) from public, anon, authenticated;
grant execute on function public.record_valor_online_batch_webhook(jsonb) to service_role;

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
        -- No terminal owns this EPI. An online-order account (the location's
        -- virtual terminal) may; that path also dead-letters an unknown EPI.
        RETURN public.record_valor_online_batch_webhook(p_payload);
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
