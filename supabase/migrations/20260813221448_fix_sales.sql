CREATE OR REPLACE FUNCTION public.get_sales_by_item_report_v2(
  p_merchant_id uuid,
  p_location_id uuid,
  p_start_date timestamptz,
  p_end_date timestamptz,
  p_order_source text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_filter_source text := CASE
    WHEN p_order_source IS NULL THEN NULL
    ELSE public.normalize_order_source(p_order_source)
  END;
BEGIN
  IF v_filter_source IS NOT NULL
     AND v_filter_source NOT IN ('pos', 'kiosk', 'online_store', 'orderout') THEN
    RAISE EXCEPTION 'Invalid order_source filter: %', p_order_source
      USING ERRCODE = '22023';
  END IF;

  IF NOT public.is_dexapos_admin() THEN
    IF p_merchant_id IS DISTINCT FROM public.user_merchant_id() THEN
      RAISE EXCEPTION 'Access denied: merchant not in user scope';
    END IF;

    IF p_location_id IS NOT NULL
       AND NOT COALESCE(p_location_id = ANY(public.user_location_ids()), false) THEN
      RAISE EXCEPTION 'Access denied: location not in user scope';
    END IF;
  END IF;

  RETURN (
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'item_name', item_name,
          'category', category_name,
          'quantity_sold', total_qty,
          'gross_sales', gross_sales,
          'net_sales', net_sales
        )
        ORDER BY gross_sales DESC
      ),
      '[]'::jsonb
    )
    FROM (
      SELECT
        oi.item_name,
        oi.category_name,
        SUM(GREATEST(COALESCE(oi.quantity, 0) - COALESCE(oi.refunded_quantity, 0), 0)) AS total_qty,
        SUM(COALESCE(oi.pre_discount_subtotal, oi.subtotal)) AS gross_sales,
        SUM(GREATEST(COALESCE(oi.subtotal, 0) - COALESCE(oi.refunded_amount, 0), 0)) AS net_sales
      FROM public.order_items oi
      JOIN public.orders o ON o.id = oi.order_id
      WHERE o.merchant_id = p_merchant_id
        AND (p_location_id IS NULL OR o.location_id = p_location_id)
        AND public.is_order_reportable(o.status::text, o.payment_status::text, o.total_amount)
        AND COALESCE(oi.is_voided, false) = false
        AND o.created_at >= p_start_date
        AND o.created_at < p_end_date
        AND (
          v_filter_source IS NULL
          OR public.normalize_order_source(o.order_source) = v_filter_source
        )
      GROUP BY oi.item_name, oi.category_name
    ) stats
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.get_sales_by_item_report_v2(uuid, uuid, timestamptz, timestamptz, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_sales_by_item_report_v2(uuid, uuid, timestamptz, timestamptz, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_sales_by_item_report_v2(uuid, uuid, timestamptz, timestamptz, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_sales_by_item_report_v2(uuid, uuid, timestamptz, timestamptz, text) TO service_role;;