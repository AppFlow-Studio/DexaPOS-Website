-- =============================================================================
-- Timesheets QA seed — DEV DATABASE ONLY. Never run this on production.
-- =============================================================================
-- Paste into Supabase Dashboard → SQL Editor → Run.
--
-- What it does
--   Adds ~40 shifts to ONE location for staff who already work there. Nothing
--   else is created or changed: no people, no pay rates on profiles. Each shift
--   carries its own hourly_rate_snapshot, which is what the timesheet prices.
--   Every seeded row is tagged device_id = 'TIMESHEET-SEED', so
--   timesheets-seed-cleanup.sql removes exactly these rows and nothing else.
--
-- Dates are RELATIVE to today at the location, so the data always lands on
-- "last week" / "this week" whenever you run it. One scenario (daylight saving)
-- uses fixed dates in March 2026.
--
-- Safe to re-run: if seeded rows already exist it inserts nothing.
--
-- Staff are picked automatically: test accounts first (names containing
-- "test"), people without an open shift before people with one. The two
-- scenarios that leave a shift OPEN (missing clock-out, on the clock now) only
-- ever land on slots 1–2. An open shift makes the POS treat that person as
-- clocked in — the cleanup script closes that door again.
--
-- The last statement prints who got which scenario.
-- =============================================================================

-- ▼▼ 1. Your location. Default: Uptown Branch on Dev. ▼▼
--    Find another with:  select id, name from locations order by name;
WITH params AS (
  SELECT
    l.id AS location_id,
    l.merchant_id,
    COALESCE(NULLIF(l.timezone, ''), 'America/New_York') AS tz,
    (now() AT TIME ZONE COALESCE(NULLIF(l.timezone, ''), 'America/New_York'))::date AS today
  FROM public.locations l
  WHERE l.id = '8835e749-9bbf-4405-b4a4-7f28a56f990a'   -- ◀ change me
),
weeks AS (
  SELECT p.*, p.today - (EXTRACT(ISODOW FROM p.today)::int - 1) AS this_mon
  FROM params p
),
-- Staff at the location, numbered into scenario slots.
staff AS (
  SELECT
    sp.id AS staff_profile_id,
    row_number() OVER (
      ORDER BY
        (sp.first_name || ' ' || sp.last_name) ILIKE '%test%' DESC,
        EXISTS (SELECT 1 FROM public.staff_shifts o
                WHERE o.staff_profile_id = sp.id AND o.clock_out_time IS NULL) ASC,
        sp.first_name, sp.last_name, sp.id
    ) AS slot
  FROM public.location_members lm
  JOIN public.staff_profiles sp ON sp.id = lm.staff_profile_id
  WHERE lm.location_id = (SELECT location_id FROM params)
    AND lm.is_active AND sp.is_active
),
-- One row per shift.
--   wk        weeks from this week (0 = this week, -1 = last week, -2 = two weeks ago)
--   d         day of that week (0 = Monday … 6 = Sunday)
--   fixed     a fixed date instead of wk/d (DST case)
--   t_in      clock-in wall time at the location; NULL = "2 hours ago" (on the clock now)
--   od        clock-out day offset from the clock-in day (1 = next day)
--   t_out     clock-out wall time; NULL = still open
--   breaks    [{o: day offset, s, e, type, shape: 'pos' {start,end} | 'web' {start_at,end_at}}]
spec (slot, wk, d, fixed, t_in, od, t_out, rate, status, verified, notes, breaks) AS (
  VALUES
  -- Slot 1 · MISSING CLOCK-OUT — 4 × 8h, then Saturday never clocked out ($18.50)
  (1, -1, 0, NULL::date, '09:00', 0, '17:00', 18.50, 'completed', false, NULL, '[]'::jsonb),
  (1, -1, 1, NULL, '09:00', 0, '17:00', 18.50, 'completed', false, NULL, '[]'),
  (1, -1, 2, NULL, '09:00', 0, '17:00', 18.50, 'completed', false, NULL, '[]'),
  (1, -1, 3, NULL, '09:00', 0, '17:00', 18.50, 'completed', false, NULL, '[]'),
  (1, -1, 5, NULL, '10:58', 0, NULL,    18.50, 'active',    false, NULL, '[]'),

  -- Slot 2 · ON THE CLOCK NOW — clocked in 2 hours ago (today), + 3 shifts last week ($16)
  (2, -1, 0, NULL, '11:00', 0, '16:00', 16.00, 'completed', false, NULL, '[]'),
  (2, -1, 2, NULL, '11:00', 0, '16:00', 16.00, 'completed', false, NULL, '[]'),
  (2, -1, 4, NULL, '11:00', 0, '16:00', 16.00, 'completed', false, NULL, '[]'),
  (2,  0, NULL, NULL, NULL, 0, NULL,    16.00, 'active',    false, NULL, '[]'),

  -- Slot 3 · OVER 16 HOURS — one 17h15m shift Wednesday, then 3 × 6h ($15.50)
  (3, -1, 2, NULL, '06:00', 0, '23:15', 15.50, 'completed', false, NULL, '[]'),
  (3, -1, 4, NULL, '10:00', 0, '16:00', 15.50, 'completed', false, NULL, '[]'),
  (3, -1, 5, NULL, '10:00', 0, '16:00', 15.50, 'completed', false, NULL, '[]'),
  (3, -1, 6, NULL, '10:00', 0, '16:00', 15.50, 'completed', false, NULL, '[]'),

  -- Slot 4 · OVERTIME + OVERNIGHT — last week 49h (9h OT), POS-shape breaks ($19)
  (4, -1, 0, NULL, '16:00', 0, '22:00', 19.00, 'completed', false, NULL, '[]'),
  (4, -1, 1, NULL, '17:02', 1, '02:47', 19.00, 'completed', false, NULL,
     '[{"o":0,"s":"22:15","e":"22:45","type":"unpaid","shape":"pos"}]'),
  (4, -1, 2, NULL, '15:00', 0, '23:00', 19.00, 'completed', false, NULL, '[]'),
  (4, -1, 3, NULL, '14:30', 0, '23:00', 19.00, 'completed', false, NULL, '[]'),
  (4, -1, 4, NULL, '16:00', 1, '01:30', 19.00, 'completed', false, NULL,
     '[{"o":0,"s":"20:00","e":"20:30","type":"unpaid","shape":"pos"}]'),
  (4, -1, 5, NULL, '17:00', 1, '01:45', 19.00, 'completed', false, NULL,
     '[{"o":0,"s":"21:00","e":"21:30","type":"unpaid","shape":"pos"}]'),
  --   …and the week before: 5 × 9h = 45h (5h OT on Friday). If that week straddles
  --   a month end, the Month view splits it across two months.
  (4, -2, 0, NULL, '08:00', 0, '17:00', 19.00, 'completed', false, NULL, '[]'),
  (4, -2, 1, NULL, '08:00', 0, '17:00', 19.00, 'completed', false, NULL, '[]'),
  (4, -2, 2, NULL, '08:00', 0, '17:00', 19.00, 'completed', false, NULL, '[]'),
  (4, -2, 3, NULL, '08:00', 0, '17:00', 19.00, 'completed', false, NULL, '[]'),
  (4, -2, 4, NULL, '08:00', 0, '17:00', 19.00, 'completed', false, NULL, '[]'),

  -- Slot 5 · NO PAY RATE — 5 × 6.5h at $0/hr
  (5, -1, 0, NULL, '10:00', 0, '16:30', 0.00, 'completed', false, NULL, '[]'),
  (5, -1, 1, NULL, '10:00', 0, '16:30', 0.00, 'completed', false, NULL, '[]'),
  (5, -1, 2, NULL, '10:00', 0, '16:30', 0.00, 'completed', false, NULL, '[]'),
  (5, -1, 3, NULL, '10:00', 0, '16:30', 0.00, 'completed', false, NULL, '[]'),
  (5, -1, 4, NULL, '10:00', 0, '16:30', 0.00, 'completed', false, NULL, '[]'),

  -- Slot 6 · EXACTLY 40h, PAID BREAKS — 5 × 8h with a 15-min PAID break (not deducted) ($22)
  (6, -1, 0, NULL, '08:00', 0, '16:00', 22.00, 'completed', false, NULL, '[{"o":0,"s":"10:00","e":"10:15","type":"paid","shape":"web"}]'),
  (6, -1, 1, NULL, '08:00', 0, '16:00', 22.00, 'completed', false, NULL, '[{"o":0,"s":"10:00","e":"10:15","type":"paid","shape":"web"}]'),
  (6, -1, 2, NULL, '08:00', 0, '16:00', 22.00, 'completed', false, NULL, '[{"o":0,"s":"10:00","e":"10:15","type":"paid","shape":"web"}]'),
  (6, -1, 3, NULL, '08:00', 0, '16:00', 22.00, 'completed', false, NULL, '[{"o":0,"s":"10:00","e":"10:15","type":"paid","shape":"web"}]'),
  (6, -1, 4, NULL, '08:00', 0, '16:00', 22.00, 'completed', false, NULL, '[{"o":0,"s":"10:00","e":"10:15","type":"paid","shape":"web"}]'),

  -- Slot 7 · UNPAID BREAKS (web shape) — 5 × 8h with 30-min unpaid lunch = 37.5h ($17)
  (7, -1, 0, NULL, '08:00', 0, '16:00', 17.00, 'completed', false, NULL, '[{"o":0,"s":"12:00","e":"12:30","type":"unpaid","shape":"web"}]'),
  (7, -1, 1, NULL, '08:00', 0, '16:00', 17.00, 'completed', false, NULL, '[{"o":0,"s":"12:00","e":"12:30","type":"unpaid","shape":"web"}]'),
  (7, -1, 2, NULL, '08:00', 0, '16:00', 17.00, 'completed', false, NULL, '[{"o":0,"s":"12:00","e":"12:30","type":"unpaid","shape":"web"}]'),
  (7, -1, 3, NULL, '08:00', 0, '16:00', 17.00, 'completed', false, NULL, '[{"o":0,"s":"12:00","e":"12:30","type":"unpaid","shape":"web"}]'),
  (7, -1, 4, NULL, '08:00', 0, '16:00', 17.00, 'completed', false, NULL, '[{"o":0,"s":"12:00","e":"12:30","type":"unpaid","shape":"web"}]'),

  -- Slot 8 · MID-WEEK RAISE — Mon–Tue at $15, Wed–Fri at $17 (each shift keeps its own rate)
  (8, -1, 0, NULL, '09:00', 0, '17:00', 15.00, 'completed', false, NULL, '[]'),
  (8, -1, 1, NULL, '09:00', 0, '17:00', 15.00, 'completed', false, NULL, '[]'),
  (8, -1, 2, NULL, '09:00', 0, '17:00', 17.00, 'completed', false, NULL, '[]'),
  (8, -1, 3, NULL, '09:00', 0, '17:00', 17.00, 'completed', false, NULL, '[]'),
  (8, -1, 4, NULL, '09:00', 0, '17:00', 17.00, 'completed', false, NULL, '[]'),

  -- Slot 9 · DOUBLE-LOGGED BREAK + EDITED BY MANAGER ($16)
  --   Tue: breaks 12:00–12:30 and 12:15–12:45 overlap → 45 min deducted, not 60 → 7.75h
  (9, -1, 1, NULL, '09:00', 0, '17:30', 16.00, 'completed', false, NULL,
     '[{"o":0,"s":"12:00","e":"12:30","type":"unpaid","shape":"pos"},{"o":0,"s":"12:15","e":"12:45","type":"unpaid","shape":"pos"}]'),
  --   Thu: corrected by a manager → "Edited by manager" with the reason
  (9, -1, 3, NULL, '09:00', 0, '17:00', 16.00, 'completed', true,
     'Forgot to clock out after closing — corrected from the schedule.', '[]'),

  -- Slot 10 · CLOSED AUTOMATICALLY — auto clock-out at the 03:00 cutoff ($17)
  (10, -1, 4, NULL, '16:00', 1, '03:00', 17.00, 'completed', false,
     'Auto clock-out (system) - review required. Cutoff: 03:00 America/New_York.', '[]'),

  -- Slot 11 · DAYLIGHT SAVING — Sat Mar 7 2026 22:00 → Sun Mar 8 06:00 in New York.
  --   Clocks jump 2→3 AM, so this is 7.00 real hours, not 8. ($20)
  (11, NULL, NULL, DATE '2026-03-07', '22:00', 1, '06:00', 20.00, 'completed', false, NULL, '[]')
),
shifts AS (
  SELECT
    s.*,
    st.staff_profile_id,
    w.location_id, w.merchant_id, w.tz,
    COALESCE(s.fixed, w.this_mon + s.wk * 7 + s.d) AS in_date
  FROM spec s
  JOIN staff st ON st.slot = s.slot
  CROSS JOIN weeks w
)
INSERT INTO public.staff_shifts (
  merchant_id, location_id, staff_profile_id, status,
  clock_in_time, clock_out_time, break_logs,
  hourly_rate_snapshot, device_id, notes, is_verified
)
SELECT
  sh.merchant_id,
  sh.location_id,
  sh.staff_profile_id,
  sh.status,
  CASE WHEN sh.t_in IS NULL THEN now() - interval '2 hours'
       ELSE (sh.in_date + sh.t_in::time) AT TIME ZONE sh.tz END,
  CASE WHEN sh.t_out IS NULL THEN NULL
       ELSE ((sh.in_date + sh.od) + sh.t_out::time) AT TIME ZONE sh.tz END,
  (
    SELECT COALESCE(jsonb_agg(
      CASE WHEN b->>'shape' = 'web' THEN jsonb_build_object(
        'id', gen_random_uuid(),
        'type', b->>'type',
        'start_at', ((sh.in_date + (b->>'o')::int) + (b->>'s')::time) AT TIME ZONE sh.tz,
        'end_at',   ((sh.in_date + (b->>'o')::int) + (b->>'e')::time) AT TIME ZONE sh.tz,
        'duration_minutes', EXTRACT(EPOCH FROM ((b->>'e')::time - (b->>'s')::time))::int / 60
      ) ELSE jsonb_build_object(
        'start', ((sh.in_date + (b->>'o')::int) + (b->>'s')::time) AT TIME ZONE sh.tz,
        'end',   ((sh.in_date + (b->>'o')::int) + (b->>'e')::time) AT TIME ZONE sh.tz,
        'type', b->>'type'
      ) END
    ), '[]'::jsonb)
    FROM jsonb_array_elements(sh.breaks) b
  ),
  sh.rate,
  'TIMESHEET-SEED',
  sh.notes,
  sh.verified
FROM shifts sh
WHERE NOT EXISTS (
  SELECT 1 FROM public.staff_shifts x WHERE x.device_id = 'TIMESHEET-SEED'
);

-- ▼▼ 2. Who got which scenario (keep the location id in sync with the one above) ▼▼
WITH staff AS (
  SELECT
    sp.id,
    BTRIM(COALESCE(NULLIF(BTRIM(sp.display_name), ''), sp.first_name || ' ' || sp.last_name)) AS name,
    row_number() OVER (
      ORDER BY
        (sp.first_name || ' ' || sp.last_name) ILIKE '%test%' DESC,
        EXISTS (SELECT 1 FROM public.staff_shifts o
                WHERE o.staff_profile_id = sp.id AND o.clock_out_time IS NULL
                  AND o.device_id IS DISTINCT FROM 'TIMESHEET-SEED') ASC,
        sp.first_name, sp.last_name, sp.id
    ) AS slot
  FROM public.location_members lm
  JOIN public.staff_profiles sp ON sp.id = lm.staff_profile_id
  WHERE lm.location_id = '8835e749-9bbf-4405-b4a4-7f28a56f990a'   -- ◀ same location
    AND lm.is_active AND sp.is_active
)
SELECT st.slot, st.name, sc.scenario,
       (SELECT count(*) FROM public.staff_shifts x
        WHERE x.staff_profile_id = st.id AND x.device_id = 'TIMESHEET-SEED') AS seeded_shifts
FROM staff st
JOIN (VALUES
  (1, 'Missing clock-out'), (2, 'On the clock now'), (3, 'Over 16 hours'),
  (4, 'Overtime + overnight (49h / 9h OT, and 45h the week before)'),
  (5, 'No pay rate'), (6, 'Exactly 40h with paid breaks'), (7, 'Unpaid breaks, 37.5h'),
  (8, 'Mid-week raise $15 → $17'), (9, 'Double-logged break + edited by manager'),
  (10, 'Closed automatically'), (11, 'Daylight saving (Mar 7–8, 2026)')
) AS sc(slot, scenario) ON sc.slot = st.slot
ORDER BY st.slot;
