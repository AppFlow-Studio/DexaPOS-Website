-- ============================================================================
-- create_public_reservation — store the status the merchant asked for
-- ============================================================================
--
-- Until now this function hardcoded 'confirmed', with a comment recording why:
--
--     -- Auto-confirm (plan decision D1). A "pending" booking would make the
--     -- confirmation message the guest immediately receives a lie.
--
-- That reasoning was right and it still is. It is not being overturned — it is
-- being paid for. The guest-facing copy moves in the same milestone (plan
-- §4.4–§4.6): in manual mode the button says "Request a table", the success
-- screen says nothing is confirmed yet, and the immediate message is the
-- "requested" pair rather than the "confirmed" pair. If this migration ships
-- and that copy does not, the old comment becomes true again and the feature is
-- worse than not having it.
--
-- WHERE THE SETTING LIVES. `merchant_sites.brand->>'reservationApproval'`, one
-- jsonb key on one row per merchant, because the rule is merchant-wide. The
-- obvious home, `reservation_settings`, is keyed per location: N rows that can
-- drift, and a branch created next month would silently take the column default
-- instead of the answer the merchant already gave.
--
-- IT COSTS NOTHING TO READ. The site-scoping SELECT below already joined
-- `merchant_sites` to prove the hold's location belongs to the site. The mode
-- is another column off a row that was already being fetched.
--
-- ONLY THE EXACT STRING 'manual' MEANS MANUAL. Absent, null, 'MANUAL', or
-- anything unrecognised is 'confirmed' — today's behaviour. `resolveReservationApproval`
-- in lib/site-builder/site-settings.ts applies the identical rule in TypeScript,
-- and the two must not disagree: TypeScript decides what the guest is TOLD
-- before they commit, this decides what is STORED. A mismatch means a guest
-- reading "request sent" against a row that is already confirmed, or the
-- reverse.
--
-- THE already_booked BRANCH RETURNS THE STORED STATUS. A guest who
-- double-submits a request must see the request screen again, not a
-- confirmation. It is the branch nobody tests by hand, so it is called out here.
--
-- Signature unchanged, so the existing REVOKE/GRANT block still applies and
-- there is no grant churn.
-- ============================================================================

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
  v_hold         reservation_holds%ROWTYPE;
  v_merchant_id  uuid;
  v_status       reservation_status;
  v_turn         int;
  v_start_min    int;
  v_end_min      int;
  v_id           uuid;
  v_confirmation text;
  v_manage_token text;
  v_existing     reservations%ROWTYPE;
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
      -- The stored status, not a literal. A resent request stays a request.
      'status',              v_existing.status,
      'already_booked',      true
    );
  END IF;

  IF v_hold.expires_at <= now() THEN RETURN NULL; END IF;

  -- Same site scoping as everywhere else: a hold token is not a licence to
  -- write under a different merchant's site. The approval mode rides along on
  -- the merchant_sites row this join already reads.
  SELECT l.merchant_id,
         CASE WHEN ms.brand->>'reservationApproval' = 'manual'
              THEN 'pending'
              ELSE 'confirmed'
         END::reservation_status
    INTO v_merchant_id, v_status
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
  --
  -- Note this is unchanged by approval mode, and deliberately so:
  -- `reservation_occupancy` already counts 'pending' as occupying, so a request
  -- holds its table from the moment the guest asks. Manual review cannot
  -- oversell a dining room.
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
    v_status, 'website', v_merchant_id
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
    'status',              v_status,
    'already_booked',      false
  );
END $function$;

COMMENT ON FUNCTION public.create_public_reservation(uuid, text, text, text, text, text, text, text[], text[], boolean, boolean) IS
  'Turns a hold into a booking. Stores pending when merchant_sites.brand->>''reservationApproval'' is exactly ''manual'', otherwise confirmed. Returns the stored status so the guest is shown the truth, including on a double submit.';
