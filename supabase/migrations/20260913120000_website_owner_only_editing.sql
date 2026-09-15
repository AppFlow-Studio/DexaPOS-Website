-- ─────────────────────────────────────────────────────────────────────────────
-- Website builder: owner-only editing
--
-- Product decision (2026-09-13): only the merchant OWNER (Clerk role exactly
-- 'merchant.owner') may CHANGE a store's website. Every website table previously
-- used a single `FOR ALL` policy gated by is_merchant_admin(), which admits
-- owner + admin + manager. This resolves blocker B10 ("which role may edit"),
-- explicitly deferred in 20260813121000_website_builder_foundation.sql.
--
-- Reads stay open to is_merchant_admin() so managers/admins can still VIEW the
-- Website section — otherwise the dashboard would break for them — while only
-- INSERT / UPDATE / DELETE are narrowed to the owner.
--
-- Scope = website *content* tables:
--   merchant_sites, site_pages, site_page_versions, site_forms, site_events,
--   site_assets.
-- Deliberately NOT narrowed:
--   • site_form_submissions — the public/staff inbox (contains lead PII and is
--     handled operationally: read/mark-read is not "changing the store").
--   • reservation_settings / reservation_service_periods / reservation_blackouts
--     — floor operations (accept toggle, service periods, blackouts), managed by
--     managers, not website content.
-- ─────────────────────────────────────────────────────────────────────────────

-- Owner-strict predicate. Mirrors is_merchant_admin's structure but admits ONLY
-- role 'merchant.owner'. is_dexapos_admin() is retained so HQ super-admins — and
-- HQ impersonation, which keeps the HQ org claim (see
-- app/manage/actions/get-user-info.ts) — continue to edit on a merchant's behalf.
CREATE OR REPLACE FUNCTION public.is_merchant_owner_strict(p_merchant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT (
    is_dexapos_admin()
    OR EXISTS (
      SELECT 1
      FROM members m
      JOIN merchants mer ON mer.clerk_org_id = m.organization_id
      WHERE m.user_id = current_user_id()
        AND mer.id = p_merchant_id
        AND m.role = 'merchant.owner'
    )
  );
$$;

ALTER FUNCTION public.is_merchant_owner_strict(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.is_merchant_owner_strict(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_merchant_owner_strict(uuid) TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.is_merchant_owner_strict(uuid) IS
  'True only for Clerk role merchant.owner on this merchant (plus HQ super-admins / impersonation via is_dexapos_admin). Gates website-content writes; reads still use is_merchant_admin.';

-- ── merchant_sites ───────────────────────────────────────────────────────────
DROP POLICY IF EXISTS merchant_sites_merchant_rw ON public.merchant_sites;

CREATE POLICY merchant_sites_read ON public.merchant_sites
  FOR SELECT TO authenticated
  USING (public.is_merchant_admin(merchant_id));

CREATE POLICY merchant_sites_insert_owner ON public.merchant_sites
  FOR INSERT TO authenticated
  WITH CHECK (public.is_merchant_owner_strict(merchant_id));

CREATE POLICY merchant_sites_update_owner ON public.merchant_sites
  FOR UPDATE TO authenticated
  USING      (public.is_merchant_owner_strict(merchant_id))
  WITH CHECK (public.is_merchant_owner_strict(merchant_id));

CREATE POLICY merchant_sites_delete_owner ON public.merchant_sites
  FOR DELETE TO authenticated
  USING (public.is_merchant_owner_strict(merchant_id));

-- ── site_pages ───────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS site_pages_merchant_rw ON public.site_pages;

CREATE POLICY site_pages_read ON public.site_pages
  FOR SELECT TO authenticated
  USING (public.is_merchant_admin(merchant_id));

CREATE POLICY site_pages_insert_owner ON public.site_pages
  FOR INSERT TO authenticated
  WITH CHECK (public.is_merchant_owner_strict(merchant_id));

CREATE POLICY site_pages_update_owner ON public.site_pages
  FOR UPDATE TO authenticated
  USING      (public.is_merchant_owner_strict(merchant_id))
  WITH CHECK (public.is_merchant_owner_strict(merchant_id));

CREATE POLICY site_pages_delete_owner ON public.site_pages
  FOR DELETE TO authenticated
  USING (public.is_merchant_owner_strict(merchant_id));

-- ── site_page_versions (append-only: SELECT/INSERT + UPDATE superseded_at) ─────
DROP POLICY IF EXISTS site_page_versions_merchant_rw ON public.site_page_versions;

CREATE POLICY site_page_versions_read ON public.site_page_versions
  FOR SELECT TO authenticated
  USING (public.is_merchant_admin(merchant_id));

CREATE POLICY site_page_versions_insert_owner ON public.site_page_versions
  FOR INSERT TO authenticated
  WITH CHECK (public.is_merchant_owner_strict(merchant_id));

CREATE POLICY site_page_versions_update_owner ON public.site_page_versions
  FOR UPDATE TO authenticated
  USING      (public.is_merchant_owner_strict(merchant_id))
  WITH CHECK (public.is_merchant_owner_strict(merchant_id));

-- ── site_forms ───────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS site_forms_merchant_rw ON public.site_forms;

CREATE POLICY site_forms_read ON public.site_forms
  FOR SELECT TO authenticated
  USING (public.is_merchant_admin(merchant_id));

CREATE POLICY site_forms_insert_owner ON public.site_forms
  FOR INSERT TO authenticated
  WITH CHECK (public.is_merchant_owner_strict(merchant_id));

CREATE POLICY site_forms_update_owner ON public.site_forms
  FOR UPDATE TO authenticated
  USING      (public.is_merchant_owner_strict(merchant_id))
  WITH CHECK (public.is_merchant_owner_strict(merchant_id));

CREATE POLICY site_forms_delete_owner ON public.site_forms
  FOR DELETE TO authenticated
  USING (public.is_merchant_owner_strict(merchant_id));

-- ── site_events ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS site_events_merchant_rw ON public.site_events;

CREATE POLICY site_events_read ON public.site_events
  FOR SELECT TO authenticated
  USING (public.is_merchant_admin(merchant_id));

CREATE POLICY site_events_insert_owner ON public.site_events
  FOR INSERT TO authenticated
  WITH CHECK (public.is_merchant_owner_strict(merchant_id));

CREATE POLICY site_events_update_owner ON public.site_events
  FOR UPDATE TO authenticated
  USING      (public.is_merchant_owner_strict(merchant_id))
  WITH CHECK (public.is_merchant_owner_strict(merchant_id));

CREATE POLICY site_events_delete_owner ON public.site_events
  FOR DELETE TO authenticated
  USING (public.is_merchant_owner_strict(merchant_id));

-- ── site_assets ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS site_assets_merchant_admin ON public.site_assets;

CREATE POLICY site_assets_read ON public.site_assets
  FOR SELECT TO authenticated
  USING (public.is_merchant_admin(merchant_id));

CREATE POLICY site_assets_insert_owner ON public.site_assets
  FOR INSERT TO authenticated
  WITH CHECK (public.is_merchant_owner_strict(merchant_id));

CREATE POLICY site_assets_update_owner ON public.site_assets
  FOR UPDATE TO authenticated
  USING      (public.is_merchant_owner_strict(merchant_id))
  WITH CHECK (public.is_merchant_owner_strict(merchant_id));

CREATE POLICY site_assets_delete_owner ON public.site_assets
  FOR DELETE TO authenticated
  USING (public.is_merchant_owner_strict(merchant_id));
