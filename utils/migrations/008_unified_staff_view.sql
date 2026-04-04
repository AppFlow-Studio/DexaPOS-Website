-- ============================================================================
-- Migration 008: Unified Staff View RPC Function
-- ============================================================================
-- Purpose: Create a PostgreSQL function to fetch all staff with location
--          assignments in a single query, supporting both Clerk users and
--          POS-only staff.
-- ============================================================================

-- ============================================================================
-- STEP 1: Drop existing function if it exists
-- ============================================================================

DROP FUNCTION IF EXISTS get_unified_staff_view(UUID, UUID);

-- ============================================================================
-- STEP 2: Create function to get unified staff view with location scoping
-- ============================================================================

CREATE OR REPLACE FUNCTION get_unified_staff_view(
    p_merchant_id UUID,
    p_location_id UUID DEFAULT NULL
)
RETURNS TABLE (
    -- Member fields
    member_id UUID,
    user_id UUID,
    clerk_user_id TEXT,
    email TEXT,
    first_name TEXT,
    last_name TEXT,
    display_name TEXT,
    avatar_url TEXT,
    phone TEXT,
    is_clerk_user BOOLEAN,

    -- Location assignment fields (array aggregation)
    location_assignments JSONB,
    total_locations INT,
    primary_location_id UUID,
    primary_location_name TEXT,

    -- Status
    overall_is_active BOOLEAN,

    -- Timestamps
    member_created_at TIMESTAMPTZ,
    last_updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    WITH location_data AS (
        SELECT
            lm.user_id,
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
            COUNT(*)::INT AS location_count,
            MAX(CASE WHEN lm.is_primary_location THEN l.id END) AS primary_loc_id,
            MAX(CASE WHEN lm.is_primary_location THEN l.name END) AS primary_loc_name,
            BOOL_OR(lm.is_active) AS any_active
        FROM location_members lm
        INNER JOIN locations l ON l.id = lm.location_id
        LEFT JOIN roles r ON r.code = lm.role_code
        WHERE l.merchant_id = p_merchant_id
            AND (p_location_id IS NULL OR lm.location_id = p_location_id)
        GROUP BY lm.user_id
    )
    SELECT
        m.id AS member_id,
        m.user_id,
        m.clerk_user_id,
        m.email,
        m.first_name,
        m.last_name,
        m.display_name,
        m.avatar_url,
        m.phone,
        (m.user_id IS NOT NULL) AS is_clerk_user,

        COALESCE(ld.assignments, '[]'::jsonb) AS location_assignments,
        COALESCE(ld.location_count, 0) AS total_locations,
        ld.primary_loc_id AS primary_location_id,
        ld.primary_loc_name AS primary_location_name,

        COALESCE(ld.any_active, false) AS overall_is_active,

        m.created_at AS member_created_at,
        m.updated_at AS last_updated_at
    FROM members m
    LEFT JOIN location_data ld ON ld.user_id = m.user_id
    WHERE m.merchant_id = p_merchant_id
        AND ld.user_id IS NOT NULL  -- Only return members with location assignments
    ORDER BY m.last_name, m.first_name;
END;
$$;

-- ============================================================================
-- STEP 3: Grant permissions
-- ============================================================================

GRANT EXECUTE ON FUNCTION get_unified_staff_view(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_unified_staff_view(UUID, UUID) TO anon;

-- ============================================================================
-- STEP 4: Add documentation
-- ============================================================================

COMMENT ON FUNCTION get_unified_staff_view IS
'Returns unified staff view with all location assignments aggregated.
- p_merchant_id: Required merchant UUID for scoping
- p_location_id: Optional location UUID to filter to specific location (for Location Managers)

Returns JSONB array of location assignments with roles, status, and POS settings.
Each row represents one staff member with all their location assignments aggregated.

Usage Examples:
- Global Admin (all staff): SELECT * FROM get_unified_staff_view(''merchant-uuid'', NULL);
- Location Manager (filtered): SELECT * FROM get_unified_staff_view(''merchant-uuid'', ''location-uuid'');
';

-- ============================================================================
-- Migration Complete
-- ============================================================================

-- Summary of changes:
-- 1. ✅ Created get_unified_staff_view() RPC function
-- 2. ✅ Uses JSONB aggregation for efficient location assignment queries
-- 3. ✅ Supports optional location filtering for Location Managers
-- 4. ✅ Returns computed fields: is_clerk_user, overall_is_active, total_locations
-- 5. ✅ Granted execute permissions to authenticated and anon users
