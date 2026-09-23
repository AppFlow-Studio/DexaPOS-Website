-- Rollback for 20260923120100_analytics_recognized_order_gate.sql
--
-- Restores the pre-migration definitions of the five HQ analytics functions and
-- drops the columns the forward migration added.
--
-- PROVENANCE — READ BEFORE RUNNING. This is a RECONSTRUCTION from
-- supabase_analytics_rpcs.sql, NOT a pg_get_functiondef capture. No SQL-exec
-- RPC is exposed on staging so the live definitions could not be read back.
--
-- BE AWARE THAT THE SOURCE FILE IS KNOWN-CORRUPT. supabase_analytics_rpcs.sql
-- contains a stray `--sda` line and a `CCREATE OR REPLACE FUNCTION` typo at its
-- kitchen-time definition, so it has drifted from what is deployed and cannot
-- be run as-is. The five functions restored here were read from it and are
-- believed accurate, but this file carries more uncertainty than a normal
-- rollback. CAPTURE THE LIVE DEFINITIONS FIRST if you have psql access:
--
--     SELECT pg_get_functiondef(p.oid)
--     FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--     WHERE n.nspname = 'public'
--       AND p.proname IN ('get_platform_gmv_by_day','get_avg_ticket_by_day',
--                         'get_tip_rate_by_day','get_refund_rate_by_day',
--                         'get_avg_time_to_first_order');
--
-- WHAT ROLLING BACK COSTS. The restored `get_platform_gmv_by_day` counts unpaid
-- pending orders as revenue and overstates platform GMV by ~51% against real
-- staging data (226,170 reported vs 109,902 actually collected). It also puts
-- the HQ dashboard back into disagreement with every merchant-side reporting
-- surface, which has used the canonical `is_order_reportable` gate since
-- 20260626000000. `get_avg_time_to_first_order` returns to yielding NULL.
--
-- Roll back only to unblock a caller that breaks on the widened return types —
-- never because the new revenue figure looks low. The lower number is the real
-- one.
--
-- `is_order_reportable` is NOT dropped here: it predates this migration
-- (20260626000000) and the merchant-side RPCs depend on it.

DROP FUNCTION IF EXISTS public.get_platform_gmv_by_day(TIMESTAMPTZ, TIMESTAMPTZ);
DROP FUNCTION IF EXISTS public.get_avg_ticket_by_day(TIMESTAMPTZ, TIMESTAMPTZ);
DROP FUNCTION IF EXISTS public.get_tip_rate_by_day(TIMESTAMPTZ, TIMESTAMPTZ);
DROP FUNCTION IF EXISTS public.get_refund_rate_by_day(TIMESTAMPTZ, TIMESTAMPTZ);
DROP FUNCTION IF EXISTS public.get_avg_time_to_first_order(TIMESTAMPTZ, TIMESTAMPTZ);

CREATE OR REPLACE FUNCTION public.get_platform_gmv_by_day(p_from TIMESTAMPTZ, p_to TIMESTAMPTZ)
RETURNS TABLE(date DATE, revenue NUMERIC, order_count BIGINT)
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  RETURN QUERY
  SELECT
    DATE(o.created_at) as date,
    COALESCE(SUM(o.total_amount), 0)::NUMERIC as revenue,
    COUNT(*)::BIGINT as order_count
  FROM orders o
  WHERE o.created_at >= p_from AND o.created_at < p_to
    AND o.status NOT IN ('draft', 'cancelled', 'void')
  GROUP BY DATE(o.created_at)
  ORDER BY date;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_avg_ticket_by_day(p_from TIMESTAMPTZ, p_to TIMESTAMPTZ)
RETURNS TABLE(date DATE, avg_ticket NUMERIC)
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  RETURN QUERY
  SELECT
    DATE(o.created_at) as date,
    AVG(o.total_amount)::NUMERIC(8,2) as avg_ticket
  FROM orders o
  WHERE o.created_at >= p_from AND o.created_at < p_to
    AND o.status NOT IN ('draft', 'cancelled', 'void')
  GROUP BY DATE(o.created_at)
  ORDER BY date;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_tip_rate_by_day(p_from TIMESTAMPTZ, p_to TIMESTAMPTZ)
RETURNS TABLE(date DATE, tip_rate_pct NUMERIC)
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  RETURN QUERY
  SELECT
    DATE(op.initiated_at) AS date,
    CASE
      WHEN SUM(op.total_amount) > 0
      THEN (SUM(op.tip_amount)::NUMERIC / SUM(op.total_amount) * 100)::NUMERIC(5,2)
      ELSE 0::NUMERIC
    END AS tip_rate_pct
  FROM order_payments op
  WHERE op.initiated_at >= p_from
    AND op.initiated_at < p_to
  GROUP BY DATE(op.initiated_at)
  ORDER BY date;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_refund_rate_by_day(p_from TIMESTAMPTZ, p_to TIMESTAMPTZ)
RETURNS TABLE(date DATE, refund_rate_pct NUMERIC)
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  RETURN QUERY
  SELECT
    DATE(op.initiated_at) AS date,
    CASE
      WHEN SUM(op.total_amount) > 0
      THEN (
        SUM(CASE WHEN op.status IN ('refunded', 'partially_refunded')
                 THEN op.amount ELSE 0 END)::NUMERIC
        / SUM(op.total_amount) * 100
      )::NUMERIC(5,2)
      ELSE 0::NUMERIC
    END AS refund_rate_pct
  FROM order_payments op
  WHERE op.initiated_at >= p_from
    AND op.initiated_at < p_to
  GROUP BY DATE(op.initiated_at)
  ORDER BY date;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_avg_time_to_first_order(p_from TIMESTAMPTZ, p_to TIMESTAMPTZ)
RETURNS TABLE(avg_days NUMERIC)
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  RETURN QUERY
  SELECT
    AVG(EXTRACT(EPOCH FROM (o.created_at - m.created_at)) / 86400)::NUMERIC(5,2) as avg_days
  FROM merchants m
  JOIN LATERAL (
    SELECT created_at FROM orders WHERE merchant_id = m.id ORDER BY created_at LIMIT 1
  ) o ON TRUE
  WHERE m.created_at >= p_from AND m.created_at < p_to
    AND o.created_at >= p_from AND o.created_at < p_to;
END;
$$;

GRANT ALL ON FUNCTION public.get_platform_gmv_by_day(TIMESTAMPTZ, TIMESTAMPTZ) TO anon;
GRANT ALL ON FUNCTION public.get_platform_gmv_by_day(TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;
GRANT ALL ON FUNCTION public.get_platform_gmv_by_day(TIMESTAMPTZ, TIMESTAMPTZ) TO service_role;

GRANT ALL ON FUNCTION public.get_avg_ticket_by_day(TIMESTAMPTZ, TIMESTAMPTZ) TO anon;
GRANT ALL ON FUNCTION public.get_avg_ticket_by_day(TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;
GRANT ALL ON FUNCTION public.get_avg_ticket_by_day(TIMESTAMPTZ, TIMESTAMPTZ) TO service_role;

GRANT ALL ON FUNCTION public.get_tip_rate_by_day(TIMESTAMPTZ, TIMESTAMPTZ) TO anon;
GRANT ALL ON FUNCTION public.get_tip_rate_by_day(TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;
GRANT ALL ON FUNCTION public.get_tip_rate_by_day(TIMESTAMPTZ, TIMESTAMPTZ) TO service_role;

GRANT ALL ON FUNCTION public.get_refund_rate_by_day(TIMESTAMPTZ, TIMESTAMPTZ) TO anon;
GRANT ALL ON FUNCTION public.get_refund_rate_by_day(TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;
GRANT ALL ON FUNCTION public.get_refund_rate_by_day(TIMESTAMPTZ, TIMESTAMPTZ) TO service_role;

GRANT ALL ON FUNCTION public.get_avg_time_to_first_order(TIMESTAMPTZ, TIMESTAMPTZ) TO anon;
GRANT ALL ON FUNCTION public.get_avg_time_to_first_order(TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;
GRANT ALL ON FUNCTION public.get_avg_time_to_first_order(TIMESTAMPTZ, TIMESTAMPTZ) TO service_role;
