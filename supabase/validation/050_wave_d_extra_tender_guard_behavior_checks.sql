-- ============================================================================
-- Wave D — extra-tender guard: behavior + regression checks
-- ============================================================================
-- Run after applying 20260729122000_wave_d_process_payment_v17_extra_tender_guard.sql
-- (read-only; safe to run against staging or prod).
--
-- Locks in the answer to "does the guard regress paying custom $0.01 items?":
--   NO. The guard fires ONLY when payment_status='paid' AND amount_due <= 0,
--   so an UNPAID $0.01 checkout is never blocked, and the threshold was
--   deliberately left at <= 0 (not widened). This is the SQL analogue of the
--   client-side paymentPennyGuard.test.ts that keeps the penny-payment path
--   from silently regressing (as it did once via commit 90f0ed1e).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Part 1 — guard PREDICATE truth table (pure; no fixtures, always runnable).
-- The predicate mirrors the deployed guard exactly:
--     (payment_status = 'paid' AND COALESCE(amount_due, 0) <= 0)
-- Part 2 asserts the deployed function still uses this exact predicate, so this
-- table is testing the real thing, not a drifted copy.
-- ----------------------------------------------------------------------------
WITH cases(label, payment_status, amount_due, expected_blocked) AS (
  VALUES
    -- The scenario in question: a real $0.01 item being checked out & paid.
    ('unpaid $0.01 item (checkout + pay)',        'unpaid',  0.01::numeric, false),
    ('pending $0.01 item',                        'pending', 0.01,          false),
    -- In-progress split remainder is still 'partial' — must remain payable.
    ('partial split remainder',                   'partial', 0.02,          false),
    -- Already fully settled — the only case the guard SHOULD refuse.
    ('fully paid, $0.00 owed (duplicate tender)', 'paid',    0.00,          true),
    -- Deliberate: a 1c dust residual on a PAID order is NOT blocked because the
    -- threshold stays <= 0. (Widening to <= 0.01 would flip this to true — the
    -- regression this file guards against.)
    ('paid + 1c dust residual (threshold <= 0)',  'paid',    0.01,          false)
)
SELECT
  label,
  payment_status,
  amount_due,
  expected_blocked,
  (payment_status = 'paid' AND COALESCE(amount_due, 0) <= 0) AS actual_blocked,
  CASE
    WHEN (payment_status = 'paid' AND COALESCE(amount_due, 0) <= 0) = expected_blocked
      THEN 'PASS' ELSE 'FAIL'
  END AS result
FROM cases
ORDER BY label;

-- Aggregate assertion — expect 'ALL PASS'.
WITH cases(label, payment_status, amount_due, expected_blocked) AS (
  VALUES
    ('unpaid $0.01 item (checkout + pay)',        'unpaid',  0.01::numeric, false),
    ('pending $0.01 item',                        'pending', 0.01,          false),
    ('partial split remainder',                   'partial', 0.02,          false),
    ('fully paid, $0.00 owed (duplicate tender)', 'paid',    0.00,          true),
    ('paid + 1c dust residual (threshold <= 0)',  'paid',    0.01,          false)
)
SELECT
  CASE WHEN count(*) FILTER (
         WHERE (payment_status = 'paid' AND COALESCE(amount_due, 0) <= 0) <> expected_blocked
       ) = 0
    THEN 'ALL PASS — guard blocks only already-settled orders; $0.01 items payable'
    ELSE 'FAIL — ' || count(*) FILTER (
           WHERE (payment_status = 'paid' AND COALESCE(amount_due, 0) <= 0) <> expected_blocked
         )::text || ' predicate case(s) mismatched'
  END AS predicate_truth_table
FROM cases;

-- ----------------------------------------------------------------------------
-- Part 2 — deployed-definition regression guards. Assert the live v17 kept the
-- <= 0 threshold (did not widen to a penny/dust tolerance) and that the refusal
-- now carries the captured card last-4s in its DETAIL.
-- ----------------------------------------------------------------------------
SELECT
  CASE
    WHEN pg_get_functiondef(p.oid)
         LIKE '%payment_status = ''paid'' AND COALESCE(v_order.amount_due, 0) <= 0 THEN%'
      THEN 'PASS — guard threshold is <= 0 (unpaid $0.01 items unaffected)'
    ELSE 'FAIL — guard threshold changed; penny/$0.01 payment regression risk'
  END AS threshold_regression_check
FROM pg_proc p
WHERE p.proname = 'process_payment_v17'
  AND p.pronamespace = 'public'::regnamespace;

SELECT
  CASE
    WHEN pg_get_functiondef(p.oid) LIKE '%Already captured on%'
     AND pg_get_functiondef(p.oid) LIKE '%card_last_four%'
      THEN 'PASS — already-paid refusal names the captured last-4s in DETAIL'
    ELSE 'FAIL — last-4s DETAIL enhancement missing from the guard'
  END AS last4_detail_check
FROM pg_proc p
WHERE p.proname = 'process_payment_v17'
  AND p.pronamespace = 'public'::regnamespace;
