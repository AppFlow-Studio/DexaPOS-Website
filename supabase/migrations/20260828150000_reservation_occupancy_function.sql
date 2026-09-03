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
