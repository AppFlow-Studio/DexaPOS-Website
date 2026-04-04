-- ============================================================================
-- Plaintext Staff PIN Support
-- ============================================================================
-- Purpose:
-- 1. Move staff PIN storage to pin_plain / pin_hashed
-- 2. Expose readable PIN values in unified staff views for the dashboard UI
-- 3. Keep POS login compatible with both new plaintext PINs and legacy bcrypt PINs
-- ============================================================================

ALTER TABLE public.location_members
  ADD COLUMN IF NOT EXISTS pin_plain TEXT,
  ADD COLUMN IF NOT EXISTS pin_hashed TEXT;

UPDATE public.location_members
SET
  pin_plain = COALESCE(
    pin_plain,
    CASE
      WHEN pin_code ~ '^\d{4,6}$' THEN pin_code
      ELSE NULL
    END
  ),
  pin_hashed = COALESCE(
    pin_hashed,
    CASE
      WHEN pin_code IS NOT NULL AND pin_code !~ '^\d{4,6}$' THEN pin_code
      ELSE NULL
    END
  )
WHERE pin_code IS NOT NULL
  AND (pin_plain IS NULL OR pin_hashed IS NULL);

CREATE INDEX IF NOT EXISTS idx_location_members_pin_plain
  ON public.location_members(location_id, pin_plain)
  WHERE pin_plain IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_location_members_pin_hashed
  ON public.location_members(location_id, pin_hashed)
  WHERE pin_hashed IS NOT NULL;

DROP FUNCTION IF EXISTS public.get_unified_staff_view(UUID, UUID);

CREATE OR REPLACE FUNCTION public.get_unified_staff_view(
  p_merchant_id UUID,
  p_location_id UUID DEFAULT NULL
)
RETURNS TABLE (
  member_id TEXT,
  staff_profile_id UUID,
  user_id TEXT,
  clerk_user_id TEXT,
  email TEXT,
  first_name TEXT,
  last_name TEXT,
  display_name TEXT,
  avatar_url TEXT,
  phone TEXT,
  account_type TEXT,
  is_clerk_user BOOLEAN,
  location_assignments JSONB,
  total_locations INT,
  primary_location_id UUID,
  primary_location_name TEXT,
  overall_is_active BOOLEAN,
  member_created_at TIMESTAMPTZ,
  last_updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  WITH staff_data AS (
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
      COALESCE(lm.staff_profile_id, sp_map.id) AS profile_id,
      jsonb_agg(
        jsonb_build_object(
          'location_id', l.id,
          'location_name', l.name,
          'role_code', lm.role_code,
          'role_name', r.name,
          'is_primary', lm.is_primary_location,
          'is_active', lm.is_active,
          'has_pin', (lm.pin_plain IS NOT NULL OR lm.pin_hashed IS NOT NULL OR lm.pin_code IS NOT NULL),
          'pin_code', COALESCE(lm.pin_plain, lm.pin_hashed, lm.pin_code),
          'hourly_rate', lm.hourly_rate,
          'employment_type', lm.employment_type,
          'assigned_at', lm.assigned_at
        ) ORDER BY lm.is_primary_location DESC, l.name
      ) AS assignments,
      COUNT(*)::INT AS location_count,
      (array_agg(l.id) FILTER (WHERE lm.is_primary_location = true))[1] AS primary_loc_id,
      (array_agg(l.name) FILTER (WHERE lm.is_primary_location = true))[1] AS primary_loc_name,
      BOOL_OR(lm.is_active) AS any_active
    FROM location_members lm
    INNER JOIN locations l ON l.id = lm.location_id
    LEFT JOIN roles r ON r.code = lm.role_code
    LEFT JOIN staff_profiles sp_map
      ON sp_map.user_id = lm.user_id
     AND sp_map.merchant_id = p_merchant_id
    WHERE l.merchant_id = p_merchant_id
      AND (p_location_id IS NULL OR lm.location_id = p_location_id)
      AND COALESCE(lm.staff_profile_id, sp_map.id) IS NOT NULL
    GROUP BY COALESCE(lm.staff_profile_id, sp_map.id)
  )
  SELECT
    m.id::text AS member_id,
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
    COALESCE(ld.assignments, '[]'::JSONB) AS location_assignments,
    COALESCE(ld.location_count, 0) AS total_locations,
    ld.primary_loc_id AS primary_location_id,
    ld.primary_loc_name AS primary_location_name,
    COALESCE(ld.any_active, false) AND sd.profile_active AS overall_is_active,
    m.created_at AS member_created_at,
    m.updated_at AS last_updated_at
  FROM staff_data sd
  LEFT JOIN members m ON m.staff_profile_id = sd.profile_id OR m.user_id = sd.user_id
  LEFT JOIN location_data ld ON ld.profile_id = sd.profile_id
  WHERE m.id IS NOT NULL OR ld.profile_id IS NOT NULL
  ORDER BY sd.last_name, sd.first_name;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_unified_staff_view(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_unified_staff_view(UUID, UUID) TO anon;

DROP FUNCTION IF EXISTS public.admin_get_unified_staff_view(uuid, uuid);

CREATE OR REPLACE FUNCTION public.admin_get_unified_staff_view(
  p_merchant_id uuid,
  p_location_id uuid DEFAULT NULL
)
RETURNS TABLE (
  member_id text,
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
  IF NOT is_dexapos_admin() THEN
    RAISE EXCEPTION 'Unauthorized: Admin access required';
  END IF;

  RETURN QUERY
  WITH staff_data AS (
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
      COALESCE(lm.staff_profile_id, sp_map.id) AS profile_id,
      jsonb_agg(
        jsonb_build_object(
          'location_id', l.id,
          'location_name', l.name,
          'role_code', lm.role_code,
          'role_name', r.name,
          'is_primary', lm.is_primary_location,
          'is_active', lm.is_active,
          'has_pin', (lm.pin_plain IS NOT NULL OR lm.pin_hashed IS NOT NULL OR lm.pin_code IS NOT NULL),
          'pin_code', COALESCE(lm.pin_plain, lm.pin_hashed, lm.pin_code),
          'hourly_rate', lm.hourly_rate,
          'employment_type', lm.employment_type,
          'assigned_at', lm.assigned_at
        ) ORDER BY lm.is_primary_location DESC, l.name
      ) AS assignments,
      COUNT(*)::bigint AS location_count,
      (array_agg(l.id) FILTER (WHERE lm.is_primary_location = true))[1] AS primary_loc_id,
      (array_agg(l.name) FILTER (WHERE lm.is_primary_location = true))[1] AS primary_loc_name,
      BOOL_OR(lm.is_active) AS any_active
    FROM location_members lm
    INNER JOIN locations l ON l.id = lm.location_id
    LEFT JOIN roles r ON r.code = lm.role_code
    LEFT JOIN staff_profiles sp_map
      ON sp_map.user_id = lm.user_id
     AND sp_map.merchant_id = p_merchant_id
    WHERE l.merchant_id = p_merchant_id
      AND (p_location_id IS NULL OR lm.location_id = p_location_id)
      AND COALESCE(lm.staff_profile_id, sp_map.id) IS NOT NULL
    GROUP BY COALESCE(lm.staff_profile_id, sp_map.id)
  )
  SELECT
    m.id::text AS member_id,
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
  LEFT JOIN location_data ld ON ld.profile_id = sd.profile_id
  ORDER BY sd.last_name, sd.first_name;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_get_unified_staff_view(uuid, uuid) TO authenticated;

DROP FUNCTION IF EXISTS public.admin_reset_staff_pin(uuid, uuid, text);

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
  v_staff_name text;
  v_merchant_id uuid;
  v_admin_user_id text;
  v_staff_user_id text;
BEGIN
  IF NOT is_dexapos_admin() THEN
    RETURN QUERY SELECT false, NULL::text, 'Unauthorized: Admin access required'::text;
    RETURN;
  END IF;

  v_admin_user_id := current_user_id();

  SELECT
    sp.first_name || ' ' || sp.last_name,
    sp.merchant_id,
    sp.user_id
  INTO v_staff_name, v_merchant_id, v_staff_user_id
  FROM staff_profiles sp
  JOIN location_members lm
    ON (
      lm.staff_profile_id = sp.id
      OR (sp.user_id IS NOT NULL AND lm.user_id = sp.user_id)
    )
  WHERE sp.id = p_staff_profile_id
    AND lm.location_id = p_location_id;

  IF v_staff_name IS NULL THEN
    RETURN QUERY SELECT false, NULL::text, 'Staff member not found at this location'::text;
    RETURN;
  END IF;

  IF p_custom_pin IS NOT NULL THEN
    IF NOT p_custom_pin ~ '^\d{4,6}$' THEN
      RETURN QUERY SELECT false, NULL::text, 'PIN must be 4-6 digits'::text;
      RETURN;
    END IF;
    v_pin := p_custom_pin;
  ELSE
    v_pin := lpad(floor(random() * 9000 + 1000)::text, 4, '0');
  END IF;

  UPDATE location_members
  SET
    pin_plain = v_pin,
    pin_hashed = NULL,
    pin_code = v_pin,
    updated_at = NOW()
  WHERE (
      staff_profile_id = p_staff_profile_id
      OR (v_staff_user_id IS NOT NULL AND user_id = v_staff_user_id)
    )
    AND location_id = p_location_id;

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

GRANT EXECUTE ON FUNCTION public.admin_reset_staff_pin(uuid, uuid, text) TO authenticated;

DROP FUNCTION IF EXISTS public.admin_bulk_reset_pins(uuid, uuid);

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
  v_reset_count int := 0;
BEGIN
  IF NOT is_dexapos_admin() THEN
    RAISE EXCEPTION 'Unauthorized: Admin access required';
  END IF;

  v_admin_user_id := current_user_id();

  FOR v_staff IN
    SELECT
      sp.id AS profile_id,
      sp.user_id AS profile_user_id,
      sp.first_name || ' ' || sp.last_name AS full_name,
      lm.location_id AS loc_id
    FROM staff_profiles sp
    JOIN location_members lm ON lm.staff_profile_id = sp.id
    JOIN locations l ON l.id = lm.location_id
    WHERE sp.merchant_id = p_merchant_id
      AND sp.is_active = true
      AND lm.is_active = true
      AND (p_location_id IS NULL OR lm.location_id = p_location_id)
    UNION
    SELECT
      sp.id AS profile_id,
      sp.user_id AS profile_user_id,
      sp.first_name || ' ' || sp.last_name AS full_name,
      lm.location_id AS loc_id
    FROM staff_profiles sp
    JOIN location_members lm ON lm.user_id = sp.user_id
    JOIN locations l ON l.id = lm.location_id
    WHERE sp.merchant_id = p_merchant_id
      AND sp.user_id IS NOT NULL
      AND sp.is_active = true
      AND lm.staff_profile_id IS NULL
      AND lm.is_active = true
      AND (p_location_id IS NULL OR lm.location_id = p_location_id)
  LOOP
    v_pin := lpad(floor(random() * 9000 + 1000)::text, 4, '0');

    UPDATE location_members
    SET
      pin_plain = v_pin,
      pin_hashed = NULL,
      pin_code = v_pin,
      updated_at = NOW()
    WHERE (
        staff_profile_id = v_staff.profile_id
        OR (v_staff.profile_user_id IS NOT NULL AND user_id = v_staff.profile_user_id)
      )
      AND location_id = v_staff.loc_id;

    staff_profile_id := v_staff.profile_id;
    staff_name := v_staff.full_name;
    new_pin := v_pin;
    RETURN NEXT;

    v_reset_count := v_reset_count + 1;
  END LOOP;

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

GRANT EXECUTE ON FUNCTION public.admin_bulk_reset_pins(uuid, uuid) TO authenticated;

-- NOTE:
-- Do not redefine public.pos_staff_login_v2 in this migration using the legacy
-- two-argument shape from public.pos_staff_login(UUID, TEXT). The active POS
-- contract in generated DB types is public.pos_staff_login_v2(...) RETURNS json
-- with the richer device/station argument set. Patch v2 in a follow-up
-- POS-aligned migration by cloning the current v2 function body and only
-- swapping the PIN lookup to:
--   - pin_plain for new readable PINs
--   - pin_hashed for legacy hashed PINs
--   - temporary pin_code fallback during transition
