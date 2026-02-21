-- ============================================================================
-- ANALYTICS LAYER 2 — RPC FUNCTIONS
-- Paste all of this into Supabase SQL Editor and run
-- ============================================================================

-- SECTION 2A: GROWTH METRICS
-- ============================================================================

CREATE OR REPLACE FUNCTION get_merchant_acquisition(p_from TIMESTAMPTZ, p_to TIMESTAMPTZ)
RETURNS TABLE(period TEXT, new_merchants BIGINT, new_locations BIGINT) AS $$
BEGIN
  RETURN QUERY
  SELECT
    TO_CHAR(DATE_TRUNC('week', m.created_at)::DATE, 'YYYY-MM-DD') as period,
    COUNT(DISTINCT m.id)::BIGINT as new_merchants,
    COUNT(DISTINCT l.id)::BIGINT as new_locations
  FROM merchants m
  LEFT JOIN locations l ON l.merchant_id = m.id AND l.created_at >= p_from AND l.created_at < p_to
  WHERE m.created_at >= p_from AND m.created_at < p_to
  GROUP BY DATE_TRUNC('week', m.created_at)
  ORDER BY period;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION get_merchant_retention(
  p_from TIMESTAMPTZ,
  p_to   TIMESTAMPTZ
)
RETURNS TABLE(
  retained BIGINT,
  churned BIGINT,
  new_merchants BIGINT,
  retention_rate NUMERIC
) AS $$
DECLARE
  v_window_days INT;
  v_prev_start  TIMESTAMPTZ;
  v_prev_end    TIMESTAMPTZ;
BEGIN
  -- Calculate window size
  v_window_days := EXTRACT(DAY FROM (p_to - p_from));
  v_prev_start  := p_from - (v_window_days || ' days')::INTERVAL;
  v_prev_end    := p_from;

  RETURN QUERY
  WITH current_active AS (
    SELECT DISTINCT merchant_id
    FROM orders
    WHERE created_at >= p_from
      AND created_at < p_to
  ),
  previous_active AS (
    SELECT DISTINCT merchant_id
    FROM orders
    WHERE created_at >= v_prev_start
      AND created_at < v_prev_end
  ),
  new_merchants_cte AS (
    SELECT COUNT(*)::BIGINT AS cnt
    FROM merchants
    WHERE created_at >= p_from
      AND created_at < p_to
  )

  SELECT
    -- Retained = active in both periods
    COUNT(DISTINCT pa.merchant_id)
      FILTER (WHERE ca.merchant_id IS NOT NULL)::BIGINT AS retained,

    -- Churned = active before but not now
    COUNT(DISTINCT pa.merchant_id)
      FILTER (WHERE ca.merchant_id IS NULL)::BIGINT AS churned,

    -- Newly created merchants in current window
    (SELECT cnt FROM new_merchants_cte) AS new_merchants,

    -- Retention %
    CASE
      WHEN COUNT(DISTINCT pa.merchant_id) > 0 THEN
        (
          COUNT(DISTINCT pa.merchant_id)
          FILTER (WHERE ca.merchant_id IS NOT NULL)::NUMERIC
          / COUNT(DISTINCT pa.merchant_id)
        * 100
        )::NUMERIC(5,2)
      ELSE 0::NUMERIC
    END AS retention_rate

  FROM previous_active pa
  LEFT JOIN current_active ca
    ON pa.merchant_id = ca.merchant_id;

END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION get_churn_risk_merchants(
  p_from TIMESTAMPTZ,
  p_to   TIMESTAMPTZ
)
RETURNS TABLE(
  merchant_id UUID,
  merchant_name TEXT,
  last_period_revenue NUMERIC,
  current_revenue NUMERIC,
  change_pct NUMERIC
) AS $$
DECLARE
  v_window_days INT;
  v_prev_start  TIMESTAMPTZ;
  v_prev_end    TIMESTAMPTZ;
BEGIN
  -- Calculate window size correctly
  v_window_days := EXTRACT(DAY FROM (p_to - p_from));
  v_prev_start  := p_from - (v_window_days || ' days')::INTERVAL;
  v_prev_end    := p_from;

  RETURN QUERY
  WITH current_rev AS (
    SELECT 
      o.merchant_id,
      COALESCE(SUM(o.total_amount), 0) AS revenue
    FROM orders o
    WHERE o.created_at >= p_from
      AND o.created_at < p_to
      AND o.status NOT IN ('draft', 'cancelled', 'void')
    GROUP BY o.merchant_id
  ),
  previous_rev AS (
    SELECT 
      o.merchant_id,
      COALESCE(SUM(o.total_amount), 0) AS revenue
    FROM orders o
    WHERE o.created_at >= v_prev_start
      AND o.created_at < v_prev_end
      AND o.status NOT IN ('draft', 'cancelled', 'void')
    GROUP BY o.merchant_id
  )

  SELECT
    cr.merchant_id,
    m.name::TEXT,
    pr.revenue::NUMERIC AS last_period_revenue,
    cr.revenue::NUMERIC AS current_revenue,
    CASE
      WHEN pr.revenue > 0
      THEN ((cr.revenue - pr.revenue) / pr.revenue * 100)::NUMERIC(5,2)
      ELSE 0::NUMERIC
    END AS change_pct

  FROM current_rev cr
  JOIN previous_rev pr
    ON cr.merchant_id = pr.merchant_id
  JOIN merchants m
    ON cr.merchant_id = m.id

  WHERE pr.revenue > 0
    AND ((cr.revenue - pr.revenue) / pr.revenue) < -0.5

  ORDER BY change_pct;

END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION get_avg_time_to_first_order(p_from TIMESTAMPTZ, p_to TIMESTAMPTZ)
RETURNS TABLE(avg_days NUMERIC) AS $$
BEGIN
  RETURN QUERY
  SELECT
    AVG(EXTRACT(EPOCH FROM (o.created_at - m.created_at)) / 86400)::NUMERIC(5,2) as avg_days
  FROM merchants m
  JOIN LATERAL (
    SELECT created_at FROM orders WHERE merchant_id = m.id ORDER BY created_at LIMIT 1
  ) o ON TRUE
  WHERE m.created_at >= p_from AND m.created_at < p_to
    AND o.created_at >= p_from AND o.created_at < p_to;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION get_onboarding_funnel(p_from TIMESTAMPTZ, p_to TIMESTAMPTZ)
RETURNS TABLE(stage TEXT, merchant_count BIGINT) AS $$
BEGIN
  RETURN QUERY
  WITH created_merchants AS (
    SELECT COUNT(DISTINCT id)::BIGINT as cnt FROM merchants WHERE created_at >= p_from AND created_at < p_to
  ),
  with_menu AS (
    SELECT COUNT(DISTINCT m.id)::BIGINT as cnt
    FROM merchants m
    WHERE m.created_at >= p_from AND m.created_at < p_to
      AND EXISTS (SELECT 1 FROM menu_items mi WHERE mi.merchant_id = m.id LIMIT 1)
  ),
  with_staff AS (
    SELECT COUNT(DISTINCT m.id)::BIGINT as cnt
    FROM merchants m
    WHERE m.created_at >= p_from AND m.created_at < p_to
      AND EXISTS (SELECT 1 FROM staff_profiles sp WHERE sp.merchant_id = m.id LIMIT 1)
  ),
  with_first_order AS (
    SELECT COUNT(DISTINCT m.id)::BIGINT as cnt
    FROM merchants m
    WHERE m.created_at >= p_from AND m.created_at < p_to
      AND EXISTS (SELECT 1 FROM orders o WHERE o.merchant_id = m.id LIMIT 1)
  ),
  steady_state AS (
    SELECT COUNT(DISTINCT o.merchant_id)::BIGINT as cnt
    FROM orders o
    WHERE o.created_at >= p_from AND o.created_at < p_to
    GROUP BY o.merchant_id
    HAVING COUNT(*) >= 5
  )
  SELECT 'Merchant Created' as stage, (SELECT cnt FROM created_merchants) as merchant_count
  UNION ALL
  SELECT 'Menu Setup', (SELECT cnt FROM with_menu)
  UNION ALL
  SELECT 'Staff Added', (SELECT cnt FROM with_staff)
  UNION ALL
  SELECT 'First Order', (SELECT cnt FROM with_first_order)
  UNION ALL
  SELECT 'Steady State (5+ orders)', (SELECT cnt FROM steady_state);
END;
$$ LANGUAGE plpgsql;

-- SECTION 2B: REVENUE METRICS
-- ============================================================================

CREATE OR REPLACE FUNCTION get_platform_gmv_by_day(p_from TIMESTAMPTZ, p_to TIMESTAMPTZ)
RETURNS TABLE(date DATE, revenue NUMERIC, order_count BIGINT) AS $$
BEGIN
  RETURN QUERY
  SELECT
    DATE(o.created_at) as date,
    COALESCE(SUM(o.total_amount), 0)::NUMERIC as revenue,
    COUNT(*)::BIGINT as order_count
  FROM orders o
  WHERE o.created_at >= p_from AND o.created_at < p_to
    AND o.status NOT IN ('draft', 'cancelled', 'void')
  GROUP BY DATE(o.created_at)
  ORDER BY date;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION get_revenue_by_merchant(p_from TIMESTAMPTZ, p_to TIMESTAMPTZ)
RETURNS TABLE(merchant_id UUID, merchant_name TEXT, revenue NUMERIC) AS $$
BEGIN
  RETURN QUERY
  SELECT
    m.id,
    m.name,
    COALESCE(SUM(o.total_amount), 0)::NUMERIC as revenue
  FROM merchants m
  LEFT JOIN orders o ON o.merchant_id = m.id
    AND o.created_at >= p_from AND o.created_at < p_to
    AND o.status NOT IN ('draft', 'cancelled', 'void')
  GROUP BY m.id, m.name
  ORDER BY revenue DESC
  LIMIT 20;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION get_revenue_by_order_type(p_from TIMESTAMPTZ, p_to TIMESTAMPTZ)
RETURNS TABLE(order_type TEXT, revenue NUMERIC, order_count BIGINT) AS $$
BEGIN
  RETURN QUERY
  SELECT
    o.order_type::TEXT,
    COALESCE(SUM(o.total_amount), 0)::NUMERIC as revenue,
    COUNT(*)::BIGINT as order_count
  FROM orders o
  WHERE o.created_at >= p_from AND o.created_at < p_to
    AND o.status NOT IN ('draft', 'cancelled', 'void')
  GROUP BY o.order_type
  ORDER BY revenue DESC;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION get_payment_method_mix(
  p_from TIMESTAMPTZ,
  p_to   TIMESTAMPTZ
)
RETURNS TABLE(
  payment_method TEXT,
  txn_count BIGINT,
  total_amount NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    op.payment_method::TEXT,
    COUNT(*)::BIGINT AS txn_count,
    COALESCE(SUM(op.total_amount), 0)::NUMERIC AS total_amount
  FROM order_payments op
  WHERE op.initiated_at >= p_from
    AND op.initiated_at < p_to
  GROUP BY op.payment_method
  ORDER BY txn_count DESC;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION get_cash_vs_card_split(p_from TIMESTAMPTZ, p_to TIMESTAMPTZ)
RETURNS TABLE(pricing_mode TEXT, order_count BIGINT, revenue NUMERIC) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COALESCE(o.payment_pricing_mode::TEXT, 'unknown') as pricing_mode,
    COUNT(*)::BIGINT as order_count,
    COALESCE(SUM(o.total_amount), 0)::NUMERIC as revenue
  FROM orders o
  WHERE o.created_at >= p_from AND o.created_at < p_to
    AND o.status NOT IN ('draft', 'cancelled', 'void')
  GROUP BY o.payment_pricing_mode
  ORDER BY order_count DESC;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION get_avg_ticket_by_day(p_from TIMESTAMPTZ, p_to TIMESTAMPTZ)
RETURNS TABLE(date DATE, avg_ticket NUMERIC) AS $$
BEGIN
  RETURN QUERY
  SELECT
    DATE(o.created_at) as date,
    AVG(o.total_amount)::NUMERIC(8,2) as avg_ticket
  FROM orders o
  WHERE o.created_at >= p_from AND o.created_at < p_to
    AND o.status NOT IN ('draft', 'cancelled', 'void')
  GROUP BY DATE(o.created_at)
  ORDER BY date;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION get_tip_rate_by_day(
  p_from TIMESTAMPTZ,
  p_to   TIMESTAMPTZ
)
RETURNS TABLE(date DATE, tip_rate_pct NUMERIC) AS $$
BEGIN
  RETURN QUERY
  SELECT
    DATE(op.initiated_at) AS date,
    CASE
      WHEN SUM(op.total_amount) > 0
      THEN (SUM(op.tip_amount)::NUMERIC / SUM(op.total_amount) * 100)::NUMERIC(5,2)
      ELSE 0::NUMERIC
    END AS tip_rate_pct
  FROM order_payments op
  WHERE op.initiated_at >= p_from
    AND op.initiated_at < p_to
  GROUP BY DATE(op.initiated_at)
  ORDER BY date;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION get_refund_rate_by_day(
  p_from TIMESTAMPTZ,
  p_to   TIMESTAMPTZ
)
RETURNS TABLE(date DATE, refund_rate_pct NUMERIC) AS $$
BEGIN
  RETURN QUERY
  SELECT
    DATE(op.initiated_at) AS date,
    CASE
      WHEN SUM(op.total_amount) > 0
      THEN (
        SUM(CASE WHEN op.status IN ('refunded', 'partially_refunded')
                 THEN op.amount ELSE 0 END)::NUMERIC
        / SUM(op.total_amount) * 100
      )::NUMERIC(5,2)
      ELSE 0::NUMERIC
    END AS refund_rate_pct
  FROM order_payments op
  WHERE op.initiated_at >= p_from
    AND op.initiated_at < p_to
  GROUP BY DATE(op.initiated_at)
  ORDER BY date;
END;
$$ LANGUAGE plpgsql;

-- SECTION 2C: OPERATIONAL METRICS
-- ============================================================================

CREATE OR REPLACE FUNCTION get_peak_hours_heatmap(p_from TIMESTAMPTZ, p_to TIMESTAMPTZ)
RETURNS TABLE(day_of_week INT, hour INT, order_count BIGINT) AS $$
BEGIN
  RETURN QUERY
  SELECT
    EXTRACT(DOW FROM o.created_at)::INT as day_of_week,
    EXTRACT(HOUR FROM o.created_at)::INT as hour,
    COUNT(*)::BIGINT as order_count
  FROM orders o
  WHERE o.created_at >= p_from AND o.created_at < p_to
  GROUP BY EXTRACT(DOW FROM o.created_at), EXTRACT(HOUR FROM o.created_at)
  ORDER BY day_of_week, hour;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION get_busiest_locations(p_from TIMESTAMPTZ, p_to TIMESTAMPTZ)
RETURNS TABLE(location_id UUID, location_name TEXT, merchant_name TEXT, order_count BIGINT) AS $$
BEGIN
  RETURN QUERY
  SELECT
    l.id,
    l.name,
    m.name,
    COUNT(*)::BIGINT as order_count
  FROM orders o
  JOIN locations l ON o.location_id = l.id
  JOIN merchants m ON o.merchant_id = m.id
  WHERE o.created_at >= p_from AND o.created_at < p_to
  GROUP BY l.id, l.name, m.name
  ORDER BY order_count DESC
  LIMIT 10;
END;
$$ LANGUAGE plpgsql;
--sda
CCREATE OR REPLACE FUNCTION get_avg_kitchen_time(
  p_from TIMESTAMPTZ,
  p_to   TIMESTAMPTZ
)
RETURNS TABLE(
  date DATE,
  avg_minutes NUMERIC,
  overall_avg NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  WITH daily_avg AS (
    SELECT
      DATE(kis.created_at) AS kitchen_date,
      AVG(EXTRACT(EPOCH FROM (kis.bumped_at - kis.created_at)) / 60)::NUMERIC(10,2) AS avg_min
    FROM kds_item_status kis
    WHERE kis.created_at >= p_from
      AND kis.created_at < p_to
      AND kis.bumped_at IS NOT NULL
    GROUP BY DATE(kis.created_at)
  )
  SELECT
    d.kitchen_date AS date,
    d.avg_min AS avg_minutes,
    (
      SELECT AVG(EXTRACT(EPOCH FROM (kis.bumped_at - kis.created_at)) / 60)::NUMERIC(10,2)
      FROM kds_item_status kis
      WHERE kis.created_at >= p_from
        AND kis.created_at < p_to
        AND kis.bumped_at IS NOT NULL
    ) AS overall_avg
  FROM daily_avg d
  ORDER BY d.kitchen_date;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION get_avg_table_turn_time(
  p_from TIMESTAMPTZ,
  p_to   TIMESTAMPTZ
)
RETURNS TABLE(
  date DATE,
  avg_minutes NUMERIC,
  overall_avg NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  WITH daily_avg AS (
    SELECT
      DATE(ts.seated_at) AS session_date,
      ROUND(
        AVG(
          COALESCE(
            ts.actual_duration,
            EXTRACT(EPOCH FROM (ts.closed_at - ts.seated_at)) / 60
          )
        ),
        2
      ) AS avg_min
    FROM table_sessions ts
    WHERE ts.seated_at >= p_from
      AND ts.seated_at < p_to
      AND ts.closed_at IS NOT NULL
    GROUP BY DATE(ts.seated_at)
  )
  SELECT
    d.session_date,
    d.avg_min,
    (
      SELECT ROUND(
        AVG(
          COALESCE(
            ts.actual_duration,
            EXTRACT(EPOCH FROM (ts.closed_at - ts.seated_at)) / 60
          )
        ),
        2
      )
      FROM table_sessions ts
      WHERE ts.seated_at >= p_from
        AND ts.seated_at < p_to
        AND ts.closed_at IS NOT NULL
    ) AS overall_avg
  FROM daily_avg d
  ORDER BY d.session_date;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION get_feature_adoption_rates(p_from TIMESTAMPTZ, p_to TIMESTAMPTZ)
RETURNS TABLE(feature TEXT, adopted_count BIGINT, total_merchants BIGINT, adoption_pct NUMERIC) AS $$
DECLARE
  v_total_merchants BIGINT;
BEGIN
  SELECT COUNT(DISTINCT id)::BIGINT INTO v_total_merchants FROM merchants;

  RETURN QUERY
  SELECT
    'kds'::TEXT as feature,
    COUNT(DISTINCT kd.merchant_id)::BIGINT,
    v_total_merchants,
    (COUNT(DISTINCT kd.merchant_id)::NUMERIC / NULLIF(v_total_merchants, 0) * 100)::NUMERIC(5,2)
  FROM kds_displays kd
  WHERE kd.is_active = true

  UNION ALL

  SELECT
    'table_management'::TEXT,
    COUNT(DISTINCT ts.merchant_id)::BIGINT,
    v_total_merchants,
    (COUNT(DISTINCT ts.merchant_id)::NUMERIC / NULLIF(v_total_merchants, 0) * 100)::NUMERIC(5,2)
  FROM table_sessions ts
  WHERE ts.seated_at >= p_from AND ts.seated_at < p_to

  UNION ALL

  SELECT
    'online_ordering'::TEXT,
    COUNT(DISTINCT o.merchant_id)::BIGINT,
    v_total_merchants,
    (COUNT(DISTINCT o.merchant_id)::NUMERIC / NULLIF(v_total_merchants, 0) * 100)::NUMERIC(5,2)
  FROM orders o
  WHERE o.created_at >= p_from AND o.created_at < p_to
    AND o.order_type = 'online';
END;
$$ LANGUAGE plpgsql;

-- SECTION 2D: PAYMENT METRICS
-- ============================================================================

CREATE OR REPLACE FUNCTION get_transaction_volume_by_day(p_from TIMESTAMPTZ, p_to TIMESTAMPTZ)
RETURNS TABLE(date DATE, txn_count BIGINT, total_amount NUMERIC) AS $$
BEGIN
  RETURN QUERY
  SELECT
    DATE(op.created_at) as date,
    COUNT(*)::BIGINT as txn_count,
    SUM(op.total_amount)::NUMERIC as total_amount
  FROM order_payments op
  WHERE op.created_at >= p_from AND op.created_at < p_to
  GROUP BY DATE(op.created_at)
  ORDER BY date;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION get_payment_failure_rate_by_day(p_from TIMESTAMPTZ, p_to TIMESTAMPTZ)
RETURNS TABLE(date DATE, total_txns BIGINT, failed_txns BIGINT, failure_rate_pct NUMERIC) AS $$
BEGIN
  RETURN QUERY
  SELECT
    DATE(op.created_at) as date,
    COUNT(*)::BIGINT as total_txns,
    COUNT(CASE WHEN op.status IN ('failed', 'declined') THEN 1 END)::BIGINT as failed_txns,
    CASE
      WHEN COUNT(*) > 0
      THEN (COUNT(CASE WHEN op.status IN ('failed', 'declined') THEN 1 END)::NUMERIC / COUNT(*) * 100)::NUMERIC(5,2)
      ELSE 0::NUMERIC
    END as failure_rate_pct
  FROM order_payments op
  WHERE op.created_at >= p_from AND op.created_at < p_to
  GROUP BY DATE(op.created_at)
  ORDER BY date;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION get_chargeback_volume_by_month(p_from TIMESTAMPTZ, p_to TIMESTAMPTZ)
RETURNS TABLE(month TEXT, chargeback_count BIGINT, total_amount NUMERIC) AS $$
BEGIN
  RETURN QUERY
  SELECT
    TO_CHAR(DATE_TRUNC('month', cb.received_at)::DATE, 'YYYY-MM') as month,
    COUNT(*)::BIGINT as chargeback_count,
    SUM(cb.amount)::NUMERIC as total_amount
  FROM chargebacks cb
  WHERE cb.received_at >= p_from AND cb.received_at < p_to
  GROUP BY DATE_TRUNC('month', cb.received_at)
  ORDER BY month;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION get_terminal_type_distribution(p_from TIMESTAMPTZ, p_to TIMESTAMPTZ)
RETURNS TABLE(terminal_type TEXT, terminal_count BIGINT) AS $$
BEGIN
  RETURN QUERY
  SELECT
    pt.terminal_type::TEXT,
    COUNT(*)::BIGINT as terminal_count
  FROM payment_terminals pt
  WHERE pt.is_active = true
  GROUP BY pt.terminal_type
  ORDER BY terminal_count DESC;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION get_dual_pricing_adoption(p_from TIMESTAMPTZ, p_to TIMESTAMPTZ)
RETURNS TABLE(adopted_merchants BIGINT, total_merchants BIGINT, adoption_pct NUMERIC) AS $$
DECLARE
  v_total_merchants BIGINT;
  v_adopted BIGINT;
BEGIN
  SELECT COUNT(DISTINCT id)::BIGINT INTO v_total_merchants FROM merchants;

  SELECT COUNT(DISTINCT merchant_id)::BIGINT INTO v_adopted
  FROM orders
  WHERE created_at >= p_from AND created_at < p_to
    AND cash_discount_applied = true;

  RETURN QUERY
  SELECT
    COALESCE(v_adopted, 0)::BIGINT,
    v_total_merchants,
    CASE
      WHEN v_total_merchants > 0
      THEN (COALESCE(v_adopted, 0)::NUMERIC / v_total_merchants * 100)::NUMERIC(5,2)
      ELSE 0::NUMERIC
    END;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION get_payment_summary_stats(
  p_from TIMESTAMPTZ,
  p_to   TIMESTAMPTZ
)
RETURNS TABLE(
  total_transactions BIGINT,
  total_failed BIGINT,
  overall_failure_rate NUMERIC,
  total_chargebacks BIGINT,
  total_chargeback_amount NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*)::BIGINT AS total_transactions,

    COUNT(
      CASE WHEN op.status IN ('failed', 'declined') THEN 1 END
    )::BIGINT AS total_failed,

    CASE
      WHEN COUNT(*) > 0
      THEN ROUND(
        COUNT(CASE WHEN op.status IN ('failed', 'declined') THEN 1 END)::NUMERIC
        / COUNT(*) * 100,
        2
      )
      ELSE 0
    END AS overall_failure_rate,

    (
      SELECT COUNT(*)::BIGINT
      FROM chargebacks cb
      WHERE cb.received_at >= p_from
        AND cb.received_at < p_to
    ) AS total_chargebacks,

    (
      SELECT COALESCE(SUM(cb.amount), 0)
      FROM chargebacks cb
      WHERE cb.received_at >= p_from
        AND cb.received_at < p_to
    ) AS total_chargeback_amount

  FROM order_payments op
  WHERE op.initiated_at >= p_from
    AND op.initiated_at < p_to;

END;
$$ LANGUAGE plpgsql;