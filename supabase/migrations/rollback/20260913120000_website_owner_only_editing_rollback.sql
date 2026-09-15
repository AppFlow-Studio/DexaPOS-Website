-- Rollback for 20260913120000_website_owner_only_editing.sql
-- Restores the original single `FOR ALL` is_merchant_admin() policy on every
-- website-content table and drops the owner-strict predicate.

-- ── merchant_sites ───────────────────────────────────────────────────────────
DROP POLICY IF EXISTS merchant_sites_read          ON public.merchant_sites;
DROP POLICY IF EXISTS merchant_sites_insert_owner  ON public.merchant_sites;
DROP POLICY IF EXISTS merchant_sites_update_owner  ON public.merchant_sites;
DROP POLICY IF EXISTS merchant_sites_delete_owner  ON public.merchant_sites;
CREATE POLICY merchant_sites_merchant_rw ON public.merchant_sites
  FOR ALL TO authenticated
  USING      (public.is_merchant_admin(merchant_id))
  WITH CHECK (public.is_merchant_admin(merchant_id));

-- ── site_pages ───────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS site_pages_read          ON public.site_pages;
DROP POLICY IF EXISTS site_pages_insert_owner  ON public.site_pages;
DROP POLICY IF EXISTS site_pages_update_owner  ON public.site_pages;
DROP POLICY IF EXISTS site_pages_delete_owner  ON public.site_pages;
CREATE POLICY site_pages_merchant_rw ON public.site_pages
  FOR ALL TO authenticated
  USING      (public.is_merchant_admin(merchant_id))
  WITH CHECK (public.is_merchant_admin(merchant_id));

-- ── site_page_versions ───────────────────────────────────────────────────────
DROP POLICY IF EXISTS site_page_versions_read          ON public.site_page_versions;
DROP POLICY IF EXISTS site_page_versions_insert_owner  ON public.site_page_versions;
DROP POLICY IF EXISTS site_page_versions_update_owner  ON public.site_page_versions;
CREATE POLICY site_page_versions_merchant_rw ON public.site_page_versions
  FOR ALL TO authenticated
  USING      (public.is_merchant_admin(merchant_id))
  WITH CHECK (public.is_merchant_admin(merchant_id));

-- ── site_forms ───────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS site_forms_read          ON public.site_forms;
DROP POLICY IF EXISTS site_forms_insert_owner  ON public.site_forms;
DROP POLICY IF EXISTS site_forms_update_owner  ON public.site_forms;
DROP POLICY IF EXISTS site_forms_delete_owner  ON public.site_forms;
CREATE POLICY site_forms_merchant_rw ON public.site_forms
  FOR ALL TO authenticated
  USING      (public.is_merchant_admin(merchant_id))
  WITH CHECK (public.is_merchant_admin(merchant_id));

-- ── site_events ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS site_events_read          ON public.site_events;
DROP POLICY IF EXISTS site_events_insert_owner  ON public.site_events;
DROP POLICY IF EXISTS site_events_update_owner  ON public.site_events;
DROP POLICY IF EXISTS site_events_delete_owner  ON public.site_events;
CREATE POLICY site_events_merchant_rw ON public.site_events
  FOR ALL TO authenticated
  USING      (public.is_merchant_admin(merchant_id))
  WITH CHECK (public.is_merchant_admin(merchant_id));

-- ── site_assets ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS site_assets_read          ON public.site_assets;
DROP POLICY IF EXISTS site_assets_insert_owner  ON public.site_assets;
DROP POLICY IF EXISTS site_assets_update_owner  ON public.site_assets;
DROP POLICY IF EXISTS site_assets_delete_owner  ON public.site_assets;
CREATE POLICY site_assets_merchant_admin ON public.site_assets
  FOR ALL
  USING      (public.is_merchant_admin(merchant_id))
  WITH CHECK (public.is_merchant_admin(merchant_id));

DROP FUNCTION IF EXISTS public.is_merchant_owner_strict(uuid);
