-- ═════════════════════════════════════════════════════════════════════════════
-- Website builder — marketing pixels on the public site (plan Phase 6)
-- ═════════════════════════════════════════════════════════════════════════════
--
-- No new storage: `merchant_sites.integrations` has existed and held '{}' since
-- the foundation migration (20260813120000). The shape inside it is owned by
-- `lib/site-builder/tracking.ts` and validated on write AND on read, because
-- those values are interpolated into inline script source on a public page.
--
-- What IS missing is a way for an anonymous visitor's render to see the column.
-- `get_public_site_page` remains the only public read path into the website
-- tables, and it does not return `integrations` — so a merchant could save four
-- pixel IDs and have none of them reach a single visitor.
--
-- Replaced wholesale rather than patched: a SQL function cannot be altered in
-- place when its return type changes. The body is reproduced from
-- 20260820120000 with one column added.
--
-- ORDERING: this migration assumes 20260820120000 (features + brand) has been
-- applied first. If it has not, apply both in filename order — this file
-- selects a.features and a.brand, which that migration creates.
--
-- Idempotent: safe to re-run.

BEGIN;

DROP FUNCTION IF EXISTS public.get_public_site_page(text, text);

CREATE FUNCTION public.get_public_site_page(p_slug text, p_path text)
RETURNS TABLE (
  site_id              uuid,
  merchant_id          uuid,
  render_mode          text,
  addressed_by_subdomain boolean,
  published_page_count integer,
  site_nav             jsonb,
  site_theme           jsonb,
  site_seo             jsonb,
  site_logo_url        text,
  site_features        jsonb,
  site_brand           jsonb,
  site_integrations    jsonb,
  page_id              uuid,
  page_title           text,
  page_path            text,
  page_location_id     uuid,
  version_id           uuid,
  version_number       integer,
  version_published_at timestamptz,
  content              jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH addressed AS (
    -- A brand subdomain addresses its site directly.
    SELECT ms.*, true AS by_subdomain
    FROM public.merchant_sites ms
    WHERE ms.subdomain = p_slug

    UNION ALL

    -- A storefront slug addresses the site belonging to the same merchant.
    SELECT ms.*, false AS by_subdomain
    FROM public.merchant_sites ms
    JOIN public.online_store_config osc ON osc.merchant_id = ms.merchant_id
    WHERE osc.slug = p_slug
      AND osc.is_active
      AND NOT EXISTS (
        SELECT 1 FROM public.merchant_sites m2 WHERE m2.subdomain = p_slug
      )
  )
  SELECT
    a.id,
    a.merchant_id,
    a.render_mode,
    a.by_subdomain,
    (
      SELECT count(*)::integer
      FROM public.site_pages sp
      WHERE sp.site_id = a.id
        AND sp.status = 'published'
        AND sp.published_version_id IS NOT NULL
    ),
    a.nav,
    a.theme,
    a.site_seo,
    logo.cdn_url,
    a.features,
    a.brand,
    a.integrations,
    p.id,
    p.title,
    p.path,
    p.location_id,
    v.id,
    v.version_number,
    v.published_at,
    v.content
  FROM addressed a
  LEFT JOIN public.site_assets logo
    ON  logo.id = a.logo_asset_id
    AND logo.deleted_at IS NULL
  LEFT JOIN public.site_pages p
    ON  p.site_id = a.id
    AND p.path    = COALESCE(p_path, '')
    AND p.status  = 'published'
    AND p.published_version_id IS NOT NULL
  LEFT JOIN public.site_page_versions v
    ON v.id = p.published_version_id
  LIMIT 1;
$$;

COMMENT ON FUNCTION public.get_public_site_page(text, text) IS
  'The ONLY public read path into the website tables. SECURITY DEFINER so anon needs no table grant; never returns site_pages.draft_content. Returns facts; the routing fork is decided in lib/site-builder/resolve-render-mode.ts.';

GRANT EXECUTE ON FUNCTION public.get_public_site_page(text, text) TO anon, authenticated;

COMMENT ON COLUMN public.merchant_sites.integrations IS
  'Marketing pixel IDs for the built site (Facebook, GA4, GTM, TikTok) plus Search Console verification. Shape owned by lib/site-builder/tracking.ts; ALWAYS read through resolveTracking() — these values reach inline script source.';

COMMIT;
