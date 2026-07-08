-- =============================================================================
-- Recognized-order canonical predicate — reporting consistency
-- Purpose:
--   Establish ONE definition of a reportable order and apply it to every
--   reporting RPC, replacing the inconsistent per-surface filters:
--     - undercount:  status = 'completed'        (manual tap; hides paid orders)
--     - overcount:   status NOT IN (draft,cancelled,void) with NO payment gate
--                    (counts unpaid open checks as revenue)
--
-- Canonical "recognized order" (locked):
--     payment_status IN ('paid','captured')
--     AND status NOT IN ('draft','cancelled','void','refunded')
--
-- Notes:
--   - `captured` is the retired legacy value, kept only so pre-2026 orders count.
--   - Volume AND revenue share this single gate.
--   - Refunds are netted via the dedicated refunds subquery, not this gate.
--   - Operational views (KDS / active orders) are NOT touched.
--   - The supporting partial index ships separately (CONCURRENTLY cannot run in
--     a transaction): 20260626000001_recognized_order_index.sql
-- =============================================================================

-- 1. Single source of truth -------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_order_reportable(
  p_status order_status,
  p_payment_status payment_status
) RETURNS boolean
LANGUAGE sql IMMUTABLE PARALLEL SAFE
SET search_path = ''
AS $$
  SELECT p_payment_status IN ('paid','captured')
     AND p_status NOT IN ('draft','cancelled','void','refunded');
$$;

COMMENT ON FUNCTION public.is_order_reportable(order_status, payment_status) IS
  'Canonical recognized-order predicate for all reporting surfaces: payment collected (paid/captured) and not draft/cancelled/void/refunded. Operational views must NOT use this.';


-- 2. get_financial_kpis -----------------------------------------------------
-- Replace `status NOT IN (...)` (no payment gate) with is_order_reportable in
-- all four order-derived blocks. Refunds subquery is unchanged.
CREATE OR REPLACE FUNCTION public.get_financial_kpis(
    p_merchant_id uuid,
    p_location_id uuid,
    p_start_date timestamp with time zone,
    p_end_date timestamp with time zone
) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
    v_summary JSON;
    v_payment_methods JSON;
    v_daily_stats JSON;
    v_best_sellers JSON;
    v_order_types JSON;
BEGIN
    SELECT json_build_object(
        'gross_sales',       COALESCE(SUM(subtotal), 0),
        'net_sales',         COALESCE(SUM(subtotal - discount_amount), 0),
        'discounts_total',   COALESCE(SUM(discount_amount), 0),
        'refunds_total', (
            SELECT COALESCE(SUM(op.refunded_amount), 0)
            FROM order_payments op
            JOIN orders o2 ON o2.id = op.order_id
            WHERE o2.merchant_id = p_merchant_id
              AND (p_location_id IS NULL OR o2.location_id = p_location_id)
              AND op.status IN ('refunded', 'partially_refunded')
              AND o2.created_at >= p_start_date
              AND o2.created_at < p_end_date
        ),
        'tax_total',         COALESCE(SUM(tax_amount), 0),
        'tip_total',         COALESCE(SUM(tip_amount), 0),
        'order_count',       COUNT(*),
        'avg_order_value',   CASE WHEN COUNT(*) > 0 THEN SUM(total_amount) / COUNT(*) ELSE 0 END,
        'paid_in_total',     COALESCE(SUM(amount_paid), 0)
    ) INTO v_summary
    FROM orders
    WHERE merchant_id = p_merchant_id
      AND (p_location_id IS NULL OR location_id = p_location_id)
      AND is_order_reportable(status, payment_status)
      AND created_at >= p_start_date
      AND created_at < p_end_date;

    SELECT COALESCE(json_agg(pm), '[]'::json) INTO v_payment_methods
    FROM (
        SELECT
            op.payment_method AS method,
            SUM(op.amount)    AS amount,
            COUNT(*)          AS count
        FROM order_payments op
        JOIN orders o ON o.id = op.order_id
        WHERE o.merchant_id = p_merchant_id
          AND (p_location_id IS NULL OR o.location_id = p_location_id)
          AND op.status IN ('captured', 'authorized')
          AND o.created_at >= p_start_date
          AND o.created_at < p_end_date
        GROUP BY op.payment_method
    ) pm;

    SELECT COALESCE(
      json_agg(
        json_build_object(
          'date', ds.local_day::text,
          'net_sales', ds.net_sales,
          'order_count', ds.order_count,
          'guest_count', ds.guest_count
        )
        ORDER BY ds.local_day ASC
      ),
      '[]'::json
    ) INTO v_daily_stats
    FROM (
        SELECT
            (o.created_at AT TIME ZONE COALESCE(l.timezone, 'America/New_York'))::date AS local_day,
            SUM(o.subtotal - o.discount_amount) AS net_sales,
            COUNT(*) AS order_count,
            COUNT(*) AS guest_count
        FROM orders o
        LEFT JOIN locations l ON l.id = o.location_id
        WHERE o.merchant_id = p_merchant_id
          AND (p_location_id IS NULL OR o.location_id = p_location_id)
          AND is_order_reportable(o.status, o.payment_status)
          AND o.created_at >= p_start_date
          AND o.created_at < p_end_date
        GROUP BY 1
        ORDER BY 1 ASC
    ) ds;

    SELECT COALESCE(json_agg(bs), '[]'::json) INTO v_best_sellers
    FROM (
        SELECT
            oi.item_name,
            SUM(oi.quantity) AS quantity,
            SUM(oi.subtotal) AS revenue
        FROM order_items oi
        JOIN orders o ON o.id = oi.order_id
        WHERE o.merchant_id = p_merchant_id
          AND (p_location_id IS NULL OR o.location_id = p_location_id)
          AND is_order_reportable(o.status, o.payment_status)
          AND oi.is_voided = false
          AND o.created_at >= p_start_date
          AND o.created_at < p_end_date
        GROUP BY oi.item_name
        ORDER BY revenue DESC
        LIMIT 10
    ) bs;

    SELECT COALESCE(json_agg(ot), '[]'::json) INTO v_order_types
    FROM (
        SELECT
            order_type AS type,
            COUNT(*) AS count,
            SUM(total_amount) AS revenue
        FROM orders
        WHERE merchant_id = p_merchant_id
          AND (p_location_id IS NULL OR location_id = p_location_id)
          AND is_order_reportable(status, payment_status)
          AND created_at >= p_start_date
          AND created_at < p_end_date
        GROUP BY order_type
    ) ot;

    RETURN json_build_object(
        'summary',         v_summary,
        'payment_methods', v_payment_methods,
        'daily_stats',     v_daily_stats,
        'best_sellers',    v_best_sellers,
        'order_types',     v_order_types
    );
END;
$$;


-- 3. get_sales_by_item_report ----------------------------------------------
CREATE OR REPLACE FUNCTION public.get_sales_by_item_report(
  p_merchant_id uuid,
  p_location_id uuid,
  p_start_date  timestamp with time zone,
  p_end_date    timestamp with time zone
) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
BEGIN
    RETURN (
        SELECT COALESCE(json_agg(
            json_build_object(
                'item_name', item_name,
                'category', category_name,
                'quantity_sold', total_qty,
                'gross_sales', gross_sales,
                'net_sales', net_sales
            ) ORDER BY gross_sales DESC
        ), '[]'::json)
        FROM (
            SELECT
                oi.item_name,
                oi.category_name,
                SUM(oi.quantity) as total_qty,
                SUM(COALESCE(oi.pre_discount_subtotal, oi.subtotal)) as gross_sales,
                SUM(oi.subtotal) as net_sales
            FROM order_items oi
            JOIN orders o ON o.id = oi.order_id
            WHERE o.merchant_id = p_merchant_id
              AND (p_location_id IS NULL OR o.location_id = p_location_id)
              AND is_order_reportable(o.status, o.payment_status)
              AND oi.is_voided = false
              AND o.created_at >= p_start_date
              AND o.created_at < p_end_date
            GROUP BY oi.item_name, oi.category_name
        ) stats
    );
END;
$$;


-- 4. get_top_performing_merchants ------------------------------------------
-- HQ cross-merchant leaderboard. No location param; trailing-window via now().
-- Add the payment gate so unpaid open checks no longer inflate the leaderboard.
CREATE OR REPLACE FUNCTION public.get_top_performing_merchants(
  p_limit integer,
  p_days integer
) RETURNS TABLE("id" uuid, "name" text, "revenue" numeric, "transactions" bigint, "growth" numeric)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
BEGIN
  RETURN QUERY
    SELECT
      m.id,
      m.name AS name,
      SUM(o.total_amount)::DECIMAL AS revenue,
      COUNT(o.id) AS transactions,
      0::DECIMAL AS growth
    FROM merchants m
    JOIN orders o ON o.merchant_id = m.id
    WHERE o.created_at >= (now() - (p_days || ' days')::interval)
      AND is_order_reportable(o.status, o.payment_status)
    GROUP BY m.id, m.name
    ORDER BY SUM(o.total_amount) DESC
    LIMIT p_limit;
END;
$$;

-- get_cash_flow_report / get_voids_report intentionally NOT changed here:
-- they gate on payment-level status (op.status / refunded_amount), not order
-- status, so the recognized-order predicate does not apply. (Note for a future
-- ticket: get_cash_flow_report includes op.status='authorized' which is not yet
-- settled money — out of scope for this change.)
