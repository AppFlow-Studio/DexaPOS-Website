-- Live aggregates per batch (works for open + settled).
CREATE OR REPLACE FUNCTION public.get_batches_with_live_totals_v1(
    p_location_id uuid,
    p_business_day date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
    v_result jsonb;
BEGIN
    IF NOT (p_location_id = ANY(user_location_ids())) THEN
        RAISE EXCEPTION 'Access denied: location not in user scope';
    END IF;

    SELECT COALESCE(jsonb_agg(row ORDER BY opened_at_v DESC), '[]'::jsonb) INTO v_result
    FROM (
        SELECT
            jsonb_build_object(
                'id',                sb.id,
                'batch_id',          sb.batch_id,
                'status',            sb.status,
                'closed_at',         sb.closed_at,
                'opened_at',         sb.opened_at,
                'acquirer',          sb.acquirer,
                'batch_number',      sb.batch_number,
                'transaction_count', COALESCE(agg.txn_count, sb.transaction_count, 0),
                'gross_amount',      COALESCE(agg.gross_amount, sb.gross_amount, 0),
                'tip_amount',        COALESCE(agg.tip_amount, sb.tip_amount, 0),
                'net_deposit',       COALESCE(agg.net_deposit, sb.net_deposit, 0)
            ) AS row,
            sb.opened_at AS opened_at_v
        FROM public.settlement_batches sb
        LEFT JOIN LATERAL (
            SELECT
                COUNT(*) FILTER (WHERE op.status = 'captured') AS txn_count,
                COALESCE(SUM(op.amount) FILTER (WHERE op.status = 'captured'), 0) AS gross_amount,
                COALESCE(SUM(op.tip_amount) FILTER (WHERE op.status = 'captured'), 0) AS tip_amount,
                COALESCE(SUM(op.total_amount) FILTER (WHERE op.status = 'captured'), 0) AS net_deposit
            FROM public.order_payments op
            WHERE op.settlement_batch_id = sb.id
        ) agg ON TRUE
        WHERE sb.location_id = p_location_id
          AND sb.merchant_id = user_merchant_id()
          AND sb.business_date = p_business_day
    ) batches;

    RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_batches_with_live_totals_v1(uuid, date) TO authenticated;

-- Drill-down: list of payments linked to a batch.
CREATE OR REPLACE FUNCTION public.get_batch_payments_v1(
    p_settlement_batch_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
    v_batch settlement_batches%ROWTYPE;
    v_result jsonb;
BEGIN
    SELECT * INTO v_batch FROM public.settlement_batches WHERE id = p_settlement_batch_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'settlement_batches row % not found', p_settlement_batch_id; END IF;
    IF v_batch.merchant_id IS DISTINCT FROM user_merchant_id() THEN
        RAISE EXCEPTION 'Access denied: merchant scope mismatch';
    END IF;
    IF NOT (v_batch.location_id = ANY(user_location_ids())) THEN
        RAISE EXCEPTION 'Access denied: location not in user scope';
    END IF;

    SELECT COALESCE(jsonb_agg(row ORDER BY captured_at_v DESC), '[]'::jsonb) INTO v_result
    FROM (
        SELECT
            jsonb_build_object(
                'id',                 op.id,
                'order_number',       o.order_number,
                'captured_at',        op.captured_at,
                'payment_method',     op.payment_method::text,
                'card_type',          op.card_type,
                'card_last_four',     op.card_last_four,
                'amount',             op.amount,
                'tip_amount',         op.tip_amount,
                'total_amount',       op.total_amount,
                'status',             op.status,
                'is_settled',         op.is_settled,
                'is_returned',        op.is_returned,
                'authorization_code', op.authorization_code,
                'transaction_id',     op.transaction_id,
                'rrn',                op.rrn,
                'batch_number',       op.batch_number,
                'acquirer',           op.acquirer
            ) AS row,
            op.captured_at AS captured_at_v
        FROM public.order_payments op
        LEFT JOIN public.orders o ON o.id = op.order_id
        WHERE op.settlement_batch_id = p_settlement_batch_id
    ) payments;

    RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_batch_payments_v1(uuid) TO authenticated;;
