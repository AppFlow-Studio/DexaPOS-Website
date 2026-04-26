-- =============================================================================
-- Migration: Add INSERT policy on public.cash_drawers
--
-- Why:
--   The existing schema has SELECT and UPDATE policies on cash_drawers but no
--   INSERT policy, meaning RLS-authenticated clients cannot create drawers
--   from the web. Drawer rows have only ever been seeded out-of-band (or by
--   service-role admin paths). The new merchant-facing /dashboard/cash-drawers
--   UI needs to create drawers as the authenticated merchant user, scoped by
--   the same staff_profiles → merchant_id check that the SELECT/UPDATE
--   policies already use.
-- =============================================================================

DROP POLICY IF EXISTS "cash_drawers_insert" ON public.cash_drawers;

CREATE POLICY "cash_drawers_insert"
  ON public.cash_drawers
  FOR INSERT
  TO authenticated
  WITH CHECK (
    merchant_id IN (
      SELECT staff_profiles.merchant_id
      FROM public.staff_profiles
      WHERE staff_profiles.user_id = public.current_user_id()
    )
  );
