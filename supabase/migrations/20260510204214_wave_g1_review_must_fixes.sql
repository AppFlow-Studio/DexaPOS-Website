CREATE OR REPLACE FUNCTION public._cascade_is_settled_on_batch_close()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
    IF NEW.status IN ('settled','closed','funded')
       AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN
        UPDATE public.order_payments
           SET is_settled = true,
               settled_at = COALESCE(NEW.closed_at, settled_at, now())
         WHERE settlement_batch_id = NEW.id
           AND is_settled = false;
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public._lazy_settlement_batch_link()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
    v_existing_id uuid;
    v_existing_status text;
    v_business_date date;
    v_lazy_batch_id text;
    v_terminal_uuid uuid;
BEGIN
    IF NEW.settlement_batch_id IS NOT NULL THEN RETURN NEW; END IF;
    IF NEW.acquirer IS NULL OR NEW.batch_number IS NULL THEN RETURN NEW; END IF;
    IF NEW.terminal_id IS NULL THEN RETURN NEW; END IF;
    IF NEW.terminal_type::text NOT IN ('castles','dejavoo') THEN RETURN NEW; END IF;
    IF NEW.terminal_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN RETURN NEW; END IF;

    v_terminal_uuid := NEW.terminal_id::uuid;

    SELECT id, status INTO v_existing_id, v_existing_status
    FROM public.settlement_batches
    WHERE payment_terminal_id = v_terminal_uuid
      AND merchant_id = NEW.merchant_id
      AND acquirer = NEW.acquirer
      AND batch_number = NEW.batch_number
    LIMIT 1;

    IF v_existing_id IS NOT NULL AND v_existing_status IN ('pending','settling') THEN
        RETURN NEW;
    END IF;

    IF v_existing_id IS NULL THEN
        v_business_date := (COALESCE(NEW.captured_at, now()) AT TIME ZONE 'America/New_York')::date;
        v_lazy_batch_id := 'LAZY-' || NEW.acquirer || '-' || NEW.terminal_id || '-' || NEW.batch_number;

        INSERT INTO public.settlement_batches (
            batch_id, merchant_id, location_id, payment_terminal_id,
            acquirer, batch_number,
            business_date, business_date_start, business_date_end,
            opened_at, status, retry_count
        ) VALUES (
            v_lazy_batch_id, NEW.merchant_id, NEW.location_id, v_terminal_uuid,
            NEW.acquirer, NEW.batch_number,
            v_business_date, v_business_date, v_business_date,
            COALESCE(NEW.captured_at, now()), 'open', 0
        )
        ON CONFLICT (payment_terminal_id, merchant_id, acquirer, batch_number)
            WHERE batch_number IS NOT NULL
        DO NOTHING
        RETURNING id INTO v_existing_id;

        IF v_existing_id IS NULL THEN
            SELECT id INTO v_existing_id
            FROM public.settlement_batches
            WHERE payment_terminal_id = v_terminal_uuid
              AND merchant_id = NEW.merchant_id
              AND acquirer = NEW.acquirer
              AND batch_number = NEW.batch_number
            LIMIT 1;
        END IF;
    END IF;

    NEW.settlement_batch_id := v_existing_id;
    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public._lazy_settlement_batch_link IS
    'BEFORE INSERT trigger on order_payments. Find-or-creates a settlement_batches row keyed by (payment_terminal_id, merchant_id, acquirer, batch_number) via the partial unique index uq_settlement_batches_host_key WHERE batch_number IS NOT NULL and stamps NEW.settlement_batch_id. Skips: rows with existing settlement_batch_id, missing acquirer/batch_number/terminal_id, terminal_type not in (castles,dejavoo), non-UUID terminal_id, and (Wave G.1 race guard) batches currently in pending/settling.';

CREATE OR REPLACE FUNCTION public.prepare_castles_settlement(
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
    v_terminal          record;
    v_batch             record;
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
    v_is_host_keyed     boolean := false;
    v_safety_iter       integer := 0;
BEGIN
    SELECT * INTO v_terminal FROM public.payment_terminals WHERE id = p_terminal_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Terminal not found: %', p_terminal_id; END IF;
    IF v_terminal.merchant_id != p_merchant_id THEN
        RAISE EXCEPTION 'Access denied: terminal % does not belong to merchant %', p_terminal_id, p_merchant_id;
    END IF;

    UPDATE public.settlement_batches
    SET status='closed', closed_at=NOW(),
        failure_reason='Auto-closed: cross-merchant host batch on terminal (data hygiene).',
        updated_at=NOW()
    WHERE payment_terminal_id=p_terminal_id
      AND status='open'
      AND acquirer IS NOT NULL
      AND batch_number IS NOT NULL
      AND merchant_id != p_merchant_id;

    UPDATE public.settlement_batches
    SET status='failed',
        failure_reason='Auto-reset: prepare was called but the Castles device was never contacted (app crash or timeout). Safe to retry.',
        updated_at=NOW()
    WHERE payment_terminal_id=p_terminal_id AND status='pending' AND opened_at < (NOW() - INTERVAL '10 minutes');

    UPDATE public.order_payments op SET settlement_batch_id=NULL
    FROM public.settlement_batches sb
    WHERE op.settlement_batch_id=sb.id AND sb.payment_terminal_id=p_terminal_id AND sb.status='failed' AND sb.acquirer IS NULL;

    UPDATE public.settlement_batches SET status='open', updated_at=NOW()
    WHERE payment_terminal_id=p_terminal_id
      AND status IN ('failed','partial_failure')
      AND acquirer IS NOT NULL
      AND merchant_id = p_merchant_id;

    IF EXISTS (SELECT 1 FROM public.settlement_batches WHERE payment_terminal_id=p_terminal_id AND status IN ('pending','settling') AND merchant_id=p_merchant_id) THEN
        RAISE EXCEPTION 'A settlement is already in progress for terminal %. Wait or check for a stuck batch.', p_terminal_id;
    END IF;

    LOOP
        v_safety_iter := v_safety_iter + 1;
        IF v_safety_iter > 50 THEN EXIT; END IF;

        SELECT * INTO v_batch FROM public.settlement_batches
        WHERE payment_terminal_id=p_terminal_id
          AND merchant_id=p_merchant_id
          AND status='open'
          AND acquirer IS NOT NULL
          AND batch_number IS NOT NULL
        ORDER BY opened_at ASC LIMIT 1 FOR UPDATE;

        IF NOT FOUND THEN EXIT; END IF;

        SELECT COUNT(*), MIN(captured_at::date), MAX(captured_at::date),
               COALESCE(SUM(amount),0), COALESCE(SUM(tip_amount),0), COALESCE(SUM(total_amount),0)
        INTO v_payment_count, v_date_start, v_date_end, v_gross, v_tips, v_total
        FROM public.order_payments
        WHERE settlement_batch_id=v_batch.id AND status='captured' AND is_settled=false;

        IF v_payment_count > 0 THEN
            v_is_host_keyed := true;
            v_batch_uuid := v_batch.id;
            v_batch_id := v_batch.batch_id;
            EXIT;
        END IF;

        UPDATE public.settlement_batches
        SET status='closed', closed_at=NOW(),
            failure_reason='Auto-closed by prepare: host batch has no eligible payments (drained via voids/refunds or backfill orphan).',
            updated_at=NOW()
        WHERE id=v_batch.id;
    END LOOP;

    IF v_is_host_keyed THEN
        v_next_pos_txn_int := ((COALESCE(v_terminal.castles_last_pos_txn_id,'000000')::integer % 999999) + 1);
        v_pos_txn_id := LPAD(v_next_pos_txn_int::text,6,'0');

        UPDATE public.payment_terminals SET castles_last_pos_txn_id=v_pos_txn_id, updated_at=NOW() WHERE id=p_terminal_id;

        UPDATE public.settlement_batches
        SET status='pending', transaction_count=v_payment_count, gross_amount=v_gross,
            tip_amount=v_tips, net_deposit=v_total,
            business_date_start=v_date_start, business_date_end=v_date_end,
            castles_pos_txn_id=v_pos_txn_id, updated_at=NOW()
        WHERE id=v_batch_uuid;

    ELSE
        SELECT COUNT(*), MIN(op.captured_at::date), MAX(op.captured_at::date),
               COALESCE(SUM(op.amount),0), COALESCE(SUM(op.tip_amount),0), COALESCE(SUM(op.total_amount),0)
        INTO v_payment_count, v_date_start, v_date_end, v_gross, v_tips, v_total
        FROM public.order_payments op
        WHERE op.terminal_id=p_terminal_id::text AND op.terminal_type='castles'
          AND op.merchant_id=p_merchant_id
          AND op.is_settled=false AND op.status='captured' AND op.settlement_batch_id IS NULL;

        IF v_payment_count = 0 THEN
            RAISE EXCEPTION 'No unsettled captured payments found for terminal %. All transactions may already be settled or none have been captured yet.', p_terminal_id;
        END IF;

        SELECT COUNT(*)+1 INTO v_batch_seq FROM public.settlement_batches WHERE payment_terminal_id=p_terminal_id;

        v_batch_id := 'DEXA-' || UPPER(LEFT(REPLACE(p_terminal_id::text,'-',''),8))
            || '-' || TO_CHAR(NOW() AT TIME ZONE 'America/New_York','YYYYMMDD')
            || '-' || LPAD(v_batch_seq::text,3,'0');

        v_next_pos_txn_int := ((COALESCE(v_terminal.castles_last_pos_txn_id,'000000')::integer % 999999) + 1);
        v_pos_txn_id := LPAD(v_next_pos_txn_int::text,6,'0');

        UPDATE public.payment_terminals SET castles_last_pos_txn_id=v_pos_txn_id, updated_at=NOW() WHERE id=p_terminal_id;

        INSERT INTO public.settlement_batches (
            batch_id, merchant_id, location_id, payment_terminal_id, terminal_id,
            business_date, business_date_start, business_date_end,
            transaction_count, gross_amount, tip_amount, net_deposit,
            status, castles_pos_txn_id, opened_at, created_at, updated_at
        ) VALUES (
            v_batch_id, p_merchant_id, v_terminal.location_id, p_terminal_id, p_terminal_id::text,
            (NOW() AT TIME ZONE 'America/New_York')::date, v_date_start, v_date_end,
            v_payment_count, v_gross, v_tips, v_total,
            'pending', v_pos_txn_id, NOW(), NOW(), NOW()
        ) RETURNING id INTO v_batch_uuid;

        UPDATE public.order_payments SET settlement_batch_id=v_batch_uuid
        WHERE terminal_id=p_terminal_id::text AND terminal_type='castles'
          AND merchant_id=p_merchant_id
          AND is_settled=false AND status='captured' AND settlement_batch_id IS NULL;
    END IF;

    RETURN jsonb_build_object(
        'batch_uuid', v_batch_uuid, 'batch_id', v_batch_id, 'host_keyed', v_is_host_keyed,
        'payment_count', v_payment_count, 'gross_amount', v_gross, 'tip_amount', v_tips, 'total_amount', v_total,
        'date_range', jsonb_build_object('start', v_date_start, 'end', v_date_end),
        'castles_request', jsonb_build_object('txnPosTxnId', v_pos_txn_id, 'txnType', 'settlement')
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.finalize_castles_settlement(
    p_batch_uuid uuid,
    p_merchant_id uuid,
    p_castles_response jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
    v_batch             record;
    v_return_code       text;
    v_final_status      text;
    v_settle_entry      jsonb;
    v_all_acquirers_ok  boolean := true;
    v_any_acquirer_ok   boolean := false;
    v_failed_acquirers  jsonb   := '[]'::jsonb;
    v_settled_acquirers jsonb   := '[]'::jsonb;
    v_is_host_keyed     boolean;
    v_response_is_ok    boolean;
BEGIN
    SELECT * INTO v_batch FROM public.settlement_batches WHERE id=p_batch_uuid FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Settlement batch not found: %', p_batch_uuid; END IF;
    IF v_batch.merchant_id != p_merchant_id THEN
        RAISE EXCEPTION 'Access denied: batch % does not belong to merchant %', p_batch_uuid, p_merchant_id;
    END IF;

    v_return_code := p_castles_response->>'txnReturnCode';
    v_response_is_ok := (v_return_code = '00000000');

    IF v_batch.status = 'settled' THEN
        IF v_response_is_ok THEN
            UPDATE public.settlement_batches
            SET raw_response = COALESCE(raw_response, p_castles_response),
                castles_settle_info = COALESCE(castles_settle_info, p_castles_response->'txnSettleInfo'),
                castles_return_code = COALESCE(castles_return_code, v_return_code),
                castles_batch_num = COALESCE(castles_batch_num, p_castles_response->>'txnBatchNum'),
                updated_at = NOW()
            WHERE id = p_batch_uuid;

            RETURN jsonb_build_object(
                'success', true,
                'status', 'settled',
                'return_code', v_return_code,
                'batch_id', v_batch.batch_id,
                'host_keyed', (v_batch.acquirer IS NOT NULL AND v_batch.batch_number IS NOT NULL),
                'settled_acquirers', '[]'::jsonb,
                'failed_acquirers', '[]'::jsonb,
                'should_retry', false,
                'requires_support', false,
                'idempotent_replay', true
            );
        END IF;
        RAISE EXCEPTION 'Batch % is already settled. Cannot finalize again with a non-success response.', p_batch_uuid;
    END IF;

    IF v_batch.status NOT IN ('pending','settling','retry','failed','partial_failure','open') THEN
        RAISE EXCEPTION 'Batch % is in status %. Expected pending/settling/retry/failed/partial_failure/open.', p_batch_uuid, v_batch.status;
    END IF;

    v_is_host_keyed := (v_batch.acquirer IS NOT NULL AND v_batch.batch_number IS NOT NULL);

    IF p_castles_response ? 'txnSettleInfo' THEN
        FOR v_settle_entry IN SELECT value FROM jsonb_array_elements(p_castles_response->'txnSettleInfo')
        LOOP
            IF (v_settle_entry->>'txnReturnCode') = '00000000' THEN
                v_any_acquirer_ok := true;
                v_settled_acquirers := v_settled_acquirers || jsonb_build_array(v_settle_entry->>'txnAcquirerName');
            ELSE
                v_all_acquirers_ok := false;
                v_failed_acquirers := v_failed_acquirers || jsonb_build_array(jsonb_build_object(
                    'acquirer', v_settle_entry->>'txnAcquirerName',
                    'return_code', v_settle_entry->>'txnReturnCode',
                    'message', v_settle_entry->>'txnHostMsg'
                ));
            END IF;
        END LOOP;
    ELSE
        v_all_acquirers_ok := v_response_is_ok;
        v_any_acquirer_ok := v_response_is_ok;
    END IF;

    v_final_status := CASE
        WHEN v_all_acquirers_ok THEN 'settled'
        WHEN v_any_acquirer_ok AND NOT v_all_acquirers_ok THEN 'partial_failure'
        WHEN v_return_code = 'E000002A' THEN 'retry'
        ELSE 'failed'
    END;

    UPDATE public.settlement_batches
    SET status=v_final_status,
        closed_at = CASE WHEN v_final_status IN ('settled','partial_failure') THEN NOW() ELSE closed_at END,
        settlement_date = CASE WHEN v_final_status IN ('settled','partial_failure') THEN CURRENT_DATE ELSE settlement_date END,
        retry_count = retry_count + 1,
        last_attempt_at = NOW(),
        castles_return_code = v_return_code,
        castles_batch_num = COALESCE(p_castles_response->>'txnBatchNum', castles_batch_num),
        castles_settle_info = p_castles_response->'txnSettleInfo',
        raw_response = p_castles_response,
        failure_reason = CASE
            WHEN v_final_status IN ('settled') THEN NULL
            WHEN v_final_status = 'partial_failure'
                THEN 'Partial settlement: ' || array_to_string(ARRAY(SELECT jsonb_array_elements_text(v_failed_acquirers)), ', ') || ' failed. Contact processor support.'
            WHEN v_return_code = 'E000002A' THEN 'Castles requested a retry (E000002A). Call prepare again with a new txnPosTxnId.'
            ELSE p_castles_response->>'txnHostMsg'
        END,
        updated_at = NOW()
    WHERE id = p_batch_uuid;

    IF v_final_status IN ('settled','partial_failure') THEN
        UPDATE public.order_payments
        SET is_settled = true, settled_at = NOW()
        WHERE settlement_batch_id = p_batch_uuid;
    END IF;

    IF v_final_status IN ('retry','failed') THEN
        IF v_is_host_keyed THEN
            UPDATE public.settlement_batches SET status='open', updated_at=NOW() WHERE id=p_batch_uuid;
        ELSE
            UPDATE public.order_payments SET settlement_batch_id=NULL WHERE settlement_batch_id=p_batch_uuid;
        END IF;
    END IF;

    RETURN jsonb_build_object(
        'success', v_final_status IN ('settled','partial_failure'),
        'status', v_final_status,
        'return_code', v_return_code,
        'batch_id', v_batch.batch_id,
        'host_keyed', v_is_host_keyed,
        'settled_acquirers', v_settled_acquirers,
        'failed_acquirers', v_failed_acquirers,
        'should_retry', (v_final_status='retry'),
        'requires_support', (v_final_status='partial_failure')
    );
END;
$$;

WITH recomputed AS (
    SELECT sb.id,
           (MIN(op.captured_at) AT TIME ZONE 'America/New_York')::date AS start_d,
           (MAX(op.captured_at) AT TIME ZONE 'America/New_York')::date AS end_d
    FROM public.settlement_batches sb
    JOIN public.order_payments op ON op.settlement_batch_id = sb.id
    WHERE sb.batch_id LIKE 'LAZY-%'
      AND sb.business_date_start = sb.business_date_end
    GROUP BY sb.id
)
UPDATE public.settlement_batches sb
SET business_date_start = r.start_d,
    business_date_end = r.end_d,
    updated_at = NOW()
FROM recomputed r
WHERE sb.id = r.id
  AND r.start_d IS DISTINCT FROM r.end_d;;
