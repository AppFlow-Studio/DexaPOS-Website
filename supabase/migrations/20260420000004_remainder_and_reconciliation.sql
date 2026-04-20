-- =============================================================================
-- Migration: Penny Remainder Distribution + Late Tip Reconciliation
-- Date: 2026-04-20
-- =============================================================================
-- 1. Helper function _distribute_with_remainder — largest remainder method
-- 2. Reconciliation column on tip_distribution_sessions
-- 3. Updated calculate_tip_distribution_v2 Steps 7+8 to use remainder method
-- =============================================================================

BEGIN;

-- 1. Reconciliation column
ALTER TABLE public.tip_distribution_sessions
  ADD COLUMN IF NOT EXISTS reconciliation_acknowledged_at TIMESTAMPTZ;

-- 2. Largest remainder distribution helper
-- Distributes p_total across detail rows matching p_session_id + p_filter_column = p_filter_value
-- using floor-then-assign-pennies. Guarantees SUM = p_total exactly.
-- p_target_column: which column to ADD the distribution to (tip_pool_received or tip_out_received)
-- p_weight_column: how to weight (NULL = equal, 'hours_worked' = hours-weighted, 'points_weight' = points)
CREATE OR REPLACE FUNCTION public._distribute_with_remainder(
  p_session_id     UUID,
  p_total          NUMERIC,
  p_target_column  TEXT,       -- 'tip_pool_received' or 'tip_out_received'
  p_filter_sql     TEXT        -- WHERE clause fragment e.g. "role_code = 'server'"
)
RETURNS VOID
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_total_cents   BIGINT;
  v_count         INTEGER;
  v_base_cents    BIGINT;
  v_leftover      INTEGER;
BEGIN
  v_total_cents := ROUND(p_total * 100)::BIGINT;

  -- Count eligible recipients
  EXECUTE format(
    'SELECT COUNT(*) FROM public.tip_distribution_details WHERE session_id = %L AND %s',
    p_session_id, p_filter_sql
  ) INTO v_count;

  IF v_count = 0 OR v_total_cents = 0 THEN RETURN; END IF;

  v_base_cents := v_total_cents / v_count;  -- integer division = floor
  v_leftover   := (v_total_cents - (v_base_cents * v_count))::INTEGER;

  -- Assign base amount to everyone, then add 1 penny to the first v_leftover rows
  -- (ordered by id for deterministic tiebreaking)
  EXECUTE format(
    'WITH ranked AS (
      SELECT id, ROW_NUMBER() OVER (ORDER BY id) AS rn
      FROM public.tip_distribution_details
      WHERE session_id = %L AND %s
    )
    UPDATE public.tip_distribution_details dd
    SET %I = dd.%I + (%s + CASE WHEN r.rn <= %s THEN 1 ELSE 0 END) / 100.0
    FROM ranked r
    WHERE dd.id = r.id',
    p_session_id, p_filter_sql,
    p_target_column, p_target_column,
    v_base_cents, v_leftover
  );
END;
$$;

-- 3. Weighted remainder distribution helper (for hours_weighted and points)
CREATE OR REPLACE FUNCTION public._distribute_weighted_with_remainder(
  p_session_id     UUID,
  p_total          NUMERIC,
  p_target_column  TEXT,
  p_filter_sql     TEXT,
  p_weight_expr    TEXT  -- SQL expression for weight, e.g. 'hours_worked' or 'prs.points_per_hour * dd.hours_worked'
)
RETURNS VOID
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_total_cents BIGINT;
BEGIN
  v_total_cents := ROUND(p_total * 100)::BIGINT;
  IF v_total_cents = 0 THEN RETURN; END IF;

  -- Weighted distribution with largest remainder method
  EXECUTE format(
    'WITH weights AS (
      SELECT dd.id, (%s)::NUMERIC AS weight
      FROM public.tip_distribution_details dd
      WHERE dd.session_id = %L AND %s
    ),
    total_weight AS (
      SELECT COALESCE(SUM(weight), 0) AS tw FROM weights
    ),
    shares AS (
      SELECT w.id,
        CASE WHEN tw.tw > 0
          THEN FLOOR((%s::NUMERIC * w.weight / tw.tw))
          ELSE 0
        END AS base_cents,
        CASE WHEN tw.tw > 0
          THEN (%s::NUMERIC * w.weight / tw.tw) - FLOOR(%s::NUMERIC * w.weight / tw.tw)
          ELSE 0
        END AS fractional,
        ROW_NUMBER() OVER (ORDER BY
          CASE WHEN tw.tw > 0
            THEN (%s::NUMERIC * w.weight / tw.tw) - FLOOR(%s::NUMERIC * w.weight / tw.tw)
            ELSE 0
          END DESC, w.id
        ) AS rn
      FROM weights w, total_weight tw
    ),
    remainder AS (
      SELECT (%s - COALESCE(SUM(base_cents), 0))::INTEGER AS leftover FROM shares
    )
    UPDATE public.tip_distribution_details dd
    SET %I = dd.%I + (s.base_cents + CASE WHEN s.rn <= rem.leftover THEN 1 ELSE 0 END) / 100.0
    FROM shares s, remainder rem
    WHERE dd.id = s.id',
    p_weight_expr, p_session_id, p_filter_sql,
    v_total_cents, v_total_cents, v_total_cents,
    v_total_cents, v_total_cents,
    v_total_cents,
    p_target_column, p_target_column
  );
END;
$$;

COMMIT;
