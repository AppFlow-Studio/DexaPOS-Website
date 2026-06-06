-- Adds the tip-distribution void path:
--   - tip_distribution_sessions.void_reason text
--   - tip_distribution_sessions.voided_at timestamptz
--   - tip_distribution_sessions.voided_by uuid
--   - void_tip_distribution(p_session_id, p_reason, p_voided_by) RPC
--
-- Mirrors the staging migration that wired up `void_tip_distribution`. Without
-- these, prod cannot void a tip distribution session: the columns the RPC
-- writes into don't exist and the RPC itself is missing.

ALTER TABLE public.tip_distribution_sessions
  ADD COLUMN IF NOT EXISTS void_reason text,
  ADD COLUMN IF NOT EXISTS voided_at   timestamptz,
  ADD COLUMN IF NOT EXISTS voided_by   uuid;

CREATE OR REPLACE FUNCTION public.void_tip_distribution(p_session_id uuid, p_reason text, p_voided_by uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_merchant_id UUID;
  v_current_status TEXT;
BEGIN
  IF p_reason IS NULL OR length(trim(p_reason)) = 0 THEN
    RAISE EXCEPTION 'Void reason is required' USING ERRCODE = 'check_violation';
  END IF;

  SELECT merchant_id, status
    INTO v_merchant_id, v_current_status
  FROM public.tip_distribution_sessions
  WHERE id = p_session_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Session not found' USING ERRCODE = 'no_data_found';
  END IF;

  IF NOT (is_dexapos_admin() OR v_merchant_id = user_merchant_id()) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_current_status = 'voided' THEN
    RETURN json_build_object('success', false, 'error', 'Session is already voided');
  END IF;

  UPDATE public.tip_distribution_sessions
  SET status      = 'voided',
      voided_at   = now(),
      voided_by   = p_voided_by,
      void_reason = p_reason,
      updated_at  = now()
  WHERE id = p_session_id;

  RETURN json_build_object(
    'success', true,
    'session_id', p_session_id,
    'previous_status', v_current_status
  );
END;
$function$;
