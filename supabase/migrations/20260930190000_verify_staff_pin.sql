-- =============================================================================
-- verify_staff_pin: identify a staff member by PIN, with no side effects
-- =============================================================================
-- The POS per-order PIN gate (Dexa-POS hooks/useVerifyStaffPin.ts, since
-- 2026-06-28) calls verify_staff_pin(p_location_id, p_pin_code) to learn WHO
-- is ringing an order. The function was never created, so every online PIN
-- entry failed with PGRST202 and the tablet fell back to matching the PIN
-- against its cached staff list. Attribution then followed whatever that cache
-- held: a PIN changed or a staff member deactivated on the dashboard still
-- matched until the next employee sync.
--
-- Contract (what the client already sends and reads):
--   args     p_location_id uuid, p_pin_code text
--   returns  one row { staff_profile_id, name, role } on a match,
--            no rows for a wrong or empty PIN (the client shows "wrong PIN").
--   errors   any error makes the client fall back to its cached match, so
--            "not authorized" degrades to today's behaviour instead of
--            blocking the till.
--
-- Deliberately NOT pos_staff_login*: no station_session, no clock-in, no
-- device/shift state, no login-attempt rows. It only reads.
--
-- PIN rules are pos_staff_login's: an active location member of an active
-- staff profile, matched on the plain PIN (pin_plain, else a numeric pin_code)
-- or a bcrypt hash (pin_hashed, else a non-numeric pin_code). Plain PINs are
-- checked first so bcrypt only runs when no plain PIN matched. If two staff
-- share a plain PIN, the lowest staff_profile_id wins, so the answer is at
-- least stable.
--
-- Caller check: the caller's merchant must own the location (dexapos admins
-- excepted), the same rule get_pos_bootstrap_v1 applies to the POS.
--
-- ROLLBACK: rollback/20260930190000_verify_staff_pin_rollback.sql
-- =============================================================================

CREATE OR REPLACE FUNCTION public.verify_staff_pin(
  p_location_id uuid,
  p_pin_code text
)
RETURNS TABLE (staff_profile_id uuid, name text, role text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE
  v_merchant_id uuid;
  v_row record;
BEGIN
  IF p_location_id IS NULL OR p_pin_code IS NULL OR p_pin_code = '' THEN
    RETURN;
  END IF;

  SELECT l.merchant_id
    INTO v_merchant_id
    FROM public.locations l
   WHERE l.id = p_location_id;

  IF v_merchant_id IS NULL THEN
    RAISE EXCEPTION 'Location % not found', p_location_id
      USING ERRCODE = '42704';
  END IF;

  -- COALESCE: a NULL from either helper counts as "no", never as a pass.
  IF NOT COALESCE(public.is_dexapos_admin(), false)
     AND public.user_merchant_id() IS DISTINCT FROM v_merchant_id THEN
    RAISE EXCEPTION 'Not authorized for location %', p_location_id
      USING ERRCODE = '42501';
  END IF;

  -- 1. Plain PIN (indexed on location_id, pin_plain).
  RETURN QUERY
    SELECT lm.staff_profile_id,
           COALESCE(
             NULLIF(btrim(sp.display_name), ''),
             btrim(concat_ws(' ', sp.first_name, sp.last_name))
           ),
           lm.role_code
      FROM public.location_members lm
      JOIN public.staff_profiles sp ON sp.id = lm.staff_profile_id
     WHERE lm.location_id = p_location_id
       AND lm.is_active = true
       AND sp.is_active = true
       AND COALESCE(lm.pin_plain, lm.pin_code) = p_pin_code
     ORDER BY lm.staff_profile_id
     LIMIT 1;
  IF FOUND THEN
    RETURN;
  END IF;

  -- 2. bcrypt hash.
  FOR v_row IN
    SELECT lm.staff_profile_id,
           COALESCE(
             NULLIF(btrim(sp.display_name), ''),
             btrim(concat_ws(' ', sp.first_name, sp.last_name))
           ) AS staff_name,
           lm.role_code,
           COALESCE(
             lm.pin_hashed,
             CASE WHEN lm.pin_code !~ '^\d{4,6}$' THEN lm.pin_code END
           ) AS stored_hash
      FROM public.location_members lm
      JOIN public.staff_profiles sp ON sp.id = lm.staff_profile_id
     WHERE lm.location_id = p_location_id
       AND lm.is_active = true
       AND sp.is_active = true
       AND COALESCE(
             lm.pin_hashed,
             CASE WHEN lm.pin_code !~ '^\d{4,6}$' THEN lm.pin_code END
           ) LIKE '$2%'
     ORDER BY lm.staff_profile_id
  LOOP
    IF extensions.crypt(p_pin_code, v_row.stored_hash) = v_row.stored_hash THEN
      staff_profile_id := v_row.staff_profile_id;
      name := v_row.staff_name;
      role := v_row.role_code;
      RETURN NEXT;
      RETURN;
    END IF;
  END LOOP;
END
$fn$;

COMMENT ON FUNCTION public.verify_staff_pin(uuid, text) IS
  'Per-order PIN attribution: returns the active staff member at the location whose PIN matches (staff_profile_id, name, role), or no rows. Read-only: no session, clock or device state. Caller must belong to the location''s merchant.';

REVOKE ALL ON FUNCTION public.verify_staff_pin(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.verify_staff_pin(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.verify_staff_pin(uuid, text) TO authenticated;
