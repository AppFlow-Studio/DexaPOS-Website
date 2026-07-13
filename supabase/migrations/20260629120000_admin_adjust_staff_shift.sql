-- Timesheets: controlled manager adjustment path.
-- Lets merchant admins/managers correct clock times and break logs without
-- bypassing tenant authorization or basic labor-time validation.

CREATE OR REPLACE FUNCTION public.admin_adjust_staff_shift(
  p_shift_id uuid,
  p_clock_in_time timestamptz,
  p_clock_out_time timestamptz DEFAULT NULL,
  p_break_logs jsonb DEFAULT '[]'::jsonb,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public', 'pg_temp'
AS $$
DECLARE
  v_shift public.staff_shifts%ROWTYPE;
  v_updated public.staff_shifts%ROWTYPE;
  v_reason text := NULLIF(BTRIM(COALESCE(p_reason, '')), '');
  v_break_logs jsonb := COALESCE(p_break_logs, '[]'::jsonb);
  v_normalized_break_logs jsonb := '[]'::jsonb;
  v_break record;
  v_break_start timestamptz;
  v_break_end timestamptz;
  v_previous_break_end timestamptz;
  v_break_type text;
  v_break_duration_minutes integer;
  v_unpaid_break_minutes numeric := 0;
  v_total_minutes numeric;
  v_net_minutes numeric;
  v_estimated_pay numeric;
BEGIN
  IF p_shift_id IS NULL THEN
    RAISE EXCEPTION 'SHIFT_REQUIRED';
  END IF;

  IF p_clock_in_time IS NULL THEN
    RAISE EXCEPTION 'CLOCK_IN_REQUIRED';
  END IF;

  IF v_reason IS NULL THEN
    RAISE EXCEPTION 'REASON_REQUIRED';
  END IF;

  SELECT *
  INTO v_shift
  FROM public.staff_shifts
  WHERE id = p_shift_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'SHIFT_NOT_FOUND';
  END IF;

  IF NOT (
    public.is_merchant_admin(v_shift.merchant_id)
    OR public.user_has_location_permission(v_shift.location_id, 'location.team.manage')
  ) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED';
  END IF;

  IF p_clock_in_time > now() + interval '5 minutes'
    OR (p_clock_out_time IS NOT NULL AND p_clock_out_time > now() + interval '5 minutes') THEN
    RAISE EXCEPTION 'FUTURE_SHIFT_TIME';
  END IF;

  IF p_clock_out_time IS NOT NULL AND p_clock_out_time <= p_clock_in_time THEN
    RAISE EXCEPTION 'INVALID_RANGE';
  END IF;

  IF jsonb_typeof(v_break_logs) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'INVALID_BREAK_LOGS';
  END IF;

  FOR v_break IN
    SELECT entry
    FROM jsonb_array_elements(v_break_logs) AS b(entry)
    ORDER BY NULLIF(entry->>'start_at', '') NULLS LAST
  LOOP
    v_break_type := COALESCE(NULLIF(v_break.entry->>'type', ''), 'unpaid');

    IF v_break_type NOT IN ('paid', 'unpaid') THEN
      RAISE EXCEPTION 'INVALID_BREAK_TYPE';
    END IF;

    IF NULLIF(v_break.entry->>'start_at', '') IS NULL
      OR NULLIF(v_break.entry->>'end_at', '') IS NULL THEN
      RAISE EXCEPTION 'BREAK_TIME_REQUIRED';
    END IF;

    BEGIN
      v_break_start := (v_break.entry->>'start_at')::timestamptz;
      v_break_end := (v_break.entry->>'end_at')::timestamptz;
    EXCEPTION
      WHEN others THEN
        RAISE EXCEPTION 'INVALID_BREAK_TIME';
    END;

    IF v_break_end <= v_break_start THEN
      RAISE EXCEPTION 'INVALID_BREAK_RANGE';
    END IF;

    IF v_break_start < p_clock_in_time THEN
      RAISE EXCEPTION 'BREAK_OUT_OF_BOUNDS';
    END IF;

    IF p_clock_out_time IS NOT NULL AND v_break_end > p_clock_out_time THEN
      RAISE EXCEPTION 'BREAK_OUT_OF_BOUNDS';
    END IF;

    IF p_clock_out_time IS NULL AND v_break_end > now() + interval '5 minutes' THEN
      RAISE EXCEPTION 'FUTURE_BREAK_TIME';
    END IF;

    IF v_previous_break_end IS NOT NULL AND v_break_start < v_previous_break_end THEN
      RAISE EXCEPTION 'BREAKS_OVERLAP';
    END IF;

    v_break_duration_minutes := CEIL(EXTRACT(EPOCH FROM (v_break_end - v_break_start)) / 60.0)::integer;

    IF v_break_type = 'unpaid' THEN
      v_unpaid_break_minutes := v_unpaid_break_minutes + v_break_duration_minutes;
    END IF;

    v_normalized_break_logs :=
      v_normalized_break_logs ||
      jsonb_build_array(
        (v_break.entry - 'duration_minutes' - 'type' - 'id') ||
        jsonb_build_object(
          'id', COALESCE(NULLIF(v_break.entry->>'id', ''), gen_random_uuid()::text),
          'type', v_break_type,
          'duration_minutes', v_break_duration_minutes
        )
      );

    v_previous_break_end := v_break_end;
  END LOOP;

  IF p_clock_out_time IS NOT NULL THEN
    v_total_minutes := EXTRACT(EPOCH FROM (p_clock_out_time - p_clock_in_time)) / 60.0;

    IF v_unpaid_break_minutes > v_total_minutes THEN
      RAISE EXCEPTION 'BREAK_EXCEEDS_SHIFT';
    END IF;

    v_net_minutes := GREATEST(v_total_minutes - v_unpaid_break_minutes, 0);
    v_estimated_pay := ROUND((v_net_minutes / 60.0) * COALESCE(v_shift.hourly_rate_snapshot, 0), 2);
  ELSE
    v_net_minutes := NULL;
    v_estimated_pay := NULL;
  END IF;

  UPDATE public.staff_shifts
  SET
    clock_in_time = p_clock_in_time,
    clock_out_time = p_clock_out_time,
    break_logs = v_normalized_break_logs,
    notes = v_reason,
    is_verified = true,
    status = CASE
      WHEN p_clock_out_time IS NULL THEN
        CASE WHEN v_shift.status = 'on_break' THEN 'on_break' ELSE 'active' END
      ELSE 'completed'
    END,
    updated_at = now()
  WHERE id = p_shift_id
  RETURNING *
  INTO v_updated;

  RETURN jsonb_build_object(
    'shift', to_jsonb(v_updated),
    'net_worked_minutes', v_net_minutes,
    'estimated_pay', v_estimated_pay
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_adjust_staff_shift(uuid, timestamptz, timestamptz, jsonb, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_adjust_staff_shift(uuid, timestamptz, timestamptz, jsonb, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_adjust_staff_shift(uuid, timestamptz, timestamptz, jsonb, text) TO service_role;
