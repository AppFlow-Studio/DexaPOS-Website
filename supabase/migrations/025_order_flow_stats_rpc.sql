-- ============================================================================
-- Order Flow & Issues Analytics RPC
-- Provides order lifecycle funnel, void/refund analysis, order type breakdown
-- ============================================================================

CREATE OR REPLACE FUNCTION get_order_flow_stats(
  p_merchant_id UUID,
  p_location_id UUID DEFAULT NULL,
  p_start_date TIMESTAMPTZ DEFAULT NOW() - INTERVAL '7 days',
  p_end_date TIMESTAMPTZ DEFAULT NOW()
)
RETURNS jsonb AS $$
DECLARE
  v_result jsonb;
BEGIN
  -- Base: all orders in the date range
  WITH all_orders AS (
    SELECT
      o.id,
      o.status::text as status,
      o.total_amount,
      o.created_at,
      o.completed_at,
      o.order_type,
      o.voided_by,
      o.void_reason,
      sp_voided.first_name || ' ' || sp_voided.last_name as voided_by_staff
    FROM orders o
    LEFT JOIN staff_profiles sp_voided ON o.voided_by = sp_voided.id
    WHERE o.merchant_id = p_merchant_id
      AND (p_location_id IS NULL OR o.location_id = p_location_id)
      AND o.created_at >= p_start_date
      AND o.created_at <= p_end_date
  ),
   
  -- Funnel stages: count orders at each status
  funnel_counts AS (
    SELECT
      status,
      CASE
        WHEN status = 'pending' THEN 'Pending'
        WHEN status = 'sent_to_kitchen' THEN 'Sent to Kitchen'
        WHEN status = 'preparing' THEN 'Preparing'
        WHEN status = 'ready' THEN 'Ready'
        WHEN status = 'completed' THEN 'Completed'
        WHEN status = 'cancelled' THEN 'Cancelled'
        WHEN status = 'refunded' THEN 'Refunded'
        WHEN status = 'void' THEN 'Void'
        WHEN status = 'draft' THEN 'Draft'
        ELSE status
      END as label,
      CASE
        WHEN status = 'draft' THEN 0
        WHEN status = 'pending' THEN 1
        WHEN status = 'sent_to_kitchen' THEN 2
        WHEN status = 'preparing' THEN 3
        WHEN status = 'ready' THEN 4
        WHEN status = 'completed' THEN 5
        WHEN status = 'cancelled' THEN 6
        WHEN status = 'refunded' THEN 7
        WHEN status = 'void' THEN 8
        ELSE 99
      END as sort_order,
      COUNT(*) as count_val
    FROM all_orders
    GROUP BY status
  ),

  -- Top voided items
  top_voided_items_calc AS (
    SELECT
      mi.name as item_name,
      COUNT(*) as void_count,
      COALESCE(SUM(oi.unit_price * oi.quantity), 0) as void_amount
    FROM all_orders ao
    LEFT JOIN order_items oi ON ao.id = oi.order_id
    LEFT JOIN menu_items mi ON oi.menu_item_id = mi.id
    WHERE ao.status = 'void'
      AND oi.id IS NOT NULL
    GROUP BY mi.name
    ORDER BY void_count DESC
    LIMIT 10
  ),

  -- Staff void stats
  staff_void_stats_calc AS (
    SELECT
      COALESCE(ao.voided_by_staff, 'Unknown') as staff_name,
      COUNT(*) as void_count,
      COALESCE(SUM(ao.total_amount), 0) as void_amount
    FROM all_orders ao
    WHERE ao.status = 'void'
      AND ao.voided_by IS NOT NULL
    GROUP BY ao.voided_by_staff
    ORDER BY void_count DESC
  ),

  -- Refund reason breakdown
  refund_reason_calc AS (
    SELECT
      COALESCE(op.refund_reason, 'No reason provided') as reason,
      COUNT(*) as count_val,
      COALESCE(SUM(op.refunded_amount), 0) as total_amount
    FROM all_orders ao
    LEFT JOIN order_payments op ON ao.id = op.order_id
    WHERE ao.status = 'refunded'
      AND op.is_returned = true
    GROUP BY op.refund_reason
    ORDER BY count_val DESC
  ),

  -- Order type breakdown
  order_type_stats_calc AS (
    SELECT
      ao.order_type as order_type_val,
      COUNT(*) as count_val,
      COALESCE(SUM(ao.total_amount), 0) as total_rev,
      COALESCE(AVG(ao.total_amount), 0) as avg_val
    FROM all_orders ao
    WHERE ao.order_type IS NOT NULL
    GROUP BY ao.order_type
  ),

  -- Completion time per order type
  completion_time_calc AS (
    SELECT
      ao.order_type as order_type_val,
      AVG(EXTRACT(EPOCH FROM (ao.completed_at - ao.created_at)) / 60) as avg_min,
      MIN(EXTRACT(EPOCH FROM (ao.completed_at - ao.created_at)) / 60) as min_min,
      MAX(EXTRACT(EPOCH FROM (ao.completed_at - ao.created_at)) / 60) as max_min,
      COUNT(*) as count_val
    FROM all_orders ao
    WHERE ao.completed_at IS NOT NULL
      AND ao.order_type IS NOT NULL
    GROUP BY ao.order_type
  ),

  -- Aggregates
  order_totals AS (
    SELECT
      COUNT(*) as total_orders,
      COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_count,
      COUNT(CASE WHEN status = 'cancelled' THEN 1 END) as cancelled_count,
      COUNT(CASE WHEN status = 'void' THEN 1 END) as void_count
    FROM all_orders
  )

  SELECT jsonb_build_object(
    'total_orders', (SELECT total_orders FROM order_totals),

    'completion_rate',
    CASE
      WHEN (SELECT total_orders FROM order_totals) > 0
      THEN ROUND(((SELECT completed_count FROM order_totals)::numeric / (SELECT total_orders FROM order_totals) * 100)::numeric, 2)
      ELSE 0
    END,

    'cancellation_rate',
    CASE
      WHEN (SELECT total_orders FROM order_totals) > 0
      THEN ROUND(((SELECT cancelled_count FROM order_totals)::numeric / (SELECT total_orders FROM order_totals) * 100)::numeric, 2)
      ELSE 0
    END,

    'void_rate',
    CASE
      WHEN (SELECT total_orders FROM order_totals) > 0
      THEN ROUND(((SELECT void_count FROM order_totals)::numeric / (SELECT total_orders FROM order_totals) * 100)::numeric, 2)
      ELSE 0
    END,

    'funnel',
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'status', fc.status,
        'label', fc.label,
        'count', fc.count_val,
        'pct_of_total', ROUND((fc.count_val::numeric / (SELECT total_orders FROM order_totals) * 100)::numeric, 2)
      ) ORDER BY fc.sort_order)
      FROM funnel_counts fc
    ), '[]'::jsonb),

    'void_refund',
    jsonb_build_object(
      'total_voids', (SELECT COUNT(*) FROM all_orders WHERE status = 'void'),
      'void_amount', (SELECT COALESCE(SUM(total_amount), 0) FROM all_orders WHERE status = 'void'),
      'total_refunds', (SELECT COUNT(*) FROM all_orders WHERE status = 'refunded'),
      'refund_amount', (SELECT COALESCE(SUM(total_amount), 0) FROM all_orders WHERE status = 'refunded'),
      'by_reason', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'reason', frc.reason,
          'count', frc.count_val,
          'total_amount', ROUND(COALESCE(frc.total_amount, 0)::numeric, 2)
        ))
        FROM refund_reason_calc frc
      ), '[]'::jsonb),
      'top_voided_items', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'item_name', tvi.item_name,
          'void_count', tvi.void_count,
          'void_amount', ROUND(COALESCE(tvi.void_amount, 0)::numeric, 2)
        ))
        FROM top_voided_items_calc tvi
      ), '[]'::jsonb),
      'staff_voids', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'staff_id', ''::text,
          'staff_name', svs.staff_name,
          'void_count', svs.void_count,
          'void_amount', ROUND(COALESCE(svs.void_amount, 0)::numeric, 2)
        ))
        FROM staff_void_stats_calc svs
      ), '[]'::jsonb)
    ),

    'order_types',
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'order_type', ots.order_type_val,
        'count', ots.count_val,
        'total_revenue', ROUND(COALESCE(ots.total_rev, 0)::numeric, 2),
        'avg_order_value', ROUND(COALESCE(ots.avg_val, 0)::numeric, 2),
        'pct_of_total', ROUND((ots.count_val::numeric / (SELECT total_orders FROM order_totals) * 100)::numeric, 2)
      ))
      FROM order_type_stats_calc ots
    ), '[]'::jsonb),

    'completion_times',
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'order_type', ctc.order_type_val,
        'avg_minutes', ROUND(COALESCE(ctc.avg_min, 0)::numeric, 2),
        'order_count', ctc.count_val,
        'min_minutes', ROUND(COALESCE(ctc.min_min, 0)::numeric, 2),
        'max_minutes', ROUND(COALESCE(ctc.max_min, 0)::numeric, 2)
      ))
      FROM completion_time_calc ctc
    ), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION get_order_flow_stats(UUID, UUID, TIMESTAMPTZ, TIMESTAMPTZ) IS
'Comprehensive order flow analytics for a merchant/location over date range. '
'Returns: funnel progression, void/refund analysis, order type breakdown, completion times. '
'Aggregates from orders, order_items, menu_items, order_payments, staff_profiles.';
