-- Rollback for 20260923120000_analytics_duration_plausibility.sql
--
-- Restores the unbounded-AVG definitions of `get_avg_kitchen_time` and
-- `get_avg_table_turn_time`, including dropping the two added columns
-- (`sample_count`, `excluded_count`) from their return types.
--
-- PROVENANCE — READ BEFORE RUNNING. Unlike most rollbacks in this directory,
-- this is a RECONSTRUCTION from the migration history
-- (20260413215901_remote_schema.sql, lines 10255+ for turn time and 45676+ for
-- the grants), NOT a pg_get_functiondef capture from the live database. No
-- SQL-exec RPC is exposed on staging, so the running definitions could not be
-- read back from here. They are believed to match the file, but if anything has
-- been hot-patched directly against the database since April, this will restore
-- the April text and silently discard that patch. CAPTURE THE LIVE DEFINITIONS
-- FIRST if you have psql access:
--
--     SELECT pg_get_functiondef(p.oid)
--     FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--     WHERE n.nspname = 'public'
--       AND p.proname IN ('get_avg_kitchen_time','get_avg_table_turn_time');
--
-- WHAT ROLLING BACK COSTS. The restored functions report a ~34 h mean kitchen
-- time and a ~40 h mean table turn against real staging data, because they
-- average abandoned tickets and sessions into a measure of service. That is the
-- defect the forward migration exists to remove. Roll back only to unblock a
-- caller that breaks on the widened return type — not because the new numbers
-- look unfamiliar. A median turn of ~13 min is the correct figure; the old
-- 40-hour one never described anything real.
--
-- DROP is required because CREATE OR REPLACE cannot narrow a function's
-- RETURNS TABLE signature. Dropping revokes the grants with it, so they are
-- re-issued at the bottom exactly as 20260413215901_remote_schema.sql set them.

DROP FUNCTION IF EXISTS public.get_avg_kitchen_time(TIMESTAMPTZ, TIMESTAMPTZ);
DROP FUNCTION IF EXISTS public.get_avg_table_turn_time(TIMESTAMPTZ, TIMESTAMPTZ);

CREATE OR REPLACE FUNCTION public.get_avg_kitchen_time(
  p_from TIMESTAMPTZ,
  p_to   TIMESTAMPTZ
)
RETURNS TABLE(
  date DATE,
  avg_minutes NUMERIC,
  overall_avg NUMERIC
)
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  RETURN QUERY
  WITH daily_avg AS (
    SELECT
      DATE(kis.created_at) AS kitchen_date,
      AVG(EXTRACT(EPOCH FROM (kis.bumped_at - kis.created_at)) / 60)::NUMERIC(10,2) AS avg_min
    FROM kds_item_status kis
    WHERE kis.created_at >= p_from
      AND kis.created_at < p_to
      AND kis.bumped_at IS NOT NULL
    GROUP BY DATE(kis.created_at)
  )
  SELECT
    d.kitchen_date AS date,
    d.avg_min AS avg_minutes,
    (
      SELECT AVG(EXTRACT(EPOCH FROM (kis.bumped_at - kis.created_at)) / 60)::NUMERIC(10,2)
      FROM kds_item_status kis
      WHERE kis.created_at >= p_from
        AND kis.created_at < p_to
        AND kis.bumped_at IS NOT NULL
    ) AS overall_avg
  FROM daily_avg d
  ORDER BY d.kitchen_date;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_avg_table_turn_time(
  p_from TIMESTAMPTZ,
  p_to   TIMESTAMPTZ
)
RETURNS TABLE(
  date DATE,
  avg_minutes NUMERIC,
  overall_avg NUMERIC
)
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  RETURN QUERY
  WITH daily_avg AS (
    SELECT
      DATE(ts.seated_at) AS session_date,
      ROUND(
        AVG(
          COALESCE(
            ts.actual_duration,
            EXTRACT(EPOCH FROM (ts.closed_at - ts.seated_at)) / 60
          )
        ),
        2
      ) AS avg_min
    FROM table_sessions ts
    WHERE ts.seated_at >= p_from
      AND ts.seated_at < p_to
      AND ts.closed_at IS NOT NULL
    GROUP BY DATE(ts.seated_at)
  )
  SELECT
    d.session_date,
    d.avg_min,
    (
      SELECT ROUND(
        AVG(
          COALESCE(
            ts.actual_duration,
            EXTRACT(EPOCH FROM (ts.closed_at - ts.seated_at)) / 60
          )
        ),
        2
      )
      FROM table_sessions ts
      WHERE ts.seated_at >= p_from
        AND ts.seated_at < p_to
        AND ts.closed_at IS NOT NULL
    ) AS overall_avg
  FROM daily_avg d
  ORDER BY d.session_date;
END;
$$;

GRANT ALL ON FUNCTION public.get_avg_kitchen_time(TIMESTAMPTZ, TIMESTAMPTZ) TO anon;
GRANT ALL ON FUNCTION public.get_avg_kitchen_time(TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;
GRANT ALL ON FUNCTION public.get_avg_kitchen_time(TIMESTAMPTZ, TIMESTAMPTZ) TO service_role;

GRANT ALL ON FUNCTION public.get_avg_table_turn_time(TIMESTAMPTZ, TIMESTAMPTZ) TO anon;
GRANT ALL ON FUNCTION public.get_avg_table_turn_time(TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;
GRANT ALL ON FUNCTION public.get_avg_table_turn_time(TIMESTAMPTZ, TIMESTAMPTZ) TO service_role;
