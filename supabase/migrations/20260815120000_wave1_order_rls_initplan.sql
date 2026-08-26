-- =============================================================================
-- Wave 1 — RLS InitPlan hoisting on the order tables
-- =============================================================================
-- Source: POS DB Performance Waves (Dexa-POS docs/engineering/performance/
--         db-perf-waves-2026-08-13.md), audit 2026-07-24.
--
-- PROBLEM (measured on prod, pg_stat_statements 254-day window)
--   PostgREST reads of orders + order_items(*, order_item_modifiers(*)) cost
--   450-1110 ms per call and ~97,000 s of DB time in aggregate. The identical
--   query shape with RLS bypassed executes in 8.5 ms. The 60-130x penalty is
--   RLS policy evaluation, not query shape, indexes, or row count.
--
--   Three compounding causes:
--     1. public.orders carries TWO permissive policies, both evaluated per row.
--     2. is_merchant_admin(merchant_id) takes a PER-ROW COLUMN ARGUMENT, so the
--        planner cannot hoist it into an InitPlan. Every row runs a
--        members JOIN merchants lookup.
--     3. order_items / order_item_modifiers reach the tenant through nested
--        subqueries on orders, which RE-TRIGGER orders' RLS -- multiplying (2).
--        Counter evidence: idx_order_item_modifiers_order_item shows
--        340,812,834 scans against a 9,983-row table.
--
-- DIRECT MEASUREMENT OF THE PREDICATE (prod, 2026-08-13, EXPLAIN ANALYZE)
--   Per-row form, exactly what the policy does today:
--     SELECT count(*) FROM orders o WHERE is_merchant_admin(o.merchant_id);
--       Index Only Scan ... Filter: is_merchant_admin(merchant_id)
--       Rows Removed by Filter: 3595
--       Execution Time: 255.718 ms
--
--   Hoisted set-based form, what this migration produces:
--     SELECT count(*) FROM orders o WHERE EXISTS (members/merchants semi-join);
--       HashAggregate (Group Key: mer.id) -> Nested Loop -> Index Only Scan
--       Execution Time: 0.173 ms
--
--   1,478x on the predicate alone, on ONE table. The embed pays it again at each
--   nesting level (orders -> order_items -> order_item_modifiers), which is how
--   an 8.5 ms query becomes a 536-1110 ms one.
--
-- FIX
--   Express the same authorization decision in a form the planner evaluates
--   ONCE PER QUERY (InitPlan) instead of once per row:
--     - one policy per table instead of two
--     - every volatile-looking call wrapped in (SELECT ...) so it hoists
--     - no function receives a per-row column argument
--   Once orders' predicate is an InitPlan, the children's EXISTS checks reduce
--   to a primary-key index lookup plus an array comparison against the cached
--   InitPlan value -- roughly 2 microseconds per row.
--
-- SEMANTICS: PRESERVED EXACTLY. No principal gains or loses access.
--   is_merchant_admin(p) is defined as:
--       is_dexapos_admin() OR EXISTS (members JOIN merchants ... = p ...)
--   so  is_merchant_admin(merchant_id)
--   ==  is_dexapos_admin() OR merchant_id = ANY(admin_merchant_ids())
--   where admin_merchant_ids() carries the identical membership predicate.
--
--   SYNTAX NOTE -- the ::uuid[] cast is REQUIRED, not decorative.
--   Written as  = ANY ((SELECT public.admin_merchant_ids()))  the parser takes
--   the SUBQUERY form of ANY and compares uuid against ROWS of type uuid[],
--   failing with: operator does not exist: uuid = uuid[] (SQLSTATE 42883).
--   Casting the scalar subquery forces the ARRAY form of ANY. Verified by
--   EXPLAIN on prod 2026-08-13 -- the cast form yields
--       InitPlan 1
--       Index Only Scan ... Index Cond: (merchant_id = ANY ((InitPlan 1).col1))
--       Execution Time: 0.237 ms
--   i.e. the membership array is computed once and pushed into the INDEX
--   CONDITION, not merely a filter. The alternative
--   merchant_id IN (SELECT unnest(...)) also hoists but degrades to a Merge
--   Semi Join with a Sort; the cast form is strictly better.
--   The old "admins can view orders" (is_dexapos_admin, SELECT) policy is
--   subsumed: is_merchant_admin() already short-circuits on is_dexapos_admin().
--
--   Role change public -> authenticated matches the house pattern already used
--   by order_item_modifiers_merchant_scope and by docs/engineering/database/
--   rls_plan.md. It is not a narrowing in practice: under the old policies an
--   anon caller evaluated is_merchant_admin()/user_merchant_id() to false/null
--   and received zero rows. Public receipt lookups go through SECURITY DEFINER
--   RPCs, which bypass RLS (these tables are ENABLE but not FORCE row security).
--
--   VERIFY BEFORE PROMOTING: run the companion harness
--   20260815120001_wave1_rls_equivalence_harness.sql on staging. Any non-zero
--   delta stops this wave.
--
-- NOT DONE HERE (deliberate): denormalising merchant_id onto order_items /
--   order_item_modifiers. It is unnecessary once orders hoists, and it would
--   mean a schema change plus a trigger on the hottest write path. Revisit only
--   if order_item_modifiers grows large enough that the child EXISTS shows up
--   in EXPLAIN.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Hoistable membership helper
-- -----------------------------------------------------------------------------
-- Returns every merchant the current user administers. Takes NO arguments, so a
-- call wrapped in (SELECT ...) becomes an InitPlan evaluated once per query.
-- The membership predicate is copied verbatim from is_merchant_admin() minus
-- its is_dexapos_admin() short-circuit, which the policies apply separately.
CREATE OR REPLACE FUNCTION public.admin_merchant_ids()
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT COALESCE(array_agg(DISTINCT mer.id), ARRAY[]::uuid[])
  FROM public.members m
  JOIN public.merchants mer
    ON mer.clerk_org_id = m.organization_id
  WHERE m.user_id = public.current_user_id()
    AND m.role = ANY (
      ARRAY[
        'merchant.owner'::text,
        'merchant.admin'::text,
        'merchant.manager'::text
      ]
    );
$function$;

COMMENT ON FUNCTION public.admin_merchant_ids() IS
  'Merchants the current user administers. Argument-free so RLS policies can '
  'hoist it into an InitPlan. The ::uuid[] cast is REQUIRED to select the array '
  'form of ANY: merchant_id = ANY((SELECT admin_merchant_ids())::uuid[]). '
  'Semantically identical to the membership half of is_merchant_admin().';

REVOKE ALL ON FUNCTION public.admin_merchant_ids() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_merchant_ids() TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 2. public.orders — collapse two per-row policies into one InitPlan policy
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Merchant Admin Can manage orders" ON public.orders;
DROP POLICY IF EXISTS "admins can view orders"           ON public.orders;
DROP POLICY IF EXISTS orders_merchant_scope              ON public.orders;

CREATE POLICY orders_merchant_scope ON public.orders
  FOR ALL TO authenticated
  USING (
    (SELECT public.is_dexapos_admin())
    OR merchant_id = ANY ((SELECT public.admin_merchant_ids())::uuid[])
  )
  WITH CHECK (
    (SELECT public.is_dexapos_admin())
    OR merchant_id = ANY ((SELECT public.admin_merchant_ids())::uuid[])
  );

-- -----------------------------------------------------------------------------
-- 3. public.order_items — one policy; parent reached by PK index lookup
-- -----------------------------------------------------------------------------
-- The EXISTS stays, but every term inside it is now InitPlan-cached, and the
-- orders probe is a primary-key lookup. Previously this subquery re-entered
-- orders' RLS and paid the members JOIN merchants cost per row.
DROP POLICY IF EXISTS "Merchant Admins Can manage order items" ON public.order_items;
DROP POLICY IF EXISTS "hq_admin_can see order Items"           ON public.order_items;
DROP POLICY IF EXISTS order_items_merchant_scope               ON public.order_items;

CREATE POLICY order_items_merchant_scope ON public.order_items
  FOR ALL TO authenticated
  USING (
    (SELECT public.is_dexapos_admin())
    OR EXISTS (
      SELECT 1
      FROM public.orders o
      WHERE o.id = order_items.order_id
        AND o.merchant_id = ANY ((SELECT public.admin_merchant_ids())::uuid[])
    )
  )
  WITH CHECK (
    (SELECT public.is_dexapos_admin())
    OR EXISTS (
      SELECT 1
      FROM public.orders o
      WHERE o.id = order_items.order_id
        AND o.merchant_id = ANY ((SELECT public.admin_merchant_ids())::uuid[])
    )
  );

-- -----------------------------------------------------------------------------
-- 4. public.order_item_modifiers — bounded correlated EXISTS
-- -----------------------------------------------------------------------------
-- Replaces  order_item_id IN (SELECT oi.id FROM order_items JOIN orders ...)
-- which materialised a hash of EVERY visible order_item id on each evaluation
-- and grew without bound as the table grew. The correlated form below is two
-- primary-key index lookups per row against a fixed InitPlan array.
DROP POLICY IF EXISTS order_item_modifiers_merchant_scope ON public.order_item_modifiers;

CREATE POLICY order_item_modifiers_merchant_scope ON public.order_item_modifiers
  FOR ALL TO authenticated
  USING (
    (SELECT public.is_dexapos_admin())
    OR EXISTS (
      SELECT 1
      FROM public.order_items oi
      JOIN public.orders o ON o.id = oi.order_id
      WHERE oi.id = order_item_modifiers.order_item_id
        AND o.merchant_id = ANY ((SELECT public.admin_merchant_ids())::uuid[])
    )
  )
  WITH CHECK (
    (SELECT public.is_dexapos_admin())
    OR EXISTS (
      SELECT 1
      FROM public.order_items oi
      JOIN public.orders o ON o.id = oi.order_id
      WHERE oi.id = order_item_modifiers.order_item_id
        AND o.merchant_id = ANY ((SELECT public.admin_merchant_ids())::uuid[])
    )
  );

COMMIT;

-- =============================================================================
-- ROLLBACK (paste into the SQL editor if the harness reports any delta)
-- =============================================================================
-- BEGIN;
-- DROP POLICY IF EXISTS orders_merchant_scope ON public.orders;
-- CREATE POLICY "Merchant Admin Can manage orders" ON public.orders
--   FOR ALL TO public
--   USING (is_merchant_admin(merchant_id))
--   WITH CHECK (is_merchant_admin(merchant_id));
-- CREATE POLICY "admins can view orders" ON public.orders
--   FOR SELECT TO public USING (is_dexapos_admin());
--
-- DROP POLICY IF EXISTS order_items_merchant_scope ON public.order_items;
-- CREATE POLICY "Merchant Admins Can manage order items" ON public.order_items
--   FOR ALL TO public
--   USING (EXISTS (SELECT 1 FROM orders o
--                  WHERE o.id = order_items.order_id
--                    AND o.merchant_id = (SELECT user_merchant_id())))
--   WITH CHECK (EXISTS (SELECT 1 FROM orders o
--                  WHERE o.id = order_items.order_id
--                    AND o.merchant_id = (SELECT user_merchant_id())));
-- CREATE POLICY "hq_admin_can see order Items" ON public.order_items
--   FOR ALL TO public USING (is_dexapos_admin()) WITH CHECK (is_dexapos_admin());
--
-- DROP POLICY IF EXISTS order_item_modifiers_merchant_scope ON public.order_item_modifiers;
-- CREATE POLICY order_item_modifiers_merchant_scope ON public.order_item_modifiers
--   FOR ALL TO authenticated
--   USING ((SELECT is_dexapos_admin()) OR (order_item_id IN (
--            SELECT oi.id FROM order_items oi JOIN orders o ON o.id = oi.order_id
--            WHERE o.merchant_id = (SELECT user_merchant_id()))))
--   WITH CHECK ((SELECT is_dexapos_admin()) OR (order_item_id IN (
--            SELECT oi.id FROM order_items oi JOIN orders o ON o.id = oi.order_id
--            WHERE o.merchant_id = (SELECT user_merchant_id()))));
-- COMMIT;
