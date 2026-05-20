-- =============================================================================
-- Migration: HQ Merchant Impersonation — sessions, audit columns, RPCs
-- =============================================================================
-- Adds infrastructure for Dexa HQ admins to "view as merchant" inside the
-- /dashboard experience. See plan in
-- ~/.claude/plans/lets-look-into-and-imperative-zephyr.md
--
-- This migration is fully additive:
--   * New table: impersonation_sessions (server-of-truth for active sessions)
--   * audit_logs gets impersonation_session_id / is_impersonation /
--     impersonator_user_id columns. NOT NULL DEFAULT false on the boolean is
--     metadata-only on PG >= 11 — no table rewrite.
--   * log_audit_event gains two new params at the end with DEFAULT NULL —
--     every existing caller continues to work unchanged.
--   * New SECURITY DEFINER RPCs:
--         hq_can_impersonate_merchant(uuid)       -> boolean
--         start_impersonation_session(uuid,...)   -> uuid (session id)
--         end_impersonation_session(uuid, text)   -> void
--         touch_impersonation_session(uuid)       -> boolean
--   * New RLS helper is_merchant_admin_or_impersonating(uuid). Existing
--     policies are NOT changed by this migration — that swap is handled in
--     20260504110200_extend_rls_for_impersonation.sql so review can be
--     scoped tightly.
--
-- Audit identity contract (frozen — referenced by readers downstream):
--   audit_logs.actor_user_id   = the real Clerk user pressing the button
--                                (the HQ admin during an impersonation session)
--   audit_logs.merchant_id     = the merchant being acted upon (the impersonated
--                                merchant during a session)
--   audit_logs.impersonator_user_id = denormalized copy of actor_user_id when
--                                is_impersonation = true. Kept separate so
--                                "show me everything Sarah did while
--                                 impersonating" filters in O(index lookup).
-- =============================================================================


-- 1. Sessions table
CREATE TABLE IF NOT EXISTS public.impersonation_sessions (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    hq_user_id          text NOT NULL,
    target_merchant_id  uuid NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
    started_at          timestamptz NOT NULL DEFAULT now(),
    ended_at            timestamptz NULL,
    end_reason          text NULL,
    last_validated_at   timestamptz NOT NULL DEFAULT now(),
    ip_address          inet NULL,
    user_agent          text NULL,
    reason              text NULL,
    CONSTRAINT impersonation_sessions_end_reason_check
        CHECK (end_reason IS NULL OR end_reason IN (
            'user_exit',
            'idle_timeout',
            'revoked_access',
            'session_expired',
            'superseded'
        )),
    CONSTRAINT impersonation_sessions_ended_state_check
        CHECK (
            (ended_at IS NULL  AND end_reason IS NULL)
         OR (ended_at IS NOT NULL AND end_reason IS NOT NULL)
        )
);

COMMENT ON TABLE  public.impersonation_sessions IS
    'One row per HQ admin impersonation session. Anchors per-action audit_logs rows via FK.';
COMMENT ON COLUMN public.impersonation_sessions.hq_user_id IS
    'Clerk user ID of the real HQ admin who initiated the session.';
COMMENT ON COLUMN public.impersonation_sessions.target_merchant_id IS
    'The merchant being impersonated.';
COMMENT ON COLUMN public.impersonation_sessions.last_validated_at IS
    'Updated on every touch_impersonation_session call. Sliding 30-min TTL is enforced against this column.';
COMMENT ON COLUMN public.impersonation_sessions.end_reason IS
    'How the session ended. NULL while active. CHECK enforces enum values.';

CREATE UNIQUE INDEX IF NOT EXISTS impersonation_sessions_one_active_per_admin_idx
    ON public.impersonation_sessions (hq_user_id)
    WHERE ended_at IS NULL;

CREATE INDEX IF NOT EXISTS impersonation_sessions_target_started_idx
    ON public.impersonation_sessions (target_merchant_id, started_at DESC);


-- 2. RLS on impersonation_sessions
ALTER TABLE public.impersonation_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS impersonation_sessions_hq_select ON public.impersonation_sessions;
CREATE POLICY impersonation_sessions_hq_select
    ON public.impersonation_sessions
    FOR SELECT
    TO authenticated
    USING (public.is_dexapos_admin());

DROP POLICY IF EXISTS impersonation_sessions_merchant_owner_select ON public.impersonation_sessions;
CREATE POLICY impersonation_sessions_merchant_owner_select
    ON public.impersonation_sessions
    FOR SELECT
    TO authenticated
    USING (public.is_merchant_owner(target_merchant_id));


-- 3. audit_logs column adds
ALTER TABLE public.audit_logs
    ADD COLUMN IF NOT EXISTS impersonation_session_id uuid NULL
        REFERENCES public.impersonation_sessions(id) ON DELETE SET NULL;

ALTER TABLE public.audit_logs
    ADD COLUMN IF NOT EXISTS is_impersonation boolean NOT NULL DEFAULT false;

ALTER TABLE public.audit_logs
    ADD COLUMN IF NOT EXISTS impersonator_user_id text NULL;

COMMENT ON COLUMN public.audit_logs.impersonation_session_id IS
    'FK to impersonation_sessions. NULL for normal merchant actions. Allows clean session-scoped queries.';
COMMENT ON COLUMN public.audit_logs.is_impersonation IS
    'True iff this row was written during an active HQ impersonation session. Denormalized for index speed (see audit_logs_impersonation_idx).';
COMMENT ON COLUMN public.audit_logs.impersonator_user_id IS
    'Denormalized copy of actor_user_id when is_impersonation=true. Same human, kept separate for filter speed.';


-- 4. log_audit_event — extend with two optional params at the end
CREATE OR REPLACE FUNCTION public.log_audit_event(
    p_merchant_id              uuid,
    p_location_id              uuid,
    p_actor_user_id            text,
    p_actor_name               text,
    p_actor_role               text,
    p_action                   text,
    p_action_category          text,
    p_severity                 text     DEFAULT 'info',
    p_resource_type            text     DEFAULT NULL,
    p_resource_id              uuid     DEFAULT NULL,
    p_resource_name            text     DEFAULT NULL,
    p_changes                  jsonb    DEFAULT NULL,
    p_metadata                 jsonb    DEFAULT NULL,
    p_pii_access_type          text     DEFAULT NULL,
    p_impersonation_session_id uuid     DEFAULT NULL,
    p_impersonator_user_id     text     DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
    v_log_id uuid;
BEGIN
    INSERT INTO public.audit_logs (
        merchant_id,
        location_id,
        actor_user_id,
        actor_name,
        actor_role,
        action,
        action_category,
        severity,
        resource_type,
        resource_id,
        resource_name,
        changes,
        metadata,
        pii_access_type,
        impersonation_session_id,
        is_impersonation,
        impersonator_user_id
    ) VALUES (
        p_merchant_id,
        p_location_id,
        p_actor_user_id,
        p_actor_name,
        p_actor_role,
        p_action,
        p_action_category,
        p_severity,
        p_resource_type,
        p_resource_id,
        p_resource_name,
        p_changes,
        p_metadata,
        p_pii_access_type,
        p_impersonation_session_id,
        (p_impersonation_session_id IS NOT NULL),
        p_impersonator_user_id
    )
    RETURNING id INTO v_log_id;

    RETURN v_log_id;
END;
$$;


-- 5. hq_can_impersonate_merchant — the gate
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

    IF EXISTS (
        SELECT 1
          FROM public.user_roles ur
         WHERE ur.user_id   = v_user_id
           AND ur.role_code = 'hq.super_admin'
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

REVOKE ALL    ON FUNCTION public.hq_can_impersonate_merchant(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.hq_can_impersonate_merchant(uuid) TO authenticated;

COMMENT ON FUNCTION public.hq_can_impersonate_merchant(uuid) IS
    'Returns true iff current user is HQ admin AND (is hq.super_admin OR has active admin_merchant_access). Called by start_impersonation_session and used by /manage UI to gate the View as merchant button.';


-- 6. start_impersonation_session
CREATE OR REPLACE FUNCTION public.start_impersonation_session(
    p_merchant_id uuid,
    p_reason      text DEFAULT NULL,
    p_ip_address  inet DEFAULT NULL,
    p_user_agent  text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
    v_user_id    text;
    v_session_id uuid;
BEGIN
    v_user_id := public.current_user_id();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'start_impersonation_session: not authenticated'
            USING ERRCODE = '28000';
    END IF;

    IF NOT public.hq_can_impersonate_merchant(p_merchant_id) THEN
        RAISE EXCEPTION 'start_impersonation_session: not authorized to impersonate merchant %', p_merchant_id
            USING ERRCODE = '42501';
    END IF;

    UPDATE public.impersonation_sessions
       SET ended_at   = now(),
           end_reason = 'superseded'
     WHERE hq_user_id = v_user_id
       AND ended_at IS NULL;

    INSERT INTO public.impersonation_sessions (
        hq_user_id,
        target_merchant_id,
        reason,
        ip_address,
        user_agent
    ) VALUES (
        v_user_id,
        p_merchant_id,
        p_reason,
        p_ip_address,
        p_user_agent
    )
    RETURNING id INTO v_session_id;

    RETURN v_session_id;
END;
$$;

REVOKE ALL    ON FUNCTION public.start_impersonation_session(uuid, text, inet, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.start_impersonation_session(uuid, text, inet, text) TO authenticated;

COMMENT ON FUNCTION public.start_impersonation_session(uuid, text, inet, text) IS
    'Begins a new impersonation session for the calling HQ admin. Supersedes any prior active session. Raises 42501 if not authorized.';


-- 7. end_impersonation_session — idempotent
CREATE OR REPLACE FUNCTION public.end_impersonation_session(
    p_session_id uuid,
    p_reason     text DEFAULT 'user_exit'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
    v_user_id text;
BEGIN
    v_user_id := public.current_user_id();
    IF v_user_id IS NULL THEN
        RETURN;
    END IF;

    UPDATE public.impersonation_sessions
       SET ended_at   = COALESCE(ended_at, now()),
           end_reason = COALESCE(end_reason, p_reason)
     WHERE id         = p_session_id
       AND hq_user_id = v_user_id
       AND ended_at IS NULL;
END;
$$;

REVOKE ALL    ON FUNCTION public.end_impersonation_session(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.end_impersonation_session(uuid, text) TO authenticated;

COMMENT ON FUNCTION public.end_impersonation_session(uuid, text) IS
    'Marks an impersonation session ended. Idempotent. Only the originating admin can end their own session.';


-- 8. touch_impersonation_session — sliding TTL + revalidation in one round-trip
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

    IF v_session.last_validated_at < now() - interval '30 minutes' THEN
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

REVOKE ALL    ON FUNCTION public.touch_impersonation_session(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.touch_impersonation_session(uuid) TO authenticated;

COMMENT ON FUNCTION public.touch_impersonation_session(uuid) IS
    'Re-validates an impersonation session and slides its 30-min TTL. Returns true if still valid; ends the session and returns false otherwise. Called on every request that resolves merchant context.';


-- 9. is_merchant_admin_or_impersonating — the RLS helper
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
                   AND s.last_validated_at   > now() - interval '30 minutes'
            )
        );
$$;

REVOKE ALL    ON FUNCTION public.is_merchant_admin_or_impersonating(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_merchant_admin_or_impersonating(uuid) TO authenticated;

COMMENT ON FUNCTION public.is_merchant_admin_or_impersonating(uuid) IS
    'Returns true if current user is a merchant admin for the given merchant OR is an HQ admin with an active, fresh (<30min) impersonation session targeting it. Drop-in replacement for is_merchant_admin in policies that should allow impersonation.';
;
