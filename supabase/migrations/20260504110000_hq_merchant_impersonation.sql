-- =============================================================================
-- Migration: HQ Merchant Impersonation — sessions, audit columns, RPCs
-- =============================================================================
-- Adds infrastructure for Dexa HQ admins to "view as merchant" inside the
-- /dashboard experience. Plan: ~/.claude/plans/lets-look-into-and-imperative-zephyr.md
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
--
-- No RLS policy changes are needed: the existing public.is_merchant_admin
-- function short-circuits to true whenever public.is_dexapos_admin() is true,
-- so HQ admins already pass every is_merchant_admin-gated policy. The
-- security tightening required to make admin_merchant_access an end-to-end
-- gate (rather than only a session-start gate) is a separate project beyond
-- impersonation scope.
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


-- -----------------------------------------------------------------------------
-- 1. Sessions table
-- -----------------------------------------------------------------------------

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
-- One active session per HQ admin (multi-tab opens overwrite via 'superseded').
CREATE UNIQUE INDEX IF NOT EXISTS impersonation_sessions_one_active_per_admin_idx
    ON public.impersonation_sessions (hq_user_id)
    WHERE ended_at IS NULL;
-- "Who has impersonated this merchant lately" — for merchant-side disputes.
CREATE INDEX IF NOT EXISTS impersonation_sessions_target_started_idx
    ON public.impersonation_sessions (target_merchant_id, started_at DESC);
-- -----------------------------------------------------------------------------
-- 2. RLS on impersonation_sessions
-- -----------------------------------------------------------------------------
-- Read access:
--   * HQ admins can read everything (audit/oversight).
--   * Merchant owners can read sessions targeting their own merchant
--     (transparency: merchants can audit who accessed their account).
-- Mutations: forbidden from clients. Only SECURITY DEFINER RPCs below modify
-- this table. The lack of any INSERT/UPDATE/DELETE policy is intentional and
-- is the security boundary.

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
-- -----------------------------------------------------------------------------
-- 3. audit_logs column adds
-- -----------------------------------------------------------------------------

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
-- -----------------------------------------------------------------------------
-- 4. log_audit_event — extend with two optional params at the end
-- -----------------------------------------------------------------------------
-- Back-compat: every existing caller (positional or named) continues to work
-- because the new params have DEFAULT NULL and are appended after all current
-- params. When p_impersonation_session_id is non-null, is_impersonation is
-- automatically set to true.
--
-- We DROP the prior 14-arg signature first because Postgres treats different
-- parameter counts as separate functions even with CREATE OR REPLACE. Without
-- the drop, both versions coexist and PostgREST routes 14-named-arg callers
-- to the old version — silently bypassing impersonation logging. The drop is
-- safe: every previous caller works against the new 16-arg version because
-- the new params have DEFAULT NULL.

DROP FUNCTION IF EXISTS public.log_audit_event(
    uuid, uuid, text, text, text, text, text, text, text, uuid, text, jsonb, jsonb, text
);
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
-- -----------------------------------------------------------------------------
-- 5. hq_can_impersonate_merchant — the gate
-- -----------------------------------------------------------------------------
-- Returns true iff the current user is an HQ admin AND either:
--   (a) holds the hq.super_admin role (level 10), OR
--   (b) has an active row in admin_merchant_access for the target merchant.
--
-- Merchants and unauthenticated callers always receive false. Safe to call
-- from any role; gates downstream RPCs that mutate impersonation_sessions.

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

    -- Super admins bypass admin_merchant_access (per plan: hq.super_admin
    -- has unrestricted impersonation capability; this is logged in every
    -- session row so it is auditable). Role is read from members.role —
    -- the canonical store per migration 019. (public.user_roles exists but
    -- is legacy/secondary and is missing entries for current HQ users.)
    IF EXISTS (
        SELECT 1
          FROM public.members m
         WHERE m.user_id = v_user_id
           AND m.role    = 'hq.super_admin'
    ) THEN
        RETURN true;
    END IF;

    -- Otherwise, require an explicit grant.
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
    'Returns true iff current user is HQ admin AND (is hq.super_admin OR has active admin_merchant_access). Called by start_impersonation_session and used by /manage UI to gate the "View as merchant" button.';
-- -----------------------------------------------------------------------------
-- 6. start_impersonation_session
-- -----------------------------------------------------------------------------
-- Closes any prior active session for the same admin (end_reason='superseded'),
-- then inserts a new active session row. Caller (server action) is responsible
-- for setting cookies. Raises an exception if the admin lacks impersonation
-- access — server action surfaces that as a 403.

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

    -- Close any currently-active session for this admin. Multi-tab opens
    -- supersede; the old tab's next API call notices via touch and exits.
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
-- -----------------------------------------------------------------------------
-- 7. end_impersonation_session — idempotent
-- -----------------------------------------------------------------------------

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
        RETURN;  -- silent no-op; logout cleanup path
    END IF;

    -- Defensive: only end sessions belonging to the calling admin.
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
-- -----------------------------------------------------------------------------
-- 8. touch_impersonation_session — sliding TTL + revalidation in one round-trip
-- -----------------------------------------------------------------------------
-- Returns true if the session is still valid (not ended, within 30-min sliding
-- window, admin still has access). Updates last_validated_at. Returns false
-- (and ends the session with the appropriate reason) otherwise.
--
-- Called once per request by getEffectiveClerkOrgId via React.cache, so this
-- is on the hot path. Kept in plpgsql to do everything in one round-trip.

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

    -- Idle timeout: 30-min sliding window since last validation.
    IF v_session.last_validated_at < now() - interval '30 minutes' THEN
        UPDATE public.impersonation_sessions
           SET ended_at   = now(),
               end_reason = 'idle_timeout'
         WHERE id = p_session_id;
        RETURN false;
    END IF;

    -- Re-check authorization on every touch — if access is revoked
    -- mid-session, the next request closes the session.
    v_can_impersonate := public.hq_can_impersonate_merchant(v_session.target_merchant_id);
    IF NOT v_can_impersonate THEN
        UPDATE public.impersonation_sessions
           SET ended_at   = now(),
               end_reason = 'revoked_access'
         WHERE id = p_session_id;
        RETURN false;
    END IF;

    -- Slide the window forward.
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
-- -----------------------------------------------------------------------------
-- 9. (intentionally omitted)
-- -----------------------------------------------------------------------------
-- An is_merchant_admin_or_impersonating(uuid) helper was prototyped here in
-- early drafts. Removed because it was redundant: public.is_merchant_admin
-- already short-circuits to true whenever public.is_dexapos_admin() is true,
-- so the impersonation OR-branch never adds anything for HQ admins. Existing
-- merchant-data policies that gate on is_merchant_admin already permit
-- impersonating HQ admins through. See the audit-trail story (sessions +
-- per-action rows) for what impersonation actually buys today.;
