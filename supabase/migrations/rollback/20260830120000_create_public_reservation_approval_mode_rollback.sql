-- Rollback for 20260830120000_create_public_reservation_approval_mode.sql
--
-- Restores the function exactly as it stood before approval mode: the status
-- hardcoded to 'confirmed', and no `status` key in either return payload.
--
-- Captured from staging via pg_get_functiondef on 2026-08-30, so this is the
-- definition that was actually running rather than a reconstruction.
--
-- Safe to run with manual-mode bookings already in the table. Rows that are
-- already 'pending' stay 'pending' — this only changes what NEW bookings
-- store. Answer or cancel them through the dashboard before rolling back, or
-- they sit pending with no code path left that expects them.

CREATE OR REPLACE FUNCTION public.create_public_reservation(
  p_site_id           uuid,
  p_hold_token        text,
  p_first_name        text,
  p_last_name         text,
  p_email             text,
  p_phone             text,
  p_special_requests  text    DEFAULT NULL::text,
  p_occasion_tags     text[]  DEFAULT '{}'::text[],
  p_dietary_tags      text[]  DEFAULT '{}'::text[],
  p_marketing_opt_in  boolean DEFAULT false,
  p_sms_opt_in        boolean DEFAULT true
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
END $function$;
