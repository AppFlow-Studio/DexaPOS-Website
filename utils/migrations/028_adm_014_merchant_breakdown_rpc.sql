-- ============================================================================
-- Migration 028: ADM-014 Merchant Breakdown RPC (v2)
-- ============================================================================
-- This replaces the original ADM-014 function with the v2 implementation:
-- 1) Uses order_payments.merchant_id/location_id directly for filtering.
-- 2) Adds refund/return amount metrics.
-- 3) Adds distinct order_count alongside transaction_count.
-- 4) Adds last_transaction_at recency field.
-- 5) Gap-fills daily_revenue_trend with zero days.
-- 6) Adds prior-period comparison metrics.
-- 7) Adds unsettled_amount and total_fees metrics.
-- 8) Adds payment_method_breakdown JSONB.
-- 9) Adds total_locations and active_locations.
-- 10) Rounds money outputs to 2 decimals where applicable.
-- 11) Adds cash_discount_count metric.

CREATE OR REPLACE FUNCTION public.get_admin_merchant_breakdown(
  p_merchant_ids   uuid[]       DEFAULT NULL,
  p_location_ids   uuid[]       DEFAULT NULL,
  p_payment_status text[]       DEFAULT NULL,
  p_date_from      timestamptz  DEFAULT NULL,
  p_date_to        timestamptz  DEFAULT NULL
)
RETURNS TABLE (
  merchant_id              uuid,
  merchant_name            text,
  total_locations          bigint,
  active_locations         bigint,
  order_count              bigint,
  transaction_count        bigint,
  card_revenue             numeric,
  cash_revenue             numeric,
  total_revenue            numeric,
  avg_ticket               numeric,
  tip_total                numeric,
  total_fees               numeric,
  void_count               bigint,
  refund_count             bigint,
  void_refund_amount       numeric,
  void_rate_pct            numeric,
  unsettled_amount         numeric,
  cash_discount_count      bigint,
  last_transaction_at      timestamptz,
  prior_total_revenue      numeric,
  revenue_change_pct       numeric,
  payment_method_breakdown jsonb,
  daily_revenue_trend      jsonb
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_allowed_merchants uuid[];
  v_filter_merchants  uuid[];
  v_from              timestamptz;
  v_to                timestamptz;
  v_period_days       int;
  v_prior_from        timestamptz;
  v_prior_to          timestamptz;
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

  v_period_days := GREATEST(EXTRACT(DAY FROM v_to - v_from)::int, 1);
  v_prior_from := v_from - (v_period_days || ' days')::interval;
  v_prior_to := v_from;

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
  WITH
  base AS (
    SELECT
      op.merchant_id,
      op.location_id,
      op.order_id,
      op.id AS payment_id,
      COALESCE(op.captured_at, op.initiated_at) AS event_ts,
      op.payment_method::text AS payment_method,
      op.status::text AS payment_status,
      COALESCE(op.total_amount, 0)::numeric AS total_amount,
      COALESCE(op.tip_amount, 0)::numeric AS tip_amount,
      COALESCE(op.gateway_fee, 0)::numeric AS gateway_fee,
      COALESCE(op.refunded_amount, 0)::numeric AS refunded_amount,
      COALESCE(op.return_amount, 0)::numeric AS return_amount,
      COALESCE(op.is_voided, false) AS is_voided,
      COALESCE(op.is_returned, false) AS is_returned,
      COALESCE(op.is_settled, false) AS is_settled,
      COALESCE(op.cash_discount_applied, false) AS cash_discount_applied
    FROM public.order_payments op
    WHERE op.merchant_id = ANY (v_filter_merchants)
      AND (p_location_ids IS NULL OR op.location_id = ANY (p_location_ids))
      AND COALESCE(op.captured_at, op.initiated_at) >= v_from
      AND COALESCE(op.captured_at, op.initiated_at) <= v_to
      AND (
        (p_payment_status IS NULL AND op.status::text NOT IN ('pending', 'failed'))
        OR (p_payment_status IS NOT NULL AND op.status::text = ANY (p_payment_status))
      )
  ),

  prior_period AS (
    SELECT
      op.merchant_id,
      COALESCE(
        SUM(
          CASE
            WHEN op.status::text = 'captured' THEN COALESCE(op.total_amount, 0)
            ELSE 0
          END
        ),
        0
      )::numeric AS prior_revenue
    FROM public.order_payments op
    WHERE op.merchant_id = ANY (v_filter_merchants)
      AND (p_location_ids IS NULL OR op.location_id = ANY (p_location_ids))
      AND COALESCE(op.captured_at, op.initiated_at) >= v_prior_from
      AND COALESCE(op.captured_at, op.initiated_at) < v_prior_to
      AND op.status::text NOT IN ('pending', 'failed')
    GROUP BY op.merchant_id
  ),

  all_locations AS (
    SELECT
      l.merchant_id,
      COUNT(*)::bigint AS total_locations
    FROM public.locations l
    WHERE l.merchant_id = ANY (v_filter_merchants)
      AND l.is_active = true
    GROUP BY l.merchant_id
  ),

  merchant_rollup AS (
    SELECT
      b.merchant_id,
      COUNT(DISTINCT b.location_id)::bigint AS active_locations,
      COUNT(DISTINCT b.order_id)::bigint AS order_count,
      COUNT(*)::bigint AS transaction_count,

      ROUND(
        COALESCE(
          SUM(
            CASE
              WHEN b.payment_status = 'captured' AND b.payment_method = 'card'
              THEN b.total_amount
              ELSE 0
            END
          ),
          0
        ),
        2
      ) AS card_revenue,

      ROUND(
        COALESCE(
          SUM(
            CASE
              WHEN b.payment_status = 'captured' AND b.payment_method = 'cash'
              THEN b.total_amount
              ELSE 0
            END
          ),
          0
        ),
        2
      ) AS cash_revenue,

      ROUND(
        COALESCE(
          SUM(
            CASE
              WHEN b.payment_status = 'captured' THEN b.total_amount
              ELSE 0
            END
          ),
          0
        ),
        2
      ) AS total_revenue,

      ROUND(
        COALESCE(
          AVG(
            CASE
              WHEN b.payment_status = 'captured' THEN b.total_amount
              ELSE NULL
            END
          ),
          0
        ),
        2
      ) AS avg_ticket,

      ROUND(
        COALESCE(
          SUM(
            CASE
              WHEN b.payment_status = 'captured' THEN b.tip_amount
              ELSE 0
            END
          ),
          0
        ),
        2
      ) AS tip_total,

      ROUND(COALESCE(SUM(b.gateway_fee), 0), 2) AS total_fees,

      COUNT(*) FILTER (WHERE b.is_voided)::bigint AS void_count,
      COUNT(*) FILTER (WHERE b.payment_status IN ('refunded', 'partially_refunded'))::bigint AS refund_count,

      ROUND(
        COALESCE(
          SUM(CASE WHEN b.is_voided THEN b.total_amount ELSE 0 END) +
          SUM(b.refunded_amount) +
          SUM(b.return_amount),
          0
        ),
        2
      ) AS void_refund_amount,

      ROUND(
        COALESCE(
          SUM(
            CASE
              WHEN b.payment_status = 'captured' AND NOT b.is_settled
              THEN b.total_amount
              ELSE 0
            END
          ),
          0
        ),
        2
      ) AS unsettled_amount,

      COUNT(*) FILTER (WHERE b.cash_discount_applied)::bigint AS cash_discount_count,
      MAX(b.event_ts) AS last_transaction_at
    FROM base b
    GROUP BY b.merchant_id
  ),

  method_breakdown AS (
    SELECT
      b.merchant_id,
      jsonb_agg(
        jsonb_build_object(
          'method', b.payment_method,
          'count', b.cnt,
          'amount', b.amt
        ) ORDER BY b.amt DESC
      ) AS payment_method_breakdown
    FROM (
      SELECT
        base_tx.merchant_id,
        base_tx.payment_method,
        COUNT(*)::bigint AS cnt,
        ROUND(
          COALESCE(
            SUM(CASE WHEN base_tx.payment_status = 'captured' THEN base_tx.total_amount ELSE 0 END),
            0
          ),
          2
        ) AS amt
      FROM base AS base_tx
      GROUP BY base_tx.merchant_id, base_tx.payment_method
    ) b
    GROUP BY b.merchant_id
  ),

  date_series AS (
    SELECT d::date AS day
    FROM generate_series(
      date_trunc('day', v_from)::date,
      date_trunc('day', v_to)::date,
      '1 day'::interval
    ) AS d
  ),

  merchant_ids_cte AS (
    SELECT DISTINCT base_ids.merchant_id
    FROM base AS base_ids
  ),

  daily_filled AS (
    SELECT
      mi.merchant_id,
      ds.day,
      COALESCE(
        SUM(CASE WHEN b.payment_status = 'captured' THEN b.total_amount ELSE 0 END),
        0
      )::numeric AS daily_revenue
    FROM merchant_ids_cte mi
    CROSS JOIN date_series ds
    LEFT JOIN base b
      ON b.merchant_id = mi.merchant_id
      AND date_trunc('day', b.event_ts)::date = ds.day
    GROUP BY mi.merchant_id, ds.day
  ),

  trend AS (
    SELECT
      df.merchant_id,
      jsonb_agg(
        jsonb_build_object(
          'date', to_char(df.day, 'YYYY-MM-DD'),
          'revenue', ROUND(df.daily_revenue, 2)
        ) ORDER BY df.day
      ) AS daily_revenue_trend
    FROM daily_filled df
    GROUP BY df.merchant_id
  )

  SELECT
    mr.merchant_id,
    m.name::text AS merchant_name,
    COALESCE(al.total_locations, 0)::bigint AS total_locations,
    mr.active_locations,
    mr.order_count,
    mr.transaction_count,
    mr.card_revenue,
    mr.cash_revenue,
    mr.total_revenue,
    mr.avg_ticket,
    mr.tip_total,
    mr.total_fees,
    mr.void_count,
    mr.refund_count,
    mr.void_refund_amount,
    CASE
      WHEN mr.transaction_count > 0
      THEN ROUND((mr.void_count::numeric / mr.transaction_count) * 100, 2)
      ELSE 0
    END::numeric AS void_rate_pct,
    mr.unsettled_amount,
    mr.cash_discount_count,
    mr.last_transaction_at,
    COALESCE(pp.prior_revenue, 0)::numeric AS prior_total_revenue,
    CASE
      WHEN COALESCE(pp.prior_revenue, 0) > 0
      THEN ROUND(((mr.total_revenue - pp.prior_revenue) / pp.prior_revenue) * 100, 1)
      WHEN mr.total_revenue > 0 THEN 100.0
      ELSE 0
    END::numeric AS revenue_change_pct,
    COALESCE(mb.payment_method_breakdown, '[]'::jsonb) AS payment_method_breakdown,
    COALESCE(t.daily_revenue_trend, '[]'::jsonb) AS daily_revenue_trend
  FROM merchant_rollup mr
  JOIN public.merchants m ON m.id = mr.merchant_id
  LEFT JOIN all_locations al ON al.merchant_id = mr.merchant_id
  LEFT JOIN prior_period pp ON pp.merchant_id = mr.merchant_id
  LEFT JOIN method_breakdown mb ON mb.merchant_id = mr.merchant_id
  LEFT JOIN trend t ON t.merchant_id = mr.merchant_id
  ORDER BY mr.total_revenue DESC, mr.transaction_count DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_admin_merchant_breakdown(
  uuid[], uuid[], text[], timestamptz, timestamptz
) TO authenticated;

COMMENT ON FUNCTION public.get_admin_merchant_breakdown(
  uuid[], uuid[], text[], timestamptz, timestamptz
)
IS 'v2 HQ admin merchant breakdown: revenue, voids, refunds, tips, fees, settlement, dual-pricing, prior-period comparison, gap-filled daily trend, and payment-method breakdown.';
