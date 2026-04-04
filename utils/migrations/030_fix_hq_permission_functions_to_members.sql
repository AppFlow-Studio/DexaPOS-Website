-- ============================================================================
-- Migration 030: Fix HQ permission functions to use members table
-- ============================================================================
-- Problem:
-- - get_my_hq_role() was moved to members in migration 019.
-- - get_my_hq_permissions() and hq_has_permission() still read user_roles.
-- - Newly invited HQ users can have a valid members.role but empty permissions.
--
-- Result:
-- - Sidebar and server permission checks fail for HQ users created via invite flow.
--
-- This migration aligns HQ permission functions with members-based role storage.

CREATE OR REPLACE FUNCTION public.hq_has_permission(p_permission_code text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_user_id text;
  v_has_permission boolean;
BEGIN
  v_user_id := current_user_id();
  IF v_user_id IS NULL THEN
    RETURN false;
  END IF;

  IF NOT is_dexapos_admin() THEN
    RETURN false;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM members m
    JOIN roles r ON r.code = m.role
    JOIN role_permissions rp ON rp.role_code = m.role
    WHERE m.user_id = v_user_id
      AND r.organization_type = 'hq'
      AND rp.permission_code = p_permission_code
  )
  INTO v_has_permission;

  RETURN COALESCE(v_has_permission, false);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_my_hq_permissions()
RETURNS text[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_user_id text;
  v_permissions text[];
BEGIN
  v_user_id := current_user_id();
  IF v_user_id IS NULL OR NOT is_dexapos_admin() THEN
    RETURN ARRAY[]::text[];
  END IF;

  SELECT ARRAY_AGG(DISTINCT rp.permission_code)
  INTO v_permissions
  FROM members m
  JOIN roles r ON r.code = m.role
  JOIN role_permissions rp ON rp.role_code = m.role
  WHERE m.user_id = v_user_id
    AND r.organization_type = 'hq';

  RETURN COALESCE(v_permissions, ARRAY[]::text[]);
END;
$$;

GRANT EXECUTE ON FUNCTION public.hq_has_permission(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_hq_permissions() TO authenticated;

COMMENT ON FUNCTION public.hq_has_permission(text)
IS 'Checks HQ permission using members.role + role_permissions (aligned with members-based HQ roles).';

COMMENT ON FUNCTION public.get_my_hq_permissions()
IS 'Returns HQ permissions using members.role + role_permissions (aligned with members-based HQ roles).';
