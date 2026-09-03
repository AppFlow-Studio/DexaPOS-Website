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
