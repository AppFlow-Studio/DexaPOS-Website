-- =============================================================================
-- Migration: Preview Tip Distribution RPC
-- =============================================================================
-- Creates a non-destructive preview function that runs the full calculation
-- inside a PL/pgSQL subtransaction (BEGIN...EXCEPTION), captures the JSON
-- result, then rolls back all DB writes via an intentional exception.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.preview_tip_distribution(
  p_merchant_id    UUID,
  p_location_id    UUID,
  p_session_date   DATE,
  p_shift_period   TEXT DEFAULT 'full_day'
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_result JSON;
BEGIN
  -- Authorization
  IF NOT (is_dexapos_admin() OR p_merchant_id = user_merchant_id()) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Run the full calculation in a subtransaction. The intentional RAISE at
  -- the end triggers a rollback of all DB writes (session, details, daily
  -- tips refresh) while preserving the in-memory v_result variable.
  BEGIN
    SELECT public.calculate_tip_distribution_v2(
      p_merchant_id,
      p_location_id,
      p_session_date,
      p_shift_period,
      NULL  -- no calculated_by for preview
    ) INTO v_result;

    -- Intentional raise to roll back the subtransaction
    RAISE EXCEPTION 'preview_rollback' USING ERRCODE = 'P0099';
  EXCEPTION
    WHEN SQLSTATE 'P0099' THEN
      -- Subtransaction rolled back; v_result still in scope
      RETURN v_result;
  END;
END;
$$;
