-- =====================================================================
-- get_admin_settlement_batches / get_admin_settlement_batch_payments
-- Use settlement_batches.batch_number for the order_payments join, and
-- surface batch_number + acquirer to the UI.
--
-- Why: lazy-created settlement_batches rows store a synthetic
-- 'LAZY-TSYS-<terminal>-<batch_number>' string in the legacy `batch_id`
-- column. order_payments.batch_number is the raw host number ('009'),
-- so the previous join `op.batch_number = b.batch_id` never matched
-- and every lazy batch displayed `linked_payments=0` despite real
-- captures sitting in the ledger. Same broken assumption explains why
-- the UI showed the LAZY label instead of the actual host batch number.
--
-- Fix: join on `b.batch_number` (the canonical host batch identity from
-- Wave A.1 / B.1) with merchant + acquirer scoping. Keep a fallback to
-- `b.batch_id` for legacy DEXA-prefixed rows where batch_number was
-- never populated, so the change is non-breaking.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.get_admin_settlement_batches(
  p_merchant_ids uuid[] DEFAULT NULL::uuid[],
  p_status text[] DEFAULT NULL::text[],
  p_date_from date DEFAULT NULL::date,
  p_date_to date DEFAULT NULL::date,
  p_limit integer DEFAULT 200
)
RETURNS TABLE(
  id uuid,
  batch_id text,
  batch_number text,
  acquirer text,
  merchant_id uuid,
  merchant_name text,
  location_id uuid,
  location_name text,
  business_date date,
  opened_at timestamp with time zone,
  closed_at timestamp with time zone,
  settlement_date date,
  funded_date date,
  transaction_count integer,
  sales_count integer,
  refund_count integer,
  void_count integer,
  gross_amount numeric,
  tip_amount numeric,
  refund_amount numeric,
  net_deposit numeric,
  status text,
  linked_payment_count bigint,
  linked_payment_amount numeric,
  discrepancy_amount numeric,
  has_discrepancy boolean
)
LANGUAGE plpgsql
STABLE
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_allowed_merchants uuid[];
  v_filter_merchants uuid[];
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 200), 1), 500);
BEGIN
  IF NOT public.is_dexapos_admin() THEN
    RETURN;
  END IF;

  SELECT COALESCE(array_agg(mid), ARRAY[]::uuid[])
  INTO v_allowed_merchants
  FROM public.get_admin_merchant_ids() AS mid;

  IF COALESCE(array_length(v_allowed_merchants, 1), 0) = 0 THEN
    RETURN;
  END IF;

  IF p_merchant_ids IS NULL OR array_length(p_merchant_ids, 1) IS NULL THEN
    v_filter_merchants := v_allowed_merchants;
  ELSE
    SELECT COALESCE(array_agg(mid), ARRAY[]::uuid[])
    INTO v_filter_merchants
    FROM unnest(p_merchant_ids) AS mid
    WHERE mid = ANY (v_allowed_merchants);

    IF COALESCE(array_length(v_filter_merchants, 1), 0) = 0 THEN
      RETURN;
    END IF;
  END IF;

  RETURN QUERY
  WITH scoped_batches AS (
    SELECT
      sb.id,
      sb.batch_id,
      sb.batch_number,
      sb.acquirer,
      sb.terminal_id,
      sb.merchant_id,
      m.name AS merchant_name,
      sb.location_id,
      l.name AS location_name,
      sb.business_date,
      sb.opened_at,
      sb.closed_at,
      sb.settlement_date,
      sb.funded_date,
      COALESCE(sb.transaction_count, 0) AS transaction_count,
      COALESCE(sb.sales_count, 0) AS sales_count,
      COALESCE(sb.refund_count, 0) AS refund_count,
      COALESCE(sb.void_count, 0) AS void_count,
      COALESCE(sb.gross_amount, 0)::numeric AS gross_amount,
      COALESCE(sb.tip_amount, 0)::numeric AS tip_amount,
      COALESCE(sb.refund_amount, 0)::numeric AS refund_amount,
      COALESCE(sb.net_deposit, 0)::numeric AS net_deposit,
      sb.status::text AS status
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
  SELECT
    b.id,
    b.batch_id::text,
    b.batch_number::text,
    b.acquirer::text,
    b.merchant_id,
    b.merchant_name::text,
    b.location_id,
    b.location_name::text,
    b.business_date,
    b.opened_at,
    b.closed_at,
    b.settlement_date,
    b.funded_date,
    b.transaction_count,
    b.sales_count,
    b.refund_count,
    b.void_count,
    b.gross_amount,
    b.tip_amount,
    b.refund_amount,
    b.net_deposit,
    b.status,
    COALESCE(lp.linked_payment_count, 0)::bigint AS linked_payment_count,
    COALESCE(lp.linked_payment_amount, 0)::numeric AS linked_payment_amount,
    -- linked_payment_amount sums order_payments.total_amount (tip-inclusive),
    -- so compare against gross_amount + tip_amount, not gross alone, otherwise
    -- the tip itself shows up as a discrepancy.
    ROUND((b.gross_amount + b.tip_amount) - COALESCE(lp.linked_payment_amount, 0), 2)::numeric AS discrepancy_amount,
    ABS(ROUND((b.gross_amount + b.tip_amount) - COALESCE(lp.linked_payment_amount, 0), 2)) >= 0.01 AS has_discrepancy
  FROM scoped_batches b
  LEFT JOIN LATERAL (
    SELECT
      COUNT(*)::bigint AS linked_payment_count,
      COALESCE(
        SUM(
          CASE
            WHEN COALESCE(op.is_voided, false) THEN 0
            WHEN op.status::text = ANY (ARRAY['failed', 'pending']) THEN 0
            ELSE GREATEST(
              COALESCE(op.total_amount, 0)::numeric
                - COALESCE(op.return_amount, 0)::numeric
                - COALESCE(op.refunded_amount, 0)::numeric,
              0
            )
          END
        ),
        0
      )::numeric AS linked_payment_amount
    FROM public.order_payments op
    LEFT JOIN public.orders o ON o.id = op.order_id
    WHERE COALESCE(op.merchant_id, o.merchant_id) = b.merchant_id
      AND (
        -- Preferred: FK link stamped at settlement time.
        op.settlement_batch_id = b.id
        -- Fallback: host-batch-number identity, scoped to the same
        -- terminal and business date so recycled batch numbers
        -- ('009', '010') from prior days/terminals don't leak in.
        OR (
          op.settlement_batch_id IS NULL
          AND b.batch_number IS NOT NULL
          AND COALESCE(op.batch_number, op.dejavoo_batch_number) = b.batch_number
          AND (b.acquirer IS NULL OR op.acquirer IS NULL OR op.acquirer = b.acquirer)
          AND (b.terminal_id IS NULL OR op.terminal_id IS NULL OR op.terminal_id = b.terminal_id)
          AND COALESCE(op.captured_at, op.initiated_at)::date
              BETWEEN b.business_date - INTERVAL '1 day' AND b.business_date + INTERVAL '1 day'
        )
        -- Legacy fallback: pre-Wave-A.1 rows where batch_number was never
        -- populated, so batch_id was used as the host identity.
        OR (
          op.settlement_batch_id IS NULL
          AND b.batch_number IS NULL
          AND COALESCE(op.batch_number, op.dejavoo_batch_number) = b.batch_id
          AND (b.terminal_id IS NULL OR op.terminal_id IS NULL OR op.terminal_id = b.terminal_id)
          AND COALESCE(op.captured_at, op.initiated_at)::date
              BETWEEN b.business_date - INTERVAL '1 day' AND b.business_date + INTERVAL '1 day'
        )
      )
  ) lp ON true
  ORDER BY b.business_date DESC, b.closed_at DESC NULLS LAST, b.opened_at DESC;
END;
$function$;


CREATE OR REPLACE FUNCTION public.get_admin_settlement_batch_payments(
  p_batch_id text,
  p_merchant_id uuid DEFAULT NULL::uuid
)
RETURNS TABLE(
  payment_id uuid,
  order_id uuid,
  order_number text,
  merchant_id uuid,
  merchant_name text,
  location_id uuid,
  location_name text,
  payment_method text,
  payment_status text,
  total_amount numeric,
  tip_amount numeric,
  refund_amount numeric,
  is_voided boolean,
  is_returned boolean,
  initiated_at timestamp with time zone,
  captured_at timestamp with time zone
)
LANGUAGE plpgsql
STABLE
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_allowed_merchants uuid[];
  v_filter_merchants uuid[];
  v_input text := NULLIF(trim(p_batch_id), '');
  v_batch_uuid uuid;
  v_batch_number text;
  v_batch_id_text text;
  v_acquirer text;
  v_batch_merchant uuid;
  v_batch_terminal text;
  v_batch_business_date date;
BEGIN
  IF NOT public.is_dexapos_admin() THEN
    RETURN;
  END IF;

  IF v_input IS NULL THEN
    RETURN;
  END IF;

  SELECT COALESCE(array_agg(mid), ARRAY[]::uuid[])
  INTO v_allowed_merchants
  FROM public.get_admin_merchant_ids() AS mid;

  IF COALESCE(array_length(v_allowed_merchants, 1), 0) = 0 THEN
    RETURN;
  END IF;

  IF p_merchant_id IS NOT NULL THEN
    IF NOT (p_merchant_id = ANY (v_allowed_merchants)) THEN
      RETURN;
    END IF;
    v_filter_merchants := ARRAY[p_merchant_id];
  ELSE
    v_filter_merchants := v_allowed_merchants;
  END IF;

  -- Resolve the input to the canonical (batch_number, acquirer) tuple.
  -- Caller may pass either the settlement_batches.id (uuid), the legacy
  -- batch_id text label ('LAZY-...', 'DEXA-...'), or the bare host
  -- batch_number ('009'). Try each in order.
  IF v_input ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    SELECT sb.id, sb.batch_number, sb.batch_id, sb.acquirer, sb.merchant_id, sb.terminal_id, sb.business_date
    INTO v_batch_uuid, v_batch_number, v_batch_id_text, v_acquirer, v_batch_merchant, v_batch_terminal, v_batch_business_date
    FROM public.settlement_batches sb
    WHERE sb.id = v_input::uuid
      AND sb.merchant_id = ANY (v_filter_merchants);
  END IF;

  IF v_batch_uuid IS NULL AND v_batch_number IS NULL AND v_batch_id_text IS NULL THEN
    SELECT sb.id, sb.batch_number, sb.batch_id, sb.acquirer, sb.merchant_id, sb.terminal_id, sb.business_date
    INTO v_batch_uuid, v_batch_number, v_batch_id_text, v_acquirer, v_batch_merchant, v_batch_terminal, v_batch_business_date
    FROM public.settlement_batches sb
    WHERE sb.batch_id = v_input
      AND sb.merchant_id = ANY (v_filter_merchants)
    LIMIT 1;
  END IF;

  -- If still nothing, treat the input as a raw host batch_number and
  -- match payments directly (covers historical or unlinked rows).
  IF v_batch_number IS NULL AND v_batch_id_text IS NULL THEN
    v_batch_number := v_input;
  END IF;

  RETURN QUERY
  SELECT
    op.id AS payment_id,
    op.order_id,
    COALESCE(o.order_number, o.display_number)::text AS order_number,
    o.merchant_id,
    m.name::text AS merchant_name,
    o.location_id,
    l.name::text AS location_name,
    op.payment_method::text AS payment_method,
    op.status::text AS payment_status,
    COALESCE(op.total_amount, 0)::numeric AS total_amount,
    COALESCE(op.tip_amount, 0)::numeric AS tip_amount,
    COALESCE(op.return_amount, 0)::numeric AS refund_amount,
    COALESCE(op.is_voided, false) AS is_voided,
    COALESCE(op.is_returned, false) AS is_returned,
    op.initiated_at,
    op.captured_at
  FROM public.order_payments op
  JOIN public.orders o ON o.id = op.order_id
  JOIN public.merchants m ON m.id = o.merchant_id
  LEFT JOIN public.locations l ON l.id = o.location_id
  WHERE o.merchant_id = ANY (v_filter_merchants)
    AND (
      -- Preferred: FK link stamped at settlement time.
      (v_batch_uuid IS NOT NULL AND op.settlement_batch_id = v_batch_uuid)
      -- Fallback: host-batch-number identity, scoped to the same
      -- terminal + business date so recycled batch numbers don't leak.
      OR (
        op.settlement_batch_id IS NULL
        AND v_batch_number IS NOT NULL
        AND COALESCE(op.batch_number, op.dejavoo_batch_number) = v_batch_number
        AND (v_acquirer IS NULL OR op.acquirer IS NULL OR op.acquirer = v_acquirer)
        AND (v_batch_terminal IS NULL OR op.terminal_id IS NULL OR op.terminal_id = v_batch_terminal)
        AND (v_batch_business_date IS NULL
             OR COALESCE(op.captured_at, op.initiated_at)::date
                BETWEEN v_batch_business_date - INTERVAL '1 day' AND v_batch_business_date + INTERVAL '1 day')
      )
      -- Legacy fallback: batch_id text label.
      OR (
        op.settlement_batch_id IS NULL
        AND v_batch_number IS NULL
        AND v_batch_id_text IS NOT NULL
        AND COALESCE(op.batch_number, op.dejavoo_batch_number) = v_batch_id_text
        AND (v_batch_terminal IS NULL OR op.terminal_id IS NULL OR op.terminal_id = v_batch_terminal)
        AND (v_batch_business_date IS NULL
             OR COALESCE(op.captured_at, op.initiated_at)::date
                BETWEEN v_batch_business_date - INTERVAL '1 day' AND v_batch_business_date + INTERVAL '1 day')
      )
    )
  ORDER BY COALESCE(op.captured_at, op.initiated_at, o.created_at) DESC;
END;
$function$;
