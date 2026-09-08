-- ============================================================================
-- get_public_reservation_config — what a guest's booking widget needs to know
-- ============================================================================
--
-- WHY THIS EXISTS. The booking widget has to render before anybody has chosen a
-- branch. To do that it needs the list of branches that actually take bookings,
-- and, per branch, the handful of facts the form is shaped by: the cancellation
-- policy the guest must agree to, whether to ask for a birthday, the party-size
-- range, how far ahead the calendar may go, and the number to ring for a large
-- party.
--
-- None of that can be read the obvious way. Every table in
-- `20260828120000_reservation_availability` is RLS'd to `is_merchant_admin`,
-- and the public site renders through an ANON client — the migration's own
-- comment is explicit that "nothing anonymous gets row access to any table in
-- this migration". That is the correct posture and this function does not
-- weaken it: like `get_public_reservation_availability`, it is SECURITY DEFINER,
-- granted to `service_role` alone, and returns an explicit allowlist of columns
-- rather than rows.
--
-- WHAT IT DELIBERATELY DOES NOT RETURN: `notify_emails` (staff inboxes, and a
-- spam list to anyone who asks), table ids or capacities (the availability
-- function withholds these for the same reason), and anything at all about
-- bookings that already exist.
--
-- THE GATE IS COPIED FROM `get_public_reservation_availability`, character for
-- character, and must stay that way. If this function lists a branch the
-- availability function refuses, the guest gets a branch that shows an empty
-- grid forever — the "false zero" this whole sprint exists to eliminate.
--
--   * scoped by SITE, not just location — a location id is visible in page HTML
--     and trivially harvested, so without joining through `merchant_sites` on a
--     shared merchant_id anyone could read one merchant's setup under another's
--     site id;
--   * `features->>'reservations' = 'true' AND brand->>'reservationMode' =
--     'native'`, mirroring `resolveReservationMode` in site-settings.ts;
--   * the per-branch half, `reservation_settings.accepts_reservations` — a
--     site-wide 'native' does not mean every branch takes bookings.
--
-- One addition beyond that gate: a branch with no active service period is
-- excluded. It would pass every check above and then show a permanently empty
-- grid, which is exactly the lie we are removing.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_public_reservation_config(
  p_site_id uuid
)
RETURNS TABLE (
  location_id             uuid,
  location_name           text,
  address                 text,
  timezone                text,
  phone                   text,
  booking_policy          text,
  collect_birthday        boolean,
  large_party_phone       text,
  cancellation_cutoff_min integer,
  min_party_size          smallint,
  max_party_size          smallint,
  max_advance_days        smallint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT
    l.id,
    l.name,
    NULLIF(
      concat_ws(' · ',
        NULLIF(btrim(l.address_line1), ''),
        NULLIF(btrim(l.address_line2), ''),
        NULLIF(btrim(concat_ws(', ',
          NULLIF(btrim(l.city), ''),
          NULLIF(btrim(l.state), '')
        )), ''),
        NULLIF(btrim(l.postal_code), '')
      ), ''
    ) AS address,
    l.timezone,
    l.phone,
    rs.booking_policy,
    rs.collect_birthday,
    rs.large_party_phone,
    rs.cancellation_cutoff_min,
    -- Party bounds and the booking window live on the SERVICE PERIOD, not the
    -- location: lunch may seat parties of two to six while dinner seats up to
    -- twelve. The widget asks one question before it knows which period a guest
    -- will land in, so it needs the union — the widest range any period offers.
    -- Anything narrower would refuse a party the restaurant can actually seat.
    MIN(sp.min_party_size)   AS min_party_size,
    MAX(sp.max_party_size)   AS max_party_size,
    MAX(sp.max_advance_days) AS max_advance_days
  FROM merchant_sites ms
  JOIN locations l
    ON l.merchant_id = ms.merchant_id
   AND l.is_active
  JOIN reservation_settings rs
    ON rs.location_id = l.id
   AND rs.accepts_reservations
  JOIN reservation_service_periods sp
    ON sp.location_id = l.id
   AND sp.is_active
  WHERE ms.id = p_site_id
    AND ms.features->>'reservations' = 'true'
    AND ms.brand->>'reservationMode' = 'native'
  GROUP BY
    l.id, l.name, l.address_line1, l.address_line2, l.city, l.state,
    l.postal_code, l.timezone, l.phone,
    rs.booking_policy, rs.collect_birthday, rs.large_party_phone,
    rs.cancellation_cutoff_min
  ORDER BY l.name;
$$;

COMMENT ON FUNCTION public.get_public_reservation_config(uuid) IS
  'Bookable branches for a site, with the public booking settings the guest widget is shaped by. Allowlisted columns only — never notify_emails, table ids or existing bookings. Gate mirrors get_public_reservation_availability.';

-- Same posture as every other public reservation function: reachable only by
-- the service role, from a server route that has already decided the request is
-- legitimate. An anon or authenticated caller must not be able to enumerate a
-- merchant's branch setup directly.
REVOKE ALL ON FUNCTION public.get_public_reservation_config(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_reservation_config(uuid) TO service_role;
