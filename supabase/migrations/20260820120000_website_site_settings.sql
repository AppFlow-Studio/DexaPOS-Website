-- ═════════════════════════════════════════════════════════════════════════════
-- Website builder — brand feature toggles and brand settings (plan Phase 5)
-- ═════════════════════════════════════════════════════════════════════════════
--
-- The two-layer model: brand settings say *whether* a capability exists;
-- the page editor says *where* it appears and *what it says*. Before this,
-- every section kind was offered to every merchant regardless of whether the
-- business it describes exists — a restaurant that takes no reservations was
-- shown a Reservations section, and found out by adding one.
--
-- Two jsonb columns rather than a column per setting. These are read together
-- on every public page render and written together by one screen, and the set
-- will keep growing; a column per boolean makes each addition a migration, a
-- `MerchantSiteRow` change and an RPC signature change for one flag. Both are
-- validated in `lib/site-builder/site-settings.ts` on the way in AND repaired
-- on the way out, so a row written by an older build still renders.
--
-- Idempotent: safe to re-run.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. The columns
-- ─────────────────────────────────────────────────────────────────────────────
-- `{}` rather than a populated default: `resolveFeatures` fills every key in,
-- and an empty object is the honest representation of "this merchant has never
-- opened the settings screen". Baking today's four keys into a column default
-- would leave every existing row asserting a value for a fifth key that does
-- not exist yet.
ALTER TABLE public.merchant_sites
  ADD COLUMN IF NOT EXISTS features jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS brand    jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.merchant_sites.features IS
  'Availability toggles: reviews, rewards, giftCards, reservations. Shape owned by lib/site-builder/site-settings.ts; always read through resolveFeatures().';

COMMENT ON COLUMN public.merchant_sites.brand IS
  'Brand facts a page may display: social accounts, reservation link, cuisines, price range, default location. Always read through resolveBrand().';

-- Structural guards only. The real shape is enforced in TypeScript on write and
-- repaired on read; these stop the two obvious ways a row becomes unreadable —
-- an array or a scalar where an object belongs.
ALTER TABLE public.merchant_sites
  DROP CONSTRAINT IF EXISTS merchant_sites_features_object;
ALTER TABLE public.merchant_sites
  ADD CONSTRAINT merchant_sites_features_object
  CHECK (jsonb_typeof(features) = 'object');

ALTER TABLE public.merchant_sites
  DROP CONSTRAINT IF EXISTS merchant_sites_brand_object;
ALTER TABLE public.merchant_sites
  ADD CONSTRAINT merchant_sites_brand_object
  CHECK (jsonb_typeof(brand) = 'object');

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. get_public_site_page(): return them
-- ─────────────────────────────────────────────────────────────────────────────
-- Anonymous visitors cannot read `merchant_sites`, and this function remains
-- the ONLY public read path into the website tables. The public renderer needs
-- both columns on every page: `brand.social` feeds the footer, `brand.cuisines`
-- and `brand.priceRange` feed the structured data that puts a restaurant in a
-- search result, and `brand.defaultLocationId` decides whether a visitor who
-- has not picked a branch is shown prices at all.
--
-- Replaced wholesale rather than patched — the body is reproduced from
-- 20260819120000 with two columns added, because a SQL function cannot be
-- altered in place when its return type changes.
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

COMMIT;
