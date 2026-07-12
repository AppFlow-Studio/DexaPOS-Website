-- Rollback: restore the original get_order_courses definition where 'working_course'
-- is an unbounded scalar subquery over active table_sessions.
--
-- WARNING: reverting reintroduces SQLSTATE 21000 ("more than one row returned by a
-- subquery used as an expression") whenever an order has >1 active table_sessions row.
-- Only roll back if the forward migration must be undone for an unrelated reason.

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
