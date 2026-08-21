-- create_reservation: evaluate the "must be in the future" guard in the
-- LOCATION's timezone rather than the database server's (UTC).
--
-- Background:
--   The guard compared `p_reservation_date`/`p_reservation_time` against bare
--   `CURRENT_DATE` / `CURRENT_TIME`, which resolve in the server timezone —
--   UTC on Supabase. Every active location is US-based (UTC-4 … UTC-7), so the
--   server clock runs hours AHEAD of the restaurant's wall clock.
--
--   Concretely, at 03:08 America/New_York the server already reads 07:08 UTC,
--   so a host booking a 6:00am table for that same morning got
--   P0001 "Reservation must be in the future" for a time four hours away. The
--   whole local pre-dawn window was unbookable, and the failure window widened
--   the further west the location sat (Phoenix loses 7 hours).
--
--   `reservation_date` (date) and `reservation_time` (time) are stored as
--   wall-clock values with no offset, so the ONLY correct comparison basis is
--   the location's own timezone. We resolve it from `locations.timezone` and
--   fall back to UTC when it is NULL, which preserves today's behaviour for a
--   location that has never been configured.

CREATE OR REPLACE FUNCTION public.create_reservation(
  p_location_id          uuid,
  p_party_name           text,
  p_party_size           integer,
  p_phone                text,
  p_reservation_date     date,
  p_reservation_time     time without time zone,
  p_email                text DEFAULT NULL,
  p_duration_minutes     integer DEFAULT 90,
  p_preferred_section    text DEFAULT NULL,
  p_seating_preference   text DEFAULT NULL,
  p_notes                text DEFAULT NULL,
  p_special_requests     text DEFAULT NULL,
  p_is_vip               boolean DEFAULT false,
  p_source               text DEFAULT 'direct',
  p_assigned_table_ids   uuid[] DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_merchant_id          uuid;
  v_timezone             text;
  v_local_now            timestamp;
  v_reservation_id       uuid;
  v_confirmation_number  text;
BEGIN
  -- Resolve merchant + timezone from location (single source of truth).
  SELECT merchant_id, timezone INTO v_merchant_id, v_timezone
  FROM public.locations
  WHERE id = p_location_id;

  IF v_merchant_id IS NULL THEN
    RAISE EXCEPTION 'Location not found' USING ERRCODE = '42704';
  END IF;

  -- Allow if the caller is a location member OR a merchant admin/owner of
  -- the merchant that owns the location.
  IF NOT (
    p_location_id = ANY(user_location_ids())
    OR is_merchant_admin(v_merchant_id)
  ) THEN
    RAISE EXCEPTION 'Location access denied' USING ERRCODE = '42501';
  END IF;

  -- The restaurant's wall clock, not the server's. `AT TIME ZONE <tz>` on a
  -- timestamptz yields the local timestamp for that zone, and handles DST.
  v_local_now := now() AT TIME ZONE COALESCE(NULLIF(v_timezone, ''), 'UTC');

  IF (p_reservation_date + p_reservation_time) < v_local_now THEN
    RAISE EXCEPTION
      'Reservation must be in the future (location local time is %)',
      to_char(v_local_now, 'YYYY-MM-DD HH24:MI');
  END IF;

  INSERT INTO public.reservations (
    merchant_id, location_id,
    party_name, party_size, phone, email,
    reservation_date, reservation_time, duration_minutes,
    preferred_section, seating_preference,
    notes, special_requests, is_vip, source,
    assigned_table_ids,
    created_by_staff_id
  ) VALUES (
    v_merchant_id, p_location_id,
    p_party_name, p_party_size, p_phone, p_email,
    p_reservation_date, p_reservation_time, p_duration_minutes,
    p_preferred_section, p_seating_preference,
    p_notes, p_special_requests, p_is_vip, p_source,
    p_assigned_table_ids,
    user_staff_profile_id()
  )
  RETURNING id, confirmation_number
  INTO v_reservation_id, v_confirmation_number;

  RETURN json_build_object(
    'success', true,
    'reservation_id', v_reservation_id,
    'confirmation_number', v_confirmation_number,
    'party_name', p_party_name,
    'reservation_date', p_reservation_date,
    'reservation_time', p_reservation_time
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_reservation(
  uuid, text, integer, text, date, time without time zone,
  text, integer, text, text, text, text, boolean, text, uuid[]
) TO authenticated, service_role;
