-- Timesheets summary grid: one canonical hours formula + one read RPC.
-- Plan: docs/features/staff/PLAN-2026-09-15-TIMESHEETS-SUMMARY-GRID.md (§3 is the
-- computation contract, §4.1 this migration).
--
-- Before this, three hours formulas disagreed (web calculateShiftDuration,
-- admin_adjust_staff_shift, rebuild_employee_daily_tips) and the web ignored
-- every POS-written break. Everything on the timesheets page and in both CSVs
-- is now a sum of the shift rows this RPC returns.

-- -----------------------------------------------------------------------------
-- 1. timesheet_shift_minutes — the one net-hours formula (§3.2)
-- -----------------------------------------------------------------------------
-- Two break shapes are live: the POS writes {start,end,type}, the web adjust
-- path writes {id,type,start_at,end_at,duration_minutes}. Both are read.
-- Breaks are clamped to the shift (one live break ends after its shift) and
-- overlapping breaks of the same type are merged first, so a double-logged
-- break is not deducted twice.
--
-- Never throws: NULL / non-array break_logs, non-object entries, missing keys
-- and unparseable timestamps are all ignored. The casts sit behind
-- pg_input_is_valid() inside CASE, which (unlike a WHERE qual) guarantees the
-- guard runs first.
--
-- Declared IMMUTABLE per the plan. Strictly, casting an offset-less timestamp
-- string depends on the session TimeZone; every live break carries an offset.
CREATE OR REPLACE FUNCTION public.timesheet_shift_minutes(
  p_clock_in timestamptz,
  p_clock_out timestamptz,
  p_break_logs jsonb,
  OUT net_minutes integer,
  OUT unpaid_break_minutes integer,
  OUT paid_break_minutes integer
)
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = 'public', 'pg_temp'
AS $$
  WITH entries AS (
    SELECT
      CASE WHEN e.value->>'type' = 'paid' THEN 'paid' ELSE 'unpaid' END AS break_type,
      COALESCE(NULLIF(e.value->>'start_at', ''), NULLIF(e.value->>'start', '')) AS start_txt,
      COALESCE(NULLIF(e.value->>'end_at', ''), NULLIF(e.value->>'end', '')) AS end_txt
    FROM jsonb_array_elements(
      CASE WHEN jsonb_typeof(p_break_logs) = 'array' THEN p_break_logs ELSE '[]'::jsonb END
    ) AS e
    WHERE jsonb_typeof(e.value) = 'object'
  ),
  parsed AS (
    SELECT
      break_type,
      CASE WHEN pg_input_is_valid(start_txt, 'timestamptz') THEN start_txt::timestamptz END AS start_at,
      CASE WHEN pg_input_is_valid(end_txt, 'timestamptz') THEN end_txt::timestamptz END AS end_at
    FROM entries
  ),
  clamped AS (
    -- GREATEST/LEAST skip NULLs, so NULL ends must be dropped before clamping.
    SELECT
      break_type,
      GREATEST(start_at, p_clock_in) AS s,
      LEAST(end_at, p_clock_out) AS e
    FROM parsed
    WHERE start_at IS NOT NULL
      AND end_at IS NOT NULL
  ),
  islands AS (
    -- Gaps-and-islands: a break that starts before the running max end of the
    -- earlier breaks of its type continues that island.
    SELECT
      break_type, s, e,
      CASE
        WHEN s <= MAX(e) OVER (
          PARTITION BY break_type ORDER BY s, e
          ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
        ) THEN 0
        ELSE 1
      END AS is_new_island
    FROM clamped
    WHERE e > s
  ),
  numbered AS (
    SELECT
      break_type, s, e,
      SUM(is_new_island) OVER (
        PARTITION BY break_type ORDER BY s, e ROWS UNBOUNDED PRECEDING
      ) AS island
    FROM islands
  ),
  merged AS (
    SELECT break_type, EXTRACT(EPOCH FROM MAX(e) - MIN(s)) AS secs
    FROM numbered
    GROUP BY break_type, island
  ),
  totals AS (
    SELECT
      COALESCE(SUM(secs) FILTER (WHERE break_type = 'unpaid'), 0) AS unpaid_secs,
      COALESCE(SUM(secs) FILTER (WHERE break_type = 'paid'), 0) AS paid_secs
    FROM merged
  )
  SELECT
    CASE WHEN p_clock_in IS NULL OR p_clock_out IS NULL THEN 0
         ELSE ROUND(GREATEST(EXTRACT(EPOCH FROM p_clock_out - p_clock_in) - t.unpaid_secs, 0) / 60)::integer
    END,
    CASE WHEN p_clock_in IS NULL OR p_clock_out IS NULL THEN 0
         ELSE ROUND(t.unpaid_secs / 60)::integer
    END,
    CASE WHEN p_clock_in IS NULL OR p_clock_out IS NULL THEN 0
         ELSE ROUND(t.paid_secs / 60)::integer
    END
  FROM totals t;
$$;

COMMENT ON FUNCTION public.timesheet_shift_minutes(timestamptz, timestamptz, jsonb) IS
  'Canonical net / unpaid-break / paid-break minutes for one shift (timesheets '
  'plan §3.2). Reads both break shapes ({start,end} from the POS and '
  '{start_at,end_at} from the web), clamps breaks to the shift, merges '
  'same-type overlaps. Open shift => all zero. Never throws on malformed break_logs.';

-- -----------------------------------------------------------------------------
-- 2. get_timesheet_summary — shift-grain payload for the timesheets page (§4.1)
-- -----------------------------------------------------------------------------
-- Returns shift rows, not buckets: day / week / month / custom totals are
-- plain sums on the client, so switching views needs no refetch and the CSVs
-- serialise the same rows the screen renders.
--
-- Overtime is allocated per shift, chronologically, within the full Mon–Sun
-- workweek (§3.3). The read window is therefore widened to the Monday on/before
-- p_start and the Sunday on/after p_end so running totals are right at the
-- range edges; only shifts whose local clock-in date is inside the range are
-- returned.
CREATE OR REPLACE FUNCTION public.get_timesheet_summary(
  p_location_id uuid,
  p_start date,
  p_end date
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = 'public', 'pg_temp'
AS $$
DECLARE
  -- Constants surfaced in meta so the client never hard-codes a threshold.
  c_ot_threshold_minutes constant integer := 2400;  -- 40 h / week (§9 Q2)
  c_ot_multiplier constant numeric := 1.5;           -- §9 Q3
  c_max_shift_minutes constant integer := 960;       -- 16 h: over-max + missing clock-out
  c_max_span_days constant integer := 92;

  v_merchant_id uuid;
  v_location_name text;
  v_tz text;
  v_now timestamptz := now();
  v_fetch_start date;
  v_fetch_end date;
  v_from timestamptz;
  v_to timestamptz;
  v_result jsonb;
BEGIN
  IF p_location_id IS NULL OR p_start IS NULL OR p_end IS NULL OR p_end < p_start THEN
    RAISE EXCEPTION 'INVALID_RANGE';
  END IF;

  IF p_end - p_start > c_max_span_days THEN
    RAISE EXCEPTION 'RANGE_TOO_LARGE';
  END IF;

  SELECT l.merchant_id, l.name, COALESCE(NULLIF(l.timezone, ''), 'America/New_York')
  INTO v_merchant_id, v_location_name, v_tz
  FROM public.locations l
  WHERE l.id = p_location_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND';
  END IF;

  -- SECURITY DEFINER bypasses RLS, so this is the tenant guard. Same shape as
  -- admin_adjust_staff_shift; view-level permission (owner, admin, manager,
  -- shift_manager). Caller identity is current_user_id() (Clerk sub).
  -- COALESCE is load-bearing: with no org_id claim is_dexapos_admin() is NULL,
  -- so both helpers return NULL (not false) for an outsider, and a bare
  -- `IF NOT (NULL)` would skip the RAISE.
  IF NOT COALESCE(
    public.is_merchant_admin(v_merchant_id)
    OR public.user_has_location_permission(p_location_id, 'location.team.view'),
    false
  ) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED';
  END IF;

  -- A bad zone name would make every AT TIME ZONE below throw; fall back to
  -- the column default instead of breaking the page.
  BEGIN
    PERFORM v_now AT TIME ZONE v_tz;
  EXCEPTION WHEN invalid_parameter_value THEN
    v_tz := 'America/New_York';
  END;

  -- Monday on/before p_start .. Sunday on/after p_end, as local midnights.
  -- Each boundary is converted on its own so DST-length days stay exact.
  v_fetch_start := p_start - (EXTRACT(ISODOW FROM p_start)::integer - 1);
  v_fetch_end := p_end + (7 - EXTRACT(ISODOW FROM p_end)::integer);
  v_from := (v_fetch_start::timestamp) AT TIME ZONE v_tz;
  v_to := ((v_fetch_end + 1)::timestamp) AT TIME ZONE v_tz;

  WITH base AS (
    SELECT
      ss.id,
      ss.staff_profile_id,
      ss.status,
      ss.clock_in_time,
      ss.clock_out_time,
      ss.break_logs,
      ss.hourly_rate_snapshot,
      ss.device_id,
      ss.notes,
      ss.is_verified,
      (ss.clock_in_time AT TIME ZONE v_tz)::date AS local_date,
      m.net_minutes,
      m.unpaid_break_minutes,
      m.paid_break_minutes
    FROM public.staff_shifts ss
    CROSS JOIN LATERAL public.timesheet_shift_minutes(
      ss.clock_in_time, ss.clock_out_time, ss.break_logs
    ) m
    WHERE ss.location_id = p_location_id
      AND ss.clock_in_time >= v_from
      AND ss.clock_in_time < v_to
  ),
  with_ot AS (
    -- The last minutes worked in a week are the overtime minutes. Open shifts
    -- add 0 to the running total and carry no overtime.
    SELECT
      b.*,
      CASE
        WHEN b.clock_out_time IS NULL THEN 0
        ELSE LEAST(
          b.net_minutes,
          GREATEST(
            SUM(CASE WHEN b.clock_out_time IS NULL THEN 0 ELSE b.net_minutes END) OVER (
              PARTITION BY b.staff_profile_id,
                           b.local_date - (EXTRACT(ISODOW FROM b.local_date)::integer - 1)
              ORDER BY b.clock_in_time, b.id
              ROWS UNBOUNDED PRECEDING
            ) - c_ot_threshold_minutes,
            0
          )
        )
      END::integer AS ot_minutes
    FROM base b
  ),
  shifts AS (
    SELECT
      o.*,
      (o.clock_out_time IS NULL) AS is_open,
      COALESCE(o.notes, '') LIKE 'Auto clock-out (system)%' AS is_auto_closed
    FROM with_ot o
    WHERE o.local_date BETWEEN p_start AND p_end
  ),
  -- A member row is keyed by staff_profile_id OR (Clerk users upgraded from
  -- POS) only by user_id — normalise both, as get_unified_staff_view does.
  memberships AS (
    SELECT DISTINCT ON (x.profile_id)
      x.profile_id,
      x.is_active,
      x.role_code
    FROM (
      SELECT
        COALESCE(lm.staff_profile_id, sp_map.id) AS profile_id,
        lm.is_active,
        lm.role_code,
        lm.assigned_at
      FROM public.location_members lm
      LEFT JOIN public.staff_profiles sp_map
        ON lm.staff_profile_id IS NULL
       AND sp_map.user_id = lm.user_id
       AND sp_map.merchant_id = v_merchant_id
      WHERE lm.location_id = p_location_id
    ) x
    WHERE x.profile_id IS NOT NULL
    ORDER BY x.profile_id, x.is_active DESC, x.assigned_at DESC
  ),
  -- Everyone currently working here (absence is signal), plus anyone with a
  -- shift in the range who has since left.
  people AS (
    SELECT mb.profile_id
    FROM memberships mb
    JOIN public.staff_profiles sp ON sp.id = mb.profile_id
    WHERE mb.is_active AND sp.is_active
    UNION
    SELECT s.staff_profile_id FROM shifts s
  ),
  employees AS (
    SELECT
      p.profile_id,
      COALESCE(
        NULLIF(BTRIM(sp.display_name), ''),
        BTRIM(COALESCE(sp.first_name, '') || ' ' || COALESCE(sp.last_name, ''))
      ) AS display_name,
      sp.first_name,
      sp.last_name,
      COALESCE(u.avatar_url, sp.avatar_url) AS avatar_url,
      r.name AS role_name,
      COALESCE(mb.is_active AND sp.is_active, false) AS is_active_member
    FROM people p
    LEFT JOIN public.staff_profiles sp ON sp.id = p.profile_id
    LEFT JOIN public.users u ON u.id = sp.user_id
    LEFT JOIN memberships mb ON mb.profile_id = p.profile_id
    LEFT JOIN public.roles r ON r.code = mb.role_code
  )
  SELECT jsonb_build_object(
    'meta', jsonb_build_object(
      'location_id', p_location_id,
      'location_name', v_location_name,
      'timezone', v_tz,
      'week_starts_on', 'monday',
      'ot_threshold_minutes', c_ot_threshold_minutes,
      'ot_multiplier', c_ot_multiplier,
      'max_shift_minutes', c_max_shift_minutes,
      'range_start', to_char(p_start, 'YYYY-MM-DD'),
      'range_end', to_char(p_end, 'YYYY-MM-DD'),
      'generated_at', v_now
    ),
    'employees', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'staff_profile_id', e.profile_id,
          'display_name', e.display_name,
          'first_name', e.first_name,
          'last_name', e.last_name,
          'avatar_url', e.avatar_url,
          'role_name', e.role_name,
          'is_active_member', e.is_active_member
        )
        ORDER BY e.display_name, e.profile_id
      )
      FROM employees e
    ), '[]'::jsonb),
    'shifts', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', s.id,
          'staff_profile_id', s.staff_profile_id,
          'local_date', to_char(s.local_date, 'YYYY-MM-DD'),
          'clock_in', s.clock_in_time,
          'clock_out', s.clock_out_time,
          'status', s.status,
          'net_minutes', s.net_minutes,
          'unpaid_break_minutes', s.unpaid_break_minutes,
          'paid_break_minutes', s.paid_break_minutes,
          'ot_minutes', s.ot_minutes,
          'rate', s.hourly_rate_snapshot,
          -- Truncated per shift so every total is an exact sum of shift cents.
          'pay_cents', CASE
            WHEN s.hourly_rate_snapshot > 0 THEN
              TRUNC(
                ((s.net_minutes - s.ot_minutes) * s.hourly_rate_snapshot
                  + s.ot_minutes * s.hourly_rate_snapshot * c_ot_multiplier)
                / 60.0 * 100
              )::bigint
            ELSE NULL
          END,
          'is_open', s.is_open,
          'is_on_clock', s.is_open
                         AND s.clock_in_time > v_now - make_interval(mins => c_max_shift_minutes),
          'is_missing_out', s.is_open
                            AND s.clock_in_time <= v_now - make_interval(mins => c_max_shift_minutes),
          'is_overnight', NOT s.is_open
                          AND (s.clock_out_time AT TIME ZONE v_tz)::date > s.local_date,
          'is_over_max', NOT s.is_open AND s.net_minutes > c_max_shift_minutes,
          'is_edited', COALESCE(s.is_verified, false) AND NOT s.is_auto_closed,
          'is_auto_closed', s.is_auto_closed,
          'from_pos', s.device_id IS NOT NULL,
          'breaks', (
            -- Display copy of the breaks, both key shapes normalised. Same
            -- parsing rules as timesheet_shift_minutes; each entry keeps its
            -- own minutes (the totals above merge overlaps).
            SELECT COALESCE(
              jsonb_agg(
                jsonb_build_object(
                  'type', bk.break_type,
                  'start', bk.start_at,
                  'end', bk.end_at,
                  'minutes', CASE
                    WHEN bk.end_at IS NULL OR s.is_open THEN 0
                    ELSE ROUND(EXTRACT(EPOCH FROM bk.end_at - bk.start_at) / 60)::integer
                  END
                )
                ORDER BY bk.start_at, bk.end_at
              ),
              '[]'::jsonb
            )
            FROM (
              SELECT
                pb.break_type,
                CASE WHEN s.is_open THEN pb.start_at
                     ELSE LEAST(GREATEST(pb.start_at, s.clock_in_time), s.clock_out_time)
                END AS start_at,
                CASE WHEN s.is_open OR pb.end_at IS NULL THEN pb.end_at
                     ELSE GREATEST(
                       LEAST(pb.end_at, s.clock_out_time),
                       LEAST(GREATEST(pb.start_at, s.clock_in_time), s.clock_out_time)
                     )
                END AS end_at
              FROM (
                SELECT
                  be.break_type,
                  CASE WHEN pg_input_is_valid(be.start_txt, 'timestamptz') THEN be.start_txt::timestamptz END AS start_at,
                  CASE WHEN pg_input_is_valid(be.end_txt, 'timestamptz') THEN be.end_txt::timestamptz END AS end_at
                FROM (
                  SELECT
                    CASE WHEN e.value->>'type' = 'paid' THEN 'paid' ELSE 'unpaid' END AS break_type,
                    COALESCE(NULLIF(e.value->>'start_at', ''), NULLIF(e.value->>'start', '')) AS start_txt,
                    COALESCE(NULLIF(e.value->>'end_at', ''), NULLIF(e.value->>'end', '')) AS end_txt
                  FROM jsonb_array_elements(
                    CASE WHEN jsonb_typeof(s.break_logs) = 'array' THEN s.break_logs ELSE '[]'::jsonb END
                  ) AS e
                  WHERE jsonb_typeof(e.value) = 'object'
                ) be
              ) pb
              WHERE pb.start_at IS NOT NULL
            ) bk
          ),
          -- Raw column, for the Adjust shift dialog.
          'break_logs', CASE WHEN jsonb_typeof(s.break_logs) = 'array' THEN s.break_logs ELSE '[]'::jsonb END,
          'notes', s.notes,
          'is_verified', COALESCE(s.is_verified, false)
        )
        ORDER BY s.staff_profile_id, s.clock_in_time
      )
      FROM shifts s
    ), '[]'::jsonb)
  )
  INTO v_result;

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.get_timesheet_summary(uuid, date, date) IS
  'Timesheets page payload for one location and an inclusive local-date range '
  '(<= 92 days): meta, employees (active members + anyone with a shift in range), '
  'and shift rows with net / break / overtime minutes, pay cents and review flags. '
  'Hours via timesheet_shift_minutes; overtime per shift within the Mon-Sun '
  'workweek. SECURITY DEFINER with its own guard: merchant admin or '
  'location.team.view. Raises INVALID_RANGE, RANGE_TOO_LARGE, NOT_FOUND, PERMISSION_DENIED.';

-- -----------------------------------------------------------------------------
-- 3. Index for the RPC's range scan
-- -----------------------------------------------------------------------------
-- Only an open-shift partial index on (location_id, clock_in_time) existed.
CREATE INDEX IF NOT EXISTS idx_staff_shifts_location_clock_in
  ON public.staff_shifts (location_id, clock_in_time);

-- -----------------------------------------------------------------------------
-- 4. Grants (house convention)
-- -----------------------------------------------------------------------------
-- Supabase's default privileges hand new functions to anon; a SECURITY DEFINER
-- reader of wage data has no business being callable anonymously.
REVOKE ALL ON FUNCTION public.timesheet_shift_minutes(timestamptz, timestamptz, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.timesheet_shift_minutes(timestamptz, timestamptz, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.timesheet_shift_minutes(timestamptz, timestamptz, jsonb)
  TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_timesheet_summary(uuid, date, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_timesheet_summary(uuid, date, date) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_timesheet_summary(uuid, date, date)
  TO authenticated, service_role;
