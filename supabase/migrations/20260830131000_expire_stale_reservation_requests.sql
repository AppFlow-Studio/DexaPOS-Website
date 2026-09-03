-- [Website reservations] Nothing should sit pending for ever.
--
-- §10 of PLAN-2026-08-29-RESERVATION-APPROVAL-MODE.
--
-- A guest requests a table for tonight at 19:00 at a restaurant in manual
-- review. Nobody opens the dashboard. Without this, the request stays `pending`
-- for ever: it holds a table the restaurant could have sold, and the guest sits
-- reading "we'll answer shortly" until they either turn up to a booking that
-- does not exist or give up on their evening.
--
-- This function closes that. It selects the requests that have run out of time
-- and cancels them, returning the ids so the caller can tell each guest — which
-- is the whole point, and the reason the sweep is driven from a route handler
-- rather than done entirely in SQL. pg_cron cannot send an email.
--
-- THREE GUARDS, and each one exists because of a specific way this could go
-- wrong. They were not hypothetical: staging has rows that trip two of them.
--
--   1. `source = 'website'`. Staging holds 10 `pending` reservations that came
--      from the POS and the dashboard, where `pending` does not mean "awaiting
--      the restaurant's answer" at all — it means a host wrote a booking down
--      and has not firmed it up with the guest yet. Cancelling those would
--      destroy staff bookings at every restaurant on the platform, including
--      the ones that never turned manual review on.
--
--   2. A lookback floor. All ten of those rows are in the PAST, some by four
--      months. A sweep written as "any pending sitting that has passed" would,
--      on its first run, cancel bookings from April and email those guests
--      about a dinner that is long over. `location-closure.ts` states the rule
--      this follows: a booking that has already happened is a record of
--      something that happened, and rewriting it corrupts every report built
--      on it. So the sweep reaches back a bounded distance and no further;
--      anything older is a data-hygiene question, not a guest to apologise to.
--
--   3. The branch's own clock. `reservation_date` and `reservation_time` are
--      local to the restaurant. Comparing them to `now()` without the
--      location's timezone expires tonight's dinner in Auckland while leaving
--      this afternoon's in Los Angeles standing — the same trap
--      `location-closure.ts` documents at length.
--
-- Deliberately NOT scoped to merchants currently in manual review. A merchant
-- who switches back to auto with requests already outstanding still has guests
-- owed an answer, and those requests would otherwise become permanently
-- unreachable orphans.

CREATE OR REPLACE FUNCTION public.expire_stale_reservation_requests(
  p_grace_minutes  int DEFAULT 120,
  p_lookback_hours int DEFAULT 24,
  p_reason         text DEFAULT 'We were not able to confirm this table in time.'
)
RETURNS TABLE (reservation_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  RETURN QUERY
  WITH due AS (
    SELECT r.id
      FROM reservations r
      JOIN locations l ON l.id = r.location_id
     WHERE r.status = 'pending'
       -- Guard 1. Staff-created `pending` is a different word.
       AND r.source = 'website'
       -- Guard 3. The sitting, on the branch's clock, as a real instant.
       AND ((r.reservation_date + r.reservation_time)
              AT TIME ZONE COALESCE(NULLIF(l.timezone, ''), 'UTC'))
           <= now() + make_interval(mins => p_grace_minutes)
       -- Guard 2. Near enough to still be worth telling a guest about.
       AND ((r.reservation_date + r.reservation_time)
              AT TIME ZONE COALESCE(NULLIF(l.timezone, ''), 'UTC'))
           > now() - make_interval(hours => p_lookback_hours)
     -- A manager may be clicking Confirm on this very row. Take the lock or
     -- leave it for the next run; never race them for it.
     FOR UPDATE OF r SKIP LOCKED
  )
  UPDATE reservations r
     SET status              = 'cancelled',
         cancelled_at        = now(),
         -- Neither the guest nor a host. This is the third value's whole
         -- purpose, and the same one an archived branch writes.
         cancelled_by        = 'system',
         cancellation_reason = p_reason
    FROM due
   WHERE r.id = due.id
  RETURNING r.id;
END $function$;

COMMENT ON FUNCTION public.expire_stale_reservation_requests(int, int, text) IS
  'Cancels website booking requests still unanswered within p_grace_minutes of the sitting (branch-local), reaching back at most p_lookback_hours so historic rows are never touched. Website-sourced only: staff pending means something else. Returns the ids so the caller can notify each guest.';

-- Service role only. This cancels bookings; no browser-facing role may call it.
--
-- `FROM PUBLIC, anon, authenticated` — all three, and the last two are the ones
-- that matter. Supabase's default privileges GRANT EXECUTE to `anon` and
-- `authenticated` explicitly at creation time, so `REVOKE ... FROM PUBLIC`
-- alone leaves both in place and the function reachable over PostgREST by
-- anyone holding the publishable key, which is public by design. That is not
-- theoretical: this file shipped that way, and staging showed
-- `anon=X/postgres` on a SECURITY DEFINER function that bulk-cancels bookings
-- and takes its own lookback window as an argument.
REVOKE ALL ON FUNCTION public.expire_stale_reservation_requests(int, int, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expire_stale_reservation_requests(int, int, text) TO service_role;
