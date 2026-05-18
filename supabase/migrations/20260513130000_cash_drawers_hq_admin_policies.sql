-- =============================================================================
-- Migration: Allow HQ admins on public.cash_drawers RLS policies
--
-- Why:
--   When an HQ admin uses the merchant-facing /dashboard/cash-drawers flow
--   while impersonating a merchant, they have no staff_profiles row for that
--   merchant. The existing cash_drawers_{select,update,insert} policies only
--   allow merchant staff, so INSERT fails with 42501 RLS violation.
--   Other merchant-scoped tables (merchants, merchant_billing_profiles,
--   merchant_notes, location_banking_profiles, customer_payment_methods…)
--   already extend their policies with `OR public.is_dexapos_admin()`.
--   cash_drawers was simply missed. This aligns it with that pattern.
-- =============================================================================

DROP POLICY IF EXISTS "cash_drawers_select" ON public.cash_drawers;
CREATE POLICY "cash_drawers_select"
  ON public.cash_drawers
  FOR SELECT
  TO authenticated
  USING (
    public.is_dexapos_admin()
    OR merchant_id IN (
      SELECT staff_profiles.merchant_id
      FROM public.staff_profiles
      WHERE staff_profiles.user_id = public.current_user_id()
    )
  );
DROP POLICY IF EXISTS "cash_drawers_update" ON public.cash_drawers;
CREATE POLICY "cash_drawers_update"
  ON public.cash_drawers
  FOR UPDATE
  TO authenticated
  USING (
    public.is_dexapos_admin()
    OR merchant_id IN (
      SELECT staff_profiles.merchant_id
      FROM public.staff_profiles
      WHERE staff_profiles.user_id = public.current_user_id()
    )
  )
  WITH CHECK (
    public.is_dexapos_admin()
    OR merchant_id IN (
      SELECT staff_profiles.merchant_id
      FROM public.staff_profiles
      WHERE staff_profiles.user_id = public.current_user_id()
    )
  );
DROP POLICY IF EXISTS "cash_drawers_insert" ON public.cash_drawers;
CREATE POLICY "cash_drawers_insert"
  ON public.cash_drawers
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_dexapos_admin()
    OR merchant_id IN (
      SELECT staff_profiles.merchant_id
      FROM public.staff_profiles
      WHERE staff_profiles.user_id = public.current_user_id()
    )
  );
