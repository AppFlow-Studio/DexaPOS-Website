-- Website builder: the six unapplied migrations, in dependency order.
-- Generated 2026-08-21 from supabase/migrations/. Source of truth is those files.
--
-- Safe to run whole: every table, column, index, policy and trigger is guarded
-- by IF NOT EXISTS or a matching DROP ... IF EXISTS, so re-running an already
-- applied migration is a no-op. Order matters -- 4 of the 6 redefine
-- get_public_site_page cumulatively and each builds on the last.



-- ============================================================================
-- 20260819120000_website_assets.sql
-- ============================================================================

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


-- ============================================================================
-- 20260820120000_website_site_settings.sql
-- ============================================================================

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


-- ============================================================================
-- 20260821120000_website_tracking.sql
-- ============================================================================

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


-- ============================================================================
-- 20260822120000_website_forms.sql
-- ============================================================================

-- ═════════════════════════════════════════════════════════════════════════════
-- Website builder — Forms (plan Phase 7)
-- ═════════════════════════════════════════════════════════════════════════════
--
-- Forms are BRAND-LEVEL REUSABLE OBJECTS, not page content. A form is authored
-- once and embedded into any number of pages through the `form` section, which
-- stores only a `form_id`. One form, many pages, one inbox. Modelling a form as
-- a section's internal state would give a merchant four copies of their contact
-- form and four separate piles of leads.
--
-- Two tables:
--   site_forms             — the definition, draft + published
--   site_form_submissions  — what strangers sent, with real contact columns
--
-- Idempotent: safe to re-run.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. site_forms
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.site_forms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id     uuid NOT NULL REFERENCES public.merchant_sites(id) ON DELETE CASCADE,
  merchant_id uuid NOT NULL REFERENCES public.merchants(id)      ON DELETE CASCADE,

  -- The merchant-facing name in the forms list. Kept as a column rather than
  -- read out of the jsonb so the list can sort and search without parsing every
  -- definition; the builder writes both together.
  name text NOT NULL DEFAULT 'Untitled form',

  -- A lib/site-builder/forms FormDocument. Always read through normalizeForm().
  draft_definition jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- NULL until first publish. This is the ONLY definition a public visitor is
  -- ever served and the ONLY one a submission is validated against — so editing
  -- a draft can never change what a live form accepts, and cannot retroactively
  -- invalidate a submission that is already in flight.
  published_definition jsonb,
  published_at timestamptz,

  -- Optimistic concurrency for the builder's autosave, same contract as
  -- site_pages.revision.
  revision integer NOT NULL DEFAULT 0,

  -- Denormalised submission count. A COUNT(*) per row would make the forms list
  -- N+1 against a table that grows without limit, and this number is read far
  -- more often than it changes. Maintained by trigger, so it cannot drift the
  -- way an application-maintained counter does.
  submission_count integer NOT NULL DEFAULT 0,
  unread_count     integer NOT NULL DEFAULT 0,

  archived_at timestamptz,
  created_by  text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS site_forms_site_idx
  ON public.site_forms (site_id, created_at DESC)
  WHERE archived_at IS NULL;

COMMENT ON TABLE public.site_forms IS
  'Brand-level reusable forms. Embedded into pages by the `form` section, which stores only form_id. published_definition is the only definition ever served publicly or validated against.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. site_form_submissions
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.site_form_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id     uuid NOT NULL REFERENCES public.site_forms(id)     ON DELETE CASCADE,
  site_id     uuid NOT NULL REFERENCES public.merchant_sites(id) ON DELETE CASCADE,
  merchant_id uuid NOT NULL REFERENCES public.merchants(id)      ON DELETE CASCADE,

  -- The semantic columns. Filled from whichever field carries the matching
  -- semantic type, NOT from a field named "email" — which is the whole payoff of
  -- having Name/Email/Phone/Address as distinct field kinds rather than a text
  -- field with a validation dropdown. A merchant can label the field "Where can
  -- we reach you?" and it still lands here, which is what lets the inbox have
  -- real columns and what would let these feed `customers` later.
  contact_name    text,
  contact_email   text,
  contact_phone   text,
  contact_address text,

  -- Every answer, in order, each carrying the question AS IT WAS WORDED at the
  -- time. That label snapshot is why this table needs no form version history:
  -- a two-year-old lead still renders correctly after the form has been
  -- rewritten, and no join can ever resolve to a field that no longer exists.
  answers jsonb NOT NULL DEFAULT '[]'::jsonb,

  read_at timestamptz,

  -- Notification delivery is deliberately separate from storage. The public
  -- request inserts the response first, then attempts email and records the
  -- result here. A provider outage can therefore never lose a lead.
  -- Recipients are snapshotted so retrying an old failure cannot send private
  -- answers to someone newly added to the form settings.
  notification_state text NOT NULL DEFAULT 'not_requested'
    CHECK (notification_state IN ('not_requested', 'pending', 'sending', 'sent', 'failed')),
  notification_recipients text[] NOT NULL DEFAULT '{}',
  notification_attempts integer NOT NULL DEFAULT 0 CHECK (notification_attempts >= 0),
  notification_last_attempt_at timestamptz,
  notification_sent_at timestamptz,
  notification_error text,
  notification_message_ids text[] NOT NULL DEFAULT '{}',

  -- Abuse forensics only, and deliberately not the raw address: enough to spot
  -- a flood from one source, not enough to be a visitor-tracking log the
  -- merchant never asked for and would have to disclose.
  ip_hash text,
  user_agent text,

  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS site_form_submissions_form_idx
  ON public.site_form_submissions (form_id, created_at DESC);

CREATE INDEX IF NOT EXISTS site_form_submissions_unread_idx
  ON public.site_form_submissions (form_id)
  WHERE read_at IS NULL;

CREATE INDEX IF NOT EXISTS site_form_submissions_notification_failures_idx
  ON public.site_form_submissions (form_id, created_at DESC)
  WHERE notification_state = 'failed';

COMMENT ON TABLE public.site_form_submissions IS
  'Public form submissions. answers[] snapshots each question label at submission time, which is why site_forms needs no version history.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Tenancy derived, never supplied
-- ─────────────────────────────────────────────────────────────────────────────
-- Same pattern as site_pages: merchant_id is derived from the parent rather than
-- trusted from the writer. For submissions this is load-bearing rather than
-- merely tidy — they are inserted by a service-role client on behalf of an
-- anonymous stranger, so the row's tenancy must not be something the request can
-- influence at all.
CREATE OR REPLACE FUNCTION public.site_forms_derive_tenancy()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  SELECT s.merchant_id INTO NEW.merchant_id
  FROM public.merchant_sites s WHERE s.id = NEW.site_id;

  IF NEW.merchant_id IS NULL THEN
    RAISE EXCEPTION 'site_forms.site_id % does not exist', NEW.site_id;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS site_forms_derive_tenancy_trg ON public.site_forms;
CREATE TRIGGER site_forms_derive_tenancy_trg
  BEFORE INSERT OR UPDATE OF site_id ON public.site_forms
  FOR EACH ROW EXECUTE FUNCTION public.site_forms_derive_tenancy();

CREATE OR REPLACE FUNCTION public.site_form_submissions_derive_tenancy()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  SELECT f.site_id, f.merchant_id INTO NEW.site_id, NEW.merchant_id
  FROM public.site_forms f WHERE f.id = NEW.form_id;

  IF NEW.merchant_id IS NULL THEN
    RAISE EXCEPTION 'site_form_submissions.form_id % does not exist', NEW.form_id;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS site_form_submissions_derive_tenancy_trg ON public.site_form_submissions;
CREATE TRIGGER site_form_submissions_derive_tenancy_trg
  BEFORE INSERT OR UPDATE OF form_id ON public.site_form_submissions
  FOR EACH ROW EXECUTE FUNCTION public.site_form_submissions_derive_tenancy();

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Counters
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.site_forms_sync_counts()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.site_forms
       SET submission_count = submission_count + 1,
           unread_count     = unread_count + (CASE WHEN NEW.read_at IS NULL THEN 1 ELSE 0 END)
     WHERE id = NEW.form_id;

  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.site_forms
       SET submission_count = GREATEST(0, submission_count - 1),
           unread_count     = GREATEST(0, unread_count - (CASE WHEN OLD.read_at IS NULL THEN 1 ELSE 0 END))
     WHERE id = OLD.form_id;

  -- Marking read, or marking unread again.
  ELSIF (OLD.read_at IS NULL) <> (NEW.read_at IS NULL) THEN
    UPDATE public.site_forms
       SET unread_count = GREATEST(0, unread_count + (CASE WHEN NEW.read_at IS NULL THEN 1 ELSE -1 END))
     WHERE id = NEW.form_id;
  END IF;

  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS site_form_submissions_counts_trg ON public.site_form_submissions;
CREATE TRIGGER site_form_submissions_counts_trg
  AFTER INSERT OR UPDATE OF read_at OR DELETE ON public.site_form_submissions
  FOR EACH ROW EXECUTE FUNCTION public.site_forms_sync_counts();

DROP TRIGGER IF EXISTS update_site_forms_updated_at ON public.site_forms;
CREATE TRIGGER update_site_forms_updated_at
  BEFORE UPDATE ON public.site_forms
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Autosave concurrency, matching site_pages.
CREATE OR REPLACE FUNCTION public.site_forms_bump_revision()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.draft_definition IS DISTINCT FROM OLD.draft_definition THEN
    NEW.revision = OLD.revision + 1;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS site_forms_bump_revision_trg ON public.site_forms;
CREATE TRIGGER site_forms_bump_revision_trg
  BEFORE UPDATE ON public.site_forms
  FOR EACH ROW EXECUTE FUNCTION public.site_forms_bump_revision();

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. RLS
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.site_forms            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_form_submissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS site_forms_merchant_rw ON public.site_forms;
CREATE POLICY site_forms_merchant_rw ON public.site_forms
  FOR ALL TO authenticated
  USING      (public.is_merchant_admin(merchant_id))
  WITH CHECK (public.is_merchant_admin(merchant_id));

-- NO anon policy on either table, and none is coming.
--
-- Submissions contain other people's names, email addresses and phone numbers.
-- A public SELECT policy — however carefully scoped — is one predicate mistake
-- away from a lead-list leak, so anon gets no row access at all: the definition
-- is served by the SECURITY DEFINER function below, and the insert happens
-- through a service-role client in a server action that has already validated
-- the payload against that definition.
DROP POLICY IF EXISTS site_form_submissions_merchant_rw ON public.site_form_submissions;
CREATE POLICY site_form_submissions_merchant_rw ON public.site_form_submissions
  FOR ALL TO authenticated
  USING      (public.is_merchant_admin(merchant_id))
  WITH CHECK (public.is_merchant_admin(merchant_id));

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. The public read path
-- ─────────────────────────────────────────────────────────────────────────────
-- Returns the PUBLISHED definition of one form, and nothing else. Never the
-- draft, never the submission counts, never a submission.
--
-- Takes the site id as well as the form id so a form can only ever be fetched
-- in the context of the site that owns it — without that, a form id harvested
-- from one merchant's page HTML could be rendered by anyone's.
CREATE OR REPLACE FUNCTION public.get_public_site_form(p_site_id uuid, p_form_id uuid)
RETURNS TABLE (
  form_id    uuid,
  form_name  text,
  definition jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT f.id, f.name, f.published_definition
  FROM public.site_forms f
  WHERE f.id      = p_form_id
    AND f.site_id = p_site_id
    AND f.archived_at IS NULL
    AND f.published_definition IS NOT NULL
  LIMIT 1;
$$;

COMMENT ON FUNCTION public.get_public_site_form(uuid, uuid) IS
  'Public read path for one published form definition. Never returns drafts, counts or submissions. Scoped by site_id so a harvested form id cannot be rendered under another merchant''s site.';

GRANT EXECUTE ON FUNCTION public.get_public_site_form(uuid, uuid) TO anon, authenticated;

COMMIT;


-- ============================================================================
-- 20260823120000_website_events.sql
-- ============================================================================

-- ═════════════════════════════════════════════════════════════════════════════
-- Website builder — Events (plan Phase 8)
-- ═════════════════════════════════════════════════════════════════════════════
--
-- Events are FIRST-CLASS RECORDS, not page content. The Events page is a view
-- over this table, which is why the `events` section has almost no controls —
-- there is nothing to author there, only a list to render. Modelling them as
-- page content would mean re-typing Friday's trivia night into every page that
-- mentions it.
--
-- LISTINGS, NOT BOOKINGS. No capacity, no price, no RSVP column, and none is
-- coming: ticketing is an external link. Selling tickets is a payments product
-- with refunds, waitlists and tax in it, and a restaurant that needs one
-- already has Eventbrite.
--
-- Idempotent: safe to re-run.

BEGIN;

CREATE TABLE IF NOT EXISTS public.site_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id     uuid NOT NULL REFERENCES public.merchant_sites(id) ON DELETE CASCADE,
  merchant_id uuid NOT NULL REFERENCES public.merchants(id)      ON DELETE CASCADE,

  -- Which restaurant it is at. NULL = a brand-wide event.
  -- SET NULL rather than CASCADE: a closed branch should not silently delete
  -- the record of the events that happened there, and a brand-wide event is a
  -- reasonable thing for one to become.
  location_id uuid REFERENCES public.locations(id) ON DELETE SET NULL,

  name        text NOT NULL,
  description text,

  -- Required, and the one field this product is opinionated about. An event
  -- with no photograph is a bare line of text in a grid of images, and it makes
  -- a restaurant's website look broken. RESTRICT so deleting an asset cannot
  -- leave an event that violates its own NOT NULL.
  photo_asset_id uuid NOT NULL REFERENCES public.site_assets(id) ON DELETE RESTRICT,

  -- Stored as CALENDAR values, deliberately, not as a timestamptz.
  --
  -- A restaurant's event happens at 11pm *where the restaurant is*. Converting
  -- to an instant at write time would move it by an hour when the clocks
  -- change — which is exactly the weekend a restaurant is most likely to be
  -- running one. The occurrence maths lives in lib/site-builder/events/event.ts
  -- and works in the viewer's own local time.
  start_date date NOT NULL,
  start_time time NOT NULL DEFAULT '23:00',
  -- An end at or before the start means it finishes the following day. With the
  -- shipped default of 23:00 → 02:00 that is the COMMON case, not an edge one.
  end_time   time NOT NULL DEFAULT '02:00',

  -- Five options and no RRULE. Restaurants run weekly trivia and monthly
  -- brunches; "every 2nd Tuesday except August" is a calendar product.
  repeat text NOT NULL DEFAULT 'none'
    CHECK (repeat IN ('none', 'daily', 'weekly', 'monthly', 'yearly')),

  ticket_url text,

  -- Address of the detail page, unique per site. Derived from the name and
  -- suffixed on collision — "Trivia Night" every January must not fight last
  -- year's for the same URL.
  slug text NOT NULL,

  archived_at timestamptz,
  created_by  text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS site_events_slug_unique
  ON public.site_events (site_id, slug)
  WHERE archived_at IS NULL;

-- The public list query: everything live for a site, soonest start first.
-- Repeating events are resolved in application code, so this cannot order by
-- "next occurrence" — it orders by start_date and the caller sorts.
CREATE INDEX IF NOT EXISTS site_events_site_idx
  ON public.site_events (site_id, start_date)
  WHERE archived_at IS NULL;

COMMENT ON TABLE public.site_events IS
  'Restaurant events as first-class records. Listings, not bookings: ticketing is an external link, and there is deliberately no capacity/price/RSVP. Dates are calendar values, not instants — see lib/site-builder/events/event.ts.';

-- ─────────────────────────────────────────────────────────────────────────────
-- Tenancy derived, never supplied
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.site_events_derive_tenancy()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  SELECT s.merchant_id INTO NEW.merchant_id
  FROM public.merchant_sites s WHERE s.id = NEW.site_id;

  IF NEW.merchant_id IS NULL THEN
    RAISE EXCEPTION 'site_events.site_id % does not exist', NEW.site_id;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS site_events_derive_tenancy_trg ON public.site_events;
CREATE TRIGGER site_events_derive_tenancy_trg
  BEFORE INSERT OR UPDATE OF site_id ON public.site_events
  FOR EACH ROW EXECUTE FUNCTION public.site_events_derive_tenancy();

DROP TRIGGER IF EXISTS update_site_events_updated_at ON public.site_events;
CREATE TRIGGER update_site_events_updated_at
  BEFORE UPDATE ON public.site_events
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.site_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS site_events_merchant_rw ON public.site_events;
CREATE POLICY site_events_merchant_rw ON public.site_events
  FOR ALL TO authenticated
  USING      (public.is_merchant_admin(merchant_id))
  WITH CHECK (public.is_merchant_admin(merchant_id));

-- ─────────────────────────────────────────────────────────────────────────────
-- The public read path
-- ─────────────────────────────────────────────────────────────────────────────
-- Returns live events for one site, with the photo already resolved to a URL —
-- an anonymous visitor can read neither `site_events` nor `site_assets`, and a
-- second lookup per event would be N+1 on a page whose whole job is a list.
--
-- Returns ALL live events rather than filtering to upcoming ones in SQL: a
-- repeating event's next occurrence depends on the viewer's local date, which
-- Postgres does not know. The caller resolves it with `upcomingEvents`.
CREATE OR REPLACE FUNCTION public.get_public_site_events(p_site_id uuid)
RETURNS TABLE (
  id             uuid,
  slug           text,
  name           text,
  description    text,
  photo_url      text,
  photo_alt      text,
  location_id    uuid,
  start_date     date,
  start_time     time,
  end_time       time,
  repeat         text,
  ticket_url     text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    e.id, e.slug, e.name, e.description,
    a.cdn_url, a.alt_text,
    e.location_id, e.start_date, e.start_time, e.end_time, e.repeat, e.ticket_url
  FROM public.site_events e
  LEFT JOIN public.site_assets a
    ON  a.id = e.photo_asset_id
    AND a.deleted_at IS NULL
  WHERE e.site_id = p_site_id
    AND e.archived_at IS NULL
  ORDER BY e.start_date ASC
  LIMIT 200;
$$;

COMMENT ON FUNCTION public.get_public_site_events(uuid) IS
  'Public read path for a site''s live events, photo URL resolved. Returns all live events; "upcoming" depends on the viewer''s local date and is decided by lib/site-builder/events/event.ts.';

GRANT EXECUTE ON FUNCTION public.get_public_site_events(uuid) TO anon, authenticated;

COMMIT;


-- ============================================================================
-- 20260824120000_website_brand_name.sql
-- ============================================================================

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
