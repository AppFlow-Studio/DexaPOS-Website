-- =============================================================================
-- Reporting half-open date boundaries
-- Purpose:
--   1. Replace inclusive BETWEEN filters with half-open >= start AND < end.
--   2. Bucket get_financial_kpis daily_stats by location-local calendar day.
--   3. Keep reporting RPC payloads aligned with app expectations.
-- Notes:
--   - This migration does not touch detect_schedule_conflicts.
--   - Frontend date utility / picker state work remains separate.
-- =============================================================================

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
      AND status NOT IN ('draft', 'cancelled', 'void', 'refunded')
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
          AND o.status NOT IN ('draft', 'cancelled', 'void', 'refunded')
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
          AND o.status NOT IN ('draft', 'cancelled', 'void', 'refunded')
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
          AND status NOT IN ('draft', 'cancelled', 'void', 'refunded')
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

CREATE OR REPLACE FUNCTION public.get_cash_flow_report(
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
                'order_number',    o.order_number,
                'order_id',        o.id,
                'amount_collected', op.amount,
                'tip_amount',      op.tip_amount,
                'total_amount',    op.total_amount,
                'created_at',      op.initiated_at,
                'staff_name',      sp.first_name || ' ' || sp.last_name,
                'service_charge',  COALESCE(o.service_charge, 0)
            ) ORDER BY op.initiated_at DESC
        ), '[]'::json)
        FROM order_payments op
        JOIN orders o ON o.id = op.order_id
        LEFT JOIN staff_profiles sp ON sp.id = op.processed_by_staff_id
        WHERE o.merchant_id = p_merchant_id
          AND (p_location_id IS NULL OR o.location_id = p_location_id)
          AND op.payment_method = 'cash'
          AND op.status IN ('captured', 'authorized')
          AND op.initiated_at >= p_start_date
          AND op.initiated_at < p_end_date
    );
END;
$$;

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
              AND o.status NOT IN ('draft', 'cancelled', 'void', 'refunded')
              AND oi.is_voided = false
              AND o.created_at >= p_start_date
              AND o.created_at < p_end_date
            GROUP BY oi.item_name, oi.category_name
        ) stats
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_voids_report(
  p_merchant_id uuid,
  p_location_id uuid,
  p_start_date  timestamp with time zone,
  p_end_date    timestamp with time zone
) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
BEGIN
    RETURN json_build_object(
        'voids', (
            SELECT COALESCE(json_agg(
                json_build_object(
                    'item_name', oi.item_name,
                    'quantity', oi.quantity,
                    'amount', oi.unit_price * oi.quantity,
                    'reason', oi.void_reason,
                    'voided_at', oi.voided_at,
                    'voided_by', sp.first_name || ' ' || sp.last_name,
                    'order_number', o.order_number,
                    'order_id', o.id
                ) ORDER BY oi.voided_at DESC
            ), '[]'::json)
            FROM order_items oi
            JOIN orders o ON o.id = oi.order_id
            LEFT JOIN staff_profiles sp ON sp.id = oi.voided_by
            WHERE o.merchant_id = p_merchant_id
              AND (p_location_id IS NULL OR o.location_id = p_location_id)
              AND oi.is_voided = true
              AND oi.voided_at >= p_start_date
              AND oi.voided_at < p_end_date
        ),
        'refunds', (
            SELECT COALESCE(json_agg(
                json_build_object(
                    'order_number', o.order_number,
                    'order_id', o.id,
                    'amount', op.refunded_amount,
                    'reason', op.refund_reason,
                    'refunded_at', op.refunded_at,
                    'refunded_by', sp.first_name || ' ' || sp.last_name
                ) ORDER BY op.refunded_at DESC
            ), '[]'::json)
            FROM order_payments op
            JOIN orders o ON o.id = op.order_id
            LEFT JOIN staff_profiles sp ON sp.id = op.refunded_by
            WHERE o.merchant_id = p_merchant_id
              AND (p_location_id IS NULL OR o.location_id = p_location_id)
              AND op.refunded_amount > 0
              AND op.refunded_at >= p_start_date
              AND op.refunded_at < p_end_date
        )
    );
END;
$$;
