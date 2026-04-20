-- Fix 3 bugs in get_financial_kpis:
-- 1. refunds_total: used op.initiated_at (payment time) instead of o.created_at (order time),
--    and included 'captured'/'authorized' statuses which are not refunds
-- 2. net_sales/gross_sales/daily_stats: included refunded orders (status 'refunded' not excluded)
-- 3. payment_methods: used op.initiated_at date filter instead of o.created_at

CREATE OR REPLACE FUNCTION "public"."get_financial_kpis"(
    "p_merchant_id" uuid,
    "p_location_id" uuid,
    "p_start_date" timestamp with time zone,
    "p_end_date" timestamp with time zone
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
    -- 1. Summary Metrics
    -- Exclude 'refunded' orders from gross/net/discount/tax/tip aggregates.
    -- refunds_total subquery now filters by order creation date (not payment date)
    -- and only counts payments with actual refund statuses.
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
              AND o2.created_at BETWEEN p_start_date AND p_end_date
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
      AND status NOT IN ('draft', 'cancelled', 'void', 'refunded')
      AND created_at BETWEEN p_start_date AND p_end_date;

    -- 2. Payment Methods Breakdown
    -- Use o.created_at (consistent with summary) instead of op.initiated_at.
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
          AND o.created_at BETWEEN p_start_date AND p_end_date
        GROUP BY op.payment_method
    ) pm;

    -- 3. Daily Stats for Charts
    -- Exclude refunded orders (consistent with summary).
    SELECT COALESCE(json_agg(ds), '[]'::json) INTO v_daily_stats
    FROM (
        SELECT
            date_trunc('day', created_at AT TIME ZONE 'UTC') AS date,
            SUM(subtotal - discount_amount)                   AS net_sales,
            COUNT(*)                                          AS order_count,
            COUNT(*)                                          AS guest_count
        FROM orders
        WHERE merchant_id = p_merchant_id
          AND (p_location_id IS NULL OR location_id = p_location_id)
          AND status NOT IN ('draft', 'cancelled', 'void', 'refunded')
          AND created_at BETWEEN p_start_date AND p_end_date
        GROUP BY 1
        ORDER BY 1 ASC
    ) ds;

    -- 4. Best Selling Items
    -- Exclude refunded orders (consistent with summary).
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
          AND o.status NOT IN ('draft', 'cancelled', 'void', 'refunded')
          AND oi.is_voided = false
          AND o.created_at BETWEEN p_start_date AND p_end_date
        GROUP BY oi.item_name
        ORDER BY revenue DESC
        LIMIT 10
    ) bs;

    -- 5. Order Type Breakdown
    -- Exclude refunded orders (consistent with summary).
    SELECT COALESCE(json_agg(ot), '[]'::json) INTO v_order_types
    FROM (
        SELECT
            order_type    AS type,
            COUNT(*)      AS count,
            SUM(total_amount) AS revenue
        FROM orders
        WHERE merchant_id = p_merchant_id
          AND (p_location_id IS NULL OR location_id = p_location_id)
          AND status NOT IN ('draft', 'cancelled', 'void', 'refunded')
          AND created_at BETWEEN p_start_date AND p_end_date
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
