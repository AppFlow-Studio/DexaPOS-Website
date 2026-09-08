-- ═════════════════════════════════════════════════════════════════════════════
-- Phase 3 smoke test — does the booking path actually work?
-- ═════════════════════════════════════════════════════════════════════════════
--
-- Runs the whole guest journey against real data: configure a location, ask for
-- availability, hold a slot, book it, read it back through the manage-page
-- function, then cancel it.
--
-- ══ IT WRITES NOTHING. ══
-- The last line raises an exception on purpose, which aborts the transaction
-- and rolls back every change — the settings, the service period, the hold and
-- the booking all disappear. Raising is also how the log gets out: Supabase's
-- SQL editor shows an error message reliably and NOTICEs unreliably, so the
-- results come back in the error text.
--
-- ══ WHAT YOU SHOULD SEE ══
-- A red "ERROR" box whose message ends with `RESULT: PASS`. That is a success.
-- Copy the whole message back.
-- If it ends with `RESULT: FAIL` — or shows a different Postgres error — copy
-- that back instead; it is the bug we are looking for.
--
-- Just paste this whole file into the SQL editor and run it.
--
-- Note on style: newlines are appended with `|| NL` rather than written into
-- format() strings. Postgres format() has no `%n` specifier — only %s, %I, %L
-- and %% — and reaching for one is a runtime error, not a syntax error.

DO $smoke$
DECLARE
  NL CONSTANT text := E'\n';

  v_log        text := E'\n===== PHASE 3 SMOKE TEST =====\n';
  v_site_id    uuid;
  v_location   uuid;
  v_period_id  uuid;
  v_date       date;
  v_slot       time;
  v_slots      int;
  v_hold       json;
  v_token      text;
  v_booking    json;
  v_manage     text;
  v_view       json;
  v_cancel     json;
  v_failures   int := 0;
  v_held       uuid[];
  v_tmp        json;
  v_taken      int := 0;
  i            int;
BEGIN
  -- ── Pick a real merchant with a floor plan ────────────────────────────────
  SELECT ms.id, l.id INTO v_site_id, v_location
  FROM merchant_sites ms
  JOIN locations l ON l.merchant_id = ms.merchant_id
  WHERE l.is_active
    AND EXISTS (
      SELECT 1 FROM floor_plan_objects f
      WHERE f.location_id = l.id AND f.is_active
        AND f.category IN ('table','booth') AND COALESCE(f.capacity,0) > 0
    )
  LIMIT 1;

  IF v_site_id IS NULL THEN
    RAISE EXCEPTION '%', v_log || 'No site with a floor plan found.' || NL || 'RESULT: FAIL' || NL;
  END IF;

  v_log := v_log || format('site=%s', v_site_id) || NL
                 || format('location=%s', v_location) || NL;

  -- ── Configure it for native booking (rolled back) ──────────────────────────
  UPDATE merchant_sites
  SET features = COALESCE(features, '{}'::jsonb) || '{"reservations": true}'::jsonb,
      brand    = COALESCE(brand, '{}'::jsonb)    || '{"reservationMode": "native"}'::jsonb
  WHERE id = v_site_id;

  INSERT INTO reservation_settings (location_id, accepts_reservations)
  VALUES (v_location, true)
  ON CONFLICT (location_id) DO UPDATE SET accepts_reservations = true;

  -- Every weekday, so whatever date we pick is covered.
  INSERT INTO reservation_service_periods (
    location_id, name, days_of_week, start_time, end_time,
    slot_interval_min, turn_time_min, min_party_size, max_party_size,
    lead_time_min, max_advance_days
  ) VALUES (
    v_location, 'Smoke Dinner', ARRAY[0,1,2,3,4,5,6]::smallint[], '17:00', '22:00',
    15, 90, 1, 8, 60, 60
  ) RETURNING id INTO v_period_id;

  -- A week out, so lead time can never interfere.
  v_date := CURRENT_DATE + 7;
  v_log := v_log || format('date=%s', v_date) || NL || NL;

  -- ── 1. Availability ───────────────────────────────────────────────────────
  SELECT count(*), min(a.slot_time)
    INTO v_slots, v_slot
  FROM get_public_reservation_availability(v_site_id, v_location, v_date, 2) a;

  v_log := v_log || format('1. availability   -> %s slots, first %s', v_slots, v_slot) || NL;
  IF v_slots = 0 THEN
    v_failures := v_failures + 1;
    v_log := v_log || '   !! expected 21 slots (17:00-22:00 every 15 min)' || NL;
    RAISE EXCEPTION '%', v_log || NL || 'RESULT: FAIL' || NL;
  END IF;

  -- ── 2. Hold ───────────────────────────────────────────────────────────────
  v_hold := create_public_reservation_hold(v_site_id, v_location, v_date, v_slot, 2);
  v_log := v_log || format('2. hold           -> %s', COALESCE(v_hold::text, 'NULL')) || NL;
  IF v_hold IS NULL THEN
    v_failures := v_failures + 1;
    v_log := v_log || '   !! could not hold a slot the grid just offered' || NL;
    RAISE EXCEPTION '%', v_log || NL || 'RESULT: FAIL' || NL;
  END IF;
  v_token := v_hold->>'token';

  -- The held TABLES must now read as occupied.
  --
  -- Note what this does NOT assert: that the slot disappears from the grid. On
  -- a sixteen-table floor plan, holding one two-top leaves fifteen tables free
  -- at 17:00, so the slot is still correctly bookable — an earlier version of
  -- this test asserted otherwise and failed against perfectly correct code.
  -- The invariant is about the tables, not the slot. The end-to-end version of
  -- the question is step 10.
  SELECT h.table_ids INTO v_held FROM reservation_holds h WHERE h.token = v_token;

  SELECT count(*) INTO v_slots
  FROM reservation_occupancy(v_location, v_date) o
  WHERE o.source = 'hold' AND o.table_ids && v_held;

  v_log := v_log || format('   held tables %s now occupied? %s (want >=1)',
                           v_held::text, v_slots) || NL;
  IF v_slots < 1 THEN
    v_failures := v_failures + 1;
    v_log := v_log || '   !! a live hold is not showing up as occupancy' || NL;
  END IF;

  -- ── 3. Book ───────────────────────────────────────────────────────────────
  v_booking := create_public_reservation(
    v_site_id, v_token, 'Smoke', 'Test', 'smoke@example.com', '+15551234567',
    'Window seat if possible', ARRAY['Birthday'], ARRAY['Gluten-free'], false, true
  );
  v_log := v_log || format('3. book           -> %s', COALESCE(v_booking::text, 'NULL')) || NL;
  IF v_booking IS NULL THEN
    v_failures := v_failures + 1;
    v_log := v_log || '   !! hold did not convert into a booking' || NL;
    RAISE EXCEPTION '%', v_log || NL || 'RESULT: FAIL' || NL;
  END IF;
  v_manage := v_booking->>'manage_token';

  -- ── 4. Double submit must NOT create a second booking ─────────────────────
  v_booking := create_public_reservation(
    v_site_id, v_token, 'Smoke', 'Test', 'smoke@example.com', '+15551234567'
  );
  v_log := v_log || format('4. double submit  -> already_booked=%s (want true)',
                           v_booking->>'already_booked') || NL;
  IF COALESCE(v_booking->>'already_booked', 'false') <> 'true' THEN
    v_failures := v_failures + 1;
    v_log := v_log || '   !! a refresh would create a SECOND reservation' || NL;
  END IF;

  -- ── 5. Manage page ────────────────────────────────────────────────────────
  v_view := get_public_reservation_by_token(v_manage);
  v_log := v_log || format('5. manage page    -> %s', COALESCE(v_view::text, 'NULL')) || NL;
  IF v_view IS NULL THEN
    v_failures := v_failures + 1;
    v_log := v_log || '   !! manage token does not resolve' || NL;
  ELSIF position('smoke@example.com' in v_view::text) > 0
     OR position('5551234567' in v_view::text) > 0 THEN
    v_failures := v_failures + 1;
    v_log := v_log || '   !! CONTACT DETAILS ARE NOT MASKED' || NL;
  END IF;

  -- ── 6. Cancel, then cancel again ──────────────────────────────────────────
  v_cancel := cancel_public_reservation(v_manage, 'Smoke test');
  v_log := v_log || format('6. cancel         -> %s', COALESCE(v_cancel::text, 'NULL')) || NL;
  IF COALESCE(v_cancel->>'cancelled', 'false') <> 'true' THEN
    v_failures := v_failures + 1;
    v_log := v_log || '   !! guest could not cancel' || NL;
  END IF;

  v_cancel := cancel_public_reservation(v_manage);
  v_log := v_log || format('7. cancel again   -> already_cancelled=%s (want true)',
                           v_cancel->>'already_cancelled') || NL;

  -- Cancelling frees the table again.
  SELECT count(*) INTO v_slots
  FROM get_public_reservation_availability(v_site_id, v_location, v_date, 2) a
  WHERE a.slot_time = v_slot;
  v_log := v_log || format('8. slot freed?    -> %s (want 1)', v_slots) || NL;
  IF v_slots <> 1 THEN
    v_failures := v_failures + 1;
    v_log := v_log || '   !! cancelling did not release the table' || NL;
  END IF;

  -- ── 9. An unknown token must reveal nothing ───────────────────────────────
  IF get_public_reservation_by_token(repeat('f', 64)) IS NOT NULL
     OR cancel_public_reservation(repeat('f', 64)) IS NOT NULL THEN
    v_failures := v_failures + 1;
    v_log := v_log || '9. !! an unknown token returned something' || NL;
  ELSE
    v_log := v_log || '9. unknown token  -> nothing, as it should' || NL;
  END IF;

  -- ── 10. Holds really do exhaust a slot ────────────────────────────────────
  -- The end-to-end version of "a hold blocks the table", written so it does not
  -- depend on how many tables this particular restaurant has: keep holding the
  -- same slot until the function refuses, then the grid must no longer offer
  -- it. If holds were not blocking, this loop would never terminate early and
  -- the slot would still be on offer at the end.
  FOR i IN 1..60 LOOP
    v_tmp := create_public_reservation_hold(v_site_id, v_location, v_date, v_slot, 2);
    EXIT WHEN v_tmp IS NULL;
    v_taken := v_taken + 1;
  END LOOP;

  SELECT count(*) INTO v_slots
  FROM get_public_reservation_availability(v_site_id, v_location, v_date, 2) a
  WHERE a.slot_time = v_slot;

  v_log := v_log || format('10. exhausted after %s more holds; slot still offered? %s (want 0)',
                           v_taken, v_slots) || NL;
  IF v_slots <> 0 THEN
    v_failures := v_failures + 1;
    v_log := v_log || '   !! holds are not blocking the slot' || NL;
  END IF;

  v_log := v_log || NL
        || format('===== %s failure(s) =====', v_failures) || NL
        || 'RESULT: ' || CASE WHEN v_failures = 0 THEN 'PASS' ELSE 'FAIL' END || NL;

  -- Always raise: this is both the rollback and how the log gets out.
  RAISE EXCEPTION '%', v_log;
END $smoke$;
