-- ═════════════════════════════════════════════════════════════════════════════
-- Website reservations — columns on existing tables (plan Phase 1)
-- ═════════════════════════════════════════════════════════════════════════════
--
-- Additive only. Nothing is dropped or retyped, so the POS tablet's sync
-- contract for `reservations` is unchanged and an older build keeps working
-- against this schema.
--
-- Two tables are touched:
--   reservations   — what a website booking carries that a staff-typed one does not
--   merchant_sites — the provisioning record for the auto-created page
--
-- Idempotent: safe to re-run.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. A URL-safe, unguessable token generator
-- ─────────────────────────────────────────────────────────────────────────────
-- 256 bits from two uuids rather than `gen_random_bytes`, so this needs no
-- extension on any environment. Hex, therefore lowercase and URL-safe, which
-- matters because the token is a path segment: `/sites/{slug}/r/{token}`.
--
-- Explicitly NOT `confirmation_number` — that is short, human-readable and
-- printed on tickets, and a cancel endpoint keyed on a guessable id lets anyone
-- cancel a stranger's dinner.
CREATE OR REPLACE FUNCTION public.generate_reservation_manage_token()
RETURNS text
LANGUAGE sql
VOLATILE
SET search_path = ''
AS $$
  SELECT replace(gen_random_uuid()::text, '-', '')
      || replace(gen_random_uuid()::text, '-', '');
$$;

COMMENT ON FUNCTION public.generate_reservation_manage_token() IS
  '256-bit lowercase hex token for the public reservation manage page. Never confirmation_number, which is short and guessable.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. reservations
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.reservations
  -- Which service the booking belongs to. Lets the dashboard group a day into
  -- Lunch and Dinner without re-deriving it from the time, and lets a period's
  -- turn time be applied to the bookings it produced even after the period is
  -- edited. SET NULL rather than CASCADE: deleting a service period must never
  -- delete somebody's dinner.
  ADD COLUMN IF NOT EXISTS service_period_id uuid
    REFERENCES public.reservation_service_periods(id) ON DELETE SET NULL,

  -- Structured rather than prose, which is the whole reason the kitchen can act
  -- on them. `special_requests` already exists and still takes the free-text
  -- "Anything else we should know?".
  ADD COLUMN IF NOT EXISTS occasion_tags text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS dietary_tags  text[] NOT NULL DEFAULT '{}',

  -- Consent, recorded per booking rather than per customer, because that is how
  -- it was actually given and how it would have to be evidenced. Note the
  -- asymmetry, which is deliberate and matches the checkout defaults: marketing
  -- is opt-in, transactional messaging about this booking is opt-out.
  ADD COLUMN IF NOT EXISTS marketing_opt_in boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sms_opt_in       boolean NOT NULL DEFAULT true,

  -- The guest's own key to this booking.
  --
  -- ADDED NULLABLE AND WITHOUT A DEFAULT, then given one below. This is not
  -- fussiness: PostgreSQL stores a non-volatile column default as metadata, but
  -- a VOLATILE one — and a token generator has to be volatile, or every row
  -- would get the same token — must be evaluated per row, which rewrites the
  -- whole table under an ACCESS EXCLUSIVE lock. On a merchant with a year of
  -- reservations that is a blocking migration during service.
  --
  -- Nullable is also the honest shape: reservations that predate this column
  -- have no manage page, and inventing tokens for them buys nothing.
  ADD COLUMN IF NOT EXISTS manage_token text,

  -- Who cancelled. `cancelled_at` and `cancellation_reason` already exist but
  -- cannot distinguish a guest cancelling online from a host cancelling at the
  -- pass, and those are different facts — one is self-service working, the
  -- other is a phone call that happened.
  ADD COLUMN IF NOT EXISTS cancelled_by text;

-- Added separately: ADD CONSTRAINT has no IF NOT EXISTS, so re-running the
-- migration would fail on it.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'reservations_cancelled_by_check'
  ) THEN
    ALTER TABLE public.reservations
      ADD CONSTRAINT reservations_cancelled_by_check
      CHECK (cancelled_by IS NULL OR cancelled_by IN ('guest', 'staff', 'system'));
  END IF;
END $$;

-- Applies to rows inserted from now on — a metadata-only change, no rewrite.
-- Every new reservation therefore gets a token, staff-created ones included, so
-- a host can text a guest their manage link without a backfill.
ALTER TABLE public.reservations
  ALTER COLUMN manage_token SET DEFAULT public.generate_reservation_manage_token();

-- One booking per token, and the lookup the manage page runs.
-- Unique rather than a constraint so the pre-existing NULLs are allowed: in
-- PostgreSQL a unique index treats each NULL as distinct, which is exactly the
-- "old rows have no manage page" semantics we want.
CREATE UNIQUE INDEX IF NOT EXISTS reservations_manage_token_idx
  ON public.reservations (manage_token);

-- The index the availability query lives on. Partial on the statuses that
-- actually occupy a table: a cancelled or no-show booking frees its cover, and
-- on a busy location those accumulate until they dominate the table.
-- Kept in step with BLOCKING_STATUSES in lib/reservations/conflict-detection.ts.
CREATE INDEX IF NOT EXISTS reservations_blocking_by_date_idx
  ON public.reservations (location_id, reservation_date, reservation_time)
  WHERE status IN ('pending', 'confirmed', 'reminded', 'arrived', 'seated');

COMMENT ON COLUMN public.reservations.manage_token IS
  'Guest-facing key for /sites/{slug}/r/{token}. Nullable: rows predating the column have no manage page. Defaulted for new rows, so staff-created bookings get one too.';
COMMENT ON COLUMN public.reservations.cancelled_by IS
  'guest = self-service on the website, staff = dashboard or POS, system = automatic.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. merchant_sites — the reservations page provisioning record
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.merchant_sites
  -- Where the auto-created page currently lives. SET NULL because a merchant
  -- may delete it, and a dangling id would break the Settings screen's
  -- "your page is live at …" link.
  ADD COLUMN IF NOT EXISTS reservations_page_id uuid
    REFERENCES public.site_pages(id) ON DELETE SET NULL,

  -- Set once, at first provision, and NEVER CLEARED — not when the page is
  -- deleted, not when reservations are switched off.
  --
  -- This is the whole "do not resurrect" guarantee. Without it, provisioning
  -- would key off `reservations_page_id IS NULL`, and a merchant who
  -- deliberately deleted the page would find it recreated the next time they
  -- saved a setting. A page that grows back is worse than no page.
  ADD COLUMN IF NOT EXISTS reservations_page_provisioned_at timestamptz;

COMMENT ON COLUMN public.merchant_sites.reservations_page_provisioned_at IS
  'Set once at first provision and never cleared. Provisioning checks THIS, not reservations_page_id, so a deliberately deleted page is never recreated.';

COMMIT;
