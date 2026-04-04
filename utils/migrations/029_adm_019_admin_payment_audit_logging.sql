-- ============================================================================
-- Migration 029: ADM-019 Admin Payment Audit Logging
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.payment_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_type text NOT NULL,
  resource_id uuid,
  action text NOT NULL,
  user_id text,
  staff_profile_id uuid,
  user_email text,
  user_role text,
  merchant_id uuid,
  location_id uuid,
  ip_address inet,
  user_agent text,
  request_path text,
  success boolean NOT NULL DEFAULT true,
  error_message text,
  fields_accessed text[],
  event_timestamp timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payment_audit_log_event_timestamp
  ON public.payment_audit_log(event_timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_payment_audit_log_user_event
  ON public.payment_audit_log(user_id, event_timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_payment_audit_log_merchant_event
  ON public.payment_audit_log(merchant_id, event_timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_payment_audit_log_action_event
  ON public.payment_audit_log(action, event_timestamp DESC);

CREATE OR REPLACE FUNCTION public.log_admin_payment_audit_event(
  p_action text,
  p_resource_type text DEFAULT 'payment_data',
  p_resource_id text DEFAULT NULL,
  p_merchant_id text DEFAULT NULL,
  p_location_id text DEFAULT NULL,
  p_fields_accessed text[] DEFAULT NULL,
  p_success boolean DEFAULT true,
  p_error_message text DEFAULT NULL,
  p_request_path text DEFAULT '/manage/transactions',
  p_ip_address text DEFAULT NULL,
  p_user_agent text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id text := auth.jwt()->>'sub';
  v_user_email text := NULLIF(auth.jwt()->>'email', '');
  v_user_role text := NULL;
  v_resource_id uuid := NULL;
  v_merchant_id uuid := NULL;
  v_location_id uuid := NULL;
  v_ip_address inet := NULL;
BEGIN
  IF NOT public.is_dexapos_admin() THEN
    RETURN;
  END IF;

  IF NULLIF(trim(COALESCE(p_resource_id, '')), '') IS NOT NULL THEN
    BEGIN
      v_resource_id := trim(p_resource_id)::uuid;
    EXCEPTION
      WHEN others THEN
        v_resource_id := NULL;
    END;
  END IF;

  IF NULLIF(trim(COALESCE(p_merchant_id, '')), '') IS NOT NULL THEN
    BEGIN
      v_merchant_id := trim(p_merchant_id)::uuid;
    EXCEPTION
      WHEN others THEN
        v_merchant_id := NULL;
    END;
  END IF;

  IF NULLIF(trim(COALESCE(p_location_id, '')), '') IS NOT NULL THEN
    BEGIN
      v_location_id := trim(p_location_id)::uuid;
    EXCEPTION
      WHEN others THEN
        v_location_id := NULL;
    END;
  END IF;

  IF NULLIF(trim(COALESCE(p_ip_address, '')), '') IS NOT NULL THEN
    BEGIN
      v_ip_address := trim(p_ip_address)::inet;
    EXCEPTION
      WHEN others THEN
        v_ip_address := NULL;
    END;
  END IF;

  BEGIN
    SELECT role_code::text
    INTO v_user_role
    FROM public.get_my_hq_role()
    LIMIT 1;
  EXCEPTION
    WHEN others THEN
      v_user_role := NULL;
  END;

  INSERT INTO public.payment_audit_log (
    resource_type,
    resource_id,
    action,
    user_id,
    user_email,
    user_role,
    merchant_id,
    location_id,
    ip_address,
    user_agent,
    request_path,
    success,
    error_message,
    fields_accessed,
    event_timestamp
  )
  VALUES (
    COALESCE(NULLIF(trim(COALESCE(p_resource_type, '')), ''), 'payment_data'),
    v_resource_id,
    COALESCE(NULLIF(trim(COALESCE(p_action, '')), ''), 'unknown_action'),
    v_user_id,
    v_user_email,
    v_user_role,
    v_merchant_id,
    v_location_id,
    v_ip_address,
    NULLIF(trim(COALESCE(p_user_agent, '')), ''),
    COALESCE(NULLIF(trim(COALESCE(p_request_path, '')), ''), '/manage/transactions'),
    COALESCE(p_success, true),
    NULLIF(trim(COALESCE(p_error_message, '')), ''),
    COALESCE(p_fields_accessed, ARRAY[]::text[]),
    now()
  );
EXCEPTION
  WHEN others THEN
    RETURN;
END;
$$;

REVOKE ALL ON FUNCTION public.log_admin_payment_audit_event(
  text, text, text, text, text, text[], boolean, text, text, text, text
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.log_admin_payment_audit_event(
  text, text, text, text, text, text[], boolean, text, text, text, text
) TO authenticated;

COMMENT ON FUNCTION public.log_admin_payment_audit_event(
  text, text, text, text, text, text[], boolean, text, text, text, text
)
IS 'Logs HQ admin payment-data access actions (list/detail/export/search) to payment_audit_log. Retained long-term; no automatic pruning configured.';
