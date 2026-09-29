-- Fix get_staff_performance_stats: leaderboard totals were multiplied by a join
-- fan-out.
--
-- The previous definition built one row per ORDER (staff_order_data) and one row
-- per PAYMENT (staff_tips_data), then joined them on staff_id alone. Every order
-- was therefore repeated once per payment the staff member processed, and every
-- tip once per order, so for a staff member with N orders and M payments:
--
--   order_count = N * M      total_sales = sales * M      total_tips = tips * N
--
-- Repro (prod, 460 BREAD AND BUTTER CORP, 2026-09-19..26): 78 orders x 218
-- payments reported as 17,004 orders / $154,396.32 sales / $12,431.64 tips.
-- Real figures: 78 orders / $708.24 / tips on those orders.
--
-- This definition:
--   * rolls payments up to one row per order BEFORE joining (no fan-out),
--   * gates on the canonical recognized-order predicate
--     (public.is_order_reportable) instead of a payment-less status filter, so
--     unpaid open checks no longer count as sales,
--   * attributes each order to exactly one staff member -- assigned server, else
--     creator -- matching the Tips module (app/dashboard/actions/tips.ts). The
--     old `assigned_server_id = sp.id OR created_by_staff_id = sp.id` join
--     counted an order twice when the two differed,
--   * attributes tips through the order rather than through
--     order_payments.processed_by_staff_id, so a server's tips and sales always
--     describe the same set of orders,
--   * reports orders with no staff member (kiosk, online, delivery apps) in a new
--     additive `unattributed` array, by channel, so leaderboard + unattributed
--     reconciles to recognized sales,
--   * counts orders_created with DISTINCT so split payments no longer inflate it.
--
-- Response shape is unchanged apart from the additive `unattributed` key.
-- Security (INVOKER, RLS applies) and grants are unchanged.

CREATE OR REPLACE FUNCTION public.get_staff_performance_stats(
  p_merchant_id uuid,
  p_location_id uuid DEFAULT NULL::uuid,
  p_start_date timestamp with time zone DEFAULT (now() - '7 days'::interval),
  p_end_date timestamp with time zone DEFAULT now()
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_result jsonb;
BEGIN
  WITH
  -- One row per recognized order, attributed to at most one staff member.
  recognized_orders AS (
    SELECT
      o.id AS order_id,
      COALESCE(o.assigned_server_id, o.created_by_staff_id) AS staff_id,
      public.normalize_order_source(o.order_source) AS channel,
      COALESCE(o.total_amount, 0) AS total_amount,
      COALESCE(o.subtotal, 0) AS subtotal
    FROM orders o
    WHERE o.merchant_id = p_merchant_id
      AND (p_location_id IS NULL OR o.location_id = p_location_id)
      AND o.created_at >= p_start_date
      AND o.created_at <= p_end_date
      AND public.is_order_reportable(o.status, o.payment_status)
  ),

  -- One row per live payment on a recognized order.
  order_payment_tips AS (
    SELECT
      ro.order_id,
      COALESCE(op.tip_amount, 0) AS tip_amount,
      COALESCE(op.subtotal_portion, 0) AS subtotal_portion,
      op.payment_method
    FROM recognized_orders ro
    JOIN order_payments op ON op.order_id = ro.order_id
    WHERE op.status NOT IN ('failed', 'declined', 'void')
      AND COALESCE(op.is_voided, false) = false
  ),

  -- Payments collapsed to one row per order, so joining back cannot fan out.
  order_tips AS (
    SELECT
      opt.order_id,
      SUM(opt.tip_amount) AS tip_amount
    FROM order_payment_tips opt
    GROUP BY opt.order_id
  ),

  order_facts AS (
    SELECT
      ro.order_id,
      ro.staff_id,
      ro.channel,
      ro.total_amount,
      ro.subtotal,
      COALESCE(ot.tip_amount, 0) AS tip_amount
    FROM recognized_orders ro
    LEFT JOIN order_tips ot ON ot.order_id = ro.order_id
  ),

  staff_sales AS (
    SELECT
      ofx.staff_id,
      COUNT(*) AS order_count,
      SUM(ofx.total_amount) AS total_sales,
      AVG(ofx.subtotal) AS avg_check_size,
      SUM(ofx.tip_amount) AS total_tips,
      CASE
        WHEN SUM(ofx.subtotal) > 0
        THEN ROUND((SUM(ofx.tip_amount) / SUM(ofx.subtotal) * 100)::numeric, 2)
        ELSE 0
      END AS avg_tip_pct
    FROM order_facts ofx
    WHERE ofx.staff_id IS NOT NULL
    GROUP BY ofx.staff_id
  ),

  -- Orders nobody rang up: kiosk, online store, delivery apps.
  unattributed_data AS (
    SELECT
      ofx.channel,
      COUNT(*) AS order_count,
      SUM(ofx.total_amount) AS total_sales,
      AVG(ofx.subtotal) AS avg_check_size,
      SUM(ofx.tip_amount) AS total_tips,
      CASE
        WHEN SUM(ofx.subtotal) > 0
        THEN ROUND((SUM(ofx.tip_amount) / SUM(ofx.subtotal) * 100)::numeric, 2)
        ELSE 0
      END AS avg_tip_pct
    FROM order_facts ofx
    WHERE ofx.staff_id IS NULL
    GROUP BY ofx.channel
  ),

  -- Table turns per staff (already one row per staff member)
  staff_table_turns AS (
    SELECT
      ts.server_staff_id AS staff_id,
      COUNT(*) AS tables_turned,
      AVG(COALESCE(ts.actual_duration, 0)) / 60 AS avg_turn_minutes
    FROM table_sessions ts
    WHERE ts.merchant_id = p_merchant_id
      AND (p_location_id IS NULL OR ts.location_id = p_location_id)
      AND ts.cleared_at >= p_start_date
      AND ts.cleared_at <= p_end_date
      AND ts.server_staff_id IS NOT NULL
    GROUP BY ts.server_staff_id
  ),

  -- Order activity per staff
  staff_activity_data AS (
    SELECT
      sp.id AS staff_id,
      COALESCE(
        NULLIF(TRIM(CONCAT_WS(' ', sp.first_name, sp.last_name)), ''),
        sp.display_name,
        'Unknown staff'
      ) AS staff_name,
      COUNT(DISTINCT CASE WHEN o.created_by_staff_id = sp.id THEN o.id END) AS orders_created,
      COUNT(CASE WHEN op.processed_by_staff_id = sp.id THEN 1 END) AS payments_processed,
      COUNT(CASE WHEN op.is_voided = true AND op.voided_by = sp.id THEN 1 END) AS voids_count,
      COALESCE(SUM(CASE WHEN op.is_voided = true AND op.voided_by = sp.id THEN op.amount ELSE 0 END), 0) AS void_amount,
      COUNT(CASE WHEN op.is_returned = true AND op.returned_by = sp.id THEN 1 END) AS refunds_count,
      COALESCE(SUM(CASE WHEN op.is_returned = true AND op.returned_by = sp.id THEN op.return_amount ELSE 0 END), 0) AS refund_amount
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
    GROUP BY sp.id, sp.first_name, sp.last_name, sp.display_name
  ),

  -- Leaderboard: every input is already one row per staff member
  leaderboard_data AS (
    SELECT
      ss.staff_id,
      COALESCE(
        NULLIF(TRIM(CONCAT_WS(' ', sp.first_name, sp.last_name)), ''),
        sp.display_name,
        'Unknown staff'
      ) AS staff_name,
      sp.account_type AS role,
      ss.total_sales,
      ss.avg_check_size,
      ss.order_count,
      ss.total_tips,
      ss.avg_tip_pct,
      COALESCE(stt.tables_turned, 0) AS tables_turned,
      ROUND(COALESCE(stt.avg_turn_minutes, 0)::numeric, 2) AS avg_table_turn_minutes
    FROM staff_sales ss
    LEFT JOIN staff_profiles sp ON sp.id = ss.staff_id
    LEFT JOIN staff_table_turns stt ON stt.staff_id = ss.staff_id
  ),

  -- Tips distribution buckets (per payment)
  tip_distribution_calc AS (
    SELECT
      CASE
        WHEN COALESCE(opt.tip_amount / NULLIF(opt.subtotal_portion, 0) * 100, 0) < 10 THEN '0-10%'
        WHEN COALESCE(opt.tip_amount / NULLIF(opt.subtotal_portion, 0) * 100, 0) < 15 THEN '11-15%'
        WHEN COALESCE(opt.tip_amount / NULLIF(opt.subtotal_portion, 0) * 100, 0) < 20 THEN '16-20%'
        WHEN COALESCE(opt.tip_amount / NULLIF(opt.subtotal_portion, 0) * 100, 0) < 25 THEN '21-25%'
        ELSE '26%+'
      END AS bucket,
      COUNT(*) AS count
    FROM order_payment_tips opt
    GROUP BY bucket
  ),

  -- All tips on recognized orders, attributed or not
  tips_totals AS (
    SELECT
      COALESCE(SUM(ofx.tip_amount), 0)::numeric AS total_tips,
      CASE
        WHEN COALESCE(SUM(ofx.subtotal), 0) > 0
        THEN ROUND((SUM(ofx.tip_amount) / SUM(ofx.subtotal) * 100)::numeric, 2)
        ELSE 0
      END AS avg_tip_pct
    FROM order_facts ofx
  )

  SELECT jsonb_build_object(
    'total_active_staff',
    (SELECT COUNT(*) FROM leaderboard_data),

    'total_orders',
    (SELECT COALESCE(SUM(order_count), 0) FROM leaderboard_data),

    'total_tips',
    (SELECT total_tips FROM tips_totals),

    'avg_tip_pct',
    (SELECT avg_tip_pct FROM tips_totals),

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
    ), '[]'::jsonb),

    'unattributed',
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'channel', ud.channel,
        'order_count', ud.order_count,
        'total_sales', ROUND(COALESCE(ud.total_sales, 0)::numeric, 2),
        'avg_check_size', ROUND(COALESCE(ud.avg_check_size, 0)::numeric, 2),
        'total_tips', ROUND(COALESCE(ud.total_tips, 0)::numeric, 2),
        'avg_tip_pct', COALESCE(ud.avg_tip_pct, 0)
      ) ORDER BY ud.total_sales DESC)
      FROM unattributed_data ud
    ), '[]'::jsonb),

    'tips_analysis',
    jsonb_build_object(
      'total_tips', (SELECT total_tips FROM tips_totals),
      'avg_tip_pct', (SELECT avg_tip_pct FROM tips_totals),
      'cash_tips', (SELECT COALESCE(SUM(opt.tip_amount) FILTER (WHERE opt.payment_method = 'cash'), 0)::numeric FROM order_payment_tips opt),
      'card_tips', (SELECT COALESCE(SUM(opt.tip_amount) FILTER (WHERE opt.payment_method = 'card'), 0)::numeric FROM order_payment_tips opt),
      'tip_distribution', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'bucket', tdc.bucket,
          'count', tdc.count
        ) ORDER BY tdc.bucket)
        FROM tip_distribution_calc tdc
      ), '[]'::jsonb),
      'by_staff', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'staff_id', ld.staff_id::text,
          'staff_name', ld.staff_name,
          'total_tips', ROUND(COALESCE(ld.total_tips, 0)::numeric, 2),
          'avg_tip_pct', COALESCE(ld.avg_tip_pct, 0)
        ) ORDER BY ld.total_tips DESC)
        FROM leaderboard_data ld
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
    ), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$function$;
