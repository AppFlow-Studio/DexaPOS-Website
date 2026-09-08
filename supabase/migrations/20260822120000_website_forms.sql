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
