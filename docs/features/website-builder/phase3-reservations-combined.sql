-- GENERATED — do not edit. Run in this order:
--   supabase/migrations/20260828150000_reservation_occupancy_function.sql
--   supabase/migrations/20260828160000_reservation_public_write.sql
-- 150000 must run first: 160000 calls reservation_occupancy().

-- ═════════════════════════════════════════════════════════════════════════════
-- Website reservations — extract "what is occupying a table" (plan Phase 3)
-- ═════════════════════════════════════════════════════════════════════════════
--
-- The availability function landed with the three-source occupancy union
-- inlined. The write path needs exactly the same union — and needs it to mean
-- exactly the same thing, or the grid a guest is shown and the check that
-- accepts their booking can disagree, which is precisely how a double booking
-- happens.
--
-- So this migration lifts it into one function and rewrites the availability
-- function to call it. **No behaviour change** — the same three sources, the
-- same filters, the same half-open comparisons. `source_id` is the only
-- addition, and it exists because the booking function has to exclude the very
-- hold it is converting: that hold occupies the tables it is about to claim,
-- so counting it would reject every booking.
--
-- Idempotent: safe to re-run.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. reservation_occupancy
-- ─────────────────────────────────────────────────────────────────────────────
-- Everything holding a table at a location on a date, from all three sources,
-- in one shape. A booking, a live hold and a seated walk-in occupy a table
-- identically; the only reason to tell them apart here is `source_id`.
CREATE OR REPLACE FUNCTION public.reservation_occupancy(
  p_location_id uuid,
  p_date        date
)
RETURNS TABLE (
  source     text,
  source_id  uuid,
  table_ids  uuid[],
  start_min  integer,
  end_min    integer,
  party_size integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_timezone text;
BEGIN
  SELECT COALESCE(NULLIF(l.timezone, ''), 'UTC') INTO v_timezone
  FROM locations l WHERE l.id = p_location_id;

  IF v_timezone IS NULL THEN RETURN; END IF;

  RETURN QUERY
  -- Confirmed and in-progress bookings. Statuses kept in step with
  -- BLOCKING_STATUSES in lib/reservations/conflict-detection.ts.
  SELECT
    'reservation'::text,
    r.id,
    COALESCE(r.assigned_table_ids, '{}')::uuid[],
    (EXTRACT(HOUR FROM r.reservation_time) * 60
     + EXTRACT(MINUTE FROM r.reservation_time))::int,
    (EXTRACT(HOUR FROM r.reservation_time) * 60
     + EXTRACT(MINUTE FROM r.reservation_time))::int
     + COALESCE(r.duration_minutes, 90),
    r.party_size
  FROM reservations r
  WHERE r.location_id = p_location_id
    AND r.reservation_date = p_date
    AND r.status IN ('pending', 'confirmed', 'reminded', 'arrived', 'seated')

  UNION ALL

  -- Live holds only. An expired hold is invisible here rather than swept, which
  -- is why correctness never depends on the cron running.
  SELECT
    'hold'::text,
    h.id,
    h.table_ids,
    (EXTRACT(HOUR FROM h.reservation_time) * 60
     + EXTRACT(MINUTE FROM h.reservation_time))::int,
    (EXTRACT(HOUR FROM h.reservation_time) * 60
     + EXTRACT(MINUTE FROM h.reservation_time))::int
     + COALESCE((SELECT sp.turn_time_min FROM reservation_service_periods sp
                 WHERE sp.id = h.service_period_id), 90),
    h.party_size
  FROM reservation_holds h
  WHERE h.location_id = p_location_id
    AND h.reservation_date = p_date
    AND h.converted_reservation_id IS NULL
    AND h.expires_at > now()

  UNION ALL

  -- Parties currently sitting down, walk-ins included. Without this a website
  -- guest can book a table that someone is eating at.
  SELECT
    'session'::text,
    ts.id,
    ARRAY(
      SELECT tst.table_id FROM table_session_tables tst
      WHERE tst.session_id = ts.id AND COALESCE(tst.is_active, true)
    ),
    (EXTRACT(HOUR FROM (ts.seated_at AT TIME ZONE v_timezone)) * 60
     + EXTRACT(MINUTE FROM (ts.seated_at AT TIME ZONE v_timezone)))::int,
    (EXTRACT(HOUR FROM (ts.seated_at AT TIME ZONE v_timezone)) * 60
     + EXTRACT(MINUTE FROM (ts.seated_at AT TIME ZONE v_timezone)))::int
     + COALESCE(ts.estimated_duration, 90),
    ts.party_size
  FROM table_sessions ts
  WHERE ts.location_id = p_location_id
    AND COALESCE(ts.is_active, true)
    AND ts.cleared_at IS NULL
    AND ts.seated_at IS NOT NULL
    AND (ts.seated_at AT TIME ZONE v_timezone)::date = p_date;
END $$;

COMMENT ON FUNCTION public.reservation_occupancy(uuid, date) IS
  'Every booking, live hold and seated session occupying a table at one location on one date. The single definition of "occupied", shared by the availability grid and the booking re-check so the two cannot disagree.';

REVOKE ALL ON FUNCTION public.reservation_occupancy(uuid, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reservation_occupancy(uuid, date) TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Availability, rewritten onto it
-- ─────────────────────────────────────────────────────────────────────────────
-- Identical behaviour to 20260828140000; the occupancy CTE is now a call.
CREATE OR REPLACE FUNCTION public.get_public_reservation_availability(
  p_site_id     uuid,
  p_location_id uuid,
  p_date        date,
  p_party_size  integer
)
RETURNS TABLE (
  slot_time         time,
  service_period_id uuid,
  service_name      text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_merchant_id uuid;
  v_timezone    text;
  v_now_local   timestamp;
  v_today       date;
  v_now_minutes integer;
  v_has_tables  boolean;
BEGIN
  -- Scoped by site, not just by location: a location id is harvestable from
  -- page HTML and only means anything under the site that owns it.
  SELECT l.merchant_id, l.timezone
    INTO v_merchant_id, v_timezone
  FROM merchant_sites ms
  JOIN locations l ON l.merchant_id = ms.merchant_id
  WHERE ms.id = p_site_id
    AND l.id   = p_location_id
    AND l.is_active
    AND ms.features->>'reservations'  = 'true'
    AND ms.brand->>'reservationMode'  = 'native';

  IF v_merchant_id IS NULL THEN RETURN; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM reservation_settings rs
    WHERE rs.location_id = p_location_id AND rs.accepts_reservations
  ) THEN RETURN; END IF;

  IF p_party_size IS NULL OR p_party_size < 1 THEN RETURN; END IF;

  IF EXISTS (
    SELECT 1 FROM reservation_blackouts b
    WHERE b.location_id = p_location_id AND b.date = p_date AND b.start_time IS NULL
  ) THEN RETURN; END IF;

  -- Wall clock at the restaurant, never UTC and never the visitor's browser.
  v_now_local   := (now() AT TIME ZONE COALESCE(NULLIF(v_timezone, ''), 'UTC'));
  v_today       := v_now_local::date;
  v_now_minutes := (EXTRACT(HOUR FROM v_now_local) * 60
                  + EXTRACT(MINUTE FROM v_now_local))::int;

  IF p_date < v_today THEN RETURN; END IF;

  SELECT EXISTS (
    SELECT 1 FROM floor_plan_objects fpo
    WHERE fpo.location_id = p_location_id AND fpo.is_active
      AND COALESCE(fpo.is_reservable, true)
      AND fpo.category IN ('table', 'booth') AND COALESCE(fpo.capacity, 0) > 0
  ) INTO v_has_tables;

  RETURN QUERY
  WITH periods AS (
    SELECT sp.*
    FROM reservation_service_periods sp
    WHERE sp.location_id = p_location_id
      AND sp.is_active
      AND EXTRACT(DOW FROM p_date)::smallint = ANY (sp.days_of_week)
      AND p_party_size BETWEEN sp.min_party_size AND sp.max_party_size
      AND (p_date - v_today) <= sp.max_advance_days
  ),
  seatable AS (
    SELECT fpo.id, fpo.capacity,
           COALESCE(fpo.min_capacity, 1) AS min_capacity,
           COALESCE(fpo.is_combinable, true) AS is_combinable
    FROM floor_plan_objects fpo
    WHERE fpo.location_id = p_location_id AND fpo.is_active
      AND COALESCE(fpo.is_reservable, true)
      -- Walls, decor and zones are not tables.
      AND fpo.category IN ('table', 'booth')
      AND COALESCE(fpo.capacity, 0) > 0
  ),
  occ AS (
    SELECT * FROM public.reservation_occupancy(p_location_id, p_date)
  ),
  slots AS (
    SELECT p.id AS period_id, p.name AS period_name, p.turn_time_min,
           p.lead_time_min, p.max_covers_per_slot, gs AS start_min
    FROM periods p
    CROSS JOIN LATERAL generate_series(
      (EXTRACT(HOUR FROM p.start_time) * 60 + EXTRACT(MINUTE FROM p.start_time))::int,
      -- Inclusive: end_time is the LAST SEATING, not closing time.
      (EXTRACT(HOUR FROM p.end_time) * 60 + EXTRACT(MINUTE FROM p.end_time))::int,
      p.slot_interval_min
    ) AS gs
  ),
  filtered AS (
    SELECT s.* FROM slots s
    WHERE NOT EXISTS (
        SELECT 1 FROM reservation_blackouts b
        WHERE b.location_id = p_location_id AND b.date = p_date
          AND b.start_time IS NOT NULL
          AND s.start_min >= (EXTRACT(HOUR FROM b.start_time) * 60
                            + EXTRACT(MINUTE FROM b.start_time))::int
          AND s.start_min <  (EXTRACT(HOUR FROM b.end_time) * 60
                            + EXTRACT(MINUTE FROM b.end_time))::int
      )
      -- Lead time and "already past" are the same comparison; only today fails it.
      AND (p_date > v_today OR s.start_min >= v_now_minutes + s.lead_time_min)
      -- Covers seated AT this slot, not everyone in the room: the constraint is
      -- the kitchen firing a wave of tables, not dining-room size.
      AND (
        s.max_covers_per_slot IS NULL
        OR COALESCE((SELECT SUM(o.party_size) FROM occ o
                     WHERE o.start_min = s.start_min), 0) + p_party_size
           <= s.max_covers_per_slot
      )
  )
  SELECT make_time(f.start_min / 60, f.start_min % 60, 0),
         f.period_id,
         f.period_name
  FROM filtered f
  WHERE
    CASE
      WHEN NOT v_has_tables THEN
        -- Cover-pacing fallback, already applied above. No cap and no tables is
        -- a misconfiguration; offering nothing is the safe reading.
        f.max_covers_per_slot IS NOT NULL
      ELSE
        -- The fit test. Equivalent to the TypeScript engine's enumeration:
        -- every table in a valid set must satisfy the party's minimum, and
        -- among those the k largest maximise the total — so a set of at most k
        -- exists exactly when the top k suffice. k = 3 matches
        -- DEFAULT_MAX_TABLES_PER_PARTY. Singles are asked separately because a
        -- single table need not be combinable.
        EXISTS (
          SELECT 1 FROM seatable t
          WHERE t.min_capacity <= p_party_size
            AND t.capacity     >= p_party_size
            AND NOT EXISTS (
              SELECT 1 FROM occ o
              WHERE t.id = ANY (o.table_ids)
                -- Half-open: a table turning at 19:00 is free at 19:00.
                AND f.start_min < o.end_min
                AND o.start_min < f.start_min + f.turn_time_min
            )
        )
        OR COALESCE((
             SELECT SUM(x.capacity) FROM (
               SELECT t.capacity FROM seatable t
               WHERE t.is_combinable
                 AND t.min_capacity <= p_party_size
                 AND NOT EXISTS (
                   SELECT 1 FROM occ o
                   WHERE t.id = ANY (o.table_ids)
                     AND f.start_min < o.end_min
                     AND o.start_min < f.start_min + f.turn_time_min
                 )
               ORDER BY t.capacity DESC
               LIMIT 3
             ) x
           ), 0) >= p_party_size
    END
  ORDER BY 1;
END $$;

COMMIT;

-- ═════════════════════════════════════════════════════════════════════════════
-- Website reservations — the public write path (plan Phase 3)
-- ═════════════════════════════════════════════════════════════════════════════
--
-- Four functions:
--   create_public_reservation_hold  — claim tables for five minutes
--   create_public_reservation       — turn a hold into a booking
--   get_public_reservation_by_token — what the guest's manage page shows
--   cancel_public_reservation       — the guest cancelling themselves
--
-- ALL GRANTED TO service_role ONLY, never to anon. The route handler is the
-- authenticator — it rate-limits, screens bots and validates the payload — and
-- these are the atomic writers. Splitting those two jobs is deliberate: an
-- anon-callable writer would have to do its own abuse control in plpgsql, and
-- an application-side writer could not hold a transaction open across the
-- check and the insert, which is the only thing that stops a double booking.
--
-- THE CONCURRENCY MODEL, in one paragraph. Availability is advisory: by the
-- time a guest picks 19:00, the grid they are looking at may be stale. So both
-- writers take `pg_advisory_xact_lock` on (location, date) before they look at
-- anything, re-check the tables inside that lock, and release it at commit.
-- Two simultaneous bookings of the last table therefore serialise: the first
-- wins, the second re-reads and finds the table gone. Without the lock, both
-- would read "free" and both would insert.
--
-- Idempotent: safe to re-run.

BEGIN;

-- How long a slot is held while the guest fills in the checkout form. Matches
-- the countdown in the sticky header — if these ever disagree, the guest
-- watches a timer that means nothing.
CREATE OR REPLACE FUNCTION public.reservation_hold_minutes()
RETURNS integer LANGUAGE sql IMMUTABLE SET search_path = '' AS $$ SELECT 5 $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. create_public_reservation_hold
-- ─────────────────────────────────────────────────────────────────────────────
-- Picks the tables and claims them. Returns NULL when the slot cannot be held,
-- and the caller turns that into the same generic failure it returns for a bad
-- site id — a hold endpoint that distinguishes "no such venue" from "just taken"
-- tells a scraper which is which.
CREATE OR REPLACE FUNCTION public.create_public_reservation_hold(
  p_site_id     uuid,
  p_location_id uuid,
  p_date        date,
  p_time        time,
  p_party_size  integer
)
RETURNS json
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_merchant_id uuid;
  v_period      reservation_service_periods%ROWTYPE;
  v_start_min   int;
  v_end_min     int;
  v_table_ids   uuid[];
  v_token       text;
  v_expires     timestamptz;
  v_has_tables  boolean;
BEGIN
  -- The same gate as the availability function, for the same reason: a
  -- location id is harvestable from page HTML, so it only means anything in the
  -- context of the site that owns it.
  SELECT l.merchant_id INTO v_merchant_id
  FROM merchant_sites ms
  JOIN locations l ON l.merchant_id = ms.merchant_id
  WHERE ms.id = p_site_id AND l.id = p_location_id AND l.is_active
    AND ms.features->>'reservations' = 'true'
    AND ms.brand->>'reservationMode' = 'native';

  IF v_merchant_id IS NULL THEN RETURN NULL; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM reservation_settings rs
    WHERE rs.location_id = p_location_id AND rs.accepts_reservations
  ) THEN RETURN NULL; END IF;

  -- Serialise every writer touching this location on this date. Transaction
  -- scoped, so it is released on COMMIT or ROLLBACK without any unlock call.
  PERFORM pg_advisory_xact_lock(hashtext(p_location_id::text || p_date::text));

  -- The slot must still be one the availability function would offer. Calling
  -- it rather than re-deriving the rules is what keeps the hold honest about
  -- lead time, blackouts, party limits and the booking window.
  SELECT sp.* INTO v_period
  FROM reservation_service_periods sp
  JOIN get_public_reservation_availability(p_site_id, p_location_id, p_date, p_party_size) a
    ON a.service_period_id = sp.id AND a.slot_time = p_time
  LIMIT 1;

  IF v_period.id IS NULL THEN RETURN NULL; END IF;

  v_start_min := (EXTRACT(HOUR FROM p_time) * 60 + EXTRACT(MINUTE FROM p_time))::int;
  v_end_min   := v_start_min + v_period.turn_time_min;

  SELECT EXISTS (
    SELECT 1 FROM floor_plan_objects fpo
    WHERE fpo.location_id = p_location_id AND fpo.is_active
      AND COALESCE(fpo.is_reservable, true)
      AND fpo.category IN ('table', 'booth') AND COALESCE(fpo.capacity, 0) > 0
  ) INTO v_has_tables;

  IF v_has_tables THEN
    -- Which tables, not just whether. The availability function answers only
    -- "does something fit"; a hold has to name the tables, or it holds nothing.
    WITH free AS (
      SELECT fpo.id, fpo.capacity, COALESCE(fpo.is_combinable, true) AS is_combinable
      FROM floor_plan_objects fpo
      WHERE fpo.location_id = p_location_id AND fpo.is_active
        AND COALESCE(fpo.is_reservable, true)
        AND fpo.category IN ('table', 'booth')
        AND COALESCE(fpo.capacity, 0) > 0
        AND COALESCE(fpo.min_capacity, 1) <= p_party_size
        AND NOT EXISTS (
          SELECT 1 FROM public.reservation_occupancy(p_location_id, p_date) o
          WHERE fpo.id = ANY (o.table_ids)
            AND v_start_min < o.end_min AND o.start_min < v_end_min
        )
    ),
    -- Otherwise the fewest combinable tables that add up, largest first. The
    -- window function takes tables while the running total BEFORE this one is
    -- still short, which is exactly the minimal prefix that reaches the party
    -- size — and `LIMIT 3` enforces the same ceiling as the fit test.
    combo AS (
      SELECT array_agg(r.id) AS ids, COALESCE(SUM(r.capacity), 0) AS seats
      FROM (
        SELECT id, capacity FROM (
          SELECT id, capacity,
                 SUM(capacity) OVER (ORDER BY capacity DESC, id) AS running
          FROM free WHERE is_combinable
        ) w
        WHERE w.running - w.capacity < p_party_size
        LIMIT 3
      ) r
    )
    SELECT COALESCE(
      -- Best fit first: the smallest single table that seats them, so the big
      -- round survives for a party that actually needs it.
      (SELECT ARRAY[f.id] FROM free f
        WHERE f.capacity >= p_party_size ORDER BY f.capacity ASC LIMIT 1),
      -- The prefix can still fall short — three tables that total 8 cannot seat
      -- 10 — so it only counts once it demonstrably adds up.
      (SELECT c.ids FROM combo c WHERE c.seats >= p_party_size)
    ) INTO v_table_ids;

    IF v_table_ids IS NULL OR cardinality(v_table_ids) = 0 THEN RETURN NULL; END IF;
  ELSE
    v_table_ids := '{}';
  END IF;

  v_token   := generate_reservation_manage_token();
  v_expires := now() + (public.reservation_hold_minutes() || ' minutes')::interval;

  INSERT INTO reservation_holds (
    location_id, service_period_id, reservation_date, reservation_time,
    party_size, table_ids, token, expires_at
  ) VALUES (
    p_location_id, v_period.id, p_date, p_time,
    p_party_size, v_table_ids, v_token, v_expires
  );

  RETURN json_build_object(
    'token', v_token,
    'expires_at', v_expires,
    'hold_minutes', public.reservation_hold_minutes()
  );
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. create_public_reservation
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_public_reservation(
  p_site_id          uuid,
  p_hold_token       text,
  p_first_name       text,
  p_last_name        text,
  p_email            text,
  p_phone            text,
  p_special_requests text    DEFAULT NULL,
  p_occasion_tags    text[]  DEFAULT '{}',
  p_dietary_tags     text[]  DEFAULT '{}',
  p_marketing_opt_in boolean DEFAULT false,
  p_sms_opt_in       boolean DEFAULT true
)
RETURNS json
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_hold        reservation_holds%ROWTYPE;
  v_merchant_id uuid;
  v_turn        int;
  v_start_min   int;
  v_end_min     int;
  v_id          uuid;
  v_confirmation text;
  v_manage_token text;
  v_existing    reservations%ROWTYPE;
BEGIN
  IF p_hold_token IS NULL THEN RETURN NULL; END IF;

  SELECT * INTO v_hold FROM reservation_holds WHERE token = p_hold_token;
  IF v_hold.id IS NULL THEN RETURN NULL; END IF;

  -- A double-submit — a refresh, a flaky connection, an impatient second click
  -- — must return the booking that already exists rather than making a second
  -- one. This is why converted holds are kept instead of deleted.
  IF v_hold.converted_reservation_id IS NOT NULL THEN
    SELECT * INTO v_existing FROM reservations WHERE id = v_hold.converted_reservation_id;
    IF v_existing.id IS NULL THEN RETURN NULL; END IF;
    RETURN json_build_object(
      'reservation_id',      v_existing.id,
      'confirmation_number', v_existing.confirmation_number,
      'manage_token',        v_existing.manage_token,
      'reservation_date',    v_existing.reservation_date,
      'reservation_time',    v_existing.reservation_time,
      'party_size',          v_existing.party_size,
      'already_booked',      true
    );
  END IF;

  IF v_hold.expires_at <= now() THEN RETURN NULL; END IF;

  -- Same site scoping as everywhere else: a hold token is not a licence to
  -- write under a different merchant's site.
  SELECT l.merchant_id INTO v_merchant_id
  FROM merchant_sites ms
  JOIN locations l ON l.merchant_id = ms.merchant_id
  WHERE ms.id = p_site_id AND l.id = v_hold.location_id;

  IF v_merchant_id IS NULL THEN RETURN NULL; END IF;

  PERFORM pg_advisory_xact_lock(
    hashtext(v_hold.location_id::text || v_hold.reservation_date::text)
  );

  SELECT sp.turn_time_min INTO v_turn
  FROM reservation_service_periods sp WHERE sp.id = v_hold.service_period_id;
  v_turn := COALESCE(v_turn, 90);

  v_start_min := (EXTRACT(HOUR FROM v_hold.reservation_time) * 60
                + EXTRACT(MINUTE FROM v_hold.reservation_time))::int;
  v_end_min   := v_start_min + v_turn;

  -- THE RE-CHECK, inside the lock. The grid that produced this hold may be
  -- minutes old. Excluding this hold's own row is essential — it occupies the
  -- very tables it is about to convert, so counting it would reject every
  -- booking.
  IF cardinality(v_hold.table_ids) > 0 AND EXISTS (
    SELECT 1 FROM public.reservation_occupancy(v_hold.location_id, v_hold.reservation_date) o
    WHERE o.table_ids && v_hold.table_ids
      AND o.source_id IS DISTINCT FROM v_hold.id
      AND v_start_min < o.end_min AND o.start_min < v_end_min
  ) THEN
    RETURN NULL;
  END IF;

  INSERT INTO reservations (
    location_id, service_period_id,
    party_name, party_size, phone, email,
    reservation_date, reservation_time, duration_minutes,
    assigned_table_ids, special_requests,
    occasion_tags, dietary_tags,
    marketing_opt_in, sms_opt_in,
    status, source, merchant_id
  ) VALUES (
    v_hold.location_id, v_hold.service_period_id,
    btrim(COALESCE(p_first_name, '') || ' ' || COALESCE(p_last_name, '')),
    v_hold.party_size, p_phone, p_email,
    v_hold.reservation_date, v_hold.reservation_time, v_turn,
    NULLIF(v_hold.table_ids, '{}'), p_special_requests,
    COALESCE(p_occasion_tags, '{}'), COALESCE(p_dietary_tags, '{}'),
    COALESCE(p_marketing_opt_in, false), COALESCE(p_sms_opt_in, true),
    -- Auto-confirm (plan decision D1). A "pending" booking would make the
    -- confirmation message the guest immediately receives a lie.
    'confirmed', 'website', v_merchant_id
  )
  RETURNING id, confirmation_number, manage_token
  INTO v_id, v_confirmation, v_manage_token;

  UPDATE reservation_holds SET converted_reservation_id = v_id WHERE id = v_hold.id;

  RETURN json_build_object(
    'reservation_id',      v_id,
    'confirmation_number', v_confirmation,
    'manage_token',        v_manage_token,
    'reservation_date',    v_hold.reservation_date,
    'reservation_time',    v_hold.reservation_time,
    'party_size',          v_hold.party_size,
    'already_booked',      false
  );
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. get_public_reservation_by_token
-- ─────────────────────────────────────────────────────────────────────────────
-- What the guest's manage page renders.
--
-- CONTACT DETAILS COME BACK MASKED. A manage link may be forwarded, sit in a
-- shared inbox, or be read over someone's shoulder; it should prove "this is
-- your booking" without handing over the phone number and email of whoever made
-- it. The last four digits are enough for the guest to recognise their own.
CREATE OR REPLACE FUNCTION public.get_public_reservation_by_token(p_token text)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v json;
BEGIN
  IF p_token IS NULL OR length(p_token) < 32 THEN RETURN NULL; END IF;

  SELECT json_build_object(
    'confirmation_number', r.confirmation_number,
    'status',              r.status,
    'reservation_date',    r.reservation_date,
    'reservation_time',    r.reservation_time,
    'party_size',          r.party_size,
    'party_name',          r.party_name,
    'special_requests',    r.special_requests,
    'occasion_tags',       r.occasion_tags,
    'dietary_tags',        r.dietary_tags,
    'email_masked',        CASE WHEN r.email IS NULL THEN NULL
                                ELSE regexp_replace(r.email, '^(.).*(@.*)$', '\1•••••\2') END,
    'phone_masked',        CASE WHEN r.phone IS NULL THEN NULL
                                ELSE '•••• ' || right(r.phone, 4) END,
    'location', json_build_object(
      'name', l.name, 'phone', l.phone, 'timezone', l.timezone,
      'address_line1', l.address_line1, 'city', l.city, 'state', l.state
    ),
    'booking_policy',          rs.booking_policy,
    'cancellation_cutoff_min', COALESCE(rs.cancellation_cutoff_min, 120),
    -- Computed here rather than in the browser: a client clock is wrong often
    -- enough that "can I still cancel?" must not depend on it.
    'can_cancel',
      r.status IN ('pending', 'confirmed', 'reminded')
      AND (r.reservation_date + r.reservation_time)
          > (now() AT TIME ZONE COALESCE(NULLIF(l.timezone, ''), 'UTC'))
            + (COALESCE(rs.cancellation_cutoff_min, 120) || ' minutes')::interval
  )
  INTO v
  FROM reservations r
  JOIN locations l ON l.id = r.location_id
  LEFT JOIN reservation_settings rs ON rs.location_id = r.location_id
  WHERE r.manage_token = p_token;

  RETURN v;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. cancel_public_reservation
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.cancel_public_reservation(
  p_token  text,
  p_reason text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_id       uuid;
  v_status   reservation_status;
  v_can      boolean;
BEGIN
  IF p_token IS NULL OR length(p_token) < 32 THEN RETURN NULL; END IF;

  SELECT r.id, r.status,
         r.status IN ('pending', 'confirmed', 'reminded')
         AND (r.reservation_date + r.reservation_time)
             > (now() AT TIME ZONE COALESCE(NULLIF(l.timezone, ''), 'UTC'))
               + (COALESCE(rs.cancellation_cutoff_min, 120) || ' minutes')::interval
    INTO v_id, v_status, v_can
  FROM reservations r
  JOIN locations l ON l.id = r.location_id
  LEFT JOIN reservation_settings rs ON rs.location_id = r.location_id
  WHERE r.manage_token = p_token;
  -- No row lock, deliberately. Two simultaneous cancels of the same booking
  -- both read 'confirmed' and both write 'cancelled', which is the same outcome
  -- either way — cancellation is idempotent, so there is nothing for a lock to
  -- protect. (`FOR UPDATE` here would also need care with the LEFT JOIN.)

  IF v_id IS NULL THEN RETURN NULL; END IF;

  -- Already cancelled is a SUCCESS, not an error. The guest wanted it
  -- cancelled; it is cancelled. Erroring on a double-click would tell them
  -- something went wrong when nothing did.
  IF v_status = 'cancelled' THEN
    RETURN json_build_object('cancelled', true, 'already_cancelled', true);
  END IF;

  IF NOT v_can THEN
    RETURN json_build_object('cancelled', false, 'reason', 'cutoff_passed');
  END IF;

  UPDATE reservations
  SET status              = 'cancelled',
      cancelled_at        = now(),
      cancelled_by        = 'guest',
      cancellation_reason = p_reason
  WHERE id = v_id;

  RETURN json_build_object('cancelled', true, 'already_cancelled', false);
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Grants — service_role only
-- ─────────────────────────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.create_public_reservation_hold(uuid, uuid, date, time, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_public_reservation(uuid, text, text, text, text, text, text, text[], text[], boolean, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_public_reservation_by_token(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cancel_public_reservation(text, text) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.create_public_reservation_hold(uuid, uuid, date, time, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.create_public_reservation(uuid, text, text, text, text, text, text, text[], text[], boolean, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_public_reservation_by_token(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.cancel_public_reservation(text, text) TO service_role;

COMMIT;
