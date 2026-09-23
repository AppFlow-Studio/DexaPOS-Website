-- ============================================================================
-- HQ analytics — count revenue only once someone has paid for it
-- ============================================================================
--
-- `get_platform_gmv_by_day` and `get_avg_ticket_by_day` both gate on
--
--     o.status NOT IN ('draft','cancelled','void')
--
-- with no payment gate at all. Measured against staging on 2026-09-23 over a
-- 90-day window, 1,000 orders sampled:
--
--     old gate    711 orders    GMV 226,170.52
--     paid only   285 orders    GMV 109,901.67
--     ---------------------------------------------
--     overstatement            116,268.85  (51.4%)
--
-- The HQ dashboard has been reporting roughly DOUBLE the platform's real GMV.
-- The rows making up the difference are 397 orders sitting at
-- payment_status='pending' plus 21 at 'partial' — tickets someone rang up and
-- nobody ever paid. An unpaid order is not revenue, and a number that says
-- otherwise on the platform's top-line revenue chart is the most expensive
-- kind of wrong: it is confident, it is specific, and it is off by 2x.
--
-- THIS IS NOT A NEW RULE. `public.is_order_reportable(status, payment_status)`
-- already exists as the canonical recognized-order predicate, added in
-- 20260626000000_recognized_order_predicate.sql:
--
--     payment_status IN ('paid','captured')
--     AND status NOT IN ('draft','cancelled','void','refunded')
--
-- That migration converted the MERCHANT-side reporting RPCs (get_financial_kpis
-- and friends) to use it. The HQ platform analytics RPCs in this file were
-- simply never migrated — they are the last holdouts still using the weaker
-- status-only filter. So merchant dashboards and the HQ dashboard have been
-- disagreeing about the same orders for three months, and the HQ number was the
-- wrong one. This migration finishes that job rather than inventing a policy.
--
-- WHY 'refunded' NOW DISAPPEARS FROM GMV. The old gate let refunded orders
-- through. The canonical predicate excludes them, because refunds are netted
-- separately via order_payments (see get_refund_rate_by_day below) — counting
-- them in GMV as well would double-count the reversal. This matches what the
-- merchant-side surfaces already do.
--
-- ============================================================================
-- AVG TICKET also drops zero-amount orders
-- ============================================================================
--
-- 206 of the 1,000 sampled orders have total_amount = 0. On staging today ALL
-- of them are also unpaid, so the payment gate above already removes every one
-- and the `total_amount > 0` filter drops nothing — it is a belt-and-braces
-- guard, not the source of the improvement. It is kept because the two
-- conditions are independent: a comped or fully-discounted order CAN settle as
-- paid at 0.00, and when that happens it is not a "ticket" and would drag the
-- mean toward zero. Verified against staging 2026-09-23: 285 recognized orders,
-- 285 surviving the amount filter.
--
-- The real change here is the payment gate plus the median. The recognized
-- ticket distribution on paid orders is p50 28.58 / p99 2,176.41 with a single
-- 42,906.61 outlier, and the daily mean exceeds the daily median on 33 of 56
-- days — the series is reliably right-skewed, so the mean alone overstates a
-- typical ticket.
--
-- Avg ticket therefore reports BOTH: `avg_ticket` (the mean, kept under its
-- original column name so existing callers keep working) and `median_ticket`.
-- The median is the honest headline for a skewed series; the mean is retained
-- because it is the figure that reconciles against GMV / order_count.
--
-- ============================================================================
-- TIP AND REFUND RATES — fix the denominator
-- ============================================================================
--
-- Both divide by SUM(op.total_amount) over EVERY payment row in range,
-- including ones that never succeeded. The staging breakdown:
--
--     captured 383 | paid 34 | refunded 7 | partially_refunded 4
--     void 18 | pending 11
--
-- The 29 void/pending rows contribute to the denominator while never being able
-- to carry a tip, so both rates are diluted by money that was never collected.
-- The effect is small today (tip rate 1.74% -> 1.79%) precisely because staging
-- has few failures; on a merchant having a bad terminal day it would understate
-- their real tip rate exactly when someone is looking to find out why.
--
-- Both now restrict the denominator to payments that actually settled. The
-- refund NUMERATOR keeps its own status filter, since a refunded payment is by
-- definition one that settled first.
--
-- `op.amount` vs `op.total_amount` in the refund numerator: 75 of 457 rows have
-- these differing, so the choice is not cosmetic. It is deliberately left as
-- `op.amount` — the refunded principal, excluding tip — because a refund of the
-- sale should not be inflated by a tip that may have been kept. Called out here
-- because it looks like an inconsistency next to the total_amount denominator
-- and is not one.
--
-- ============================================================================
-- TIME TO FIRST ORDER — stop requiring the order to land in the same window
-- ============================================================================
--
-- The function returns NULL on staging today. Its WHERE clause requires BOTH
-- the merchant's signup AND their first order to fall inside [p_from, p_to):
--
--     WHERE m.created_at >= p_from AND m.created_at < p_to
--       AND o.created_at >= p_from AND o.created_at < p_to
--
-- A merchant who signs up on the last day of the window and orders the next day
-- is silently dropped — and so is every merchant in a window shorter than their
-- onboarding lag. That biases the metric toward fast onboarders by construction:
-- the slower a merchant is, the more likely they are excluded from the average
-- that is supposed to be measuring exactly that slowness.
--
-- The cohort is now defined by SIGNUP DATE ALONE, which is what "time to first
-- order for merchants who joined in this period" means. Merchants who have not
-- ordered yet are still excluded (JOIN LATERAL), but they are now reported via
-- `pending_count` so a reader can see how much of the cohort is unresolved
-- rather than being shown a mean over the fast half only.
--
-- NUMERIC(5,2) is widened to NUMERIC(10,2). The old type caps at 999.99; no
-- sampled merchant exceeds it today, but a single merchant who signed up and
-- ordered three years later would raise a numeric overflow and take the whole
-- dashboard panel down rather than reporting a large number.
--
-- EXPECT THIS TO STILL LOOK EMPTY ON STAGING, AND THAT IS NOT A BUG. Of 20
-- merchants in the whole database, only 2 have ever placed a recognized order —
-- at 187.6 and 57.3 days after signup. Those two lags are themselves the proof
-- that the old double-bounded window was broken: any window shorter than ~57
-- days excluded BOTH merchants and so returned NULL, which is exactly what the
-- function does today. A 90-day dashboard window contains neither signup, so
-- the panel will show merchant_count with pending_count equal to it until
-- staging grows more trading merchants. On production, where merchants do
-- order, this is the difference between a biased-fast average and a real one.
--
-- ============================================================================
-- SIGNATURES AND GRANTS
-- ============================================================================
--
-- Argument lists are unchanged, and every pre-existing return column keeps its
-- name, type and position, so current callers keep working. Added columns:
-- median_ticket / order_count (avg ticket), sample_count (tip, refund),
-- merchant_count / pending_count (time to first order). Recharts ignores extra
-- keys. Postgres will not widen a RETURNS TABLE via CREATE OR REPLACE, so each
-- is dropped first and its grants re-issued at the bottom, matching
-- 20260413215901_remote_schema.sql. All five are read-only analytics functions.
-- ============================================================================

DROP FUNCTION IF EXISTS public.get_platform_gmv_by_day(TIMESTAMPTZ, TIMESTAMPTZ);
DROP FUNCTION IF EXISTS public.get_avg_ticket_by_day(TIMESTAMPTZ, TIMESTAMPTZ);
DROP FUNCTION IF EXISTS public.get_tip_rate_by_day(TIMESTAMPTZ, TIMESTAMPTZ);
DROP FUNCTION IF EXISTS public.get_refund_rate_by_day(TIMESTAMPTZ, TIMESTAMPTZ);
DROP FUNCTION IF EXISTS public.get_avg_time_to_first_order(TIMESTAMPTZ, TIMESTAMPTZ);

-- ----------------------------------------------------------------------------
-- get_platform_gmv_by_day
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_platform_gmv_by_day(
  p_from TIMESTAMPTZ,
  p_to   TIMESTAMPTZ
)
RETURNS TABLE(
  date        DATE,
  revenue     NUMERIC,
  order_count BIGINT
)
LANGUAGE plpgsql
STABLE
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  RETURN QUERY
  SELECT
    DATE(o.created_at)                    AS date,
    COALESCE(SUM(o.total_amount), 0)::NUMERIC AS revenue,
    COUNT(*)::BIGINT                      AS order_count
  FROM orders o
  WHERE o.created_at >= p_from
    AND o.created_at <  p_to
    -- Canonical recognized-order gate. Replaces a status-only filter that
    -- counted unpaid pending orders as revenue (51.4% overstatement).
    AND public.is_order_reportable(o.status, o.payment_status)
  GROUP BY DATE(o.created_at)
  ORDER BY date;
END;
$$;

-- ----------------------------------------------------------------------------
-- get_avg_ticket_by_day
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_avg_ticket_by_day(
  p_from TIMESTAMPTZ,
  p_to   TIMESTAMPTZ
)
RETURNS TABLE(
  date          DATE,
  avg_ticket    NUMERIC,
  median_ticket NUMERIC,
  order_count   BIGINT
)
LANGUAGE plpgsql
STABLE
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  RETURN QUERY
  SELECT
    DATE(o.created_at)                          AS date,
    ROUND(AVG(o.total_amount)::NUMERIC, 2)      AS avg_ticket,
    ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (
      ORDER BY o.total_amount)::NUMERIC, 2)     AS median_ticket,
    COUNT(*)::BIGINT                            AS order_count
  FROM orders o
  WHERE o.created_at >= p_from
    AND o.created_at <  p_to
    AND public.is_order_reportable(o.status, o.payment_status)
    -- A comped or fully-discounted 0.00 order is not a ticket. 206 of 1,000
    -- sampled orders are zero-amount and would drag the mean toward zero.
    AND o.total_amount > 0
  GROUP BY DATE(o.created_at)
  ORDER BY date;
END;
$$;

-- ----------------------------------------------------------------------------
-- get_tip_rate_by_day
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_tip_rate_by_day(
  p_from TIMESTAMPTZ,
  p_to   TIMESTAMPTZ
)
RETURNS TABLE(
  date         DATE,
  tip_rate_pct NUMERIC,
  sample_count BIGINT
)
LANGUAGE plpgsql
STABLE
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  RETURN QUERY
  WITH settled AS (
    -- Only payments that actually collected money can carry a tip. Including
    -- void/pending rows dilutes the denominator with money never taken.
    SELECT op.initiated_at, op.total_amount, op.tip_amount
    FROM order_payments op
    WHERE op.initiated_at >= p_from
      AND op.initiated_at <  p_to
      AND op.status IN ('captured','paid','refunded','partially_refunded')
  )
  SELECT
    DATE(s.initiated_at) AS date,
    CASE
      WHEN SUM(s.total_amount) > 0
        THEN ROUND((SUM(s.tip_amount)::NUMERIC / SUM(s.total_amount) * 100), 2)
      ELSE 0::NUMERIC
    END              AS tip_rate_pct,
    COUNT(*)::BIGINT AS sample_count
  FROM settled s
  GROUP BY DATE(s.initiated_at)
  ORDER BY date;
END;
$$;

-- ----------------------------------------------------------------------------
-- get_refund_rate_by_day
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_refund_rate_by_day(
  p_from TIMESTAMPTZ,
  p_to   TIMESTAMPTZ
)
RETURNS TABLE(
  date            DATE,
  refund_rate_pct NUMERIC,
  sample_count    BIGINT
)
LANGUAGE plpgsql
STABLE
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  RETURN QUERY
  WITH settled AS (
    SELECT op.initiated_at, op.total_amount, op.amount, op.status
    FROM order_payments op
    WHERE op.initiated_at >= p_from
      AND op.initiated_at <  p_to
      AND op.status IN ('captured','paid','refunded','partially_refunded')
  )
  SELECT
    DATE(s.initiated_at) AS date,
    CASE
      WHEN SUM(s.total_amount) > 0
        THEN ROUND((
          -- op.amount, not total_amount: the refunded principal excluding tip.
          -- See the header note — this asymmetry with the denominator is
          -- deliberate, not an oversight.
          SUM(CASE WHEN s.status IN ('refunded','partially_refunded')
                   THEN s.amount ELSE 0 END)::NUMERIC
          / SUM(s.total_amount) * 100
        ), 2)
      ELSE 0::NUMERIC
    END              AS refund_rate_pct,
    COUNT(*)::BIGINT AS sample_count
  FROM settled s
  GROUP BY DATE(s.initiated_at)
  ORDER BY date;
END;
$$;

-- ----------------------------------------------------------------------------
-- get_avg_time_to_first_order
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_avg_time_to_first_order(
  p_from TIMESTAMPTZ,
  p_to   TIMESTAMPTZ
)
RETURNS TABLE(
  avg_days       NUMERIC,
  median_days    NUMERIC,
  merchant_count BIGINT,
  pending_count  BIGINT
)
LANGUAGE plpgsql
STABLE
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  RETURN QUERY
  WITH cohort AS (
    -- Cohort is defined by SIGNUP date only. The first order may land outside
    -- the window — requiring it inside biased the metric toward merchants who
    -- onboarded fastest.
    SELECT
      m.id,
      m.created_at AS signed_up_at,
      (
        SELECT MIN(o.created_at)
        FROM orders o
        WHERE o.merchant_id = m.id
          AND public.is_order_reportable(o.status, o.payment_status)
      ) AS first_order_at
    FROM merchants m
    WHERE m.created_at >= p_from
      AND m.created_at <  p_to
  ),
  measured AS (
    SELECT EXTRACT(EPOCH FROM (c.first_order_at - c.signed_up_at)) / 86400 AS days
    FROM cohort c
    WHERE c.first_order_at IS NOT NULL
      -- Guard against an order timestamped before its own merchant row.
      AND c.first_order_at >= c.signed_up_at
  )
  SELECT
    ROUND(AVG(m.days)::NUMERIC, 2) AS avg_days,
    ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY m.days)::NUMERIC, 2) AS median_days,
    (SELECT COUNT(*)::BIGINT FROM cohort)                                  AS merchant_count,
    (SELECT COUNT(*)::BIGINT FROM cohort c WHERE c.first_order_at IS NULL) AS pending_count
  FROM measured m;
END;
$$;

-- Re-issued because the DROPs above revoked them. Matches the grants set by
-- 20260413215901_remote_schema.sql.
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

COMMENT ON FUNCTION public.get_platform_gmv_by_day(TIMESTAMPTZ, TIMESTAMPTZ) IS
  'Daily platform GMV over recognized orders only (is_order_reportable). '
  'Unpaid pending orders are excluded — they were previously counted, '
  'overstating GMV by ~51% on staging.';

COMMENT ON FUNCTION public.get_avg_ticket_by_day(TIMESTAMPTZ, TIMESTAMPTZ) IS
  'Daily mean and median ticket over recognized, non-zero orders. '
  'Prefer median_ticket for display: the series is long-tailed.';

COMMENT ON FUNCTION public.get_tip_rate_by_day(TIMESTAMPTZ, TIMESTAMPTZ) IS
  'Daily tip as a pct of settled payment volume. Void/pending payments are '
  'excluded from the denominator.';

COMMENT ON FUNCTION public.get_refund_rate_by_day(TIMESTAMPTZ, TIMESTAMPTZ) IS
  'Daily refunded principal (op.amount, excluding tip) as a pct of settled '
  'payment volume. Void/pending payments are excluded from the denominator.';

COMMENT ON FUNCTION public.get_avg_time_to_first_order(TIMESTAMPTZ, TIMESTAMPTZ) IS
  'Days from signup to first recognized order, for merchants who SIGNED UP in '
  'the window (the order may fall outside it). pending_count reports cohort '
  'members with no qualifying order yet.';
