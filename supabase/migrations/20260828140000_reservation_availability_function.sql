-- ═════════════════════════════════════════════════════════════════════════════
-- Website reservations — the public availability read path (plan Phase 2)
-- ═════════════════════════════════════════════════════════════════════════════
--
-- The SQL port of lib/reservations/availability.ts. That module is the
-- reference implementation; this is what anon actually calls, and a parity test
-- asserts the two return identical slot lists for identical fixtures.
--
-- WHY A FUNCTION RATHER THAN A VIEW OR A POLICY. Availability has to be
-- readable by a stranger, but the tables behind it must not be: they hold other
-- guests' names and phone numbers, and the floor plan is commercially
-- sensitive. A SECURITY DEFINER function is the only shape that lets anon ask
-- "what times are free?" without being able to ask anything else.
--
-- WHAT IT RETURNS: times, service ids and service names. Never a table id,
-- never a remaining-capacity count, never a party. An availability endpoint
-- that leaks "3 of 12 tables left" is a competitor-intelligence feed, and one
-- that leaks table ids lets a caller map the dining room.
--
-- Idempotent: safe to re-run.

BEGIN;

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
  v_merchant_id  uuid;
  v_timezone     text;
  v_now_local    timestamp;
  v_today        date;
  v_now_minutes  integer;
  v_has_tables   boolean;
BEGIN
  -- ───────────────────────────────────────────────────────────────────────────
  -- Step 1. The gate
  -- ───────────────────────────────────────────────────────────────────────────
  -- SCOPED BY SITE, NOT JUST BY LOCATION. A location id is visible in page HTML
  -- and trivially harvested; without joining through `merchant_sites` on a
  -- shared `merchant_id`, anyone could read one merchant's availability by
  -- passing their location id under a different merchant's site.
  --
  -- The mode check mirrors `resolveReservationMode` in site-settings.ts: the
  -- feature toggle says WHETHER, `brand.reservationMode` says HOW, and only
  -- 'native' takes bookings here. A row written before native booking existed
  -- has no mode key, so this correctly returns nothing for it.
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

  -- The per-branch half. Site-wide 'native' does not mean every branch takes
  -- bookings.
  IF NOT EXISTS (
    SELECT 1 FROM reservation_settings rs
    WHERE rs.location_id = p_location_id AND rs.accepts_reservations
  ) THEN
    RETURN;
  END IF;

  IF p_party_size IS NULL OR p_party_size < 1 THEN RETURN; END IF;

  -- A whole-day blackout ends the query before anything expensive runs.
  IF EXISTS (
    SELECT 1 FROM reservation_blackouts b
    WHERE b.location_id = p_location_id
      AND b.date = p_date
      AND b.start_time IS NULL
  ) THEN
    RETURN;
  END IF;

  -- ───────────────────────────────────────────────────────────────────────────
  -- Step 2. "Now", at the restaurant
  -- ───────────────────────────────────────────────────────────────────────────
  -- `reservation_time` is a bare `time` meaning "7pm at the restaurant", so
  -- every comparison against now has to happen in the LOCATION's timezone.
  -- Using UTC here would hide this evening's slots from a US venue after 8pm
  -- local — the same bug lib/reservations/local-time.ts exists to prevent.
  v_now_local   := (now() AT TIME ZONE v_timezone);
  v_today       := v_now_local::date;
  v_now_minutes := (EXTRACT(HOUR FROM v_now_local) * 60
                  + EXTRACT(MINUTE FROM v_now_local))::int;

  IF p_date < v_today THEN RETURN; END IF;

  SELECT EXISTS (
    SELECT 1 FROM floor_plan_objects fpo
    WHERE fpo.location_id = p_location_id
      AND fpo.is_active
      AND COALESCE(fpo.is_reservable, true)
      AND fpo.category IN ('table', 'booth')
      AND COALESCE(fpo.capacity, 0) > 0
  ) INTO v_has_tables;

  -- ───────────────────────────────────────────────────────────────────────────
  -- Steps 3–7
  -- ───────────────────────────────────────────────────────────────────────────
  RETURN QUERY
  WITH periods AS (
    SELECT sp.*
    FROM reservation_service_periods sp
    WHERE sp.location_id = p_location_id
      AND sp.is_active
      -- EXTRACT(DOW) is 0=Sunday, matching days_of_week and the TS dayOfWeek().
      AND EXTRACT(DOW FROM p_date)::smallint = ANY (sp.days_of_week)
      AND p_party_size BETWEEN sp.min_party_size AND sp.max_party_size
      AND (p_date - v_today) <= sp.max_advance_days
  ),

  seatable AS (
    SELECT
      fpo.id,
      fpo.capacity,
      COALESCE(fpo.min_capacity, 1)  AS min_capacity,
      COALESCE(fpo.is_combinable, true) AS is_combinable
    FROM floor_plan_objects fpo
    WHERE fpo.location_id = p_location_id
      AND fpo.is_active
      AND COALESCE(fpo.is_reservable, true)
      -- Walls, decor and zones are not tables. `is_reservable` alone would let
      -- a decorative object with a capacity seat a party.
      AND fpo.category IN ('table', 'booth')
      AND COALESCE(fpo.capacity, 0) > 0
  ),

  -- Everything occupying a table in the window, from all three sources.
  -- Collapsed into one shape deliberately: a booking, a live hold and a seated
  -- walk-in occupy a table identically, and handling them separately is how the
  -- three drift apart.
  occ AS (
    -- Confirmed and in-progress bookings. Statuses kept in step with
    -- BLOCKING_STATUSES in lib/reservations/conflict-detection.ts.
    SELECT
      COALESCE(r.assigned_table_ids, '{}')::uuid[] AS table_ids,
      (EXTRACT(HOUR FROM r.reservation_time) * 60
       + EXTRACT(MINUTE FROM r.reservation_time))::int AS start_min,
      (EXTRACT(HOUR FROM r.reservation_time) * 60
       + EXTRACT(MINUTE FROM r.reservation_time))::int
       + COALESCE(r.duration_minutes, 90) AS end_min,
      r.party_size
    FROM reservations r
    WHERE r.location_id = p_location_id
      AND r.reservation_date = p_date
      AND r.status IN ('pending', 'confirmed', 'reminded', 'arrived', 'seated')

    UNION ALL

    -- Live holds only. An expired hold is invisible here rather than swept,
    -- which is why correctness never depends on the cron running.
    SELECT
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
      AND (ts.seated_at AT TIME ZONE v_timezone)::date = p_date
  ),

  slots AS (
    SELECT
      p.id   AS period_id,
      p.name AS period_name,
      p.turn_time_min,
      p.lead_time_min,
      p.max_covers_per_slot,
      gs     AS start_min
    FROM periods p
    CROSS JOIN LATERAL generate_series(
      (EXTRACT(HOUR FROM p.start_time) * 60
       + EXTRACT(MINUTE FROM p.start_time))::int,
      -- Inclusive: end_time is the LAST SEATING, not closing time.
      (EXTRACT(HOUR FROM p.end_time) * 60
       + EXTRACT(MINUTE FROM p.end_time))::int,
      p.slot_interval_min
    ) AS gs
  ),

  filtered AS (
    SELECT s.*
    FROM slots s
    WHERE
      -- Blackout windows inside an otherwise open service.
      NOT EXISTS (
        SELECT 1 FROM reservation_blackouts b
        WHERE b.location_id = p_location_id
          AND b.date = p_date
          AND b.start_time IS NOT NULL
          AND s.start_min >= (EXTRACT(HOUR FROM b.start_time) * 60
                            + EXTRACT(MINUTE FROM b.start_time))::int
          AND s.start_min <  (EXTRACT(HOUR FROM b.end_time) * 60
                            + EXTRACT(MINUTE FROM b.end_time))::int
      )
      -- Lead time, and "already past", are the same comparison. Only today can
      -- fail it: a future date is by definition beyond any lead time.
      AND (p_date > v_today OR s.start_min >= v_now_minutes + s.lead_time_min)
      -- Cover pacing, when set. Counts covers seated AT this slot rather than
      -- everyone in the room: the constraint is the kitchen firing a wave of
      -- tables at once, not the size of the dining room, which table inventory
      -- already models.
      AND (
        s.max_covers_per_slot IS NULL
        OR COALESCE((
             SELECT SUM(o.party_size) FROM occ o WHERE o.start_min = s.start_min
           ), 0) + p_party_size <= s.max_covers_per_slot
      )
  )

  SELECT
    make_time(f.start_min / 60, f.start_min % 60, 0) AS slot_time,
    f.period_id,
    f.period_name
  FROM filtered f
  WHERE
    CASE
      WHEN NOT v_has_tables THEN
        -- No floor plan: the merchant is on the cover-pacing fallback, already
        -- applied above. A period reaching here with no cap and no tables is a
        -- misconfiguration the settings screen must prevent, and offering
        -- nothing is the safe reading.
        f.max_covers_per_slot IS NOT NULL
      ELSE
        -- ─────────────────────────────────────────────────────────────────────
        -- THE FIT TEST, and the crux of parity with the TypeScript engine.
        --
        -- The reference implementation enumerates every valid combination and
        -- asks whether one is free. Enumerating in SQL would be miserable, so
        -- this asks the equivalent question directly — and it IS equivalent,
        -- not an approximation:
        --
        --   * every table in a valid set must have min_capacity <= party, since
        --     the set's requirement is the MAX of its tables' minimums. So
        --     filtering to those tables first loses no valid set.
        --   * among the remaining free tables, a set of at most k tables with
        --     enough total capacity exists if and only if the k LARGEST of them
        --     have enough total capacity.
        --
        -- Singles are asked separately because a single table need not be
        -- combinable — a non-combinable booth still seats a party that fits it.
        -- k = 3 matches DEFAULT_MAX_TABLES_PER_PARTY.
        -- ─────────────────────────────────────────────────────────────────────
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
  -- One flat grid in clock order, whichever period each slot came from: the
  -- guest sees a single list of times with the service name on the button.
  ORDER BY 1;
END $$;

COMMENT ON FUNCTION public.get_public_reservation_availability(uuid, uuid, date, integer) IS
  'Public availability for one location on one date. Returns slot times only — never table ids, capacity or parties. Scoped by site_id so a harvested location id cannot be queried under another merchant''s site. SQL port of lib/reservations/availability.ts; a parity test asserts they agree.';

-- anon is the whole point. service_role so the booking route can re-check with
-- the same logic that produced the grid.
GRANT EXECUTE ON FUNCTION public.get_public_reservation_availability(uuid, uuid, date, integer)
  TO anon, authenticated, service_role;

COMMIT;
