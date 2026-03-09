-- ============================================================================
-- Migration 024: POS Staff Login RPC
-- ============================================================================
-- Purpose: Provides a single RPC endpoint for the POS tablet to authenticate
-- staff by PIN. Returns role_code so the tablet can gate access:
--   - merchant.staff  → clock in/out only
--   - merchant.cashier → full POS order flow
--   - merchant.owner / admin / manager → full POS + elevated actions
--
-- Security: SECURITY DEFINER + anon-accessible so the tablet can call it
-- before a session exists. No sensitive data is returned beyond what the
-- tablet needs to render the correct UI.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.pos_staff_login(
  p_location_id  UUID,
  p_pin_code     TEXT
)
RETURNS TABLE (
  success          BOOLEAN,
  staff_profile_id UUID,
  role_code        TEXT,
  first_name       TEXT,
  last_name        TEXT,
  error_message    TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_row RECORD;
BEGIN
  -- Validate inputs
  IF p_location_id IS NULL OR p_pin_code IS NULL OR p_pin_code = '' THEN
    RETURN QUERY SELECT false, NULL::UUID, NULL::TEXT, NULL::TEXT, NULL::TEXT,
      'Missing location_id or pin_code'::TEXT;
    RETURN;
  END IF;

  -- Scan active staff at this location and check each PIN.
  -- For a typical location (≤ 50 staff) this is fast; PIN is hashed with
  -- bcrypt so we must compare each row — no index shortcut is possible.
  FOR v_row IN
    SELECT
      lm.staff_profile_id,
      lm.role_code,
      lm.pin_code        AS stored_hash,
      sp.first_name,
      sp.last_name
    FROM location_members lm
    JOIN staff_profiles sp ON sp.id = lm.staff_profile_id
    WHERE lm.location_id = p_location_id
      AND lm.is_active   = true
      AND sp.is_active   = true
      AND lm.pin_code    IS NOT NULL
  LOOP
    -- crypt(attempt, stored_hash) == stored_hash when the PIN is correct
    IF crypt(p_pin_code, v_row.stored_hash) = v_row.stored_hash THEN
      RETURN QUERY SELECT
        true,
        v_row.staff_profile_id,
        v_row.role_code,
        v_row.first_name,
        v_row.last_name,
        NULL::TEXT;
      RETURN;
    END IF;
  END LOOP;

  -- No matching PIN found
  RETURN QUERY SELECT false, NULL::UUID, NULL::TEXT, NULL::TEXT, NULL::TEXT,
    'Invalid PIN'::TEXT;
END;
$$;

-- Allow the POS tablet (anon/service role) to call this function.
-- The function itself enforces location scoping via the p_location_id param.
GRANT EXECUTE ON FUNCTION public.pos_staff_login(UUID, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.pos_staff_login(UUID, TEXT) TO authenticated;

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
-- Usage (from POS tablet):
--   SELECT * FROM pos_staff_login('<location_uuid>', '1234');
--
-- Returned columns:
--   success          — true if PIN matched an active staff member
--   staff_profile_id — UUID of the matched staff_profiles row
--   role_code        — e.g. 'merchant.cashier', 'merchant.staff', 'merchant.owner'
--   first_name       — for greeting display
--   last_name
--   error_message    — populated only when success = false
--
-- Role gating on the tablet:
--   role_code = 'merchant.staff'   → show clock-in/out screen only
--   role_code = 'merchant.cashier' → full POS order UI
--   role_code level ≥ 7            → manager overrides
