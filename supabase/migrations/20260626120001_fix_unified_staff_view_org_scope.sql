-- ============================================================================
-- Fix duplicate rows in get_unified_staff_view (cross-org members fan-out)
-- ============================================================================
-- Symptom: the Staff Directory showed the same person twice (e.g. "Nali Aoun",
-- "Temurbek Sayfutdinov") for merchants whose staff are Clerk users that also
-- belong to ANOTHER organization.
--
-- Root cause: the final join pulled members rows with NO organization scoping:
--     LEFT JOIN members m ON m.staff_profile_id = sd.profile_id
--                         OR m.user_id        = sd.user_id
-- A single Clerk user who is a member of multiple orgs has one members row per
-- org. `m.user_id = sd.user_id` matched the OTHER org's members row too, so the
-- one staff_profile fanned out into 2 directory rows (with different member_id).
-- This is NOT duplicate data — the members table is correct; the query was
-- under-scoped and could also OR-match two rows for the same profile.
--
-- Fix: resolve the merchant's clerk_org_id and pick EXACTLY ONE members row per
-- staff_profile via a LATERAL, scoped to that org (preferring the row matched by
-- staff_profile_id). Everything else (signature, location_data, pos_only staff
-- with no members row) is unchanged.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_unified_staff_view(
  p_merchant_id uuid,
  p_location_id uuid DEFAULT NULL::uuid
)
RETURNS TABLE(
  member_id text, staff_profile_id uuid, user_id text, clerk_user_id text,
  email text, first_name text, last_name text, display_name text,
  avatar_url text, phone text, account_type text, is_clerk_user boolean,
  location_assignments jsonb, total_locations integer,
  primary_location_id uuid, primary_location_name text,
  overall_is_active boolean, member_created_at timestamp with time zone,
  last_updated_at timestamp with time zone
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_org_id text;
BEGIN
  -- The Clerk organization that owns this merchant. members rows are keyed by
  -- this org; scoping the join to it prevents cross-org fan-out.
  SELECT clerk_org_id INTO v_org_id FROM merchants WHERE id = p_merchant_id;

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
  -- Exactly one members row per staff_profile, scoped to this merchant's org.
  -- Prefer the row linked by staff_profile_id; fall back to user_id match.
  LEFT JOIN LATERAL (
    SELECT mm.id, mm.created_at, mm.updated_at
    FROM members mm
    WHERE (mm.staff_profile_id = sd.profile_id OR mm.user_id = sd.user_id)
      AND mm.organization_id = v_org_id
    ORDER BY (mm.staff_profile_id = sd.profile_id) DESC, mm.created_at ASC
    LIMIT 1
  ) m ON true
  LEFT JOIN location_data ld ON ld.profile_id = sd.profile_id
  WHERE m.id IS NOT NULL OR ld.profile_id IS NOT NULL
  ORDER BY sd.last_name, sd.first_name;
END;
$function$;


-- ============================================================================
-- Same fix for the HQ /manage admin view (admin_get_unified_staff_view).
-- Identical cross-org members fan-out; preserves the admin auth gate, the
-- bigint total_locations type, and the (intentional) lack of a final WHERE
-- filter so admins still see every staff_profile.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.admin_get_unified_staff_view(
  p_merchant_id uuid,
  p_location_id uuid DEFAULT NULL::uuid
)
RETURNS TABLE(
  member_id text, staff_profile_id uuid, user_id text, clerk_user_id text,
  email text, first_name text, last_name text, display_name text,
  avatar_url text, phone text, account_type text, is_clerk_user boolean,
  location_assignments jsonb, total_locations bigint,
  primary_location_id uuid, primary_location_name text,
  overall_is_active boolean, member_created_at timestamp with time zone,
  last_updated_at timestamp with time zone
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_org_id text;
BEGIN
  IF NOT is_dexapos_admin() THEN
    RAISE EXCEPTION 'Unauthorized: Admin access required';
  END IF;

  SELECT clerk_org_id INTO v_org_id FROM merchants WHERE id = p_merchant_id;

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
  LEFT JOIN LATERAL (
    SELECT mm.id, mm.created_at, mm.updated_at
    FROM members mm
    WHERE (mm.staff_profile_id = sd.profile_id OR mm.user_id = sd.user_id)
      AND mm.organization_id = v_org_id
    ORDER BY (mm.staff_profile_id = sd.profile_id) DESC, mm.created_at ASC
    LIMIT 1
  ) m ON true
  LEFT JOIN location_data ld ON ld.profile_id = sd.profile_id
  ORDER BY sd.last_name, sd.first_name;
END;
$function$;
