-- ============================================================================
-- Migration: Fix get_my_hq_role to use members table
-- ============================================================================
-- This simplifies the role lookup by using the members table directly
-- instead of the user_roles table, since we have a 1:1 user to member relationship

-- Define HQ organization ID constant
DO $$
BEGIN
  -- Create temp variable if needed for the function
END $$;

-- ============================================================================
-- FUNCTION: get_my_hq_role (updated)
-- ============================================================================
-- Get HQ user's role info from members table
-- Returns null if user is not an HQ admin

CREATE OR REPLACE FUNCTION public.get_my_hq_role()
RETURNS TABLE(role_code text, role_name text, level integer)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
AS $$
DECLARE
  v_user_id text;
  v_hq_org_id text;
BEGIN
  v_user_id := current_user_id();
  
  -- Get HQ org ID from environment or use known value
  v_hq_org_id := current_setting('app.dexa_hq_org_id', true);
  IF v_hq_org_id IS NULL OR v_hq_org_id = '' THEN
    -- Fallback: check if user is in any org with HQ roles
    v_hq_org_id := NULL;
  END IF;

  IF v_user_id IS NULL THEN
    RETURN;
  END IF;

  -- Query from members table joined with roles
  RETURN QUERY
  SELECT r.code, r.name, r.level
  FROM members m
  JOIN roles r ON r.code = m.role
  WHERE m.user_id = v_user_id
    AND r.organization_type = 'hq'
  ORDER BY r.level DESC
  LIMIT 1;
END;
$$;

-- ============================================================================
-- FUNCTION: is_dexapos_admin (updated)
-- ============================================================================
-- Check if current user is a DexaPOS HQ admin using members table

CREATE OR REPLACE FUNCTION public.is_dexapos_admin()
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
AS $$
DECLARE
  v_user_id text;
BEGIN
  v_user_id := current_user_id();
  IF v_user_id IS NULL THEN
    RETURN false;
  END IF;

  -- Check if user has any HQ role via members table
  RETURN EXISTS (
    SELECT 1
    FROM members m
    JOIN roles r ON r.code = m.role
    WHERE m.user_id = v_user_id
      AND r.organization_type = 'hq'
  );
END;
$$;

-- ============================================================================
-- Grant permissions
-- ============================================================================
GRANT EXECUTE ON FUNCTION public.get_my_hq_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_dexapos_admin() TO authenticated;
