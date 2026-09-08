-- ═════════════════════════════════════════════════════════════════════════════
-- Website reservations — availability model (plan Phase 1)
-- ═════════════════════════════════════════════════════════════════════════════
--
-- Everything needed to answer "what times can a stranger book?" and to hold a
-- slot while they type. The booking itself still lands in `public.reservations`,
-- which this migration does not restructure — see the companion migration
-- 20260828120100_reservations_website_columns.sql for the additive columns.
--
-- Five tables:
--   reservation_service_periods — when we seat, how far apart, how far ahead
--   reservation_blackouts       — days and windows we do not seat at all
--   reservation_holds           — the 5-minute hold behind the checkout timer
--   reservation_settings        — per-location config that is not a period
--   reservation_alerts          — "tell me if something opens up"
--
-- TWO LEVELS OF CONFIGURATION, and conflating them is the mistake to avoid.
-- The reservations *page* and its nav link are site-wide and live in
-- `merchant_sites` (see lib/site-builder/site-settings.ts). Service hours and
-- table inventory are per location and live here. A merchant whose Downtown
-- branch takes bookings and whose Airport kiosk does not needs both.
--
-- NO ANON POLICY ON ANY TABLE HERE, and none is coming. Availability is served
-- by the SECURITY DEFINER function in the Phase 2 migration, which returns slot
-- times and nothing else; writes go through a service-role client in a
-- rate-limited route handler. Same reasoning as site_form_submissions: an
-- endpoint that answers "3 of 12 tables left" is a competitor-intelligence feed,
-- and a public write policy is one predicate mistake away from a data leak.
--
-- Idempotent: safe to re-run.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. reservation_service_periods
-- ─────────────────────────────────────────────────────────────────────────────
-- The concept the schema has no equivalent of today. `locations.business_hours`
-- says when the door is open; it says nothing about when we seat, how far apart
-- slots sit, or how far ahead the book opens — and those are different answers.
-- A kitchen open 11:00–23:00 may seat lunch 11:30–14:00 and dinner 17:00–22:00
-- with a two-hour gap nobody may book into.
CREATE TABLE IF NOT EXISTS public.reservation_service_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id uuid NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,

  -- Renders as the second line inside a slot button — '7:00 PM' over 'DINNER'.
  -- That label is the whole reason one grid can cover two services without a
  -- separate selector, so it is a real column rather than something derived
  -- from the start time.
  name text NOT NULL,

  -- 0=Sunday … 6=Saturday, matching EXTRACT(DOW). Stored as an array rather
  -- than seven booleans or a row per day: a period is one thing a merchant
  -- edits as one thing, and "Tue–Sun dinner" should not be six rows that can
  -- drift apart.
  days_of_week smallint[] NOT NULL,

  start_time time NOT NULL,
  -- The LAST SEATING, not closing time. A merchant who types their closing
  -- time here will offer a 22:00 slot at a restaurant that stops seating at
  -- 21:00; the settings screen says so in as many words.
  end_time time NOT NULL,

  slot_interval_min smallint NOT NULL DEFAULT 15,

  -- Overrides floor_plan_objects.default_turn_time for website bookings.
  -- Per-period is the more useful knob — lunch turns faster than dinner — at
  -- the cost of ignoring the per-table value that the POS still honours. A
  -- deliberate inconsistency, recorded here so it is not later "fixed" by
  -- accident.
  turn_time_min smallint NOT NULL DEFAULT 90,

  min_party_size smallint NOT NULL DEFAULT 1,
  max_party_size smallint NOT NULL DEFAULT 8,

  -- No bookings inside this window. Stops a guest booking a table for six
  -- minutes from now, which the kitchen cannot honour and the host will have to
  -- phone about.
  lead_time_min integer NOT NULL DEFAULT 60,
  max_advance_days smallint NOT NULL DEFAULT 60,

  -- NULL = derive capacity from reservable tables, which is the accurate path
  -- and the default. A number here is a hard pacing cap applied IN ADDITION to
  -- table inventory, and it is also the fallback that lets a merchant with no
  -- floor plan take bookings at all.
  max_covers_per_slot smallint,

  is_active boolean NOT NULL DEFAULT true,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT reservation_service_periods_window
    CHECK (start_time < end_time),
  -- `cardinality`, not `array_length`: the latter returns NULL for an empty
  -- array, a NULL check passes, and `'{}' <@ anything` is true — so the obvious
  -- spelling of this constraint would silently admit a period that runs on no
  -- days at all and renders an empty grid forever.
  CONSTRAINT reservation_service_periods_days
    CHECK (
      cardinality(days_of_week) BETWEEN 1 AND 7
      AND days_of_week <@ ARRAY[0,1,2,3,4,5,6]::smallint[]
    ),
  -- The intervals a grid can actually be laid out on. An arbitrary number
  -- (7 minutes) produces slot times no guest reads as a time.
  CONSTRAINT reservation_service_periods_interval
    CHECK (slot_interval_min IN (5, 10, 15, 20, 30, 60)),
  CONSTRAINT reservation_service_periods_turn_time
    CHECK (turn_time_min BETWEEN 15 AND 480),
  CONSTRAINT reservation_service_periods_party_range
    CHECK (min_party_size >= 1 AND max_party_size >= min_party_size AND max_party_size <= 100),
  CONSTRAINT reservation_service_periods_lead_time
    CHECK (lead_time_min >= 0 AND lead_time_min <= 43200),
  CONSTRAINT reservation_service_periods_advance
    CHECK (max_advance_days BETWEEN 1 AND 365),
  CONSTRAINT reservation_service_periods_covers
    CHECK (max_covers_per_slot IS NULL OR max_covers_per_slot > 0)
);

CREATE INDEX IF NOT EXISTS reservation_service_periods_location_idx
  ON public.reservation_service_periods (location_id)
  WHERE is_active;

COMMENT ON TABLE public.reservation_service_periods IS
  'When a location seats, at what interval, and how far ahead. end_time is the last seating, not closing time. max_covers_per_slot NULL means derive capacity from reservable tables.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. reservation_blackouts
-- ─────────────────────────────────────────────────────────────────────────────
-- Private events and holidays. Cheap, and the first thing a merchant asks for
-- after they find their New Year's Eve buyout on public sale.
CREATE TABLE IF NOT EXISTS public.reservation_blackouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id uuid NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,

  date date NOT NULL,
  -- Both NULL = the whole day is closed. Otherwise the window that is closed,
  -- so a merchant can sell a lunch service on a day they have booked out the
  -- evening.
  start_time time,
  end_time time,
  reason text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT reservation_blackouts_window
    CHECK (
      (start_time IS NULL AND end_time IS NULL)
      OR (start_time IS NOT NULL AND end_time IS NOT NULL AND start_time < end_time)
    )
);

CREATE INDEX IF NOT EXISTS reservation_blackouts_location_date_idx
  ON public.reservation_blackouts (location_id, date);

COMMENT ON TABLE public.reservation_blackouts IS
  'Days and windows a location does not seat. Both times NULL means the whole day.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. reservation_holds
-- ─────────────────────────────────────────────────────────────────────────────
-- The five-minute hold behind the checkout countdown.
--
-- A SEPARATE TABLE, NOT A `reservations` ROW WITH A NEW STATUS. Abandoned
-- checkouts are the common case, not the exception — most people who tap a time
-- never finish. Modelling them as reservations would mean a dashboard full of
-- ghosts, a new enum value every reader has to learn, and a `reservations` table
-- whose row count is dominated by things that never happened.
--
-- CORRECTNESS MUST NOT DEPEND ON THE SWEEPER RUNNING. Every read filters on
-- `expires_at`, so an expired row is already inert; the daily cron is
-- housekeeping, not a load-bearing part of the design.
CREATE TABLE IF NOT EXISTS public.reservation_holds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id uuid NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  service_period_id uuid NOT NULL
    REFERENCES public.reservation_service_periods(id) ON DELETE CASCADE,

  reservation_date date NOT NULL,
  reservation_time time NOT NULL,
  party_size integer NOT NULL,

  -- The specific tables held. Empty only in the cover-pacing fallback, where
  -- there is no floor plan to assign from.
  table_ids uuid[] NOT NULL DEFAULT '{}',

  -- Opaque, returned to the browser, and the only thing the booking request
  -- presents to claim this hold. Not derived from anything guessable.
  token text NOT NULL UNIQUE,

  expires_at timestamptz NOT NULL,

  -- Set when the hold becomes a booking. Kept rather than deleted so a
  -- double-submit finds the converted hold and can return the existing
  -- reservation instead of creating a second one.
  converted_reservation_id uuid REFERENCES public.reservations(id) ON DELETE SET NULL,

  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT reservation_holds_party_size CHECK (party_size > 0)
);

-- The index the availability query lives on: live holds for one location on one
-- date. Partial, because expired and converted rows are the overwhelming
-- majority within hours of launch and none of them affect availability.
CREATE INDEX IF NOT EXISTS reservation_holds_live_idx
  ON public.reservation_holds (location_id, reservation_date)
  WHERE converted_reservation_id IS NULL;

CREATE INDEX IF NOT EXISTS reservation_holds_expiry_idx
  ON public.reservation_holds (expires_at)
  WHERE converted_reservation_id IS NULL;

COMMENT ON TABLE public.reservation_holds IS
  'Five-minute slot holds backing the checkout countdown. Separate from reservations because most holds are abandoned. Every read filters on expires_at, so correctness does not depend on the sweeper.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. reservation_settings
-- ─────────────────────────────────────────────────────────────────────────────
-- Per-location config that is not a service period. One row per location,
-- created lazily the first time a merchant configures one.
CREATE TABLE IF NOT EXISTS public.reservation_settings (
  location_id uuid PRIMARY KEY REFERENCES public.locations(id) ON DELETE CASCADE,
  merchant_id uuid NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,

  -- Whether THIS location takes bookings. The site-wide on/off that creates the
  -- page and the nav link lives on merchant_sites; this is the per-branch half.
  -- A location is only offered in the public location picker when this is true
  -- AND it has an active service period AND it has either reservable tables or
  -- a max_covers_per_slot — anything less would list a branch whose grid is
  -- permanently empty.
  accepts_reservations boolean NOT NULL DEFAULT false,

  -- The body behind the required "Cancellation Policy" checkbox at checkout,
  -- and the text shown on the guest's manage page.
  booking_policy text,

  notify_emails text[] NOT NULL DEFAULT '{}',

  collect_birthday boolean NOT NULL DEFAULT false,

  -- The tag lists the checkout accordions offer. Structured choices rather than
  -- free text is the whole reason the kitchen can be told "gluten-free" in a
  -- way it can act on.
  occasion_tags text[] NOT NULL DEFAULT '{}',
  dietary_tags text[] NOT NULL DEFAULT '{}',

  -- How close to the booking a guest may still cancel themselves. Past it the
  -- manage page shows the venue phone number instead of a Cancel button.
  cancellation_cutoff_min integer NOT NULL DEFAULT 120,

  -- Shown instead of an empty grid when the requested party exceeds
  -- max_party_size: "For parties of 9 or more, please call us at …". Turns a
  -- dead end into a phone call the merchant wants.
  large_party_phone text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT reservation_settings_cutoff
    CHECK (cancellation_cutoff_min >= 0 AND cancellation_cutoff_min <= 20160)
);

COMMENT ON TABLE public.reservation_settings IS
  'Per-location reservation config. accepts_reservations is the per-branch half; the site-wide switch that creates the page and nav link lives on merchant_sites.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. reservation_alerts
-- ─────────────────────────────────────────────────────────────────────────────
-- "Tell me if something opens up." Turns a sold-out night — the moment a
-- restaurant otherwise loses a customer entirely — into a captured lead.
-- Written in Phase 9; the table lands now so the schema settles in one pass.
CREATE TABLE IF NOT EXISTS public.reservation_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id uuid NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,

  reservation_date date NOT NULL,
  window_start time NOT NULL,
  window_end time NOT NULL,
  party_size integer NOT NULL,

  name text NOT NULL,
  email text,
  phone text,

  notify_email boolean NOT NULL DEFAULT true,
  notify_sms boolean NOT NULL DEFAULT false,

  notified_at timestamptz,
  -- Swept after the date passes. An alert for last Tuesday is noise.
  expires_at timestamptz NOT NULL,

  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT reservation_alerts_window CHECK (window_start < window_end),
  CONSTRAINT reservation_alerts_party_size CHECK (party_size > 0),
  -- A channel with no address is an alert that can never be delivered.
  CONSTRAINT reservation_alerts_reachable
    CHECK (
      (notify_email AND email IS NOT NULL)
      OR (notify_sms AND phone IS NOT NULL)
    )
);

CREATE INDEX IF NOT EXISTS reservation_alerts_match_idx
  ON public.reservation_alerts (location_id, reservation_date)
  WHERE notified_at IS NULL;

COMMENT ON TABLE public.reservation_alerts IS
  'Priority alerts: notify a guest when a slot opens on a date they wanted. Matched when a reservation is cancelled.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Tenancy derived, never supplied
-- ─────────────────────────────────────────────────────────────────────────────
-- The same pattern as site_forms: merchant_id is read off the parent rather
-- than trusted from the writer. Load-bearing here rather than merely tidy —
-- holds and alerts are inserted by a service-role client on behalf of an
-- anonymous stranger, so the row's tenancy must not be something the request
-- can influence at all.
CREATE OR REPLACE FUNCTION public.reservation_derive_tenancy()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  SELECT l.merchant_id INTO NEW.merchant_id
  FROM public.locations l WHERE l.id = NEW.location_id;

  IF NEW.merchant_id IS NULL THEN
    RAISE EXCEPTION 'location_id % does not exist', NEW.location_id;
  END IF;
  RETURN NEW;
END $$;

COMMENT ON FUNCTION public.reservation_derive_tenancy() IS
  'Fills merchant_id from the parent location. Shared by every reservation-availability table so an anonymous writer cannot choose its own tenancy.';

DROP TRIGGER IF EXISTS reservation_service_periods_tenancy_trg ON public.reservation_service_periods;
CREATE TRIGGER reservation_service_periods_tenancy_trg
  BEFORE INSERT OR UPDATE OF location_id ON public.reservation_service_periods
  FOR EACH ROW EXECUTE FUNCTION public.reservation_derive_tenancy();

DROP TRIGGER IF EXISTS reservation_blackouts_tenancy_trg ON public.reservation_blackouts;
CREATE TRIGGER reservation_blackouts_tenancy_trg
  BEFORE INSERT OR UPDATE OF location_id ON public.reservation_blackouts
  FOR EACH ROW EXECUTE FUNCTION public.reservation_derive_tenancy();

DROP TRIGGER IF EXISTS reservation_holds_tenancy_trg ON public.reservation_holds;
CREATE TRIGGER reservation_holds_tenancy_trg
  BEFORE INSERT OR UPDATE OF location_id ON public.reservation_holds
  FOR EACH ROW EXECUTE FUNCTION public.reservation_derive_tenancy();

DROP TRIGGER IF EXISTS reservation_settings_tenancy_trg ON public.reservation_settings;
CREATE TRIGGER reservation_settings_tenancy_trg
  BEFORE INSERT OR UPDATE OF location_id ON public.reservation_settings
  FOR EACH ROW EXECUTE FUNCTION public.reservation_derive_tenancy();

DROP TRIGGER IF EXISTS reservation_alerts_tenancy_trg ON public.reservation_alerts;
CREATE TRIGGER reservation_alerts_tenancy_trg
  BEFORE INSERT OR UPDATE OF location_id ON public.reservation_alerts
  FOR EACH ROW EXECUTE FUNCTION public.reservation_derive_tenancy();

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. updated_at, for tablet delta sync
-- ─────────────────────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS update_reservation_service_periods_updated_at ON public.reservation_service_periods;
CREATE TRIGGER update_reservation_service_periods_updated_at
  BEFORE UPDATE ON public.reservation_service_periods
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_reservation_blackouts_updated_at ON public.reservation_blackouts;
CREATE TRIGGER update_reservation_blackouts_updated_at
  BEFORE UPDATE ON public.reservation_blackouts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_reservation_settings_updated_at ON public.reservation_settings;
CREATE TRIGGER update_reservation_settings_updated_at
  BEFORE UPDATE ON public.reservation_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. RLS
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.reservation_service_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reservation_blackouts       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reservation_holds           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reservation_settings        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reservation_alerts          ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS reservation_service_periods_merchant_rw ON public.reservation_service_periods;
CREATE POLICY reservation_service_periods_merchant_rw ON public.reservation_service_periods
  FOR ALL TO authenticated
  USING      (public.is_merchant_admin(merchant_id))
  WITH CHECK (public.is_merchant_admin(merchant_id));

DROP POLICY IF EXISTS reservation_blackouts_merchant_rw ON public.reservation_blackouts;
CREATE POLICY reservation_blackouts_merchant_rw ON public.reservation_blackouts
  FOR ALL TO authenticated
  USING      (public.is_merchant_admin(merchant_id))
  WITH CHECK (public.is_merchant_admin(merchant_id));

DROP POLICY IF EXISTS reservation_settings_merchant_rw ON public.reservation_settings;
CREATE POLICY reservation_settings_merchant_rw ON public.reservation_settings
  FOR ALL TO authenticated
  USING      (public.is_merchant_admin(merchant_id))
  WITH CHECK (public.is_merchant_admin(merchant_id));

-- Holds and alerts carry strangers' details and are written by the service role
-- on their behalf. Merchants may read them — a host wants to see who is
-- waiting, and an abandoned-checkout count is genuinely useful — but nothing
-- anonymous gets row access to any table in this migration.
DROP POLICY IF EXISTS reservation_holds_merchant_rw ON public.reservation_holds;
CREATE POLICY reservation_holds_merchant_rw ON public.reservation_holds
  FOR ALL TO authenticated
  USING      (public.is_merchant_admin(merchant_id))
  WITH CHECK (public.is_merchant_admin(merchant_id));

DROP POLICY IF EXISTS reservation_alerts_merchant_rw ON public.reservation_alerts;
CREATE POLICY reservation_alerts_merchant_rw ON public.reservation_alerts
  FOR ALL TO authenticated
  USING      (public.is_merchant_admin(merchant_id))
  WITH CHECK (public.is_merchant_admin(merchant_id));

COMMIT;
