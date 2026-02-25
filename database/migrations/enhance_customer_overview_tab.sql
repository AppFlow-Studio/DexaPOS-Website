-- =============================================================================
-- DEXA-CUST-002: Enhanced Customer Overview Tab
-- =============================================================================
-- RPC Functions for enriched customer analytics and insights
-- Supports: spend trends, visit patterns, enhanced activity timeline, top items
-- =============================================================================

-- =============================================================================
-- 1. GET CUSTOMER SPEND OVER TIME (Last 6 Months)  [WORKING - unchanged]
-- =============================================================================
-- Returns monthly spend aggregation for the last 6 months
-- Used for: Spend Over Time area chart

CREATE OR REPLACE FUNCTION get_customer_spend_trend(
  p_customer_id uuid,
  p_months integer DEFAULT 6
)
RETURNS TABLE (
  month text,
  month_date date,
  total_spend numeric,
  order_count bigint
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT
    to_char(DATE_TRUNC('month', o.created_at), 'Mon') AS month,
    DATE_TRUNC('month', o.created_at)::date AS month_date,
    COALESCE(SUM(o.total_amount), 0::numeric) AS total_spend,
    COUNT(*)::bigint AS order_count
  FROM orders o
  WHERE o.customer_id = p_customer_id
    AND o.created_at >= NOW() - (p_months || ' months')::interval
    AND o.status NOT IN ('cancelled', 'void')
  GROUP BY DATE_TRUNC('month', o.created_at)
  ORDER BY month_date ASC;
END;
$$;

-- =============================================================================
-- 2. GET CUSTOMER VISIT FREQUENCY PATTERN (Day + Time)  [WORKING - unchanged]
-- =============================================================================
-- Returns the day of week and hour this customer typically visits
-- Used for: "Usually visits on Saturdays around 11 AM"

CREATE OR REPLACE FUNCTION get_customer_visit_pattern(
  p_customer_id uuid,
  p_days integer DEFAULT 90
)
RETURNS TABLE (
  day_of_week text,
  hour_of_day integer,
  visit_count bigint,
  is_peak boolean
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN QUERY
  WITH visit_stats AS (
    SELECT
      TO_CHAR(o.created_at, 'Day') AS day_of_week,
      EXTRACT(HOUR FROM o.created_at)::integer AS hour_of_day,
      COUNT(*)::bigint AS visit_count,
      ROW_NUMBER() OVER (ORDER BY COUNT(*) DESC) AS rank
    FROM orders o
    WHERE o.customer_id = p_customer_id
      AND o.created_at >= NOW() - (p_days || ' days')::interval
      AND o.status NOT IN ('cancelled', 'void')
    GROUP BY TO_CHAR(o.created_at, 'Day'), EXTRACT(HOUR FROM o.created_at)
  )
  SELECT
    TRIM(visit_stats.day_of_week) AS day_of_week,
    visit_stats.hour_of_day,
    visit_stats.visit_count,
    (visit_stats.rank <= 3)::boolean AS is_peak
  FROM visit_stats
  ORDER BY visit_stats.visit_count DESC;
END;
$$;

-- =============================================================================
-- 3. GET MOST ORDERED ITEMS (Last 90 Days + New Favorites)  [FIXED]
-- =============================================================================
-- Fix: order_items.price -> unit_price
-- Fix: item count from order_items join (no item_count on orders)

CREATE OR REPLACE FUNCTION get_customer_top_items(
  p_customer_id uuid,
  p_days integer DEFAULT 90,
  p_limit integer DEFAULT 10
)
RETURNS TABLE (
  item_id uuid,
  item_name text,
  order_count bigint,
  total_spent numeric,
  last_ordered_at timestamp with time zone,
  is_new_favorite boolean,
  frequency_label text
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN QUERY
  WITH item_orders AS (
    SELECT
      COALESCE(oi.menu_item_id, '00000000-0000-0000-0000-000000000000'::uuid) AS item_id,
      oi.item_name,
      COUNT(*)::bigint AS order_count,
      COALESCE(SUM(oi.unit_price * oi.quantity), 0::numeric) AS total_spent,
      MAX(o.created_at) AS last_ordered_at,
      -- Check if first ordered in last 30 days (new favorite)
      (MIN(o.created_at) >= NOW() - '30 days'::interval)::boolean AS is_new_favorite
    FROM order_items oi
    JOIN orders o ON oi.order_id = o.id
    WHERE o.customer_id = p_customer_id
      AND o.created_at >= NOW() - (p_days || ' days')::interval
      AND o.status NOT IN ('cancelled', 'void')
      AND oi.is_voided = false
    GROUP BY oi.menu_item_id, oi.item_name
  ),
  total_orders AS (
    SELECT COUNT(DISTINCT o.id)::bigint AS order_count
    FROM orders o
    WHERE o.customer_id = p_customer_id
      AND o.created_at >= NOW() - (p_days || ' days')::interval
      AND o.status NOT IN ('cancelled', 'void')
  )
  SELECT
    io.item_id,
    io.item_name,
    io.order_count,
    io.total_spent,
    io.last_ordered_at,
    io.is_new_favorite,
    CASE
      WHEN io.order_count >= tot.order_count THEN 'Every visit'
      WHEN io.order_count >= (tot.order_count * 0.5) THEN 'Regularly'
      WHEN io.order_count >= (tot.order_count * 0.25) THEN 'Often'
      ELSE 'Occasionally'
    END AS frequency_label
  FROM item_orders io
  CROSS JOIN total_orders tot
  ORDER BY io.order_count DESC
  LIMIT p_limit;
END;
$$;

-- =============================================================================
-- 4. GET CUSTOMER ORDER CHANNEL TREND (Last 90 Days)  [FIXED]
-- =============================================================================
-- Fix: orders.channel -> orders.order_type (the actual column name)
-- The channel concept maps to order_type enum: dine_in, takeout, delivery, online, catering

CREATE OR REPLACE FUNCTION get_customer_channel_trend(
  p_customer_id uuid,
  p_days integer DEFAULT 90
)
RETURNS TABLE (
  channel text,
  count_recent bigint,
  count_previous bigint,
  percentage_recent numeric,
  percentage_previous numeric,
  trend_label text
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN QUERY
  WITH recent_period AS (
    SELECT
      o.order_type::text AS channel,
      COUNT(*)::bigint AS count_recent
    FROM orders o
    WHERE o.customer_id = p_customer_id
      AND o.created_at >= NOW() - (p_days || ' days')::interval
      AND o.status NOT IN ('cancelled', 'void')
    GROUP BY o.order_type
  ),
  previous_period AS (
    SELECT
      o.order_type::text AS channel,
      COUNT(*)::bigint AS count_previous
    FROM orders o
    WHERE o.customer_id = p_customer_id
      AND o.created_at >= NOW() - ((p_days * 2) || ' days')::interval
      AND o.created_at < NOW() - (p_days || ' days')::interval
      AND o.status NOT IN ('cancelled', 'void')
    GROUP BY o.order_type
  ),
  totals AS (
    SELECT
      NULLIF(SUM(count_recent), 0) AS total_recent,
      NULLIF(SUM(count_previous), 0) AS total_previous
    FROM recent_period
  )
  SELECT
    COALESCE(rp.channel, pp.channel) AS channel,
    COALESCE(rp.count_recent, 0)::bigint AS count_recent,
    COALESCE(pp.count_previous, 0)::bigint AS count_previous,
    ROUND(
      (COALESCE(rp.count_recent, 0)::numeric / NULLIF(t.total_recent, 0) * 100),
      1
    ) AS percentage_recent,
    ROUND(
      (COALESCE(pp.count_previous, 0)::numeric / NULLIF(t.total_previous, 0) * 100),
      1
    ) AS percentage_previous,
    CASE
      WHEN COALESCE(rp.count_recent, 0) > COALESCE(pp.count_previous, 0) THEN '↑ Increasing'
      WHEN COALESCE(rp.count_recent, 0) < COALESCE(pp.count_previous, 0) THEN '↓ Decreasing'
      ELSE '→ Stable'
    END AS trend_label
  FROM recent_period rp
  FULL OUTER JOIN previous_period pp ON rp.channel = pp.channel
  CROSS JOIN totals t
  ORDER BY COALESCE(rp.count_recent, 0) DESC;
END;
$$;

-- =============================================================================
-- 5. GET ENHANCED ACTIVITY TIMELINE  [FIXED]
-- =============================================================================
-- Fix: orders.item_count does not exist — calculate from order_items subquery
-- Fix: orders.channel -> orders.order_type

CREATE OR REPLACE FUNCTION get_customer_activity_timeline(
  p_customer_id uuid,
  p_limit integer DEFAULT 50
)
RETURNS TABLE (
  activity_id text,
  activity_type text,
  activity_label text,
  description text,
  amount_value numeric,
  currency text,
  created_at timestamp with time zone,
  is_clickable boolean,
  related_entity_id uuid,
  related_entity_type text
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN QUERY
  -- Orders
  SELECT
    'order_' || o.id::text AS activity_id,
    'order'::text AS activity_type,
    'Order Completed'::text AS activity_label,
    'Order #' || o.order_number || ' — ' || item_counts.cnt || ' item' ||
      CASE WHEN item_counts.cnt > 1 THEN 's' ELSE '' END AS description,
    o.total_amount AS amount_value,
    'USD'::text AS currency,
    o.created_at,
    true::boolean AS is_clickable,
    o.id AS related_entity_id,
    'order'::text AS related_entity_type
  FROM orders o
  JOIN LATERAL (
    SELECT COUNT(*)::integer AS cnt
    FROM order_items oi
    WHERE oi.order_id = o.id AND oi.is_voided = false
  ) item_counts ON true
  WHERE o.customer_id = p_customer_id
    AND o.status NOT IN ('cancelled', 'void')

  UNION ALL

  -- Customer Activities (tags, notes, etc.)
  SELECT
    'activity_' || ca.id::text AS activity_id,
    ca.activity_type::text AS activity_type,
    CASE
      WHEN ca.activity_type = 'tag_added' THEN 'Tag Added'
      WHEN ca.activity_type = 'tag_removed' THEN 'Tag Removed'
      WHEN ca.activity_type = 'note_added' THEN 'Note Added'
      ELSE ca.activity_type::text
    END AS activity_label,
    CASE
      WHEN ca.activity_type = 'tag_added' THEN 'Tagged as ' || COALESCE((ca.metadata->>'tag'), 'unknown')
      WHEN ca.activity_type = 'tag_removed' THEN 'Removed tag: ' || COALESCE((ca.metadata->>'tag'), 'unknown')
      WHEN ca.activity_type = 'note_added' THEN 'Note: ' || COALESCE((ca.metadata->>'note'), '')
      ELSE COALESCE(ca.metadata::text, '')
    END AS description,
    NULL::numeric AS amount_value,
    NULL::text AS currency,
    ca.created_at,
    false::boolean AS is_clickable,
    NULL::uuid AS related_entity_id,
    NULL::text AS related_entity_type
  FROM customer_activities ca
  WHERE ca.customer_id = p_customer_id

  ORDER BY created_at DESC
  LIMIT p_limit;
END;
$$;

-- =============================================================================
-- 6. GET CUSTOMER RANK/PERCENTILE  [FIXED]
-- =============================================================================
-- Was mostly correct; added explicit cast for CEIL to avoid type mismatch

CREATE OR REPLACE FUNCTION get_customer_percentile(
  p_customer_id uuid,
  p_merchant_id uuid
)
RETURNS TABLE (
  percentile numeric,
  rank_position bigint,
  total_customers bigint,
  is_top_tier boolean
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN QUERY
  WITH customer_rank AS (
    SELECT
      c.id,
      c.lifetime_spend,
      ROW_NUMBER() OVER (ORDER BY c.lifetime_spend DESC) AS rank,
      COUNT(*) OVER () AS total
    FROM customers c
    WHERE c.merchant_id = p_merchant_id
  )
  SELECT
    ROUND(((total - rank + 1)::numeric / NULLIF(total, 0) * 100), 1) AS percentile,
    rank::bigint AS rank_position,
    total::bigint AS total_customers,
    (rank <= CEIL(total::numeric * 0.2)::bigint)::boolean AS is_top_tier
  FROM customer_rank
  WHERE id = p_customer_id;
END;
$$;

-- =============================================================================
-- 7. GET VISIT TREND (Increasing or Decreasing?)  [FIXED]
-- =============================================================================
-- Was mostly correct; fixed status filter to use enum-compatible cast

CREATE OR REPLACE FUNCTION get_customer_visit_trend(
  p_customer_id uuid,
  p_recent_days integer DEFAULT 90,
  p_compare_days integer DEFAULT 90
)
RETURNS TABLE (
  recent_visits bigint,
  previous_visits bigint,
  trend_direction text,
  trend_percentage numeric
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN QUERY
  WITH recent AS (
    SELECT COUNT(DISTINCT DATE(o.created_at))::bigint AS visit_days
    FROM orders o
    WHERE o.customer_id = p_customer_id
      AND o.created_at >= NOW() - (p_recent_days || ' days')::interval
      AND o.status NOT IN ('cancelled', 'void')
  ),
  previous AS (
    SELECT COUNT(DISTINCT DATE(o.created_at))::bigint AS visit_days
    FROM orders o
    WHERE o.customer_id = p_customer_id
      AND o.created_at >= NOW() - ((p_recent_days + p_compare_days) || ' days')::interval
      AND o.created_at < NOW() - (p_recent_days || ' days')::interval
      AND o.status NOT IN ('cancelled', 'void')
  )
  SELECT
    r.visit_days AS recent_visits,
    p.visit_days AS previous_visits,
    CASE
      WHEN r.visit_days > p.visit_days THEN '↑'
      WHEN r.visit_days < p.visit_days THEN '↓'
      ELSE '→'
    END AS trend_direction,
    CASE
      WHEN p.visit_days = 0 THEN NULL
      ELSE ROUND(((r.visit_days - p.visit_days)::numeric / p.visit_days * 100), 1)
    END AS trend_percentage
  FROM recent r, previous p;
END;
$$;

-- =============================================================================
-- Setup & Testing
-- =============================================================================
--
-- 1. Run this migration in Supabase:
--    - Paste this entire script into SQL Editor
--    - Click "Run"
--
-- 2. Test the RPCs:
--
--    -- Get spend trend for last 6 months
--    SELECT * FROM get_customer_spend_trend('customer-uuid', 6);
--
--    -- Get visit pattern
--    SELECT * FROM get_customer_visit_pattern('customer-uuid', 90);
--
--    -- Get top items
--    SELECT * FROM get_customer_top_items('customer-uuid', 90, 10);
--
--    -- Get channel trend (uses order_type column, not channel)
--    SELECT * FROM get_customer_channel_trend('customer-uuid', 90);
--
--    -- Get activity timeline
--    SELECT * FROM get_customer_activity_timeline('customer-uuid', 50);
--
--    -- Get percentile rank
--    SELECT * FROM get_customer_percentile('customer-uuid', 'merchant-uuid');
--
--    -- Get visit trend
--    SELECT * FROM get_customer_visit_trend('customer-uuid', 90, 90);
--
-- =============================================================================