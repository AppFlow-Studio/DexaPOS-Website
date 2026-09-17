-- ============================================================================
-- CodePay auto-settle support (POS scheduler parity)
-- ----------------------------------------------------------------------------
-- The POS tablet now runs unattended daily batch-out for CodePay terminals, the
-- same way it already does for Castles (services/autoSettlementScheduler.ts). The
-- CodePay settle RPCs from 20260915120200 already work for the auto path:
--   • prepare_codepay_settlement takes p_initiated_by ('pos_auto'),
--   • finalize returns should_retry=false on the indeterminate/needs_review path
--     (so the scheduler escalates instead of re-firing — no double-cut),
--   • get_unsettled_summary_by_terminal already includes 'codepay' (preflight +
--     stuck-batch guard), and log_settlement_attempt is terminal-agnostic.
--
-- Two parity gaps versus the Castles auto-settle infra remain, closed here:
--   1. flag_missed_auto_settlements (the hourly monitor) only scans
--      terminal_type IN ('castles','valor') — a missed CodePay auto-settle would
--      be invisible to ops. Broaden it to include 'codepay'.
--   2. prepare_codepay_settlement never stamps settlement_batches.origin, so the
--      HQ Batch Reconciliation surface (get_admin_settlement_batches exposes
--      `origin`) can't distinguish a CodePay auto-settle from a manual one. Stamp
--      origin = 'pos_auto' | 'pos_manual' from p_initiated_by, exactly like
--      prepare_castles_settlement (20260814174415).
--
-- No schema change. Both functions are rebased VERBATIM on their current repo
-- definitions (20260813220449 / 20260915120200) with only the noted deltas.
-- ============================================================================

-- ============================================================================
-- 1. flag_missed_auto_settlements — include CodePay auto-settle terminals.
--    Rebased verbatim on 20260813220449; ONLY the terminal_type IN-list and the
--    COMMENT change. Function signature is unchanged, so the existing hourly cron
--    ('flag-missed-auto-settlements') keeps calling it — no re-schedule needed.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.flag_missed_auto_settlements(p_grace_minutes integer DEFAULT 60)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_flagged integer := 0;
    r         record;
    v_loc_now timestamp;     -- "now" in the location's local wall-clock
    v_due     timestamp;     -- today's settle moment, local
    v_today   date;
BEGIN
    FOR r IN
        SELECT pt.id, pt.merchant_id, pt.location_id, pt.terminal_name,
               pt.terminal_type, pt.settle_time,
               COALESCE(loc.timezone, 'America/New_York') AS tz
        FROM public.payment_terminals pt
        JOIN public.locations loc ON loc.id = pt.location_id
        WHERE pt.auto_settle = true
          AND pt.is_active = true
          AND pt.settle_time IS NOT NULL
          AND pt.terminal_type IN ('castles', 'valor', 'codepay')
    LOOP
        v_loc_now := (now() AT TIME ZONE r.tz);
        v_today   := v_loc_now::date;
        v_due     := (v_today + r.settle_time);

        -- Not yet past settle_time + grace in the location's timezone.
        IF v_loc_now < v_due + make_interval(mins => p_grace_minutes) THEN
            CONTINUE;
        END IF;

        -- A settlement batch already exists today (any non-open outcome) => fine.
        IF EXISTS (
            SELECT 1 FROM public.settlement_batches sb
            WHERE sb.payment_terminal_id = r.id
              AND (sb.created_at AT TIME ZONE r.tz)::date = v_today
              AND sb.status IN ('pending','settling','settled','closed','funded','needs_review','retry')
        ) THEN
            CONTINUE;
        END IF;

        -- Already flagged today => idempotent no-op.
        IF EXISTS (
            SELECT 1 FROM public.audit_logs a
            WHERE a.resource_type = 'payment_terminal'
              AND a.resource_id = r.id
              AND a.action = 'auto_settle_missed'
              AND (a.created_at AT TIME ZONE r.tz)::date = v_today
        ) THEN
            CONTINUE;
        END IF;

        INSERT INTO public.audit_logs (
            actor_user_id, actor_role, action, action_category, severity,
            resource_type, resource_id, resource_name, merchant_id, location_id, status, metadata
        ) VALUES (
            NULL, 'system', 'auto_settle_missed', 'settlement', 'warning',
            'payment_terminal', r.id, r.terminal_name, r.merchant_id, r.location_id, 'failed',
            jsonb_build_object(
                'source', 'auto_settle_watchdog',
                'terminal_type', r.terminal_type,
                'settle_time', r.settle_time,
                'location_timezone', r.tz,
                'grace_minutes', p_grace_minutes,
                'business_date', v_today
            )
        );
        v_flagged := v_flagged + 1;
    END LOOP;

    RETURN v_flagged;
END;
$function$;

COMMENT ON FUNCTION public.flag_missed_auto_settlements(integer) IS
    'Hourly monitor: flags auto_settle terminals (Castles/Valor/CodePay) that have no settlement_batches row for today past settle_time+grace, in the location timezone. Writes a warning audit_logs row (idempotent per terminal per day). Never contacts a terminal.';

-- ============================================================================
-- 2. prepare_codepay_settlement — stamp settlement_batches.origin.
--    Rebased verbatim on 20260915120200; the ONLY additions are the v_origin
--    variable, its computation from p_initiated_by, and origin in the INSERT.
--    All settlement math / guards / pin logic is byte-identical. Origin is set
--    once at batch creation (finalize is untouched), mirroring the Castles path.
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
    v_origin        text;
BEGIN
    SELECT * INTO v_terminal FROM public.payment_terminals WHERE id = p_terminal_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Terminal not found: %', p_terminal_id; END IF;
    IF v_terminal.merchant_id != p_merchant_id THEN
        RAISE EXCEPTION 'Access denied: terminal % does not belong to merchant %', p_terminal_id, p_merchant_id;
    END IF;

    -- Provenance: scheduled auto-settle vs on-demand manual settle.
    v_origin := CASE WHEN p_initiated_by IN ('pos_auto','scheduler','auto') THEN 'pos_auto' ELSE 'pos_manual' END;

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
        business_date, status, origin, opened_at, created_at, updated_at
    ) VALUES (
        v_batch_id, 'codepay', p_merchant_id, v_terminal.location_id, p_terminal_id, p_terminal_id::text,
        (NOW() AT TIME ZONE 'America/New_York')::date, 'pending', v_origin, NOW(), NOW(), NOW()
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

GRANT EXECUTE ON FUNCTION public.prepare_codepay_settlement(uuid, uuid, text) TO authenticated;
