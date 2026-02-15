-- Kitchen Performance Stats RPC
-- Provides comprehensive kitchen analytics for a merchant/location over a date range
-- Uses order_items and order timing data

CREATE OR REPLACE FUNCTION get_kitchen_performance_stats(
  p_merchant_id UUID,
  p_location_id UUID DEFAULT NULL,
  p_start_date TIMESTAMPTZ DEFAULT NOW() - INTERVAL '7 days',
  p_end_date TIMESTAMPTZ DEFAULT NOW()
)
RETURNS jsonb AS $$
DECLARE
  v_result jsonb;
BEGIN
  -- Main stats aggregation using order_items and orders
  WITH item_data AS (
    SELECT
      oi.id,
      oi.order_id,
      oi.prep_station,
      oi.rush,
      oi.created_at,
      oi.item_status,
      o.created_at as order_created_at,
      o.updated_at as order_updated_at,
      -- Time from item creation to order update (proxy for prep time)
      EXTRACT(EPOCH FROM (o.updated_at - oi.created_at)) as item_to_order_update_seconds,
      -- Time from order creation to order update (full ticket time)
      EXTRACT(EPOCH FROM (o.updated_at - o.created_at)) as ticket_time_seconds
    FROM order_items oi
    JOIN orders o ON oi.order_id = o.id
    WHERE o.merchant_id = p_merchant_id
      AND (p_location_id IS NULL OR o.location_id = p_location_id)
      AND oi.created_at >= p_start_date
      AND oi.created_at <= p_end_date
      AND oi.item_status NOT IN ('cancelled', 'voided')
  ),
  ticket_summary AS (
    -- Overall ticket times per order
    SELECT
      order_id,
      MAX(ticket_time_seconds) as ticket_time_seconds
    FROM item_data
    GROUP BY order_id
  ),
  station_stats AS (
    -- Per-station statistics
    SELECT
      COALESCE(id.prep_station, 'Unassigned') as station_name,
      COUNT(*) as total_items,
      AVG(id.item_to_order_update_seconds) as avg_prep_seconds,
      COUNT(CASE WHEN id.item_status IN ('served', 'ready') THEN 1 END) as completed_items,
      COUNT(CASE WHEN id.item_status IN ('pending', 'preparing') THEN 1 END) as pending_items
    FROM item_data id
    GROUP BY id.prep_station
  ),
  hourly_day_stats AS (
    -- Heatmap data: hour and day of week
    SELECT
      EXTRACT(HOUR FROM id.created_at AT TIME ZONE 'UTC')::int as hour_of_day,
      EXTRACT(DOW FROM id.created_at AT TIME ZONE 'UTC')::int as day_of_week,
      AVG(id.item_to_order_update_seconds) as avg_prep_seconds,
      COUNT(*) as item_count
    FROM item_data id
    GROUP BY
      EXTRACT(HOUR FROM id.created_at AT TIME ZONE 'UTC'),
      EXTRACT(DOW FROM id.created_at AT TIME ZONE 'UTC')
  ),
  rush_analysis AS (
    -- Rush vs normal orders
    SELECT
      COUNT(CASE WHEN id.rush = true THEN 1 END) as rush_items,
      COUNT(*) as total_items,
      AVG(id.item_to_order_update_seconds) FILTER (WHERE id.rush = true) as avg_rush_seconds,
      AVG(id.item_to_order_update_seconds) FILTER (WHERE id.rush = false OR id.rush IS NULL) as avg_normal_seconds
    FROM item_data id
  ),
  completion_analysis AS (
    -- Item status breakdown
    SELECT
      COUNT(CASE WHEN id.item_status IN ('served', 'ready') THEN 1 END) as completed_items,
      COUNT(CASE WHEN id.item_status IN ('pending', 'preparing') THEN 1 END) as pending_items,
      COUNT(*) as total_items
    FROM item_data id
  ),
  daily_trend_data AS (
    -- Daily average prep times
    SELECT
      DATE(id.created_at AT TIME ZONE 'UTC') as trend_date,
      AVG(id.item_to_order_update_seconds) as avg_prep_seconds
    FROM item_data id
    GROUP BY DATE(id.created_at AT TIME ZONE 'UTC')
  )
  SELECT jsonb_build_object(
    'avg_ticket_time_minutes',
    ROUND(COALESCE((SELECT AVG(ticket_time_seconds) FROM ticket_summary) / 60.0, 0)::numeric, 2),
    'total_items_processed',
    (SELECT COUNT(*) FROM item_data),
    'by_station',
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'station_id', ss.station_name,
        'display_name', ss.station_name,
        'total_items', ss.total_items,
        'avg_prep_minutes', ROUND(COALESCE(ss.avg_prep_seconds / 60.0, 0)::numeric, 2),
        'auto_bumped', ss.pending_items,
        'manual_completed', ss.completed_items,
        'alert_threshold_minutes', 10,
        'auto_bump_threshold_minutes', 20
      ) ORDER BY ss.station_name)
      FROM station_stats ss
    ), '[]'::jsonb),
    'by_hour_and_day',
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'hour_of_day', hds.hour_of_day,
        'day_of_week', hds.day_of_week,
        'avg_ticket_minutes', ROUND(COALESCE(hds.avg_prep_seconds / 60.0, 0)::numeric, 2)
      ) ORDER BY hds.hour_of_day, hds.day_of_week)
      FROM hourly_day_stats hds
      WHERE hds.item_count > 0
    ), '[]'::jsonb),
    'rush_stats',
    (
      SELECT jsonb_build_object(
        'rush_items', COALESCE(ra.rush_items, 0),
        'total_items', COALESCE(ra.total_items, 0),
        'rush_percentage', COALESCE(ROUND(((ra.rush_items::float / NULLIF(ra.total_items, 0)) * 100)::numeric, 2), 0),
        'avg_rush_time_minutes', COALESCE(ROUND((ra.avg_rush_seconds / 60.0)::numeric, 2), 0),
        'avg_normal_time_minutes', COALESCE(ROUND((ra.avg_normal_seconds / 60.0)::numeric, 2), 0)
      )
      FROM rush_analysis ra
    ),
    'auto_bump_stats',
    (
      SELECT jsonb_build_object(
        'auto_bumped', COALESCE(ca.pending_items, 0),
        'manual_completed', COALESCE(ca.completed_items, 0),
        'total_items', COALESCE(ca.total_items, 0),
        'auto_bump_rate', COALESCE(ROUND(((ca.pending_items::float / NULLIF(ca.total_items, 0)) * 100)::numeric, 2), 0)
      )
      FROM completion_analysis ca
    ),
    'daily_trend',
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'date', dtd.trend_date,
        'avg_ticket_minutes', ROUND(COALESCE(dtd.avg_prep_seconds / 60.0, 0)::numeric, 2)
      ) ORDER BY dtd.trend_date)
      FROM daily_trend_data dtd
    ), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$$ LANGUAGE plpgsql STABLE;
