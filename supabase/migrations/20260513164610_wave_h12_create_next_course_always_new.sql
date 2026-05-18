CREATE OR REPLACE FUNCTION public.create_next_course(
  p_order_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_next_course INTEGER;
  v_course_id UUID;
BEGIN
  -- Always allocate a brand-new course header. Counter is bounded by the
  -- live rows in order_courses (remove_course actually deletes them now),
  -- so it can't escalate indefinitely.
  SELECT COALESCE(MAX(course_number), 0) + 1 INTO v_next_course
  FROM public.order_courses
  WHERE order_id = p_order_id;

  -- Defensive: also respect items that may reference a higher course_number
  -- than any extant order_courses row.
  SELECT GREATEST(v_next_course, COALESCE(MAX(course_number), 0) + 1)
  INTO v_next_course
  FROM public.order_items
  WHERE order_id = p_order_id AND is_voided = FALSE;

  INSERT INTO public.order_courses (order_id, course_number, status)
  VALUES (p_order_id, v_next_course, 'open')
  RETURNING id INTO v_course_id;

  UPDATE public.table_sessions
  SET working_course = v_next_course, updated_at = NOW()
  WHERE order_id = p_order_id AND is_active = TRUE;

  RETURN json_build_object(
    'success', true,
    'course_number', v_next_course,
    'course_id', v_course_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_next_course(UUID) TO authenticated;;
