-- Extend impersonation session TTL from 30 minutes to 24 hours.
-- Replaces touch_impersonation_session and is_merchant_admin_or_impersonating
-- to use a 24-hour sliding window instead of 30 minutes. No data migration
-- needed — only the freshness check threshold changes.

CREATE OR REPLACE FUNCTION public.touch_impersonation_session(
    p_session_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
    v_user_id          text;
    v_session          public.impersonation_sessions%ROWTYPE;
    v_can_impersonate  boolean;
BEGIN
    v_user_id := public.current_user_id();
    IF v_user_id IS NULL THEN
        RETURN false;
    END IF;

    SELECT * INTO v_session
      FROM public.impersonation_sessions
     WHERE id         = p_session_id
       AND hq_user_id = v_user_id
       FOR UPDATE;

    IF NOT FOUND THEN
        RETURN false;
    END IF;

    IF v_session.ended_at IS NOT NULL THEN
        RETURN false;
    END IF;

    IF v_session.last_validated_at < now() - interval '24 hours' THEN
        UPDATE public.impersonation_sessions
           SET ended_at   = now(),
               end_reason = 'idle_timeout'
         WHERE id = p_session_id;
        RETURN false;
    END IF;

    v_can_impersonate := public.hq_can_impersonate_merchant(v_session.target_merchant_id);
    IF NOT v_can_impersonate THEN
        UPDATE public.impersonation_sessions
           SET ended_at   = now(),
               end_reason = 'revoked_access'
         WHERE id = p_session_id;
        RETURN false;
    END IF;

    UPDATE public.impersonation_sessions
       SET last_validated_at = now()
     WHERE id = p_session_id;

    RETURN true;
END;
$$;

COMMENT ON FUNCTION public.touch_impersonation_session(uuid) IS
    'Re-validates an impersonation session and slides its 24-hour TTL. Returns true if still valid; ends the session and returns false otherwise. Called on every request that resolves merchant context.';

COMMENT ON COLUMN public.impersonation_sessions.last_validated_at IS
    'Updated on every touch_impersonation_session call. Sliding 24-hour TTL is enforced against this column.';


CREATE OR REPLACE FUNCTION public.is_merchant_admin_or_impersonating(
    p_merchant_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
    SELECT
        public.is_merchant_admin(p_merchant_id)
        OR (
            public.is_dexapos_admin()
            AND EXISTS (
                SELECT 1
                  FROM public.impersonation_sessions s
                 WHERE s.hq_user_id          = public.current_user_id()
                   AND s.target_merchant_id  = p_merchant_id
                   AND s.ended_at            IS NULL
                   AND s.last_validated_at   > now() - interval '24 hours'
            )
        );
$$;

COMMENT ON FUNCTION public.is_merchant_admin_or_impersonating(uuid) IS
    'Returns true if current user is a merchant admin for the given merchant OR is an HQ admin with an active, fresh (<24h) impersonation session targeting it. Drop-in replacement for is_merchant_admin in policies that should allow impersonation.';
