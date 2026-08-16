-- =====================================================================
-- Valor open-batch visibility: lazy-open on capture + webhook adoption
-- =====================================================================
-- Problem: a captured Valor payment carries a host batch_number but gets NO
-- settlement_batches row until the terminal auto-batches and the Valor webhook
-- fires. _lazy_settlement_batch_link (which opens a batch row on capture for
-- card payments) explicitly skipped Valor, so an OPEN Valor batch (still
-- accumulating) was invisible in /settlements and the device page, and a
-- one-shot backfill migration was the only way to surface it. Result seen on
-- staging: VP350 / Vp550 "batch 6" accumulating captured payments with
-- settlement_batch_id = NULL and no batch row anywhere.
--
-- Fix (permanent):
--   1. _lazy_settlement_batch_link now ALSO opens a serial-keyed 'open' batch
--      for terminal_type='valor' (acquirer pinned to 'VALOR', since Valor
--      payments carry none). The accumulating batch is visible the moment the
--      first payment is captured, and later payments in the same host batch
--      link to that same open row.
--   2. record_valor_batch_webhook ADOPTS that open row on close: it matches on
--      (payment_terminal_id, batch_number) for any non-settled row, not only
--      origin='valor_webhook'. Ordering prefers an existing webhook row first,
--      so a genuine idempotent replay still short-circuits and we never create
--      a 2nd origin='valor_webhook' row (uq_valor_webhook_batch stays satisfied).
--   3. get_admin_settlement_batches shows LIVE linked totals for non-finalized
--      batches and suppresses the gross-vs-linked "discrepancy" for them — an
--      open batch is still filling, so a gap is not a real discrepancy.
--   4. One-time backfill: open + link the Valor payments already orphaned
--      (idempotent; produces the exact shape lazy-link now creates).
-- =====================================================================

-- 1) Lazy-link: open an 'open' batch for Castles / Dejavoo / Valor ------
CREATE OR REPLACE FUNCTION public._lazy_settlement_batch_link()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
-- CONTRACT: ON CONFLICT below depends on uq_settlement_batches_host_key
--   (serial_number, merchant_id, acquirer, batch_number, batch_epoch)
--   WHERE batch_number IS NOT NULL
-- Valor: payments carry no acquirer and normally settle via the Valor webhook.
-- We still open a serial-keyed 'open' batch on capture (acquirer pinned to
-- 'VALOR') so the accumulating money is visible immediately; the webhook then
-- ADOPTS this open row on close (see record_valor_batch_webhook) rather than
-- creating a duplicate.
DECLARE
    v_existing_id     uuid;
    v_existing_status text;
    v_business_date   date;
    v_lazy_batch_id   text;
    v_terminal_uuid   uuid;
    v_serial          text;
    v_location_id     uuid;
    v_epoch           integer;
    v_acquirer        text;
    v_processor       text;
BEGIN
    IF NEW.settlement_batch_id IS NOT NULL THEN RETURN NEW; END IF;
    IF NEW.batch_number IS NULL THEN RETURN NEW; END IF;
    IF NEW.terminal_id IS NULL THEN RETURN NEW; END IF;
    IF NEW.terminal_type::text NOT IN ('castles','dejavoo','valor') THEN RETURN NEW; END IF;

    -- Effective acquirer: castles/dejavoo require a real acquirer (skip if
    -- absent, preserving prior behavior); Valor has none, so pin to 'VALOR'.
    v_acquirer := COALESCE(NEW.acquirer,
                           CASE WHEN NEW.terminal_type::text = 'valor' THEN 'VALOR' END);
    IF v_acquirer IS NULL THEN RETURN NEW; END IF;

    -- processor is NOT NULL (column default 'castles'); Valor must be labeled
    -- explicitly. 'ELSE castles' mirrors the pre-existing default for
    -- castles/dejavoo lazy rows (no behavior change for those).
    v_processor := CASE WHEN NEW.terminal_type::text = 'valor' THEN 'valor' ELSE 'castles' END;

    IF NEW.terminal_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        THEN RETURN NEW; END IF;

    v_terminal_uuid := NEW.terminal_id::uuid;

    -- Resolve the physical serial; NULL-serial (discovery window) -> UUID surrogate
    -- so the row stays in a stable, upgradeable namespace.
    SELECT serial_number, location_id INTO v_serial, v_location_id
    FROM public.payment_terminals WHERE id = v_terminal_uuid;
    v_serial := COALESCE(v_serial, 'UUID:' || v_terminal_uuid::text);

    -- Latest batch for this host (serial) key; highest epoch wins.
    SELECT id, status, batch_epoch
      INTO v_existing_id, v_existing_status, v_epoch
    FROM public.settlement_batches
    WHERE serial_number = v_serial
      AND merchant_id   = NEW.merchant_id
      AND acquirer      = v_acquirer
      AND batch_number  = NEW.batch_number
    ORDER BY batch_epoch DESC
    LIMIT 1;

    IF v_existing_id IS NOT NULL
       AND v_existing_status IN ('open','pending','settling','retry') THEN
        IF v_existing_status IN ('pending','settling') THEN RETURN NEW; END IF;
        NEW.settlement_batch_id := v_existing_id;
        RETURN NEW;
    END IF;

    -- Terminal-state occupant OR none → open a fresh epoch (no merge into a
    -- settled batch).
    v_epoch := COALESCE(v_epoch, 0) + 1;
    v_business_date := (COALESCE(NEW.captured_at, now()) AT TIME ZONE 'America/New_York')::date;
    v_lazy_batch_id := 'LAZY-' || v_acquirer || '-' || v_serial
                    || '-' || NEW.batch_number || '-E' || v_epoch;

    INSERT INTO public.settlement_batches (
        batch_id, merchant_id, location_id, payment_terminal_id, serial_number,
        acquirer, batch_number, batch_epoch, processor,
        business_date, business_date_start, business_date_end,
        opened_at, status, retry_count
    ) VALUES (
        v_lazy_batch_id, NEW.merchant_id, COALESCE(NEW.location_id, v_location_id),
        v_terminal_uuid, v_serial,
        v_acquirer, NEW.batch_number, v_epoch, v_processor,
        v_business_date, v_business_date, v_business_date,
        COALESCE(NEW.captured_at, now()), 'open', 0
    )
    ON CONFLICT (serial_number, merchant_id, acquirer, batch_number, batch_epoch)
        WHERE batch_number IS NOT NULL
    DO NOTHING
    RETURNING id INTO v_existing_id;

    IF v_existing_id IS NULL THEN
        SELECT id INTO v_existing_id
        FROM public.settlement_batches
        WHERE serial_number = v_serial
          AND merchant_id   = NEW.merchant_id
          AND acquirer      = v_acquirer
          AND batch_number  = NEW.batch_number
          AND batch_epoch   = v_epoch
        LIMIT 1;
    END IF;

    NEW.settlement_batch_id := v_existing_id;
    RETURN NEW;
END;
$function$;

-- 2) Valor webhook: adopt a pre-opened batch row on close --------------
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

-- 3) Admin batches: live linked totals + no false discrepancy for open -
CREATE OR REPLACE FUNCTION public.get_admin_settlement_batches(p_merchant_ids uuid[] DEFAULT NULL::uuid[], p_status text[] DEFAULT NULL::text[], p_date_from date DEFAULT NULL::date, p_date_to date DEFAULT NULL::date, p_limit integer DEFAULT 200)
 RETURNS TABLE(id uuid, batch_id text, batch_number text, acquirer text, merchant_id uuid, merchant_name text, location_id uuid, location_name text, business_date date, opened_at timestamp with time zone, closed_at timestamp with time zone, settlement_date date, funded_date date, transaction_count integer, sales_count integer, refund_count integer, void_count integer, gross_amount numeric, tip_amount numeric, refund_amount numeric, net_deposit numeric, status text, origin text, linked_payment_count bigint, linked_payment_amount numeric, discrepancy_amount numeric, has_discrepancy boolean)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_allowed_merchants uuid[];
    v_filter_merchants uuid[];
    v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 200), 1), 500);
BEGIN
    IF NOT public.is_dexapos_admin() THEN RETURN; END IF;
    SELECT COALESCE(array_agg(mid), ARRAY[]::uuid[]) INTO v_allowed_merchants
        FROM public.get_admin_merchant_ids() AS mid;
    IF COALESCE(array_length(v_allowed_merchants, 1), 0) = 0 THEN RETURN; END IF;
    IF p_merchant_ids IS NULL OR array_length(p_merchant_ids, 1) IS NULL THEN
        v_filter_merchants := v_allowed_merchants;
    ELSE
        SELECT COALESCE(array_agg(mid), ARRAY[]::uuid[]) INTO v_filter_merchants
        FROM unnest(p_merchant_ids) AS mid WHERE mid = ANY (v_allowed_merchants);
        IF COALESCE(array_length(v_filter_merchants, 1), 0) = 0 THEN RETURN; END IF;
    END IF;

    RETURN QUERY
    WITH scoped_batches AS (
        SELECT sb.id, sb.batch_id, sb.batch_number, sb.acquirer, sb.merchant_id,
               m.name AS merchant_name, sb.location_id, l.name AS location_name,
               sb.business_date, sb.opened_at, sb.closed_at, sb.settlement_date, sb.funded_date,
               sb.payment_terminal_id,
               COALESCE(sb.transaction_count, 0) AS transaction_count,
               COALESCE(sb.sales_count, 0) AS sales_count,
               COALESCE(sb.refund_count, 0) AS refund_count,
               COALESCE(sb.void_count, 0) AS void_count,
               COALESCE(sb.gross_amount, 0)::numeric AS gross_amount,
               COALESCE(sb.tip_amount, 0)::numeric AS tip_amount,
               COALESCE(sb.refund_amount, 0)::numeric AS refund_amount,
               COALESCE(sb.net_deposit, 0)::numeric AS net_deposit,
               sb.status::text AS status,
               sb.origin::text AS origin
        FROM public.settlement_batches sb
        JOIN public.merchants m ON m.id = sb.merchant_id
        LEFT JOIN public.locations l ON l.id = sb.location_id
        WHERE sb.merchant_id = ANY (v_filter_merchants)
          AND (p_status IS NULL OR sb.status::text = ANY (p_status))
          AND (p_date_from IS NULL OR sb.business_date >= p_date_from)
          AND (p_date_to IS NULL OR sb.business_date <= p_date_to)
        ORDER BY sb.business_date DESC, sb.closed_at DESC NULLS LAST, sb.opened_at DESC
        LIMIT v_limit
    )
    SELECT b.id, b.batch_id::text, b.batch_number::text, b.acquirer::text,
           b.merchant_id, b.merchant_name::text, b.location_id, b.location_name::text,
           b.business_date, b.opened_at, b.closed_at, b.settlement_date, b.funded_date,
           -- Non-finalized (open/needs_review/...) batches are still filling: show
           -- the LIVE linked payment count/amount, not the stale stored 0s.
           CASE WHEN b.status IN ('settled','closed','funded','submitted')
                THEN b.transaction_count
                ELSE COALESCE(lp.linked_payment_count, 0)::integer END AS transaction_count,
           b.sales_count, b.refund_count, b.void_count,
           CASE WHEN b.status IN ('settled','closed','funded','submitted')
                THEN b.gross_amount
                ELSE COALESCE(lp.linked_payment_amount, 0)::numeric END AS gross_amount,
           b.tip_amount, b.refund_amount, b.net_deposit, b.status, b.origin,
           COALESCE(lp.linked_payment_count, 0)::bigint AS linked_payment_count,
           COALESCE(lp.linked_payment_amount, 0)::numeric AS linked_payment_amount,
           -- A gross-vs-linked gap is only a real discrepancy once the batch is
           -- finalized (host totals authoritative). Open batches never flag.
           CASE WHEN b.status IN ('settled','closed','funded','submitted')
                THEN ROUND((b.gross_amount + b.tip_amount) - COALESCE(lp.linked_payment_amount, 0), 2)::numeric
                ELSE NULL END AS discrepancy_amount,
           CASE WHEN b.status IN ('settled','closed','funded','submitted')
                THEN ABS(ROUND((b.gross_amount + b.tip_amount) - COALESCE(lp.linked_payment_amount, 0), 2)) >= 0.01
                ELSE false END AS has_discrepancy
    FROM scoped_batches b
    LEFT JOIN LATERAL (
        SELECT COUNT(*)::bigint AS linked_payment_count,
               COALESCE(SUM(CASE
                   WHEN COALESCE(op.is_voided, false) THEN 0
                   WHEN op.status::text = ANY (ARRAY['failed','pending']) THEN 0
                   ELSE COALESCE(op.total_amount, 0)::numeric END), 0)::numeric AS linked_payment_amount
        FROM public.order_payments op
        LEFT JOIN public.orders o ON o.id = op.order_id
        WHERE COALESCE(op.merchant_id, o.merchant_id) = b.merchant_id
          AND (
                op.settlement_batch_id = b.id
                OR (
                    op.settlement_batch_id IS NULL
                    AND b.batch_number IS NOT NULL
                    AND op.batch_number = b.batch_number
                    AND b.payment_terminal_id IS NOT NULL
                    AND op.terminal_id IS NOT NULL
                    AND op.terminal_id = b.payment_terminal_id::text
                    AND (b.acquirer IS NULL OR op.acquirer IS NULL OR op.acquirer = b.acquirer)
                )
                OR (
                    op.settlement_batch_id IS NULL
                    AND b.batch_number IS NULL
                    AND COALESCE(op.batch_number, op.dejavoo_batch_number) = b.batch_id
                )
              )
    ) lp ON true
    ORDER BY b.business_date DESC, b.closed_at DESC NULLS LAST, b.opened_at DESC;
END;
$function$;

-- 4) One-time backfill of already-orphaned Valor payments --------------
-- Opens a serial-keyed 'open' batch (the same shape lazy-link now produces) for
-- every (terminal, batch_number) of captured Valor payments that has no batch
-- row yet, and links those payments. Idempotent: guarded on settlement_batch_id
-- IS NULL and NOT EXISTS(host key). A subsequent Valor webhook will ADOPT + settle
-- these 'open' rows.
WITH grp AS (
    SELECT (op.terminal_id)::uuid AS terminal_uuid, pt.serial_number, pt.merchant_id, pt.location_id,
           op.batch_number,
           min(op.captured_at) AS first_cap
    FROM public.order_payments op
    JOIN public.payment_terminals pt ON pt.id::text = op.terminal_id
    WHERE op.settlement_batch_id IS NULL
      AND op.batch_number IS NOT NULL
      AND op.captured_at IS NOT NULL
      AND op.terminal_type = 'valor'
      -- Batch membership = the webhook's own rule: settle-able captured money only.
      -- (payment_status enum is captured/partially_refunded/void/... — a 'void'
      -- payment is NOT swept; the enum has no 'voided'/'cancelled'/'reversed'.)
      AND op.status::text IN ('captured','partially_refunded')
      AND NOT COALESCE(op.is_voided, false)
      AND NOT EXISTS (
          SELECT 1 FROM public.settlement_batches sb
          WHERE sb.serial_number = pt.serial_number
            AND sb.merchant_id   = pt.merchant_id
            AND sb.acquirer      = 'VALOR'
            AND sb.batch_number  = op.batch_number
      )
    GROUP BY op.terminal_id, pt.serial_number, pt.merchant_id, pt.location_id, op.batch_number
),
ins AS (
    INSERT INTO public.settlement_batches (
        batch_id, merchant_id, location_id, payment_terminal_id, serial_number,
        acquirer, batch_number, batch_epoch, processor,
        business_date, business_date_start, business_date_end,
        opened_at, status, retry_count
    )
    SELECT
        'LAZY-VALOR-' || grp.serial_number || '-' || grp.batch_number || '-E1',
        grp.merchant_id, grp.location_id, grp.terminal_uuid, grp.serial_number,
        'VALOR', grp.batch_number, 1, 'valor',
        (grp.first_cap AT TIME ZONE 'America/New_York')::date,
        (grp.first_cap AT TIME ZONE 'America/New_York')::date,
        (grp.first_cap AT TIME ZONE 'America/New_York')::date,
        grp.first_cap, 'open', 0
    FROM grp
    ON CONFLICT (serial_number, merchant_id, acquirer, batch_number, batch_epoch)
        WHERE batch_number IS NOT NULL
    DO NOTHING
    RETURNING id, payment_terminal_id, batch_number
)
UPDATE public.order_payments op
SET settlement_batch_id = ins.id
FROM ins
WHERE op.terminal_id = ins.payment_terminal_id::text
  AND op.batch_number = ins.batch_number
  AND op.settlement_batch_id IS NULL
  AND op.terminal_type = 'valor'
  AND op.status::text IN ('captured','partially_refunded')
  AND NOT COALESCE(op.is_voided, false);
