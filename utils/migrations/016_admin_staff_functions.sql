-- ============================================================================
-- Migration 016: Admin Staff Management Functions
-- ============================================================================
-- Purpose: Create RPC functions for HQ admins to manage merchant staff
-- These functions bypass normal RLS to allow admin access to staff data
--
-- Functions:
-- 1. is_dexapos_admin() - Helper to check if current user is HQ admin
-- 2. admin_get_unified_staff_view() - Get unified staff view for a merchant
-- 3. admin_reset_staff_pin() - Reset individual staff PIN
-- 4. admin_bulk_reset_pins() - Bulk reset PINs for location/merchant
-- ============================================================================

-- ============================================================================
-- 1. HELPER FUNCTION: is_dexapos_admin
-- ============================================================================
-- Check if current user belongs to DexaPOS HQ organization

CREATE OR REPLACE FUNCTION public.is_dexapos_admin()
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
AS $$
DECLARE
  v_org_id text;
  v_hq_org_id text := 'org_33z36QibAMZy6kc2xZNYmDl5duh';
BEGIN
  -- Get org_id from JWT claims
  v_org_id := get_my_claim('org_id')::text;

  -- Remove quotes if present (JSON string)
  v_org_id := trim(both '"' from v_org_id);

  RETURN v_org_id = v_hq_org_id;
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.is_dexapos_admin() TO authenticated;

-- ============================================================================
-- 2. FUNCTION: admin_get_unified_staff_view
-- ============================================================================
-- Admin version of unified staff view that bypasses RLS
-- Returns all staff (both Clerk and POS-only) for a merchant

CREATE OR REPLACE FUNCTION public.admin_get_unified_staff_view(
  p_merchant_id uuid,
  p_location_id uuid DEFAULT NULL
)
RETURNS TABLE (
  member_id uuid,
  staff_profile_id uuid,
  user_id text,
  clerk_user_id text,
  email text,
  first_name text,
  last_name text,
  display_name text,
  avatar_url text,
  phone text,
  account_type text,
  is_clerk_user boolean,
  location_assignments jsonb,
  total_locations bigint,
  primary_location_id uuid,
  primary_location_name text,
  overall_is_active boolean,
  member_created_at timestamptz,
  last_updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Only allow DexaPOS admins
  IF NOT is_dexapos_admin() THEN
    RAISE EXCEPTION 'Unauthorized: Admin access required';
  END IF;

  RETURN QUERY
  WITH staff_data AS (
    -- Get all staff profiles for this merchant
    SELECT
      sp.id AS profile_id,
      sp.user_id,
      u.id AS clerk_user_id,
      sp.email,
      sp.first_name,
      sp.last_name,
      sp.display_name,
      COALESCE(u.avatar_url, sp.avatar_url) AS avatar_url,
      sp.phone,
      sp.account_type,
      sp.is_active AS profile_active,
      sp.created_at,
      sp.updated_at
    FROM staff_profiles sp
    LEFT JOIN users u ON u.id = sp.user_id
    WHERE sp.merchant_id = p_merchant_id
  ),
  location_data AS (
    SELECT
      lm.staff_profile_id,
      jsonb_agg(
        jsonb_build_object(
          'location_id', l.id,
          'location_name', l.name,
          'role_code', lm.role_code,
          'role_name', r.name,
          'is_primary', lm.is_primary_location,
          'is_active', lm.is_active,
          'has_pin', lm.pin_code IS NOT NULL,
          'hourly_rate', lm.hourly_rate,
          'employment_type', lm.employment_type,
          'assigned_at', lm.assigned_at
        ) ORDER BY lm.is_primary_location DESC, l.name
      ) AS assignments,
      COUNT(*)::bigint AS location_count,
      -- Use array_agg with filter and take first element for UUID columns
      (array_agg(l.id) FILTER (WHERE lm.is_primary_location = true))[1] AS primary_loc_id,
      (array_agg(l.name) FILTER (WHERE lm.is_primary_location = true))[1] AS primary_loc_name,
      BOOL_OR(lm.is_active) AS any_active
    FROM location_members lm
    INNER JOIN locations l ON l.id = lm.location_id
    LEFT JOIN roles r ON r.code = lm.role_code
    WHERE lm.staff_profile_id IS NOT NULL
      AND l.merchant_id = p_merchant_id
      AND (p_location_id IS NULL OR lm.location_id = p_location_id)
    GROUP BY lm.staff_profile_id
  )
  SELECT
    m.id AS member_id,
    sd.profile_id AS staff_profile_id,
    sd.user_id AS user_id,
    sd.clerk_user_id,
    sd.email,
    sd.first_name,
    sd.last_name,
    sd.display_name,
    sd.avatar_url,
    sd.phone,
    sd.account_type,
    (sd.account_type = 'clerk') AS is_clerk_user,
    COALESCE(ld.assignments, '[]'::jsonb) AS location_assignments,
    COALESCE(ld.location_count, 0) AS total_locations,
    ld.primary_loc_id AS primary_location_id,
    ld.primary_loc_name AS primary_location_name,
    COALESCE(ld.any_active, false) AND sd.profile_active AS overall_is_active,
    m.created_at AS member_created_at,
    m.updated_at AS last_updated_at
  FROM staff_data sd
  LEFT JOIN members m ON m.staff_profile_id = sd.profile_id OR m.user_id = sd.user_id
  LEFT JOIN location_data ld ON ld.staff_profile_id = sd.profile_id
  ORDER BY sd.last_name, sd.first_name;
END;
$$;

-- Grant execute to authenticated users (RLS check is inside function)
GRANT EXECUTE ON FUNCTION public.admin_get_unified_staff_view(uuid, uuid) TO authenticated;

-- ============================================================================
-- 3. FUNCTION: admin_reset_staff_pin
-- ============================================================================
-- Reset PIN for a single staff member at a specific location
-- Returns the new plaintext PIN for display to admin

CREATE OR REPLACE FUNCTION public.admin_reset_staff_pin(
  p_staff_profile_id uuid,
  p_location_id uuid,
  p_custom_pin text DEFAULT NULL
)
RETURNS TABLE (
  success boolean,
  new_pin text,
  error_message text
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_pin text;
  v_hashed_pin text;
  v_staff_name text;
  v_merchant_id uuid;
  v_admin_user_id text;
BEGIN
  -- Only allow DexaPOS admins
  IF NOT is_dexapos_admin() THEN
    RETURN QUERY SELECT false, NULL::text, 'Unauthorized: Admin access required'::text;
    RETURN;
  END IF;

  v_admin_user_id := current_user_id();

  -- Get staff info and verify existence
  SELECT
    sp.first_name || ' ' || sp.last_name,
    sp.merchant_id
  INTO v_staff_name, v_merchant_id
  FROM staff_profiles sp
  JOIN location_members lm ON lm.staff_profile_id = sp.id
  WHERE sp.id = p_staff_profile_id
    AND lm.location_id = p_location_id;

  IF v_staff_name IS NULL THEN
    RETURN QUERY SELECT false, NULL::text, 'Staff member not found at this location'::text;
    RETURN;
  END IF;

  -- Generate or use custom PIN
  IF p_custom_pin IS NOT NULL THEN
    -- Validate custom PIN format (4-6 digits)
    IF NOT p_custom_pin ~ '^\d{4,6}$' THEN
      RETURN QUERY SELECT false, NULL::text, 'PIN must be 4-6 digits'::text;
      RETURN;
    END IF;
    v_pin := p_custom_pin;
  ELSE
    -- Generate random 4-digit PIN
    v_pin := lpad(floor(random() * 9000 + 1000)::text, 4, '0');
  END IF;

  -- Hash the PIN using pgcrypto
  v_hashed_pin := crypt(v_pin, gen_salt('bf', 10));

  -- Update location_members with hashed PIN
  UPDATE location_members
  SET
    pin_code = v_hashed_pin,
    updated_at = NOW()
  WHERE staff_profile_id = p_staff_profile_id
    AND location_id = p_location_id;

  -- Create audit log entry
  INSERT INTO audit_logs (
    actor_user_id,
    actor_role,
    action,
    action_category,
    severity,
    resource_type,
    resource_id,
    resource_name,
    merchant_id,
    location_id,
    metadata
  ) VALUES (
    v_admin_user_id,
    'hq.admin',
    'ADMIN_RESET_PIN',
    'staff_management',
    'warning',
    'staff_profile',
    p_staff_profile_id,
    v_staff_name,
    v_merchant_id,
    p_location_id,
    jsonb_build_object('admin_reset', true)
  );

  RETURN QUERY SELECT true, v_pin, NULL::text;
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.admin_reset_staff_pin(uuid, uuid, text) TO authenticated;

-- ============================================================================
-- 4. FUNCTION: admin_bulk_reset_pins
-- ============================================================================
-- Bulk reset PINs for all active staff at a merchant/location
-- Returns table of staff names and their new PINs

CREATE OR REPLACE FUNCTION public.admin_bulk_reset_pins(
  p_merchant_id uuid,
  p_location_id uuid DEFAULT NULL
)
RETURNS TABLE (
  staff_profile_id uuid,
  staff_name text,
  new_pin text
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_admin_user_id text;
  v_staff record;
  v_pin text;
  v_hashed_pin text;
  v_reset_count int := 0;
BEGIN
  -- Only allow DexaPOS admins
  IF NOT is_dexapos_admin() THEN
    RAISE EXCEPTION 'Unauthorized: Admin access required';
  END IF;

  v_admin_user_id := current_user_id();

  -- Loop through staff and generate new PINs
  FOR v_staff IN
    SELECT
      sp.id AS profile_id,
      sp.first_name || ' ' || sp.last_name AS full_name,
      lm.location_id AS loc_id
    FROM staff_profiles sp
    JOIN location_members lm ON lm.staff_profile_id = sp.id
    JOIN locations l ON l.id = lm.location_id
    WHERE sp.merchant_id = p_merchant_id
      AND sp.is_active = true
      AND lm.is_active = true
      AND (p_location_id IS NULL OR lm.location_id = p_location_id)
  LOOP
    -- Generate 4-digit PIN
    v_pin := lpad(floor(random() * 9000 + 1000)::text, 4, '0');

    -- Hash the PIN
    v_hashed_pin := crypt(v_pin, gen_salt('bf', 10));

    -- Update location_members
    UPDATE location_members
    SET
      pin_code = v_hashed_pin,
      updated_at = NOW()
    WHERE staff_profile_id = v_staff.profile_id
      AND location_id = v_staff.loc_id;

    -- Return the result row
    staff_profile_id := v_staff.profile_id;
    staff_name := v_staff.full_name;
    new_pin := v_pin;
    RETURN NEXT;

    v_reset_count := v_reset_count + 1;
  END LOOP;

  -- Single audit log for bulk operation
  INSERT INTO audit_logs (
    actor_user_id,
    actor_role,
    action,
    action_category,
    severity,
    resource_type,
    resource_id,
    merchant_id,
    location_id,
    metadata
  ) VALUES (
    v_admin_user_id,
    'hq.admin',
    'ADMIN_BULK_RESET_PINS',
    'staff_management',
    'warning',
    'merchant',
    p_merchant_id,
    p_merchant_id,
    p_location_id,
    jsonb_build_object(
      'bulk_reset', true,
      'staff_count', v_reset_count
    )
  );
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.admin_bulk_reset_pins(uuid, uuid) TO authenticated;

-- ============================================================================
-- 5. FUNCTION: admin_toggle_staff_status
-- ============================================================================
-- Toggle active status for a staff member at a location

CREATE OR REPLACE FUNCTION public.admin_toggle_staff_status(
  p_staff_profile_id uuid,
  p_location_id uuid,
  p_new_status boolean
)
RETURNS TABLE (
  success boolean,
  error_message text
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_admin_user_id text;
  v_staff_name text;
  v_merchant_id uuid;
BEGIN
  -- Only allow DexaPOS admins
  IF NOT is_dexapos_admin() THEN
    RETURN QUERY SELECT false, 'Unauthorized: Admin access required'::text;
    RETURN;
  END IF;

  v_admin_user_id := current_user_id();

  -- Get staff info
  SELECT
    sp.first_name || ' ' || sp.last_name,
    sp.merchant_id
  INTO v_staff_name, v_merchant_id
  FROM staff_profiles sp
  JOIN location_members lm ON lm.staff_profile_id = sp.id
  WHERE sp.id = p_staff_profile_id
    AND lm.location_id = p_location_id;

  IF v_staff_name IS NULL THEN
    RETURN QUERY SELECT false, 'Staff member not found at this location'::text;
    RETURN;
  END IF;

  -- Update status
  UPDATE location_members
  SET
    is_active = p_new_status,
    updated_at = NOW()
  WHERE staff_profile_id = p_staff_profile_id
    AND location_id = p_location_id;

  -- Audit log
  INSERT INTO audit_logs (
    actor_user_id,
    actor_role,
    action,
    action_category,
    severity,
    resource_type,
    resource_id,
    resource_name,
    merchant_id,
    location_id,
    changes
  ) VALUES (
    v_admin_user_id,
    'hq.admin',
    CASE WHEN p_new_status THEN 'ADMIN_ACTIVATE_STAFF' ELSE 'ADMIN_DEACTIVATE_STAFF' END,
    'staff_management',
    'warning',
    'staff_profile',
    p_staff_profile_id,
    v_staff_name,
    v_merchant_id,
    p_location_id,
    jsonb_build_object('before', jsonb_build_object('is_active', NOT p_new_status), 'after', jsonb_build_object('is_active', p_new_status))
  );

  RETURN QUERY SELECT true, NULL::text;
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.admin_toggle_staff_status(uuid, uuid, boolean) TO authenticated;

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
-- Summary:
-- + Created is_dexapos_admin() helper function
-- + Created admin_get_unified_staff_view() for fetching staff data
-- + Created admin_reset_staff_pin() for individual PIN reset
-- + Created admin_bulk_reset_pins() for bulk PIN reset
-- + Created admin_toggle_staff_status() for activating/deactivating staff

COMMENT ON FUNCTION public.is_dexapos_admin() IS 'Check if current user is a DexaPOS HQ admin';
COMMENT ON FUNCTION public.admin_get_unified_staff_view(uuid, uuid) IS 'Get unified staff view for admin (bypasses RLS)';
COMMENT ON FUNCTION public.admin_reset_staff_pin(uuid, uuid, text) IS 'Admin: Reset PIN for staff member at location';
COMMENT ON FUNCTION public.admin_bulk_reset_pins(uuid, uuid) IS 'Admin: Bulk reset PINs for all staff at merchant/location';
COMMENT ON FUNCTION public.admin_toggle_staff_status(uuid, uuid, boolean) IS 'Admin: Toggle staff active status at location';
