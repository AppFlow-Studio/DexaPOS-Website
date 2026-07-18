-- Fix: get_order_courses fails with SQLSTATE 21000
--   ("more than one row returned by a subquery used as an expression")
--
-- The 'working_course' field is a scalar subquery against table_sessions filtered
-- by (order_id, is_active = TRUE). When an order has more than one active session
-- row (a real occurrence in the multi-station app), the scalar subquery returns
-- multiple rows and Postgres aborts the WHOLE function -> the POS logs
-- "Failed to load courses" and no courses render.
--
-- Fix: make the subquery deterministic by ordering the active sessions
-- (most-recently-updated first) and taking a single row with LIMIT 1.
-- Everything else in the function is unchanged from the deployed definition.

CREATE OR REPLACE FUNCTION public.get_order_courses(p_order_id uuid)
  RETURNS json
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public', 'public', 'pg_temp'
  AS $$
BEGIN
  RETURN (
    SELECT json_build_object(
      'order_id', p_order_id,
      'courses', COALESCE(
        (
          SELECT json_agg(
            json_build_object(
              'course_number', oc.course_number,
              'status', oc.status,
              'created_at', oc.created_at,
              'fired_at', oc.fired_at,
              'served_at', oc.served_at,
              'item_count', (
                SELECT COUNT(*) FROM public.order_items oi
                WHERE oi.order_id = p_order_id
                  AND oi.course_number = oc.course_number
                  AND oi.is_voided = FALSE
              ),
              'items', (
                SELECT json_agg(
                  json_build_object(
                    'id', oi.id,
                    'item_name', oi.item_name,
                    'quantity', oi.quantity,
                    'subtotal', oi.subtotal
                  )
                )
                FROM public.order_items oi
                WHERE oi.order_id = p_order_id
                  AND oi.course_number = oc.course_number
                  AND oi.is_voided = FALSE
              )
            ) ORDER BY oc.course_number
          )
          FROM public.order_courses oc
          WHERE oc.order_id = p_order_id
        ),
        '[]'::json
      ),
      'working_course', (
        SELECT ts.working_course
        FROM public.table_sessions ts
        WHERE ts.order_id = p_order_id AND ts.is_active = TRUE
        ORDER BY ts.updated_at DESC NULLS LAST, ts.created_at DESC NULLS LAST
        LIMIT 1
      ),
      'highest_course', (
        SELECT COALESCE(MAX(course_number), 0)
        FROM public.order_items
        WHERE order_id = p_order_id AND is_voided = FALSE
      )
    )
    FROM public.orders o
    WHERE o.id = p_order_id
      AND o.merchant_id = user_merchant_id()
      AND o.location_id = ANY(user_location_ids())
  );
END;
$$;

ALTER FUNCTION public.get_order_courses(uuid) OWNER TO postgres;
