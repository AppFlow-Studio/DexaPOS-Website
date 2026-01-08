public,get_customer_most_ordered_items,"CREATE OR REPLACE FUNCTION public.get_customer_most_ordered_items(p_customer_id uuid, p_limit integer DEFAULT 5)
 RETURNS TABLE(item_id uuid, item_name text, order_count integer, total_quantity integer)
 LANGUAGE sql
 STABLE
AS $function$
  SELECT 
    oi.menu_item_id as item_id,
    mi.name as item_name,
    COUNT(DISTINCT oi.order_id)::INTEGER as order_count,
    SUM(oi.quantity)::INTEGER as total_quantity
  FROM public.order_items oi
  JOIN public.orders o ON o.id = oi.order_id
  JOIN public.menu_items mi ON mi.id = oi.menu_item_id
  WHERE 
    o.customer_id = p_customer_id
    AND o.status IN ('ready', 'completed')
  GROUP BY oi.menu_item_id, mi.name
  ORDER BY total_quantity DESC
  LIMIT p_limit;
$function$
"
public,get_customer_order_channels,"CREATE OR REPLACE FUNCTION public.get_customer_order_channels(p_customer_id uuid)
 RETURNS TABLE(channel text, order_count integer, percentage numeric)
 LANGUAGE sql
 STABLE
AS $function$
  WITH channel_counts AS (
    SELECT 
      o.order_type::TEXT,
      COUNT(*) as count
    FROM public.orders o
    WHERE 
      o.customer_id = p_customer_id
      AND o.status IN ('ready', 'completed')
    GROUP BY o.order_type
  ),
  total_orders AS (
    SELECT SUM(count) as total FROM channel_counts
  )
  SELECT 
    cc.order_type,
    cc.count::INTEGER,
    ROUND((cc.count::NUMERIC / NULLIF(t.total, 0) * 100), 2) as percentage
  FROM channel_counts cc
  CROSS JOIN total_orders t
  ORDER BY cc.count DESC;
$function$
"
public,get_customer_profile,"CREATE OR REPLACE FUNCTION public.get_customer_profile(p_customer_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 STABLE
AS $function$
DECLARE
  v_result JSON;
BEGIN
  SELECT json_build_object(
    'customer', (
      SELECT row_to_json(c) 
      FROM public.customers c 
      WHERE c.id = p_customer_id
    ),
    'order_channels', (
      SELECT json_agg(row_to_json(ch))
      FROM get_customer_order_channels(p_customer_id) ch
    ),
    'most_ordered_items', (
      SELECT json_agg(row_to_json(items))
      FROM get_customer_most_ordered_items(p_customer_id, 5) items
    ),
    'recent_activity', (
      SELECT json_agg(row_to_json(act))
      FROM (
        SELECT * FROM public.customer_activities
        WHERE customer_id = p_customer_id
        ORDER BY created_at DESC
        LIMIT 10
      ) act
    )
  ) INTO v_result;
  
  RETURN v_result;
END;
$function$
"