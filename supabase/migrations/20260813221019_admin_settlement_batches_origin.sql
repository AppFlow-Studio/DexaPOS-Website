-- ============================================================================
-- get_admin_settlement_batches: expose settlement_batches.origin so the HQ Batch
-- Reconciliation surface can distinguish an automatic settle (Valor webhook /
-- POS auto) from a manual one. Rebased on the LIVE definition (batch_number +
-- acquirer + dual linked-payment match from 20260510201336) — origin is the only
-- addition; all matching/discrepancy logic is byte-identical.
--
-- DROP first: adding a column changes the OUT-parameter row type, which
-- CREATE OR REPLACE cannot do. Atomic within this migration's transaction.
-- ============================================================================
DROP FUNCTION IF EXISTS public.get_admin_settlement_batches(uuid[], text[], date, date, integer);

CREATE OR REPLACE FUNCTION public.get_admin_settlement_batches(
    p_merchant_ids uuid[] DEFAULT NULL::uuid[],
    p_status text[] DEFAULT NULL::text[],
    p_date_from date DEFAULT NULL::date,
    p_date_to date DEFAULT NULL::date,
    p_limit integer DEFAULT 200
)
RETURNS TABLE(
    id uuid, batch_id text, batch_number text, acquirer text, merchant_id uuid,
    merchant_name text, location_id uuid, location_name text, business_date date,
    opened_at timestamp with time zone, closed_at timestamp with time zone,
    settlement_date date, funded_date date, transaction_count integer, sales_count integer,
    refund_count integer, void_count integer, gross_amount numeric, tip_amount numeric,
    refund_amount numeric, net_deposit numeric, status text, origin text,
    linked_payment_count bigint, linked_payment_amount numeric,
    discrepancy_amount numeric, has_discrepancy boolean
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
           b.transaction_count, b.sales_count, b.refund_count, b.void_count,
           b.gross_amount, b.tip_amount, b.refund_amount, b.net_deposit, b.status, b.origin,
           COALESCE(lp.linked_payment_count, 0)::bigint AS linked_payment_count,
           COALESCE(lp.linked_payment_amount, 0)::numeric AS linked_payment_amount,
           ROUND((b.gross_amount + b.tip_amount) - COALESCE(lp.linked_payment_amount, 0), 2)::numeric AS discrepancy_amount,
           ABS(ROUND((b.gross_amount + b.tip_amount) - COALESCE(lp.linked_payment_amount, 0), 2)) >= 0.01 AS has_discrepancy
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
