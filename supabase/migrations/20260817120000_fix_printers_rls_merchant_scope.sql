-- ============================================================================
-- Fix: "new row violates row-level security policy for table printers"
--
-- Adding a printer from the station detail page always failed. The existing
-- policy was:
--
--   CREATE POLICY "printers_location_access" ON public.printers
--     USING (location_id IN (
--       SELECT location_id FROM location_members
--       WHERE user_id = get_my_claim('sub') AND is_active = true));
--
-- Two problems, both of which had to be fixed for INSERT to work:
--
-- 1. No WITH CHECK clause. USING governs which existing rows are visible;
--    WITH CHECK governs which new rows may be written. With FOR ALL and no
--    WITH CHECK, Postgres falls back to the USING expression for INSERT.
--
-- 2. The fallback expression can't be satisfied by this dashboard's users. It
--    resolves identity through location_members.user_id = get_my_claim('sub'),
--    but merchant web users authenticate via Clerk and are joined through
--    members -> merchants.clerk_org_id. Dashboard users are not populated into
--    location_members, so no candidate row ever passed the check.
--
-- The sibling tables written by the same station dialogs already scope by
-- merchant and work correctly:
--
--   station_devices    USING (is_merchant_admin(merchant_id))
--   payment_terminals  USING (is_merchant_admin(merchant_id))
--
-- printers carries a NOT NULL merchant_id and createPrinter() populates it from
-- the parent station, so it can use the same predicate. This aligns printers
-- with that pattern and states WITH CHECK explicitly rather than relying on the
-- USING fallback.
--
-- POS tablet access is preserved by keeping a location-scoped read path via
-- is_location_member(location_id), so device-side reads do not regress. That
-- function resolves identity through current_user_id(), which is the same
-- resolver the working sibling policies rely on.
-- ============================================================================

ALTER TABLE public.printers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "printers_location_access" ON public.printers;
DROP POLICY IF EXISTS "printers_merchant_scope" ON public.printers;
DROP POLICY IF EXISTS "printers_location_read" ON public.printers;

-- Full management for merchant owners/admins/managers and Dexa HQ admins.
-- WITH CHECK mirrors USING so INSERT and UPDATE are both governed explicitly.
CREATE POLICY "printers_merchant_scope" ON public.printers
  TO authenticated
  USING (public.is_merchant_admin(merchant_id))
  WITH CHECK (public.is_merchant_admin(merchant_id));

-- Read-only path for staff scoped to the printer's location (POS tablet, KDS),
-- who are members of a location but not merchant admins.
CREATE POLICY "printers_location_read" ON public.printers
  FOR SELECT
  TO authenticated
  USING (public.is_location_member(location_id));
