-- Merchant Website Builder — Stage 2: tenancy & persistence.
--
-- Three tables under the existing storefront:
--
--   online_store_config (1) ──< merchant_sites (1) ──< site_pages ──< site_page_versions
--
-- Design notes, in full in docs/features/website-builder/PLAN-02-INFRA-DATA-MODEL.md:
--
--  * A page is ONE atomic JSONB document, not one row per section. Publishing
--    copies the draft into an immutable version row and repoints a single FK, so
--    publish / rollback / diff are row operations and a render is one read.
--    (The dormant `online_store_pages` table is the row-per-section model,
--    half-built and read by nothing; it is retired separately, not extended.)
--
--  * `merchant_id` is denormalized onto every table on purpose: RLS policies
--    must not join, or every read pays for it and every policy gets harder to
--    reason about. Triggers derive it from the parent so a client can never set
--    it, which keeps tenancy correct even if a policy were mis-written.
--
--  * No public/anon read policy yet. The public renderer arrives in Stage 4 and
--    will read through a SECURITY DEFINER function (a policy's EXISTS subquery
--    is itself subject to RLS on the joined tables, so an anon policy here would
--    silently return nothing). Until then these tables are merchant-only.

-- ─────────────────────────────────────────────────────────────────────────────
-- 0. Hygiene: "one storefront per location" is convention, not a constraint
-- ─────────────────────────────────────────────────────────────────────────────
-- Decision D4 ("one site per location") inherits this rule, and only non-unique
-- indexes exist today (utils/migrations/041_online_store_config.sql:205-208).
-- Guarded because production data has not been checked for duplicates and a
-- hard failure here would block the whole migration. `merchant_sites`
-- .store_config_id UNIQUE protects the builder regardless; this is hygiene.
DO $$
DECLARE
  v_duplicates integer;
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'uq_online_store_config_merchant_location'
  ) THEN
    RETURN;
  END IF;

  SELECT count(*) INTO v_duplicates
  FROM (
    SELECT merchant_id, location_id
    FROM public.online_store_config
    GROUP BY merchant_id, location_id
    HAVING count(*) > 1
  ) d;

  IF v_duplicates = 0 THEN
    ALTER TABLE public.online_store_config
      ADD CONSTRAINT uq_online_store_config_merchant_location
      UNIQUE (merchant_id, location_id);
  ELSE
    RAISE WARNING
      'Skipped uq_online_store_config_merchant_location: % merchant/location pair(s) have more than one store config. Resolve them, then add the constraint.',
      v_duplicates;
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. merchant_sites — one built site per storefront
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.merchant_sites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id uuid NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,

  -- D4: one site per storefront, enforced by the DB rather than by convention.
  store_config_id uuid NOT NULL UNIQUE
    REFERENCES public.online_store_config(id) ON DELETE CASCADE,

  -- Blocker B3 / decision D5, the routing fork. 'template' = the existing four
  -- storefront templates serve this URL; 'builder' = the built site does.
  -- Flipped to 'builder' by the FIRST SUCCESSFUL PUBLISH, never by opening the
  -- builder — so a merchant who experiments for a week and never publishes
  -- keeps their live site the whole time. Fail-safe by construction.
  render_mode text NOT NULL DEFAULT 'template'
    CHECK (render_mode IN ('template', 'builder')),

  -- Site-wide content. Deliberately NOT on the page: changing a nav link or a
  -- brand colour must not create a new version of every page.
  nav          jsonb NOT NULL DEFAULT '{"items":[]}'::jsonb,
  theme        jsonb NOT NULL DEFAULT '{}'::jsonb,
  site_seo     jsonb NOT NULL DEFAULT '{}'::jsonb,
  integrations jsonb NOT NULL DEFAULT '{}'::jsonb,

  schema_version integer NOT NULL DEFAULT 1,

  -- Blocker B9 (plan tiers). NULL = unlimited, which is every merchant in v1.
  -- Present from day one because turning limits on later should be a config
  -- change, not a migration plus a customer conversation.
  max_pages             integer,
  max_asset_bytes       bigint,
  custom_domain_allowed boolean NOT NULL DEFAULT false,

  first_published_at timestamptz,
  last_published_at  timestamptz,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_merchant_sites_merchant ON public.merchant_sites(merchant_id);
CREATE INDEX IF NOT EXISTS idx_merchant_sites_location ON public.merchant_sites(location_id);

COMMENT ON TABLE public.merchant_sites IS
  'One merchant-built website per online_store_config (decision D4). render_mode is the template-vs-builder routing fork (B3/D5).';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. site_pages — the working draft
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.site_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id uuid NOT NULL REFERENCES public.merchant_sites(id) ON DELETE CASCADE,
  merchant_id uuid NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,

  -- '' is the home page. NOT NULL so the unique index actually constrains it.
  -- Reserved paths (/checkout, /cart, /t/*, …) are rejected in application code
  -- (lib/site-builder/reserved-paths.ts), not here — the list will change more
  -- often than this schema should.
  path text NOT NULL DEFAULT '',
  title text NOT NULL DEFAULT 'Home',

  is_home boolean NOT NULL DEFAULT false,
  status  text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'published', 'archived')),

  -- A lib/site-builder PageDocument. Read through normalizePage(), which never
  -- throws, so a malformed document degrades to a renderable page instead of a
  -- 500 on a merchant's live site.
  draft_content jsonb NOT NULL
    DEFAULT '{"schemaVersion":1,"sections":[],"seo":{},"settings":{}}'::jsonb,

  -- Optimistic concurrency for autosave. Bumped by trigger whenever
  -- draft_content changes; a stale writer gets zero rows back rather than
  -- silently clobbering another tab's work.
  revision integer NOT NULL DEFAULT 0,

  -- FK added in step 4 (circular with site_page_versions).
  published_version_id uuid,
  published_at timestamptz,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  -- '' (home) or slash-separated segments. Each segment must start and end with
  -- an alphanumeric, with single hyphens between — so '-lead', 'trail-' and
  -- 'a--b' are all rejected. Kept in step with
  -- lib/site-builder/reserved-paths.ts, which a test asserts.
  CONSTRAINT site_pages_path_format
    CHECK (path ~ '^([a-z0-9]+(-[a-z0-9]+)*(/[a-z0-9]+(-[a-z0-9]+)*)*)?$')
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_site_pages_site_path ON public.site_pages(site_id, path);
CREATE UNIQUE INDEX IF NOT EXISTS uq_site_pages_one_home  ON public.site_pages(site_id) WHERE is_home;
CREATE INDEX IF NOT EXISTS idx_site_pages_merchant ON public.site_pages(merchant_id);

-- Recovers the one thing the document model gives up versus row-per-section:
-- "which pages reference menu item X", needed by the builder's broken-binding
-- warning. Use a containment predicate (@>) so the index is actually used.
CREATE INDEX IF NOT EXISTS idx_site_pages_draft_content_gin
  ON public.site_pages USING gin (draft_content jsonb_path_ops);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. site_page_versions — immutable history
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.site_page_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id uuid NOT NULL REFERENCES public.site_pages(id) ON DELETE CASCADE,
  site_id uuid NOT NULL REFERENCES public.merchant_sites(id) ON DELETE CASCADE,
  merchant_id uuid NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,

  version_number integer NOT NULL,
  content jsonb NOT NULL,
  -- sha256 of the normalized content, so republishing unchanged content is a
  -- no-op instead of filling history with identical rows.
  content_hash text NOT NULL,
  schema_version integer NOT NULL DEFAULT 1,

  label text,
  published_by text,
  published_at timestamptz NOT NULL DEFAULT now(),

  -- Set when this version stops being live. NULL = live, or never was.
  superseded_at timestamptz,
  -- A rollback creates a NEW version whose content is copied from an old one,
  -- so history stays append-only and "what was live on the 3rd?" stays
  -- answerable. It never deletes or reactivates a row.
  rolled_back_from_version_id uuid
    REFERENCES public.site_page_versions(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_site_page_versions_number
  ON public.site_page_versions(page_id, version_number);
CREATE INDEX IF NOT EXISTS idx_site_page_versions_page
  ON public.site_page_versions(page_id, published_at DESC);

COMMENT ON TABLE public.site_page_versions IS
  'Append-only. Never UPDATE a row here; rollback inserts a new version copied from an old one.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Close the circular FK
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'site_pages_published_version_id_fkey'
  ) THEN
    ALTER TABLE public.site_pages
      ADD CONSTRAINT site_pages_published_version_id_fkey
      FOREIGN KEY (published_version_id)
      REFERENCES public.site_page_versions(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Triggers
-- ─────────────────────────────────────────────────────────────────────────────
-- The tablet's delta sync depends on updated_at moving; use the existing helper.
DROP TRIGGER IF EXISTS update_merchant_sites_updated_at ON public.merchant_sites;
CREATE TRIGGER update_merchant_sites_updated_at
  BEFORE UPDATE ON public.merchant_sites
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_site_pages_updated_at ON public.site_pages;
CREATE TRIGGER update_site_pages_updated_at
  BEFORE UPDATE ON public.site_pages
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
-- site_page_versions is immutable; it deliberately gets no updated_at trigger.

-- Tenancy is derived from the parent, never trusted from the client. Defence in
-- depth: even a mis-written policy cannot let a row land in another merchant's
-- tenancy, because merchant_id is not the caller's to set.
CREATE OR REPLACE FUNCTION public.site_pages_derive_tenancy()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  SELECT s.merchant_id INTO NEW.merchant_id
  FROM public.merchant_sites s WHERE s.id = NEW.site_id;

  IF NEW.merchant_id IS NULL THEN
    RAISE EXCEPTION 'site_pages.site_id % does not exist', NEW.site_id;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS site_pages_derive_tenancy_trg ON public.site_pages;
CREATE TRIGGER site_pages_derive_tenancy_trg
  BEFORE INSERT OR UPDATE OF site_id ON public.site_pages
  FOR EACH ROW EXECUTE FUNCTION public.site_pages_derive_tenancy();

CREATE OR REPLACE FUNCTION public.site_page_versions_derive_tenancy()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  SELECT p.site_id, p.merchant_id INTO NEW.site_id, NEW.merchant_id
  FROM public.site_pages p WHERE p.id = NEW.page_id;

  IF NEW.merchant_id IS NULL THEN
    RAISE EXCEPTION 'site_page_versions.page_id % does not exist', NEW.page_id;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS site_page_versions_derive_tenancy_trg ON public.site_page_versions;
CREATE TRIGGER site_page_versions_derive_tenancy_trg
  BEFORE INSERT ON public.site_page_versions
  FOR EACH ROW EXECUTE FUNCTION public.site_page_versions_derive_tenancy();

-- Autosave concurrency token. Bumped only when the document actually changes,
-- so renaming a page does not invalidate an open editor's revision.
CREATE OR REPLACE FUNCTION public.site_pages_bump_revision()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.draft_content IS DISTINCT FROM OLD.draft_content THEN
    NEW.revision := OLD.revision + 1;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS site_pages_bump_revision_trg ON public.site_pages;
CREATE TRIGGER site_pages_bump_revision_trg
  BEFORE UPDATE ON public.site_pages
  FOR EACH ROW EXECUTE FUNCTION public.site_pages_bump_revision();

-- Versions are append-only. Enforce it rather than trusting every future caller.
CREATE OR REPLACE FUNCTION public.site_page_versions_block_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  -- superseded_at is the one field publish/rollback must be able to stamp.
  IF TG_OP = 'UPDATE'
     AND (NEW.content, NEW.content_hash, NEW.version_number, NEW.page_id, NEW.merchant_id)
       IS DISTINCT FROM
         (OLD.content, OLD.content_hash, OLD.version_number, OLD.page_id, OLD.merchant_id)
  THEN
    RAISE EXCEPTION 'site_page_versions is append-only; create a new version instead';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS site_page_versions_block_mutation_trg ON public.site_page_versions;
CREATE TRIGGER site_page_versions_block_mutation_trg
  BEFORE UPDATE ON public.site_page_versions
  FOR EACH ROW EXECUTE FUNCTION public.site_page_versions_block_mutation();

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. RLS
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.merchant_sites     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_pages         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_page_versions ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.merchant_sites     FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.site_pages         FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.site_page_versions FROM PUBLIC, anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.merchant_sites     TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.site_pages         TO authenticated;
GRANT SELECT, INSERT                 ON TABLE public.site_page_versions TO authenticated;
GRANT UPDATE (superseded_at)         ON TABLE public.site_page_versions TO authenticated;

GRANT ALL ON TABLE public.merchant_sites     TO service_role;
GRANT ALL ON TABLE public.site_pages         TO service_role;
GRANT ALL ON TABLE public.site_page_versions TO service_role;

-- WITH CHECK is not optional. USING alone would let a caller MOVE a row into
-- another merchant's tenancy — the most common RLS mistake, and precisely the
-- "zero data bleed" acceptance criterion.
--
-- is_merchant_admin() already includes is_dexapos_admin(), so HQ support access
-- comes along without a separate policy. Blocker B10 ("which role may edit")
-- is deferred: v1 grants merchant owner/admin/manager, matching every other
-- merchant-managed surface. A dedicated `website.edit` permission can be added
-- later by widening these three policies.
DROP POLICY IF EXISTS merchant_sites_merchant_rw ON public.merchant_sites;
CREATE POLICY merchant_sites_merchant_rw ON public.merchant_sites
  FOR ALL TO authenticated
  USING      (public.is_merchant_admin(merchant_id))
  WITH CHECK (public.is_merchant_admin(merchant_id));

DROP POLICY IF EXISTS site_pages_merchant_rw ON public.site_pages;
CREATE POLICY site_pages_merchant_rw ON public.site_pages
  FOR ALL TO authenticated
  USING      (public.is_merchant_admin(merchant_id))
  WITH CHECK (public.is_merchant_admin(merchant_id));

DROP POLICY IF EXISTS site_page_versions_merchant_rw ON public.site_page_versions;
CREATE POLICY site_page_versions_merchant_rw ON public.site_page_versions
  FOR ALL TO authenticated
  USING      (public.is_merchant_admin(merchant_id))
  WITH CHECK (public.is_merchant_admin(merchant_id));
