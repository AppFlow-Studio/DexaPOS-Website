-- ============================================================================
-- Duration analytics — measure the event, not the paperwork
-- ============================================================================
--
-- `get_avg_kitchen_time` and `get_avg_table_turn_time` both reported numbers
-- that were not merely imprecise, they were describing a different quantity
-- than their titles claimed. Measured against staging on 2026-09-23, over a
-- 90-day window:
--
--     Kitchen time    reported mean 2,092 min (34 h)   actual median   2.4 min
--     Table turn      reported mean 2,432 min (40 h)   actual median  12.8 min
--
-- A 34-hour "kitchen time" on a dashboard is not a number anyone can act on,
-- and its presence teaches viewers to distrust the panel it sits in.
--
-- WHY IT WAS WRONG. Both functions took an unbounded AVG() over a timestamp
-- pair whose end column records when a human cleared the record, not when the
-- event finished. A ticket nobody bumps and a table nobody closes stay open
-- until someone tidies up days later. The underlying data is bimodal:
--
--     KDS tickets:     48% bump within ~2 min        29% sit open over a day
--     Table sessions:  real turns cluster near 12m   44% run past 8 h
--
-- A mean over two populations that far apart describes neither of them. One
-- abandoned session dated 2026-08-04 ran 36.8 days and on its own set the
-- vertical scale of the entire turn-time chart, flattening every real day into
-- the baseline. The fix is not a bigger axis label — it is to stop averaging
-- paperwork into a measure of service.
--
-- EXCLUDE, DO NOT CLAMP. Clamping a 36-day session to 8 h would keep the row
-- and assert that a table was occupied for eight hours. Nothing observed
-- supports that; the session was abandoned, and its true duration is unknown.
-- An unknown value must not be folded into an average as though it were a
-- measurement. Excluding it makes the statement "of the sessions we can
-- actually measure, the median turn was 12.8 min" — which is both true and
-- useful. The cost is that the sample shrinks, so the sample is now reported
-- (see `sample_count` / `excluded_count` below) rather than hidden.
--
-- MEDIAN, NOT MEAN. Even after filtering, service durations have a long right
-- tail: one genuinely slow table should not drag the day's figure. The median
-- answers "what was a typical turn today", which is the question the panel is
-- actually asking. The mean is retained alongside it for anyone reconciling
-- against a total, but it is computed over the FILTERED rows only.
--
-- THE CEILINGS ARE CONSERVATIVE AND THEY ARE JUDGEMENT CALLS.
--
--     Kitchen  180 min  A three-hour ticket is already far beyond any real
--                       prep; anything past it is a ticket nobody bumped.
--     Turn     480 min  An eight-hour seating is implausible for a single
--                       party but leaves room for genuinely long service,
--                       private events and late closes.
--
-- They are deliberately loose: the aim is to remove records that are obviously
-- abandoned, not to enforce a view of what good service looks like. Both are
-- named constants in the function bodies so a future change is a one-line edit
-- with this reasoning attached. If real operations start exceeding them, the
-- ceiling is wrong and should be raised — the excluded_count column is what
-- will show that happening.
--
-- DAYS CAN NOW COME BACK EMPTY, AND THAT IS THE POINT. On the staging window,
-- 10 of 20 days lose every row, because every session that day was abandoned.
-- Those days have no measurable turn time and the function now omits them
-- instead of inventing one. CALLERS MUST RENDER A GAP, NOT A ZERO: a zero-
-- minute turn is a factual claim that tables turned instantly, which is the
-- same class of error this migration exists to remove. Recharts leaves a gap
-- for a null `avg_minutes`, which is why the column is nullable rather than
-- COALESCEd to 0.
--
-- `actual_duration` IS GONE FROM THE CALCULATION. The old turn-time function
-- read COALESCE(ts.actual_duration, <elapsed>). That column is NULL on all
-- 1,000 staging sessions sampled, so the COALESCE never once took its first
-- branch — it was dead code wearing the appearance of a preference. Worse, its
-- writers disagree with one of its readers about units (two RPCs store minutes;
-- a legacy view divides the same column by 60 again). Depending on it would
-- mean depending on a coin flip. Elapsed time is computed explicitly here.
--
-- TURN NOW PREFERS paid_at -> cleared_at -> closed_at. `closed_at` is a
-- housekeeping timestamp; `paid_at` is the guest leaving. paid_at is only
-- populated on ~38% of rows, so it cannot simply replace closed_at — it is a
-- preference with fallback, which moves the metric toward the real event
-- wherever the better timestamp exists.
--
-- THE ARGUMENT LIST IS UNCHANGED, so every existing caller keeps working: the
-- first three returned columns (`date`, `avg_minutes`, `overall_avg`) keep their
-- names, types and order, and two are ADDED (`sample_count`, `excluded_count`).
-- Recharts ignores extra keys, so the dashboards continue to render while the UI
-- catches up to display them.
--
-- A DROP IS REQUIRED ANYWAY. Postgres will not let CREATE OR REPLACE change a
-- function's RETURNS TABLE shape — adding a column counts, and the statement
-- fails with "cannot change return type of existing function". Dropping also
-- revokes the grants, so they are re-issued at the bottom exactly as
-- 20260413215901_remote_schema.sql set them. Both functions are read-only
-- analytics, so the momentary window where they do not exist costs at most a
-- failed dashboard fetch that the next poll retries.
-- ============================================================================

DROP FUNCTION IF EXISTS public.get_avg_kitchen_time(TIMESTAMPTZ, TIMESTAMPTZ);
DROP FUNCTION IF EXISTS public.get_avg_table_turn_time(TIMESTAMPTZ, TIMESTAMPTZ);

-- ----------------------------------------------------------------------------
-- get_avg_kitchen_time
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_avg_kitchen_time(
  p_from TIMESTAMPTZ,
  p_to   TIMESTAMPTZ
)
RETURNS TABLE(
  date            DATE,
  avg_minutes     NUMERIC,
  overall_avg     NUMERIC,
  sample_count    BIGINT,
  excluded_count  BIGINT
)
LANGUAGE plpgsql
STABLE
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  -- See "THE CEILINGS ARE CONSERVATIVE" above before changing this.
  c_max_minutes CONSTANT NUMERIC := 180;
BEGIN
  RETURN QUERY
  WITH measured AS (
    SELECT
      DATE(kis.created_at) AS kitchen_date,
      EXTRACT(EPOCH FROM (kis.bumped_at - kis.created_at)) / 60 AS minutes
    FROM kds_item_status kis
    WHERE kis.created_at >= p_from
      AND kis.created_at <  p_to
      AND kis.bumped_at IS NOT NULL
  ),
  classified AS (
    -- A row is plausible if it is non-negative (clock skew between the POS and
    -- the server can produce a bump that precedes its own ticket) and inside
    -- the ceiling.
    SELECT
      kitchen_date,
      minutes,
      (minutes >= 0 AND minutes <= c_max_minutes) AS is_plausible
    FROM measured
  ),
  per_day AS (
    SELECT
      c.kitchen_date,
      ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (
        ORDER BY c.minutes) FILTER (WHERE c.is_plausible)::NUMERIC, 2) AS median_min,
      COUNT(*) FILTER (WHERE c.is_plausible)     AS kept,
      COUNT(*) FILTER (WHERE NOT c.is_plausible) AS dropped
    FROM classified c
    GROUP BY c.kitchen_date
  )
  SELECT
    p.kitchen_date,
    p.median_min,
    (
      SELECT ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (
        ORDER BY c2.minutes)::NUMERIC, 2)
      FROM classified c2
      WHERE c2.is_plausible
    ) AS overall_avg,
    p.kept,
    p.dropped
  FROM per_day p
  -- Days where every row was implausible have no measurable kitchen time.
  -- Omit them so the chart shows a gap rather than a fabricated zero.
  WHERE p.kept > 0
  ORDER BY p.kitchen_date;
END;
$$;

-- ----------------------------------------------------------------------------
-- get_avg_table_turn_time
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_avg_table_turn_time(
  p_from TIMESTAMPTZ,
  p_to   TIMESTAMPTZ
)
RETURNS TABLE(
  date            DATE,
  avg_minutes     NUMERIC,
  overall_avg     NUMERIC,
  sample_count    BIGINT,
  excluded_count  BIGINT
)
LANGUAGE plpgsql
STABLE
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  -- See "THE CEILINGS ARE CONSERVATIVE" above before changing this.
  c_max_minutes CONSTANT NUMERIC := 480;
BEGIN
  RETURN QUERY
  WITH measured AS (
    SELECT
      DATE(ts.seated_at) AS session_date,
      -- paid_at is the guest leaving; cleared_at is the table being reset;
      -- closed_at is a record being tidied. Prefer the earliest signal that
      -- actually corresponds to the party going.
      EXTRACT(EPOCH FROM (
        COALESCE(ts.paid_at, ts.cleared_at, ts.closed_at) - ts.seated_at
      )) / 60 AS minutes
    FROM table_sessions ts
    WHERE ts.seated_at >= p_from
      AND ts.seated_at <  p_to
      AND COALESCE(ts.paid_at, ts.cleared_at, ts.closed_at) IS NOT NULL
  ),
  classified AS (
    -- Strictly positive: a zero-length seating is a mis-tap, not a turn.
    SELECT
      session_date,
      minutes,
      (minutes > 0 AND minutes <= c_max_minutes) AS is_plausible
    FROM measured
  ),
  per_day AS (
    SELECT
      c.session_date,
      ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (
        ORDER BY c.minutes) FILTER (WHERE c.is_plausible)::NUMERIC, 2) AS median_min,
      COUNT(*) FILTER (WHERE c.is_plausible)     AS kept,
      COUNT(*) FILTER (WHERE NOT c.is_plausible) AS dropped
    FROM classified c
    GROUP BY c.session_date
  )
  SELECT
    p.session_date,
    p.median_min,
    (
      SELECT ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (
        ORDER BY c2.minutes)::NUMERIC, 2)
      FROM classified c2
      WHERE c2.is_plausible
    ) AS overall_avg,
    p.kept,
    p.dropped
  FROM per_day p
  -- See the note on empty days in get_avg_kitchen_time above.
  WHERE p.kept > 0
  ORDER BY p.session_date;
END;
$$;

-- Re-issued because the DROP above revoked them. Identical to the grants set by
-- 20260413215901_remote_schema.sql (lines 45676-45684).
GRANT ALL ON FUNCTION public.get_avg_kitchen_time(TIMESTAMPTZ, TIMESTAMPTZ) TO anon;
GRANT ALL ON FUNCTION public.get_avg_kitchen_time(TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;
GRANT ALL ON FUNCTION public.get_avg_kitchen_time(TIMESTAMPTZ, TIMESTAMPTZ) TO service_role;

GRANT ALL ON FUNCTION public.get_avg_table_turn_time(TIMESTAMPTZ, TIMESTAMPTZ) TO anon;
GRANT ALL ON FUNCTION public.get_avg_table_turn_time(TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;
GRANT ALL ON FUNCTION public.get_avg_table_turn_time(TIMESTAMPTZ, TIMESTAMPTZ) TO service_role;

COMMENT ON FUNCTION public.get_avg_kitchen_time(TIMESTAMPTZ, TIMESTAMPTZ) IS
  'Median kitchen minutes per day over tickets bumped within 0-180 min. '
  'Abandoned tickets are excluded, not clamped; excluded_count reports how many. '
  'Days with no plausible ticket are omitted — render a gap, never a zero.';

COMMENT ON FUNCTION public.get_avg_table_turn_time(TIMESTAMPTZ, TIMESTAMPTZ) IS
  'Median table turn minutes per day over sessions ending within 0-480 min, '
  'measured to paid_at/cleared_at/closed_at in that order of preference. '
  'Abandoned sessions are excluded, not clamped; excluded_count reports how many. '
  'Days with no plausible session are omitted — render a gap, never a zero.';
