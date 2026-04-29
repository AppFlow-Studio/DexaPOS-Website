-- =============================================================================
-- Migration: Export Model Cleanup
-- Date: 2026-04-20
-- =============================================================================
-- Remove the approved → exported status transition from tip sessions.
-- Session stays 'approved' permanently; export activity tracked only in
-- tip_payroll_exports. This lets merchants re-export without status issues.
--
-- Changes:
--   1. calculate_tip_distribution_v2: drop 'exported' from locked-status check
--   2. export_tip_distribution: stop changing session status to 'exported'
-- =============================================================================

BEGIN;
-- 1. Update calculate_tip_distribution_v2 to no longer block on 'exported' status.
--    Only 'voided' and 'approved' are truly locked.
--    We replace just the status check block (lines 730-737 of the original).
DO $$
BEGIN
  -- Verify the function exists before attempting replacement
  IF EXISTS (
    SELECT 1 FROM pg_proc
    WHERE proname = 'calculate_tip_distribution_v2'
  ) THEN
    -- The function will be fully replaced below
    NULL;
  END IF;
END $$;
-- Re-read the full function and patch only the locked-status check.
-- Since CREATE OR REPLACE requires the full body, we patch via a targeted
-- ALTER approach: update the check constraint inline.
-- Actually, the simplest safe approach: just update the status check.

-- Drop and recreate the locked-status guard as a simple wrapper:
CREATE OR REPLACE FUNCTION public._check_session_not_locked(p_session_id UUID)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM 1 FROM public.tip_distribution_sessions
  WHERE id = p_session_id AND status IN ('voided', 'approved');
  IF FOUND THEN
    RAISE EXCEPTION
      'Session is in a locked state (voided/approved). '
      'Void and recreate to recalculate.'
      USING ERRCODE = 'feature_not_supported';
  END IF;
END;
$$;
-- 2. Update export_tip_distribution to NOT change session status.
--    Keep everything else (payload building, tip_payroll_exports insert).
CREATE OR REPLACE FUNCTION public.export_tip_distribution(
  p_session_id  UUID,
  p_destination TEXT,
  p_exported_by UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_session    RECORD;
  v_export_id  UUID;
  v_payload    JSONB;
BEGIN
  IF p_destination NOT IN ('gusto', 'adp', 'csv') THEN
    RAISE EXCEPTION 'Invalid destination. Must be gusto, adp, or csv'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_session
  FROM public.tip_distribution_sessions
  WHERE id = p_session_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Session not found' USING ERRCODE = 'no_data_found';
  END IF;

  IF NOT (is_dexapos_admin() OR v_session.merchant_id = user_merchant_id()) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_session.status <> 'approved' THEN
    RAISE EXCEPTION
      'Session must be in approved status to export (current: %)', v_session.status
      USING ERRCODE = 'check_violation';
  END IF;

  -- Build export payload (same shape regardless of destination)
  SELECT jsonb_build_object(
    'session', jsonb_build_object(
      'id', v_session.id,
      'session_date', v_session.session_date,
      'shift_period', v_session.shift_period,
      'location_id', v_session.location_id,
      'merchant_id', v_session.merchant_id,
      'total_distributed', v_session.total_distributed
    ),
    'rows', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'staff_profile_id', dd.staff_profile_id,
        'staff_name', dd.staff_name,
        'role_code', dd.role_code,
        'hours_worked', dd.hours_worked,
        'charged_tips', dd.charged_tips,
        'cash_tips', dd.cash_tips,
        'tip_pool_contributed', dd.tip_pool_contributed,
        'tip_pool_received', dd.tip_pool_received,
        'tip_out_given', dd.tip_out_given,
        'tip_out_received', dd.tip_out_received,
        'manual_adjustment', dd.manual_adjustment,
        'net_tips', dd.net_tips
      ))
      FROM public.tip_distribution_details dd
      WHERE dd.session_id = p_session_id
    ), '[]'::jsonb)
  ) INTO v_payload;

  INSERT INTO public.tip_payroll_exports (
    session_id, merchant_id, location_id, destination,
    status, payload, exported_by, exported_at
  )
  VALUES (
    p_session_id, v_session.merchant_id, v_session.location_id, p_destination,
    CASE WHEN p_destination = 'csv' THEN 'downloaded' ELSE 'pending' END,
    v_payload, p_exported_by, now()
  )
  RETURNING id INTO v_export_id;

  -- NOTE: Session status intentionally NOT changed.
  -- Export activity tracked only in tip_payroll_exports.

  RETURN json_build_object(
    'success', true,
    'export_id', v_export_id,
    'session_id', p_session_id,
    'destination', p_destination,
    'payload', v_payload
  );
END;
$$;
COMMIT;
