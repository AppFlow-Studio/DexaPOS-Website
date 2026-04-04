-- ============================================================================
-- Staff Performance Analytics RPC
-- Provides comprehensive staff performance analytics for a merchant/location over a date range
-- Covers: Server leaderboard, tips analysis, staff order activity
-- ============================================================================

CREATE OR REPLACE FUNCTION get_staff_performance_stats(
  p_merchant_id UUID,
  p_location_id UUID DEFAULT NULL,
  p_start_date TIMESTAMPTZ DEFAULT NOW() - INTERVAL '7 days',
  p_end_date TIMESTAMPTZ DEFAULT NOW()
)
RETURNS jsonb AS $$
DECLARE
  v_result jsonb;
BEGIN
  -- Orders per staff (assigned server or creator)
  WITH staff_order_data AS (
    SELECT
      sp.id as staff_id,
      sp.first_name || ' ' || sp.last_name as staff_name,
      sp.account_type as role,
      o.id as order_id,
      o.total_amount,
      o.subtotal,
      o.created_at,
      o.voided_at,
      o.status
    FROM orders o
    LEFT JOIN staff_profiles sp ON (o.assigned_server_id = sp.id OR o.created_by_staff_id = sp.id)
    WHERE o.merchant_id = p_merchant_id
      AND (p_location_id IS NULL OR o.location_id = p_location_id)
      AND o.created_at >= p_start_date
      AND o.created_at <= p_end_date
      AND o.status NOT IN ('draft', 'cancelled', 'void')
  ),

  -- Tips per staff
  staff_tips_data AS (
    SELECT
      sp.id as staff_id,
      sp.first_name || ' ' || sp.last_name as staff_name,
      op.tip_amount,
      op.subtotal_portion,
      CASE WHEN op.payment_method = 'cash' THEN op.tip_amount ELSE 0 END as cash_tip,
      CASE WHEN op.payment_method = 'card' THEN op.tip_amount ELSE 0 END as card_tip
    FROM order_payments op
    LEFT JOIN staff_profiles sp ON op.processed_by_staff_id = sp.id
    WHERE op.merchant_id = p_merchant_id
      AND (p_location_id IS NULL OR op.location_id = p_location_id)
      AND op.initiated_at >= p_start_date
      AND op.initiated_at <= p_end_date
      AND op.status NOT IN ('failed', 'declined', 'void')
      AND sp.id IS NOT NULL
  ),

  -- Table turns per staff
  staff_table_turns AS (
    SELECT
      sp.id as staff_id,
      sp.first_name || ' ' || sp.last_name as staff_name,
      COUNT(*) as tables_turned,
      AVG(COALESCE(ts.actual_duration, 0)) / 60 as avg_turn_minutes
    FROM table_sessions ts
    LEFT JOIN staff_profiles sp ON ts.server_staff_id = sp.id
    WHERE ts.merchant_id = p_merchant_id
      AND (p_location_id IS NULL OR ts.location_id = p_location_id)
      AND ts.cleared_at >= p_start_date
      AND ts.cleared_at <= p_end_date
      AND ts.cleared_at IS NOT NULL
      AND sp.id IS NOT NULL
    GROUP BY sp.id, staff_name
  ),

  -- Order activity per staff
  staff_activity_data AS (
    SELECT
      sp.id as staff_id,
      sp.first_name || ' ' || sp.last_name as staff_name,
      COUNT(CASE WHEN o.created_by_staff_id = sp.id THEN 1 END) as orders_created,
      COUNT(CASE WHEN op.processed_by_staff_id = sp.id THEN 1 END) as payments_processed,
      COUNT(CASE WHEN op.is_voided = true AND op.voided_by = sp.id THEN 1 END) as voids_count,
      COALESCE(SUM(CASE WHEN op.is_voided = true AND op.voided_by = sp.id THEN op.amount ELSE 0 END), 0) as void_amount,
      COUNT(CASE WHEN op.is_returned = true AND op.returned_by = sp.id THEN 1 END) as refunds_count,
      COALESCE(SUM(CASE WHEN op.is_returned = true AND op.returned_by = sp.id THEN op.return_amount ELSE 0 END), 0) as refund_amount
    FROM staff_profiles sp
    LEFT JOIN orders o ON (o.created_by_staff_id = sp.id OR o.assigned_server_id = sp.id)
      AND o.merchant_id = p_merchant_id
      AND (p_location_id IS NULL OR o.location_id = p_location_id)
      AND o.created_at >= p_start_date
      AND o.created_at <= p_end_date
    LEFT JOIN order_payments op ON o.id = op.order_id
      AND op.merchant_id = p_merchant_id
      AND (p_location_id IS NULL OR op.location_id = p_location_id)
      AND op.initiated_at >= p_start_date
      AND op.initiated_at <= p_end_date
    WHERE sp.merchant_id = p_merchant_id
    GROUP BY sp.id, staff_name
  ),

  -- Leaderboard aggregation
  leaderboard_data AS (
    SELECT
      sod.staff_id,
      sod.staff_name,
      sod.role,
      COALESCE(SUM(sod.total_amount), 0) as total_sales,
      COALESCE(AVG(sod.subtotal), 0) as avg_check_size,
      COUNT(sod.order_id) as order_count,
      COALESCE(SUM(std.tip_amount), 0) as total_tips,
      CASE
        WHEN COALESCE(SUM(std.subtotal_portion), 0) > 0
        THEN ROUND((COALESCE(SUM(std.tip_amount), 0) / NULLIF(SUM(std.subtotal_portion), 0) * 100)::numeric, 2)
        ELSE 0
      END as avg_tip_pct,
      COALESCE(stt.tables_turned, 0) as tables_turned,
      ROUND(COALESCE(stt.avg_turn_minutes, 0)::numeric, 2) as avg_table_turn_minutes
    FROM staff_order_data sod
    LEFT JOIN staff_tips_data std ON sod.staff_id = std.staff_id
    LEFT JOIN staff_table_turns stt ON sod.staff_id = stt.staff_id
    WHERE sod.staff_id IS NOT NULL
    GROUP BY sod.staff_id, sod.staff_name, sod.role, stt.tables_turned, stt.avg_turn_minutes
  ),

  -- Tips distribution buckets
  tip_distribution_calc AS (
    SELECT
      CASE
        WHEN COALESCE(std.tip_amount / NULLIF(std.subtotal_portion, 0) * 100, 0) < 10 THEN '0-10%'
        WHEN COALESCE(std.tip_amount / NULLIF(std.subtotal_portion, 0) * 100, 0) < 15 THEN '11-15%'
        WHEN COALESCE(std.tip_amount / NULLIF(std.subtotal_portion, 0) * 100, 0) < 20 THEN '16-20%'
        WHEN COALESCE(std.tip_amount / NULLIF(std.subtotal_portion, 0) * 100, 0) < 25 THEN '21-25%'
        ELSE '26%+'
      END as bucket,
      COUNT(*) as count
    FROM staff_tips_data std
    GROUP BY bucket
  ),

  -- Per-staff tips summary
  staff_tips_summary AS (
    SELECT
      std.staff_id,
      std.staff_name,
      COALESCE(SUM(std.tip_amount), 0) as total_tips,
      CASE
        WHEN COALESCE(SUM(std.subtotal_portion), 0) > 0
        THEN ROUND((COALESCE(SUM(std.tip_amount), 0) / NULLIF(SUM(std.subtotal_portion), 0) * 100)::numeric, 2)
        ELSE 0
      END as avg_tip_pct
    FROM staff_tips_data std
    GROUP BY std.staff_id, std.staff_name
  )

  SELECT jsonb_build_object(
    'total_active_staff',
    (SELECT COUNT(DISTINCT staff_id) FROM leaderboard_data WHERE staff_id IS NOT NULL),

    'total_orders',
    (SELECT COALESCE(SUM(order_count), 0) FROM leaderboard_data),

    'total_tips',
    (SELECT COALESCE(SUM(total_tips), 0)::numeric FROM staff_tips_summary),

    'avg_tip_pct',
    (SELECT CASE
      WHEN COUNT(*) > 0 THEN ROUND(AVG(avg_tip_pct)::numeric, 2)
      ELSE 0
    END FROM staff_tips_summary),

    'leaderboard',
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'staff_id', ld.staff_id::text,
        'staff_name', ld.staff_name,
        'role', ld.role,
        'total_sales', ROUND(COALESCE(ld.total_sales, 0)::numeric, 2),
        'avg_check_size', ROUND(COALESCE(ld.avg_check_size, 0)::numeric, 2),
        'total_tips', ROUND(COALESCE(ld.total_tips, 0)::numeric, 2),
        'avg_tip_pct', COALESCE(ld.avg_tip_pct, 0),
        'tables_turned', COALESCE(ld.tables_turned, 0),
        'avg_table_turn_minutes', COALESCE(ld.avg_table_turn_minutes, 0),
        'order_count', COALESCE(ld.order_count, 0)
      ) ORDER BY ld.total_sales DESC)
      FROM leaderboard_data ld
      WHERE ld.staff_id IS NOT NULL
    ), '[]'::jsonb),

    'tips_analysis',
    jsonb_build_object(
      'total_tips', (SELECT COALESCE(SUM(total_tips), 0)::numeric FROM staff_tips_summary),
      'avg_tip_pct', (SELECT CASE
        WHEN COUNT(*) > 0 THEN ROUND(AVG(avg_tip_pct)::numeric, 2)
        ELSE 0
      END FROM staff_tips_summary),
      'cash_tips', (SELECT COALESCE(SUM(cash_tip), 0)::numeric FROM staff_tips_data),
      'card_tips', (SELECT COALESCE(SUM(card_tip), 0)::numeric FROM staff_tips_data),
      'tip_distribution', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'bucket', tdc.bucket,
          'count', tdc.count
        ) ORDER BY tdc.bucket)
        FROM tip_distribution_calc tdc
      ), '[]'::jsonb),
      'by_staff', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'staff_id', sts.staff_id::text,
          'staff_name', sts.staff_name,
          'total_tips', ROUND(COALESCE(sts.total_tips, 0)::numeric, 2),
          'avg_tip_pct', COALESCE(sts.avg_tip_pct, 0)
        ) ORDER BY sts.total_tips DESC)
        FROM staff_tips_summary sts
      ), '[]'::jsonb)
    ),

    'order_activity',
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'staff_id', sad.staff_id::text,
        'staff_name', sad.staff_name,
        'orders_created', COALESCE(sad.orders_created, 0),
        'payments_processed', COALESCE(sad.payments_processed, 0),
        'voids_count', COALESCE(sad.voids_count, 0),
        'void_amount', ROUND(COALESCE(sad.void_amount, 0)::numeric, 2),
        'refunds_count', COALESCE(sad.refunds_count, 0),
        'refund_amount', ROUND(COALESCE(sad.refund_amount, 0)::numeric, 2)
      ) ORDER BY sad.orders_created DESC)
      FROM staff_activity_data sad
      WHERE sad.staff_id IS NOT NULL
    ), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION get_staff_performance_stats(UUID, UUID, TIMESTAMPTZ, TIMESTAMPTZ) IS
'Comprehensive staff performance analytics for a merchant/location over date range. '
'Returns: leaderboard, tips analysis, order activity. '
'Aggregates from orders, order_payments, staff_profiles, table_sessions.';
