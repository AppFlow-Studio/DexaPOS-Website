-- ─────────────────────────────────────────────────────────────────────────────
-- Website asset library — Stage 7 / parity plan Phase 3
-- ─────────────────────────────────────────────────────────────────────────────
--
--   merchants (1) ──< site_assets
--                       ▲
--                       └─ referenced BY ID from page documents, never by URL
--
-- Why a registry table at all, when the files live on Bunny CDN and every
-- upload already returns a URL:
--
--  * **Page documents store `assetId`, never a URL.** `assetRefSchema` has said
--    so since v1. A CDN hostname change, a move to signed URLs, or a switch of
--    storage provider would otherwise mean rewriting every merchant's JSONB —
--    including immutable published version rows, which must never be rewritten.
--    One indirection here keeps all of that a config change.
--
--  * **Alt text has to live somewhere shared.** The same photo used on three
--    pages should not need its alt text typed three times, and accessibility
--    is a per-image fact, not a per-placement one. (`AssetRef.alt` stays as a
--    per-placement override for the cases where context genuinely differs.)
--
--  * **Quota needs a sum.** `merchant_sites.max_asset_bytes` has existed since
--    the foundation migration with nothing to count against it.
--
--  * **Orphan safety.** A merchant deleting a photo that is on a live page must
--    not produce a broken image on their public site. Soft delete here lets the
--    renderer fall back to nothing while the row still explains itself.
--
-- Storage note: this table is a *registry*, not the store. Bytes live on Bunny
-- under `merchants/{merchant_id}/website/{file}`, uploaded through the existing
-- `cdn-upload` edge function. Nothing here ever holds file content.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. site_assets
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.site_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Merchant-scoped rather than site-scoped on purpose: a merchant has exactly
  -- one site, and scoping to the merchant means an asset survives a site being
  -- recreated and can be reused by non-website surfaces later without a move.
  merchant_id uuid NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,

  -- Where the bytes are. `storage_path` is the Bunny path and the delete key;
  -- `cdn_url` is what the renderer serves. Both are written by the upload
  -- action from the edge function's response — never by a client.
  storage_path text NOT NULL,
  cdn_url text NOT NULL,

  original_filename text,
  mime_type text NOT NULL,
  bytes bigint NOT NULL CHECK (bytes >= 0),

  -- Nullable because we do not decode images server-side yet. When they are
  -- known the renderer can emit width/height and stop layout shift, which is a
  -- Core Web Vitals number on every page the asset appears on.
  width integer,
  height integer,

  -- The default alt text for this image wherever it is used.
  alt_text text,

  -- Soft delete. A row is never hard-deleted while a published page may still
  -- reference it; a retention sweep removes the bytes later.
  deleted_at timestamptz,

  uploaded_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- The same file cannot be registered twice.
CREATE UNIQUE INDEX IF NOT EXISTS uq_site_assets_storage_path
  ON public.site_assets (storage_path);

-- The library list: a merchant's live assets, newest first.
CREATE INDEX IF NOT EXISTS idx_site_assets_merchant_created
  ON public.site_assets (merchant_id, created_at DESC)
  WHERE deleted_at IS NULL;

COMMENT ON TABLE public.site_assets IS
  'Registry of merchant website media. Page documents reference these by id, never by URL, so the CDN can move without rewriting merchant JSONB.';
COMMENT ON COLUMN public.site_assets.deleted_at IS
  'Soft delete. A referenced asset renders as nothing rather than a broken image; a retention sweep removes the bytes.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. updated_at
-- ─────────────────────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_site_assets_updated_at ON public.site_assets;
CREATE TRIGGER trg_site_assets_updated_at
  BEFORE UPDATE ON public.site_assets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. RLS
-- ─────────────────────────────────────────────────────────────────────────────
-- Same posture as every other website table: merchant admins only, and no anon
-- policy at all. The public site never reads this table — `get_public_site_page`
-- is still the only anonymous read path into website data, and the asset URLs a
-- visitor needs are resolved server-side by a SECURITY DEFINER function below.
ALTER TABLE public.site_assets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS site_assets_merchant_admin ON public.site_assets;
CREATE POLICY site_assets_merchant_admin
  ON public.site_assets
  FOR ALL
  USING (public.is_merchant_admin(merchant_id))
  WITH CHECK (public.is_merchant_admin(merchant_id));

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Quota accounting
-- ─────────────────────────────────────────────────────────────────────────────
-- Summed rather than kept as a running total on `merchant_sites`: a counter
-- column drifts the first time a delete fails halfway, and this is read once per
-- upload rather than per page view.
CREATE OR REPLACE FUNCTION public.site_asset_bytes_used(p_merchant_id uuid)
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(sum(bytes), 0)::bigint
  FROM public.site_assets
  WHERE merchant_id = p_merchant_id
    AND deleted_at IS NULL;
$$;

REVOKE ALL ON FUNCTION public.site_asset_bytes_used(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.site_asset_bytes_used(uuid) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Public asset resolution
-- ─────────────────────────────────────────────────────────────────────────────
-- The public renderer needs URLs for the assets a published page references,
-- and anonymous visitors cannot read `site_assets`. This returns exactly the
-- three fields a renderer uses, for one merchant's live assets, and nothing
-- else — no storage path, no filename, no byte count, no upload actor.
--
-- Takes the id list so the whole library is never exposed by a page that
-- happens to reference one photo.
CREATE OR REPLACE FUNCTION public.get_public_site_assets(
  p_merchant_id uuid,
  p_asset_ids uuid[]
)
RETURNS TABLE (id uuid, cdn_url text, alt_text text, width integer, height integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT a.id, a.cdn_url, a.alt_text, a.width, a.height
  FROM public.site_assets a
  WHERE a.merchant_id = p_merchant_id
    AND a.deleted_at IS NULL
    AND a.id = ANY(p_asset_ids);
$$;

COMMENT ON FUNCTION public.get_public_site_assets(uuid, uuid[]) IS
  'Resolves asset ids to CDN URLs for the public renderer. Scoped to one merchant and to an explicit id list, so a page cannot enumerate the library.';

REVOKE ALL ON FUNCTION public.get_public_site_assets(uuid, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_site_assets(uuid, uuid[]) TO anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. The website's own logo
-- ─────────────────────────────────────────────────────────────────────────────
-- Until now the built site borrowed `online_store_config.logo_url` from
-- whichever storefront happened to be first. That is the *ordering* logo: it
-- belongs to one location, it is sized for a checkout header, and on a
-- multi-location merchant which one you got depended on row order. The Style
-- screen accordingly showed a Replace button that did nothing and a sentence
-- explaining why.
--
-- ON DELETE SET NULL rather than RESTRICT: a merchant removing a photo from
-- their library should lose their logo, not be refused. The header falls back
-- to the restaurant's name in text, which is a reasonable site.
ALTER TABLE public.merchant_sites
  ADD COLUMN IF NOT EXISTS logo_asset_id uuid
  REFERENCES public.site_assets(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.merchant_sites.logo_asset_id IS
  'The brand website logo. Falls back to the first storefront''s logo_url when NULL.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. get_public_site_page(): return the logo URL
-- ─────────────────────────────────────────────────────────────────────────────
-- Anonymous visitors cannot read `merchant_sites` or `site_assets`, and the
-- logo is not part of the page document, so it cannot arrive through
-- `get_public_site_assets` with the page's other images. Resolving it here
-- keeps the public render at one round trip for site facts, and keeps this
-- function what it already was: the single anonymous read path into website
-- data.
--
-- Replaced wholesale rather than patched — the body is reproduced from
-- 20260816150000 with one join added, because a SQL function cannot be altered
-- in place when its return type changes.
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
