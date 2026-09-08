-- Website: give the public renderer the merchant's own name.
--
-- The bug, found on Joes Coffee Shop 2026-08-20 and confirmed by anonymous
-- curl: their brand site at `joes-coffee-shop` rendered "Downtown Hamra" —
-- one of five branches — as the header brand, the footer name and the
-- copyright line, ten times on the home page. The merchant's own name never
-- appeared once.
--
-- `buildPublicRenderContext` had nothing else to use. A brand page has no
-- location, so it fell through to `configs[0]` — whichever storefront
-- `online_store_config` returned first — and took that row's `store_name`.
-- Borrowing a branch's logo, hero and phone is a fine fallback. Borrowing its
-- name is not, because the name is the brand rather than a per-branch fact.
--
-- The merchant-set override lives in `merchant_sites.brand ->> 'name'` and
-- needs no schema change; that column is free-form jsonb and already ships in
-- `site_brand`. What SQL has to add is the FALLBACK, so that a merchant who
-- never opens Website settings still gets their own name. `merchants` is not
-- readable by anon and must not become so, which is exactly why this goes
-- through the existing SECURITY DEFINER function rather than a new grant.
--
-- Adds one output column, `merchant_name`. Everything else is byte-identical
-- to 20260821120000_website_tracking.sql.

BEGIN;

DROP FUNCTION IF EXISTS public.get_public_site_page(text, text);

CREATE FUNCTION public.get_public_site_page(p_slug text, p_path text)
RETURNS TABLE (
  site_id              uuid,
  merchant_id          uuid,
  merchant_name        text,
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
    -- The fallback only. `brand ->> 'name'` still wins, and is applied in
    -- TypeScript so the editor preview and the public page cannot disagree
    -- about the precedence.
    m.name,
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
  -- INNER would be wrong: merchant_sites.merchant_id is NOT NULL with an FK, so
  -- a missing row is impossible, but a join that can drop the whole result is
  -- not the thing to reach for when the only value at stake is a display name.
  LEFT JOIN public.merchants m
    ON m.id = a.merchant_id
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
  'The ONLY public read path into the website tables. SECURITY DEFINER so anon needs no table grant; never returns site_pages.draft_content. Returns facts; the routing fork is decided in lib/site-builder/resolve-render-mode.ts. merchant_name is the display fallback when merchant_sites.brand->>''name'' is unset — it exposes only the name, never the rest of the merchants row.';

GRANT EXECUTE ON FUNCTION public.get_public_site_page(text, text) TO anon, authenticated;

COMMIT;
