-- ============================================================================
-- DEXA POS - HQ Permission Helper Functions
-- ============================================================================
-- These functions enable role-based access control for HQ admin users.
-- They check permissions against the existing role_permissions table.
-- ============================================================================

-- ============================================================================
-- FUNCTION: hq_has_permission
-- ============================================================================
-- Check if current user has a specific HQ permission
-- Returns false if user is not an HQ admin or doesn't have the permission

CREATE OR REPLACE FUNCTION public.hq_has_permission(p_permission_code text)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
AS $$
DECLARE
  v_user_id text;
  v_has_permission boolean;
BEGIN
  v_user_id := current_user_id();
  IF v_user_id IS NULL THEN
    RETURN false;
  END IF;

  -- Must be DexaPOS HQ admin first
  IF NOT is_dexapos_admin() THEN
    RETURN false;
  END IF;

  -- Check permission through existing role_permissions table
  SELECT EXISTS (
    SELECT 1
    FROM user_roles ur
    JOIN role_permissions rp ON rp.role_code = ur.role_code
    WHERE ur.user_id = v_user_id
    AND rp.permission_code = p_permission_code
  ) INTO v_has_permission;

  RETURN v_has_permission;
END;
$$;

-- ============================================================================
-- FUNCTION: get_my_hq_permissions
-- ============================================================================
-- Get all permissions for current HQ user
-- Returns empty array if user is not an HQ admin

CREATE OR REPLACE FUNCTION public.get_my_hq_permissions()
RETURNS text[]
LANGUAGE plpgsql
STABLE SECURITY DEFINER
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
  FROM user_roles ur
  JOIN role_permissions rp ON rp.role_code = ur.role_code
  WHERE ur.user_id = v_user_id
  AND ur.role_code LIKE 'hq.%';

  RETURN COALESCE(v_permissions, ARRAY[]::text[]);
END;
$$;

-- ============================================================================
-- FUNCTION: get_my_hq_role
-- ============================================================================
-- Get HQ user's role info (returns highest level role)
-- Returns null if user is not an HQ admin

CREATE OR REPLACE FUNCTION public.get_my_hq_role()
RETURNS TABLE(role_code text, role_name text, level integer)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
AS $$
DECLARE
  v_user_id text;
BEGIN
  v_user_id := current_user_id();
  IF v_user_id IS NULL OR NOT is_dexapos_admin() THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT r.code, r.name, r.level
  FROM user_roles ur
  JOIN roles r ON r.code = ur.role_code
  WHERE ur.user_id = v_user_id
  AND r.organization_type = 'hq'
  ORDER BY r.level DESC
  LIMIT 1;
END;
$$;

-- ============================================================================
-- Grant execute permissions to authenticated users
-- ============================================================================

GRANT EXECUTE ON FUNCTION public.hq_has_permission(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_hq_permissions() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_hq_role() TO authenticated;
