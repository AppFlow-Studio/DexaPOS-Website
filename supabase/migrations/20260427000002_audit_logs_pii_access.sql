-- =============================================================================
-- Migration: A10 — Audit log PII access tracking
-- =============================================================================
-- Adds a structured `pii_access_type` column to audit_logs so PII access events
-- (initially: support attachment views) can be filtered and retained
-- separately from normal operational audit rows.
--
-- Why text (not boolean): forward-compatible with future PII categories
--   ('attachment_view', 'customer_pii_view', 'customer_pii_export', ...).
--   A boolean cannot answer "show me all customer PII exports in Q3."
--
-- NULL means non-PII (the default for every existing row).
-- =============================================================================

ALTER TABLE public.audit_logs
    ADD COLUMN IF NOT EXISTS pii_access_type text NULL;
ALTER TABLE public.audit_logs
    DROP CONSTRAINT IF EXISTS audit_logs_pii_access_type_check;
ALTER TABLE public.audit_logs
    ADD CONSTRAINT audit_logs_pii_access_type_check
    CHECK (
        pii_access_type IS NULL
        OR pii_access_type IN (
            'attachment_view',
            'customer_pii_view',
            'customer_pii_export',
            'staff_pii_view',
            'merchant_billing_view'
        )
    );
-- Partial index — only index rows that ARE PII access. Keeps the index small
-- since the vast majority of audit rows are non-PII.
CREATE INDEX IF NOT EXISTS idx_audit_logs_pii_access
    ON public.audit_logs (pii_access_type, created_at DESC)
    WHERE pii_access_type IS NOT NULL;
-- =============================================================================
-- Update log_audit_event RPC to accept the new field
-- =============================================================================

CREATE OR REPLACE FUNCTION public.log_audit_event(
    p_merchant_id      uuid,
    p_location_id      uuid,
    p_actor_user_id    text,
    p_actor_name       text,
    p_actor_role       text,
    p_action           text,
    p_action_category  text,
    p_severity         text     DEFAULT 'info',
    p_resource_type    text     DEFAULT NULL,
    p_resource_id      uuid     DEFAULT NULL,
    p_resource_name    text     DEFAULT NULL,
    p_changes          jsonb    DEFAULT NULL,
    p_metadata         jsonb    DEFAULT NULL,
    p_pii_access_type  text     DEFAULT NULL
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
        pii_access_type
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
        p_pii_access_type
    )
    RETURNING id INTO v_log_id;

    RETURN v_log_id;
END;
$$;
