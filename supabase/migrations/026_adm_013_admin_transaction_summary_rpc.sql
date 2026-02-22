-- ============================================================================
-- Migration 026: ADM-013 Admin Transaction Summary RPC
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_admin_transaction_summary(
  p_merchant_ids uuid[] DEFAULT NULL,
  p_location_ids uuid[] DEFAULT NULL,
  p_status text[] DEFAULT NULL,
  p_payment_status text[] DEFAULT NULL,
  p_payment_method text[] DEFAULT NULL,
  p_date_from timestamptz DEFAULT NULL,
  p_date_to timestamptz DEFAULT NULL,
  p_min_amount numeric DEFAULT NULL,
  p_max_amount numeric DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_card_type text DEFAULT NULL,
  p_staff_id uuid DEFAULT NULL,
  p_sort_by text DEFAULT 'initiated_at',
  p_sort_dir text DEFAULT 'desc'
)
RETURNS TABLE (
  current_period_from timestamptz,
  current_period_to timestamptz,
  previous_period_from timestamptz,
  previous_period_to timestamptz,
  current_total_transactions bigint,
  previous_total_transactions bigint,
  current_card_revenue numeric,
  previous_card_revenue numeric,
  current_card_count bigint,
  previous_card_count bigint,
  current_cash_revenue numeric,
  previous_cash_revenue numeric,
  current_cash_count bigint,
  previous_cash_count bigint,
  current_total_revenue numeric,
  previous_total_revenue numeric,
  current_avg_tip numeric,
  previous_avg_tip numeric,
  current_avg_tip_pct numeric,
  previous_avg_tip_pct numeric,
  current_void_return_count bigint,
  previous_void_return_count bigint,
  current_void_return_amount numeric,
  previous_void_return_amount numeric,
  current_void_rate_pct numeric,
  previous_void_rate_pct numeric
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_search text := NULLIF(trim(p_search), '');
  v_allowed_merchants uuid[];
  v_filter_merchants uuid[];
  v_card_tokens text[];
  v_current_from timestamptz;
  v_current_to timestamptz;
  v_previous_from timestamptz;
  v_previous_to timestamptz;
  v_window interval;
BEGIN
  IF NOT public.is_dexapos_admin() THEN
    RETURN;
  END IF;

  -- Keep signature parity with list RPC (sorting is ignored for aggregates).
  PERFORM p_sort_by, p_sort_dir;

  v_current_from := COALESCE(p_date_from, date_trunc('day', now()) - interval '29 days');
  v_current_to := COALESCE(p_date_to, now());

  IF p_date_from IS NULL AND p_date_to IS NOT NULL THEN
    v_current_from := p_date_to - interval '29 days';
  END IF;

  IF p_date_from IS NOT NULL AND p_date_to IS NULL THEN
    v_current_to := now();
  END IF;

  IF v_current_to <= v_current_from THEN
    v_current_to := v_current_from + interval '1 second';
  END IF;

  v_window := v_current_to - v_current_from;
  IF v_window < interval '1 second' THEN
    v_window := interval '1 day';
  END IF;

  v_previous_to := v_current_from;
  v_previous_from := v_current_from - v_window;

  SELECT COALESCE(array_agg(mid), ARRAY[]::uuid[])
  INTO v_allowed_merchants
  FROM public.get_admin_merchant_ids() AS mid;

  IF p_merchant_ids IS NULL OR array_length(p_merchant_ids, 1) IS NULL THEN
    v_filter_merchants := v_allowed_merchants;
  ELSE
    SELECT COALESCE(array_agg(mid), ARRAY[]::uuid[])
    INTO v_filter_merchants
    FROM unnest(p_merchant_ids) AS mid
    WHERE mid = ANY (v_allowed_merchants);
  END IF;

  IF NULLIF(trim(COALESCE(p_card_type, '')), '') IS NOT NULL THEN
    v_card_tokens := ARRAY(
      SELECT trim(token)
      FROM unnest(string_to_array(lower(p_card_type), ',')) AS token
      WHERE trim(token) <> ''
    );
  ELSE
    v_card_tokens := ARRAY[]::text[];
  END IF;

  RETURN QUERY
  WITH base AS (
    SELECT
      op.id AS payment_id,
      COALESCE(op.captured_at, op.initiated_at, o.created_at) AS event_ts,
      op.payment_method::text AS payment_method,
      op.status::text AS payment_status,
      op.total_amount::numeric AS total_amount,
      op.tip_amount::numeric AS tip_amount,
      op.amount::numeric AS amount,
      COALESCE(op.is_voided, false) AS is_voided,
      COALESCE(op.is_returned, false) AS is_returned,
      op.return_amount::numeric AS return_amount
    FROM public.order_payments op
    JOIN public.orders o
      ON o.id = op.order_id
    WHERE o.merchant_id = ANY (v_filter_merchants)
      AND (p_location_ids IS NULL OR o.location_id = ANY (p_location_ids))
      AND (p_status IS NULL OR o.status::text = ANY (p_status))
      AND (
        (p_payment_status IS NULL AND op.status::text <> ALL (ARRAY['pending', 'failed']))
        OR (p_payment_status IS NOT NULL AND op.status::text = ANY (p_payment_status))
      )
      AND (p_payment_method IS NULL OR op.payment_method::text = ANY (p_payment_method))
      AND (p_min_amount IS NULL OR op.total_amount >= p_min_amount)
      AND (p_max_amount IS NULL OR op.total_amount <= p_max_amount)
      AND (
        p_staff_id IS NULL
        OR op.processed_by_staff_id = p_staff_id
        OR o.created_by_staff_id = p_staff_id
      )
      AND (
        COALESCE(array_length(v_card_tokens, 1), 0) = 0
        OR EXISTS (
          SELECT 1
          FROM unnest(v_card_tokens) AS token
          WHERE lower(COALESCE(op.card_type, '')) LIKE '%' || token || '%'
        )
      )
      AND (
        v_search IS NULL
        OR COALESCE(o.order_number, '') ILIKE '%' || v_search || '%'
        OR COALESCE(o.display_number, '') ILIKE '%' || v_search || '%'
        OR COALESCE(o.customer_name, '') ILIKE '%' || v_search || '%'
        OR COALESCE(op.card_last_four, '') ILIKE '%' || v_search || '%'
        OR COALESCE(op.authorization_code, '') ILIKE '%' || v_search || '%'
        OR COALESCE(op.reference_number, '') ILIKE '%' || v_search || '%'
      )
  ),
  current_scope AS (
    SELECT *
    FROM base
    WHERE event_ts >= v_current_from
      AND event_ts <= v_current_to
  ),
  previous_scope AS (
    SELECT *
    FROM base
    WHERE event_ts >= v_previous_from
      AND event_ts < v_previous_to
  ),
  current_metrics AS (
    SELECT
      COUNT(*)::bigint AS total_transactions,
      COALESCE(
        SUM(
          CASE
            WHEN payment_status = 'captured'
              AND payment_method IN ('card', 'card_spinapi', 'card_dvpaylite')
            THEN total_amount
            ELSE 0
          END
        ),
        0
      )::numeric AS card_revenue,
      COUNT(*) FILTER (
        WHERE payment_status = 'captured'
          AND payment_method IN ('card', 'card_spinapi', 'card_dvpaylite')
      )::bigint AS card_count,
      COALESCE(
        SUM(
          CASE
            WHEN payment_status = 'captured' AND payment_method = 'cash'
            THEN total_amount
            ELSE 0
          END
        ),
        0
      )::numeric AS cash_revenue,
      COUNT(*) FILTER (
        WHERE payment_status = 'captured' AND payment_method = 'cash'
      )::bigint AS cash_count,
      COALESCE(
        AVG(
          CASE
            WHEN payment_status = 'captured'
              AND payment_method IN ('card', 'card_spinapi', 'card_dvpaylite')
            THEN tip_amount
            ELSE NULL
          END
        ),
        0
      )::numeric AS avg_tip,
      COALESCE(
        AVG(
          CASE
            WHEN payment_status = 'captured'
              AND payment_method IN ('card', 'card_spinapi', 'card_dvpaylite')
              AND amount > 0
            THEN (tip_amount / amount) * 100
            ELSE NULL
          END
        ),
        0
      )::numeric AS avg_tip_pct,
      COUNT(*) FILTER (
        WHERE is_voided OR is_returned
      )::bigint AS void_return_count,
      COALESCE(
        SUM(
          CASE
            WHEN is_returned THEN COALESCE(return_amount, 0)
            WHEN is_voided THEN COALESCE(total_amount, 0)
            ELSE 0
          END
        ),
        0
      )::numeric AS void_return_amount,
      CASE
        WHEN COUNT(*) > 0 THEN
          (
            COUNT(*) FILTER (WHERE is_voided OR is_returned)::numeric
            / COUNT(*)::numeric
          ) * 100
        ELSE 0
      END::numeric AS void_rate_pct
    FROM current_scope
  ),
  previous_metrics AS (
    SELECT
      COUNT(*)::bigint AS total_transactions,
      COALESCE(
        SUM(
          CASE
            WHEN payment_status = 'captured'
              AND payment_method IN ('card', 'card_spinapi', 'card_dvpaylite')
            THEN total_amount
            ELSE 0
          END
        ),
        0
      )::numeric AS card_revenue,
      COUNT(*) FILTER (
        WHERE payment_status = 'captured'
          AND payment_method IN ('card', 'card_spinapi', 'card_dvpaylite')
      )::bigint AS card_count,
      COALESCE(
        SUM(
          CASE
            WHEN payment_status = 'captured' AND payment_method = 'cash'
            THEN total_amount
            ELSE 0
          END
        ),
        0
      )::numeric AS cash_revenue,
      COUNT(*) FILTER (
        WHERE payment_status = 'captured' AND payment_method = 'cash'
      )::bigint AS cash_count,
      COALESCE(
        AVG(
          CASE
            WHEN payment_status = 'captured'
              AND payment_method IN ('card', 'card_spinapi', 'card_dvpaylite')
            THEN tip_amount
            ELSE NULL
          END
        ),
        0
      )::numeric AS avg_tip,
      COALESCE(
        AVG(
          CASE
            WHEN payment_status = 'captured'
              AND payment_method IN ('card', 'card_spinapi', 'card_dvpaylite')
              AND amount > 0
            THEN (tip_amount / amount) * 100
            ELSE NULL
          END
        ),
        0
      )::numeric AS avg_tip_pct,
      COUNT(*) FILTER (
        WHERE is_voided OR is_returned
      )::bigint AS void_return_count,
      COALESCE(
        SUM(
          CASE
            WHEN is_returned THEN COALESCE(return_amount, 0)
            WHEN is_voided THEN COALESCE(total_amount, 0)
            ELSE 0
          END
        ),
        0
      )::numeric AS void_return_amount,
      CASE
        WHEN COUNT(*) > 0 THEN
          (
            COUNT(*) FILTER (WHERE is_voided OR is_returned)::numeric
            / COUNT(*)::numeric
          ) * 100
        ELSE 0
      END::numeric AS void_rate_pct
    FROM previous_scope
  )
  SELECT
    v_current_from,
    v_current_to,
    v_previous_from,
    v_previous_to,
    cm.total_transactions,
    pm.total_transactions,
    cm.card_revenue,
    pm.card_revenue,
    cm.card_count,
    pm.card_count,
    cm.cash_revenue,
    pm.cash_revenue,
    cm.cash_count,
    pm.cash_count,
    (cm.card_revenue + cm.cash_revenue)::numeric AS current_total_revenue,
    (pm.card_revenue + pm.cash_revenue)::numeric AS previous_total_revenue,
    cm.avg_tip,
    pm.avg_tip,
    cm.avg_tip_pct,
    pm.avg_tip_pct,
    cm.void_return_count,
    pm.void_return_count,
    cm.void_return_amount,
    pm.void_return_amount,
    cm.void_rate_pct,
    pm.void_rate_pct
  FROM current_metrics cm
  CROSS JOIN previous_metrics pm;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_admin_transaction_summary(
  uuid[], uuid[], text[], text[], text[], timestamptz, timestamptz,
  numeric, numeric, text, text, uuid, text, text
) TO authenticated;

COMMENT ON FUNCTION public.get_admin_transaction_summary(
  uuid[], uuid[], text[], text[], text[], timestamptz, timestamptz,
  numeric, numeric, text, text, uuid, text, text
)
IS 'HQ admin summary aggregates with assignment-scoped merchant intersection and prior-equivalent-period comparison.';
