-- create_reservation: widen the location gate so merchant admins/owners can
-- create reservations even when they don't have a staff_profile or a
-- location_members row.
--
-- Background:
--   `user_location_ids()` is staff-centric — it returns locations the caller
--   has via `location_members` (Clerk user_id OR staff_profile_id match) or
--   via a merchant-level entry in `user_roles`. A Clerk-only merchant admin
--   (created through Clerk org invites, never onboarded as a staff profile)
--   has neither, so the array comes back empty and the original gate raised
--   "Location access denied". Meanwhile `is_merchant_admin(merchant_id)`
--   correctly returns TRUE for these users via the Clerk `members` table.
--
--   Same bug also leaks into the INSERT: the original sets
--   `merchant_id = user_merchant_id()` which is NULL for Clerk-only admins.
--   We now derive the merchant from the location and reuse that.

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
  v_reservation_id       uuid;
  v_confirmation_number  text;
BEGIN
  -- Resolve merchant from location (single source of truth for ownership).
  SELECT merchant_id INTO v_merchant_id
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

  IF p_reservation_date < CURRENT_DATE
     OR (p_reservation_date = CURRENT_DATE AND p_reservation_time < CURRENT_TIME) THEN
    RAISE EXCEPTION 'Reservation must be in the future';
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
