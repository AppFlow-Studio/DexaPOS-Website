-- =============================================================================
-- 051 — Wave 1 RLS equivalence harness (SELECT-only)
-- =============================================================================
-- Gate for migration 20260815120000_wave1_order_rls_initplan.sql.
-- Run on staging BEFORE promoting. Any non-zero delta in CHECK 1/2/3 stops the wave.
--
-- Safe to run at any time: contains no DDL, DML, or mutating function calls.
--
-- What it proves
--   Wave 1 replaces the per-row predicate  is_merchant_admin(orders.merchant_id)
--   with the hoistable  merchant_id = ANY(admin_merchant_ids()).
--   is_merchant_admin(p) is  is_dexapos_admin() OR EXISTS(members/merchants ... = p).
--   The is_dexapos_admin() half is applied separately and identically in both
--   forms, so equivalence reduces to the membership half. CHECKS 1-3 evaluate
--   both membership forms for EVERY user who can authenticate and report any row
--   visible under one form but not the other.
--
-- ALREADY RUN READ-ONLY AGAINST PROD (hifouuofcaytijrkbvcy) ON 2026-08-13:
--   CHECK 1  orders       0 lost / 0 gained  (11,714 user-order pairs, both forms)
--   CHECK 2  order_items  0 lost / 0 gained  (35,941 user-item pairs, both forms)
--   CHECK 3  alignment    0 rows  (every authenticating staff profile's merchant
--                                  is among the merchants that user administers)
-- Re-run on staging before promoting; staging membership data may differ.
-- =============================================================================

\echo '=== CHECK 1: orders — per-user visibility delta (expect 0 rows) ==='

WITH principals AS (
    SELECT DISTINCT m.user_id
    FROM public.members m
    WHERE m.user_id IS NOT NULL
),
-- OLD: membership half of is_merchant_admin(o.merchant_id), evaluated per row
old_side AS (
    SELECT p.user_id, o.id AS order_id
    FROM principals p
    CROSS JOIN public.orders o
    WHERE EXISTS (
        SELECT 1
        FROM public.members m
        JOIN public.merchants mer ON mer.clerk_org_id = m.organization_id
        WHERE m.user_id = p.user_id
          AND mer.id = o.merchant_id
          AND m.role = ANY (ARRAY['merchant.owner','merchant.admin','merchant.manager'])
    )
),
-- NEW: membership half hoisted into admin_merchant_ids()
new_side AS (
    SELECT p.user_id, o.id AS order_id
    FROM principals p
    CROSS JOIN LATERAL (
        SELECT COALESCE(array_agg(DISTINCT mer.id), ARRAY[]::uuid[]) AS ids
        FROM public.members m
        JOIN public.merchants mer ON mer.clerk_org_id = m.organization_id
        WHERE m.user_id = p.user_id
          AND m.role = ANY (ARRAY['merchant.owner','merchant.admin','merchant.manager'])
    ) a
    JOIN public.orders o ON o.merchant_id = ANY (a.ids)
)
SELECT
    COALESCE(o.user_id, n.user_id)   AS user_id,
    COALESCE(o.order_id, n.order_id) AS order_id,
    CASE WHEN n.order_id IS NULL THEN 'LOST access (regression)'
         ELSE 'GAINED access (widening)' END AS delta
FROM old_side o
FULL OUTER JOIN new_side n
  ON n.user_id = o.user_id AND n.order_id = o.order_id
WHERE o.order_id IS NULL OR n.order_id IS NULL;

\echo '=== CHECK 2: order_items — per-user visibility delta (expect 0 rows) ==='

WITH principals AS (
    SELECT DISTINCT m.user_id FROM public.members m WHERE m.user_id IS NOT NULL
),
admin_ids AS (
    SELECT p.user_id,
           COALESCE(array_agg(DISTINCT mer.id), ARRAY[]::uuid[]) AS ids
    FROM principals p
    LEFT JOIN public.members m ON m.user_id = p.user_id
         AND m.role = ANY (ARRAY['merchant.owner','merchant.admin','merchant.manager'])
    LEFT JOIN public.merchants mer ON mer.clerk_org_id = m.organization_id
    GROUP BY p.user_id
),
-- OLD: EXISTS on orders gated by user_merchant_id() (staff_profiles), which was
-- itself nested inside orders' admin-gated RLS.
old_side AS (
    SELECT a.user_id, oi.id AS item_id
    FROM admin_ids a
    JOIN public.staff_profiles sp ON sp.user_id = a.user_id
    JOIN public.orders o ON o.merchant_id = sp.merchant_id
                        AND o.merchant_id = ANY (a.ids)
    JOIN public.order_items oi ON oi.order_id = o.id
),
-- NEW: EXISTS on orders gated by admin_merchant_ids()
new_side AS (
    SELECT a.user_id, oi.id AS item_id
    FROM admin_ids a
    JOIN public.orders o ON o.merchant_id = ANY (a.ids)
    JOIN public.order_items oi ON oi.order_id = o.id
)
SELECT
    COALESCE(o.user_id, n.user_id)  AS user_id,
    COALESCE(o.item_id, n.item_id)  AS order_item_id,
    CASE WHEN n.item_id IS NULL THEN 'LOST access (regression)'
         ELSE 'GAINED access (widening)' END AS delta
FROM old_side o
FULL OUTER JOIN new_side n
  ON n.user_id = o.user_id AND n.item_id = o.item_id
WHERE o.item_id IS NULL OR n.item_id IS NULL;

\echo '=== CHECK 3: staff_profile vs members alignment (explains any CHECK 2 delta) ==='
-- Wave 1 removes the redundant user_merchant_id() conjunct from the child tables.
-- That is only equivalent while every authenticating staff profile administers
-- exactly the merchant it belongs to. On prod 2026-08-13 this was 23 of 23.
-- Any row here is a principal for whom the two identity sources disagree.
SELECT sp.user_id,
       sp.merchant_id                            AS staff_profile_merchant,
       COALESCE(array_agg(DISTINCT mer.id) FILTER (WHERE mer.id IS NOT NULL),
                ARRAY[]::uuid[])                 AS administered_merchants
FROM public.staff_profiles sp
LEFT JOIN public.members m ON m.user_id = sp.user_id
     AND m.role = ANY (ARRAY['merchant.owner','merchant.admin','merchant.manager'])
LEFT JOIN public.merchants mer ON mer.clerk_org_id = m.organization_id
WHERE sp.user_id IS NOT NULL
GROUP BY sp.user_id, sp.merchant_id
HAVING NOT (sp.merchant_id = ANY (
         COALESCE(array_agg(DISTINCT mer.id) FILTER (WHERE mer.id IS NOT NULL),
                  ARRAY[]::uuid[])));

\echo '=== CHECK 4: policy inventory — expect exactly one policy per table ==='
SELECT tablename, policyname, cmd, roles::text, permissive
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('orders','order_items','order_item_modifiers')
ORDER BY tablename, policyname;

\echo '=== CHECK 5: helper is STABLE + SECURITY DEFINER + pinned search_path ==='
SELECT p.proname,
       CASE p.provolatile WHEN 's' THEN 'STABLE' WHEN 'i' THEN 'IMMUTABLE' ELSE 'VOLATILE' END AS volatility,
       p.prosecdef AS security_definer,
       p.proconfig
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'admin_merchant_ids';

-- =============================================================================
-- CHECK 6 — runtime proof. Run as a REAL authenticated POS user, not as
-- postgres/service_role (those bypass RLS and will show ~8 ms either way).
-- Capture before applying the migration and again after; attach both.
-- =============================================================================
-- EXPLAIN (ANALYZE, BUFFERS)
-- SELECT o.*,
--        (SELECT json_agg(x) FROM (
--           SELECT oi.*,
--                  (SELECT json_agg(m) FROM public.order_item_modifiers m
--                    WHERE m.order_item_id = oi.id) AS mods
--           FROM public.order_items oi
--           WHERE oi.order_id = o.id AND oi.is_voided = false) x) AS items
-- FROM public.orders o
-- WHERE o.location_id = '<your-location-uuid>'
--   AND o.status IN ('draft','pending','sent_to_kitchen','preparing','ready')
-- ORDER BY o.created_at DESC
-- LIMIT 50;
--
-- Baseline through PostgREST as an authenticated user: 536-1110 ms.
-- Same shape with RLS bypassed:                          8.5 ms.
-- Wave 1 target:                                        < 25 ms.
--
-- Expect the plan to show the policy predicate as an InitPlan evaluated ONCE
-- (look for "InitPlan N (returns $M)" referencing admin_merchant_ids), NOT as a
-- Filter re-invoking is_merchant_admin per row.
-- =============================================================================
