-- ═══════════════════════════════════════════════════════════════════════════
-- Website builder — public addressing and the public read path
--
-- Two things, both prerequisites for Stage 6 (PLAN-04) and both ratified in
-- docs/features/website-builder/PLAN-2026-08-16-GAP-CLOSURE.md §0:
--
--   1. `merchant_sites.subdomain` — the brand site's own address. Before this,
--      a built site had nowhere to live: every public URL resolves through
--      `online_store_config.slug`, which is one row per LOCATION, while a site
--      is one row per MERCHANT (2026-08-15, superseding D4). A five-location
--      merchant had five addresses and none of them belonged to the brand.
--
--   2. `get_public_site_page()` — a SECURITY DEFINER read path, so the public
--      route can render without `anon` ever holding a table grant. The website
--      tables stay REVOKED from anon exactly as the foundation migration left
--      them; this function is the only door, and it never returns a draft.
--
-- Nothing here makes any site live. `render_mode` still defaults to 'template'
-- and is still only flipped by a successful publish (plan item W2.5).
-- ═══════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. merchant_sites.subdomain
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.merchant_sites
  ADD COLUMN IF NOT EXISTS subdomain text;

-- NULL means "this merchant has not claimed a web address yet", which is every
-- merchant on the day this ships. A site without one is unreachable rather than
-- broken: there is simply no host that resolves to it, and the merchant's
-- existing per-location storefronts keep serving untouched (decision D1).
COMMENT ON COLUMN public.merchant_sites.subdomain IS
  'Brand web address, as {subdomain}.dexaposai.com. NULL = not claimed yet. Shares a namespace with online_store_config.slug; collisions are refused by trigger in both directions.';

-- DNS label rules, which are stricter than the page-path rules: 3–63 chars,
-- lowercase alphanumeric and hyphens, no leading or trailing hyphen. Enforced
-- here because unlike a page path this ends up in a hostname, where a malformed
-- value is not a bad link but an unresolvable one.
--
-- The RESERVED LIST is deliberately NOT here — it lives in
-- lib/site-builder/reserved-subdomains.ts, for the same reason the reserved page
-- paths do: the list will change more often than this schema should, and a test
-- keeps the two regexes in step.
ALTER TABLE public.merchant_sites
  DROP CONSTRAINT IF EXISTS merchant_sites_subdomain_format;

ALTER TABLE public.merchant_sites
  ADD CONSTRAINT merchant_sites_subdomain_format
  CHECK (subdomain IS NULL OR subdomain ~ '^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$');

CREATE UNIQUE INDEX IF NOT EXISTS uq_merchant_sites_subdomain
  ON public.merchant_sites (subdomain)
  WHERE subdomain IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. One flat host namespace
--
-- `proxy.ts` turns a subdomain into a single lookup key, so a brand subdomain
-- and a storefront slug are indistinguishable by the time routing sees them.
-- If the two namespaces could collide, claiming the subdomain `joes-downtown-
-- brooklyn` would let one merchant answer on another merchant's storefront
-- address — so this is a tenancy boundary, not tidiness.
--
-- Enforced in BOTH directions, because a collision created from the storefront
-- side is exactly as bad as one created from the site side. Keeping them
-- mutually exclusive is also what lets the routing fork stay
-- `resolveRenderMode(slug, path)` — one key, one lookup, no host parsing.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.website_subdomain_is_free()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.subdomain IS NULL THEN
    RETURN NEW;
  END IF;

  IF EXISTS (SELECT 1 FROM public.online_store_config WHERE slug = NEW.subdomain) THEN
    RAISE EXCEPTION 'subdomain "%" is already used by an online store', NEW.subdomain
      USING ERRCODE = 'unique_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_merchant_sites_subdomain_free ON public.merchant_sites;
CREATE TRIGGER trg_merchant_sites_subdomain_free
  BEFORE INSERT OR UPDATE OF subdomain ON public.merchant_sites
  FOR EACH ROW EXECUTE FUNCTION public.website_subdomain_is_free();

CREATE OR REPLACE FUNCTION public.storefront_slug_is_free()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.merchant_sites WHERE subdomain = NEW.slug) THEN
    RAISE EXCEPTION 'slug "%" is already used as a website address', NEW.slug
      USING ERRCODE = 'unique_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_online_store_config_slug_free ON public.online_store_config;
CREATE TRIGGER trg_online_store_config_slug_free
  BEFORE INSERT OR UPDATE OF slug ON public.online_store_config
  FOR EACH ROW EXECUTE FUNCTION public.storefront_slug_is_free();

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. The public read path
--
-- The website tables are REVOKED from anon and every policy is
-- `TO authenticated USING (is_merchant_admin(...))`. That is correct and stays:
-- `site_pages.draft_content` holds every merchant's unpublished work, and it
-- lives in the same table a public route must consult to resolve a path.
--
-- So instead of granting anon a carefully-shaped slice of those tables, anon
-- gets no table access at all and one function it may call. There is exactly one
-- door to audit, and the column that must never be public is not reachable
-- through it — `draft_content` is not in the return type.
--
-- Returns FACTS, not a verdict. Which of PLAN-04's five rules applies is decided
-- in lib/site-builder/resolve-render-mode.ts, where each rule has a unit test;
-- putting that logic in SQL would have traded the tests for nothing.
--
--   0 rows          → this slug addresses no built site at all
--   page_id IS NULL → the site exists but nothing is published at this path
-- ─────────────────────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.get_public_site_page(text, text);

CREATE FUNCTION public.get_public_site_page(p_slug text, p_path text)
RETURNS TABLE (
  site_id              uuid,
  render_mode          text,
  addressed_by_subdomain boolean,
  published_page_count integer,
  site_nav             jsonb,
  site_theme           jsonb,
  site_seo             jsonb,
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
    -- The NOT EXISTS is redundant while the collision triggers hold, and is
    -- kept so that a namespace bug degrades to "the storefront wins" rather
    -- than to two rows.
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
    p.id,
    p.title,
    p.path,
    p.location_id,
    v.id,
    v.version_number,
    v.published_at,
    v.content
  FROM addressed a
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

-- anon may call it. anon still may not read any of the three tables.
GRANT EXECUTE ON FUNCTION public.get_public_site_page(text, text) TO anon, authenticated;
