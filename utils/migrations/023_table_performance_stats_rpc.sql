-- ============================================================================
-- Table & Dine-In Performance Analytics RPC
-- Provides comprehensive dine-in analytics for a merchant/location over a date range
-- Uses table_sessions, table_session_events, floor_plan_objects, server_sections
-- ============================================================================

CREATE OR REPLACE FUNCTION get_table_performance_stats(
  p_merchant_id UUID,
  p_location_id UUID DEFAULT NULL,
  p_start_date TIMESTAMPTZ DEFAULT NOW() - INTERVAL '7 days',
  p_end_date TIMESTAMPTZ DEFAULT NOW()
)
RETURNS jsonb AS $$
DECLARE
  v_result jsonb;
BEGIN
  -- Closed sessions in date range with table/section info
  WITH session_data AS (
    SELECT
      ts.id,
      ts.party_size,
      ts.seated_at,
      ts.first_order_at,
      ts.food_served_at,
      ts.check_presented_at,
      ts.paid_at,
      ts.cleared_at,
      fpo.id as table_id,
      fpo.name as table_name,
      fpo.capacity,
      COALESCE(ss.name, 'Unassigned') as section_name,
      -- Order associated with session
      o.total_amount,
      -- Calculate turn time: seated to cleared
      EXTRACT(EPOCH FROM (ts.cleared_at - ts.seated_at)) / 60 as turn_time_seconds
    FROM table_sessions ts
    LEFT JOIN table_session_tables tst ON ts.id = tst.session_id
    LEFT JOIN floor_plan_objects fpo ON tst.table_id = fpo.id
      AND fpo.category IN ('table', 'booth')
    LEFT JOIN server_sections ss ON fpo.section_id = ss.id
    LEFT JOIN orders o ON ts.order_id = o.id
    WHERE ts.merchant_id = p_merchant_id
      AND (p_location_id IS NULL OR ts.location_id = p_location_id)
      AND ts.cleared_at IS NOT NULL
      AND ts.seated_at >= p_start_date
      AND ts.seated_at <= p_end_date
  ),

  -- Party size buckets
  party_size_stats AS (
    SELECT
      CASE
        WHEN sd.party_size BETWEEN 1 AND 2 THEN '1-2'
        WHEN sd.party_size BETWEEN 3 AND 4 THEN '3-4'
        WHEN sd.party_size BETWEEN 5 AND 6 THEN '5-6'
        ELSE '7+'
      END as bucket,
      AVG(sd.turn_time_seconds) as avg_turn_seconds,
      COUNT(*) as session_count
    FROM session_data sd
    GROUP BY bucket
  ),

  -- Daily trend
  daily_trend_data AS (
    SELECT
      DATE(sd.seated_at) as trend_date,
      AVG(sd.turn_time_seconds) as avg_turn_seconds,
      COUNT(*) as session_count
    FROM session_data sd
    GROUP BY DATE(sd.seated_at)
  ),

  -- Service phases: avg time between key events
  -- seated -> order -> food -> check -> payment -> cleared
  service_phases_calc AS (
    SELECT
      'seated_to_order' as phase,
      AVG(EXTRACT(EPOCH FROM (sd.first_order_at - sd.seated_at)) / 60) as avg_minutes,
      COUNT(CASE WHEN sd.first_order_at IS NOT NULL THEN 1 END) as phase_count
    FROM session_data sd
    WHERE sd.first_order_at IS NOT NULL

    UNION ALL

    SELECT
      'order_to_food' as phase,
      AVG(EXTRACT(EPOCH FROM (sd.food_served_at - sd.first_order_at)) / 60) as avg_minutes,
      COUNT(CASE WHEN sd.food_served_at IS NOT NULL THEN 1 END) as phase_count
    FROM session_data sd
    WHERE sd.food_served_at IS NOT NULL AND sd.first_order_at IS NOT NULL

    UNION ALL

    SELECT
      'food_to_check' as phase,
      AVG(EXTRACT(EPOCH FROM (sd.check_presented_at - sd.food_served_at)) / 60) as avg_minutes,
      COUNT(CASE WHEN sd.check_presented_at IS NOT NULL THEN 1 END) as phase_count
    FROM session_data sd
    WHERE sd.check_presented_at IS NOT NULL AND sd.food_served_at IS NOT NULL

    UNION ALL

    SELECT
      'check_to_payment' as phase,
      AVG(EXTRACT(EPOCH FROM (sd.paid_at - sd.check_presented_at)) / 60) as avg_minutes,
      COUNT(CASE WHEN sd.paid_at IS NOT NULL THEN 1 END) as phase_count
    FROM session_data sd
    WHERE sd.paid_at IS NOT NULL AND sd.check_presented_at IS NOT NULL

    UNION ALL

    SELECT
      'payment_to_cleared' as phase,
      AVG(EXTRACT(EPOCH FROM (sd.cleared_at - sd.paid_at)) / 60) as avg_minutes,
      COUNT(CASE WHEN sd.cleared_at IS NOT NULL THEN 1 END) as phase_count
    FROM session_data sd
    WHERE sd.cleared_at IS NOT NULL AND sd.paid_at IS NOT NULL
  ),

  -- Hourly RevPASH (Revenue Per Available Seat Hour)
  -- RevPASH = Total Revenue / (Capacity * Hours Available)
  hourly_revpash_calc AS (
    SELECT
      EXTRACT(HOUR FROM sd.seated_at AT TIME ZONE 'UTC')::int as hour_of_day,
      SUM(COALESCE(sd.total_amount, 0)) as total_revenue,
      SUM(sd.party_size) as total_covers,
      COUNT(*) as session_count,
      ROUND((SUM(COALESCE(sd.total_amount, 0)) / NULLIF(SUM(sd.party_size), 0))::numeric, 2) as revpash
    FROM session_data sd
    GROUP BY EXTRACT(HOUR FROM sd.seated_at AT TIME ZONE 'UTC')
  ),

  -- Per-table utilization
  table_utilization_calc AS (
    SELECT
      sd.table_id,
      sd.table_name,
      sd.capacity,
      sd.section_name,
      COUNT(*) as total_sessions,
      AVG(sd.turn_time_seconds) / 60 as avg_turn_minutes,
      SUM(COALESCE(sd.total_amount, 0)) as total_revenue,
      SUM(sd.party_size) as total_covers,
      ROUND((SUM(COALESCE(sd.total_amount, 0)) / NULLIF(SUM(sd.party_size), 0))::numeric, 2) as revpash
    FROM session_data sd
    WHERE sd.table_id IS NOT NULL
    GROUP BY sd.table_id, sd.table_name, sd.capacity, sd.section_name
  ),

  -- Per-section stats
  section_stats_calc AS (
    SELECT
      sd.section_name,
      COUNT(*) as total_sessions,
      SUM(COALESCE(sd.total_amount, 0)) as total_revenue,
      AVG(sd.turn_time_seconds) / 60 as avg_turn_minutes
    FROM session_data sd
    GROUP BY sd.section_name
  )

  SELECT jsonb_build_object(
    'avg_turn_time_minutes',
    ROUND(COALESCE((SELECT AVG(sd.turn_time_seconds) / 60 FROM session_data sd), 0)::numeric, 2),

    'total_sessions',
    (SELECT COUNT(*) FROM session_data),

    'total_covers',
    (SELECT COALESCE(SUM(party_size), 0) FROM session_data),

    'by_party_size',
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'bucket', pss.bucket,
        'avg_turn_time_minutes', ROUND(COALESCE(pss.avg_turn_seconds / 60, 0)::numeric, 2),
        'sessions', pss.session_count
      ) ORDER BY pss.bucket)
      FROM party_size_stats pss
    ), '[]'::jsonb),

    'daily_trend',
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'date', dtd.trend_date,
        'avg_turn_time_minutes', ROUND(COALESCE(dtd.avg_turn_seconds / 60, 0)::numeric, 2),
        'sessions', dtd.session_count
      ) ORDER BY dtd.trend_date)
      FROM daily_trend_data dtd
    ), '[]'::jsonb),

    'service_phases',
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'phase', spc.phase,
        'avg_minutes', ROUND(COALESCE(spc.avg_minutes, 0)::numeric, 2),
        'sessions', COALESCE(spc.phase_count, 0)
      ))
      FROM service_phases_calc spc
    ), '[]'::jsonb),

    'hourly_revpash',
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'hour', hrc.hour_of_day,
        'revpash', COALESCE(hrc.revpash, 0),
        'covers', COALESCE(hrc.total_covers, 0)
      ) ORDER BY hrc.hour_of_day)
      FROM hourly_revpash_calc hrc
    ), '[]'::jsonb),

    'table_utilization',
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'table_id', COALESCE(tuc.table_id::text, ''),
        'table_name', COALESCE(tuc.table_name, 'Unknown'),
        'capacity', COALESCE(tuc.capacity, 0),
        'section_name', COALESCE(tuc.section_name, 'Unassigned'),
        'total_sessions', tuc.total_sessions,
        'avg_turn_time_minutes', ROUND(COALESCE(tuc.avg_turn_minutes, 0)::numeric, 2),
        'total_revenue', ROUND(COALESCE(tuc.total_revenue, 0)::numeric, 2),
        'total_covers', COALESCE(tuc.total_covers, 0),
        'revpash', COALESCE(tuc.revpash, 0)
      ) ORDER BY tuc.total_revenue DESC)
      FROM table_utilization_calc tuc
    ), '[]'::jsonb),

    'section_stats',
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'section_name', ssc.section_name,
        'total_sessions', ssc.total_sessions,
        'total_revenue', ROUND(COALESCE(ssc.total_revenue, 0)::numeric, 2),
        'avg_turn_time_minutes', ROUND(COALESCE(ssc.avg_turn_minutes, 0)::numeric, 2)
      ) ORDER BY ssc.total_revenue DESC)
      FROM section_stats_calc ssc
    ), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION get_table_performance_stats(UUID, UUID, TIMESTAMPTZ, TIMESTAMPTZ) IS
'Comprehensive table/dine-in analytics for a merchant/location over date range. '
'Returns: avg turn times, party size breakdown, service phase timing, RevPASH by hour, per-table metrics, section breakdown. '
'Computes directly from table_sessions (not pre-computed table_metrics).';
