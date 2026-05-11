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

    -- Defensive cleanup: close any host-keyed open batches on this terminal
    -- whose merchant_id doesn't match. Should not happen in normal flow
    -- (lazy trigger writes NEW.merchant_id which always matches the caller),
    -- but staging backfills from mixed historical data can produce them.
    UPDATE public.settlement_batches
    SET status='closed',
        closed_at=NOW(),
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
    WHERE payment_terminal_id=p_terminal_id AND status='failed' AND acquirer IS NOT NULL
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
