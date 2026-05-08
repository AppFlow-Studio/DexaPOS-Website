-- Fix hq_can_impersonate_merchant: super_admin role lookup was reading
-- public.user_roles, but the canonical HQ role assignment lives in
-- public.members.role (per migration 019 / get_my_hq_role). user_roles is
-- legacy/secondary and was missing super_admin rows for current HQ users.

CREATE OR REPLACE FUNCTION public.hq_can_impersonate_merchant(
    p_merchant_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
    v_user_id text;
BEGIN
    IF NOT public.is_dexapos_admin() THEN
        RETURN false;
    END IF;

    v_user_id := public.current_user_id();
    IF v_user_id IS NULL THEN
        RETURN false;
    END IF;

    -- Super admins bypass admin_merchant_access. Role is read from
    -- members.role (the canonical store; see migration 019).
    IF EXISTS (
        SELECT 1
          FROM public.members m
         WHERE m.user_id = v_user_id
           AND m.role    = 'hq.super_admin'
    ) THEN
        RETURN true;
    END IF;

    RETURN EXISTS (
        SELECT 1
          FROM public.admin_merchant_access ama
         WHERE ama.admin_user_id = v_user_id
           AND ama.merchant_id   = p_merchant_id
           AND ama.is_active     = true
    );
END;
$$;
