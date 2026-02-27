-- ============================================================================
-- Migration 028: ADM-014 Merchant Breakdown RPC
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_admin_merchant_breakdown(
  p_merchant_ids uuid[] DEFAULT NULL,
  p_location_ids uuid[] DEFAULT NULL,
  p_payment_status text[] DEFAULT NULL,
  p_date_from timestamptz DEFAULT NULL,
  p_date_to timestamptz DEFAULT NULL
)
RETURNS TABLE (
  merchant_id uuid,
  merchant_name text,
  location_count bigint,
  transaction_count bigint,
  card_revenue numeric,
  cash_revenue numeric,
  total_revenue numeric,
  avg_ticket numeric,
  tip_total numeric,
  void_count bigint,
  void_rate_pct numeric,
  daily_revenue_trend jsonb
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_allowed_merchants uuid[];
  v_filter_merchants uuid[];
  v_from timestamptz;
  v_to timestamptz;
BEGIN
  IF NOT public.is_dexapos_admin() THEN
    RETURN;
  END IF;

  v_from := COALESCE(p_date_from, date_trunc('day', now()) - interval '29 days');
  v_to := COALESCE(p_date_to, now());

  IF p_date_from IS NULL AND p_date_to IS NOT NULL THEN
    v_from := p_date_to - interval '29 days';
  END IF;

  IF p_date_from IS NOT NULL AND p_date_to IS NULL THEN
    v_to := now();
  END IF;

  IF v_to <= v_from THEN
    v_to := v_from + interval '1 second';
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
  WITH base AS (
    SELECT
      o.merchant_id,
      m.name AS merchant_name,
      o.location_id,
      op.id AS payment_id,
      COALESCE(op.captured_at, op.initiated_at, o.created_at) AS event_ts,
      op.payment_method::text AS payment_method,
      op.status::text AS payment_status,
      COALESCE(op.total_amount, 0)::numeric AS total_amount,
      COALESCE(op.tip_amount, 0)::numeric AS tip_amount,
      COALESCE(op.is_voided, false) AS is_voided,
      COALESCE(op.is_returned, false) AS is_returned
    FROM public.order_payments op
    JOIN public.orders o
      ON o.id = op.order_id
    JOIN public.merchants m
      ON m.id = o.merchant_id
    WHERE o.merchant_id = ANY (v_filter_merchants)
      AND (p_location_ids IS NULL OR o.location_id = ANY (p_location_ids))
      AND COALESCE(op.captured_at, op.initiated_at, o.created_at) >= v_from
      AND COALESCE(op.captured_at, op.initiated_at, o.created_at) <= v_to
      AND (
        (p_payment_status IS NULL AND op.status::text <> ALL (ARRAY['pending', 'failed']))
        OR (p_payment_status IS NOT NULL AND op.status::text = ANY (p_payment_status))
      )
  ),
  merchant_rollup AS (
    SELECT
      b.merchant_id,
      b.merchant_name,
      COUNT(DISTINCT b.location_id)::bigint AS location_count,
      COUNT(*)::bigint AS transaction_count,
      COALESCE(
        SUM(
          CASE
            WHEN b.payment_status = 'captured'
              AND b.payment_method IN ('card', 'card_spinapi', 'card_dvpaylite')
            THEN b.total_amount
            ELSE 0
          END
        ),
        0
      )::numeric AS card_revenue,
      COALESCE(
        SUM(
          CASE
            WHEN b.payment_status = 'captured' AND b.payment_method = 'cash'
            THEN b.total_amount
            ELSE 0
          END
        ),
        0
      )::numeric AS cash_revenue,
      COALESCE(
        SUM(
          CASE
            WHEN b.payment_status = 'captured' THEN b.total_amount
            ELSE 0
          END
        ),
        0
      )::numeric AS total_revenue,
      COALESCE(
        AVG(
          CASE
            WHEN b.payment_status = 'captured' THEN b.total_amount
            ELSE NULL
          END
        ),
        0
      )::numeric AS avg_ticket,
      COALESCE(
        SUM(
          CASE
            WHEN b.payment_status = 'captured' THEN b.tip_amount
            ELSE 0
          END
        ),
        0
      )::numeric AS tip_total,
      COUNT(*) FILTER (WHERE b.is_voided OR b.is_returned)::bigint AS void_count
    FROM base b
    GROUP BY b.merchant_id, b.merchant_name
  ),
  daily AS (
    SELECT
      b.merchant_id,
      date_trunc('day', b.event_ts)::date AS day,
      COALESCE(
        SUM(
          CASE
            WHEN b.payment_status = 'captured' THEN b.total_amount
            ELSE 0
          END
        ),
        0
      )::numeric AS daily_revenue
    FROM base b
    GROUP BY b.merchant_id, date_trunc('day', b.event_ts)::date
  ),
  trend AS (
    SELECT
      d.merchant_id,
      jsonb_agg(
        jsonb_build_object(
          'date', to_char(d.day, 'YYYY-MM-DD'),
          'revenue', d.daily_revenue
        )
        ORDER BY d.day
      ) AS daily_revenue_trend
    FROM daily d
    GROUP BY d.merchant_id
  )
  SELECT
    mr.merchant_id,
    mr.merchant_name::text,
    mr.location_count,
    mr.transaction_count,
    mr.card_revenue,
    mr.cash_revenue,
    mr.total_revenue,
    mr.avg_ticket,
    mr.tip_total,
    mr.void_count,
    CASE
      WHEN mr.transaction_count > 0 THEN
        (mr.void_count::numeric / mr.transaction_count::numeric) * 100
      ELSE 0
    END::numeric AS void_rate_pct,
    COALESCE(t.daily_revenue_trend, '[]'::jsonb) AS daily_revenue_trend
  FROM merchant_rollup mr
  LEFT JOIN trend t
    ON t.merchant_id = mr.merchant_id
  ORDER BY mr.total_revenue DESC, mr.transaction_count DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_admin_merchant_breakdown(
  uuid[], uuid[], text[], timestamptz, timestamptz
) TO authenticated;

COMMENT ON FUNCTION public.get_admin_merchant_breakdown(
  uuid[], uuid[], text[], timestamptz, timestamptz
)
IS 'HQ admin merchant-level transaction breakdown with date-range and scoped merchant filters, including daily revenue trend sparkline data.';
