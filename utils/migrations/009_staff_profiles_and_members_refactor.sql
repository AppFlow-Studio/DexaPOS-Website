-- ============================================================================
-- Migration 009: Staff Profiles and Members Refactoring
-- ============================================================================
-- Purpose: Separate profile data from membership data to support both
-- Clerk users and POS-only staff in a unified way
--
-- Changes:
-- 1. Create staff_profiles table for profile information
-- 2. Update members table to link to staff_profiles
-- 3. Update location_members table to support staff_profiles
-- 4. Update location_invites table for better invite tracking
-- 5. Update get_unified_staff_view RPC function
-- ============================================================================

-- ============================================================================
-- 1. CREATE STAFF_PROFILES TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS staff_profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Link to merchant
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,

    -- Link to Clerk user (nullable for POS-only staff)
    user_id TEXT REFERENCES users(id) ON DELETE CASCADE,

    -- Profile Information
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    email TEXT,  -- Required for Clerk users, optional for POS
    phone TEXT,
    avatar_url TEXT,

    -- Computed/Display Fields
    display_name TEXT GENERATED ALWAYS AS (first_name || ' ' || last_name) STORED,

    -- Staff Type Indicator
    account_type TEXT NOT NULL CHECK (account_type IN ('clerk', 'pos_only')),

    -- Status
    is_active BOOLEAN NOT NULL DEFAULT true,

    -- Metadata
    public_metadata JSONB DEFAULT '{}'::jsonb,

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Constraints
    -- Clerk users must have email and user_id
    CONSTRAINT clerk_user_requires_email CHECK (
        account_type = 'pos_only' OR (email IS NOT NULL AND user_id IS NOT NULL)
    ),
    -- Unique user per merchant
    UNIQUE(merchant_id, user_id)
);

-- Indexes for staff_profiles
CREATE INDEX idx_staff_profiles_merchant_id ON staff_profiles(merchant_id);
CREATE INDEX idx_staff_profiles_user_id ON staff_profiles(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX idx_staff_profiles_email ON staff_profiles(email) WHERE email IS NOT NULL;
CREATE INDEX idx_staff_profiles_account_type ON staff_profiles(account_type);
CREATE INDEX idx_staff_profiles_is_active ON staff_profiles(is_active);

-- Enable RLS on staff_profiles
ALTER TABLE staff_profiles ENABLE ROW LEVEL SECURITY;

-- Helper function to get current user ID
CREATE OR REPLACE FUNCTION current_user_id()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN get_my_claim('sub')::TEXT;
END;
$$;

-- RLS Policies for staff_profiles
CREATE POLICY staff_profiles_select ON staff_profiles FOR SELECT USING (
    merchant_id IN (
        SELECT m.id FROM merchants m
        INNER JOIN members mb ON m.clerk_org_id = mb.organization_id
        WHERE mb.user_id = current_user_id()
    )
);

CREATE POLICY staff_profiles_insert ON staff_profiles FOR INSERT WITH CHECK (
    merchant_id IN (
        SELECT m.id FROM merchants m
        INNER JOIN members mb ON m.clerk_org_id = mb.organization_id
        WHERE mb.user_id = current_user_id()
    )
);

CREATE POLICY staff_profiles_update ON staff_profiles FOR UPDATE USING (
    merchant_id IN (
        SELECT m.id FROM merchants m
        INNER JOIN members mb ON m.clerk_org_id = mb.organization_id
        WHERE mb.user_id = current_user_id()
    )
);

-- ============================================================================
-- 2. UPDATE MEMBERS TABLE
-- ============================================================================

-- Add staff_profile_id column
ALTER TABLE members
    ADD COLUMN IF NOT EXISTS staff_profile_id UUID REFERENCES staff_profiles(id) ON DELETE CASCADE;

-- Make user_id nullable (for POS staff)
ALTER TABLE members
    ALTER COLUMN user_id DROP NOT NULL;

-- Add constraint: either user_id (Clerk) or staff_profile_id (POS) must be set
ALTER TABLE members
    DROP CONSTRAINT IF EXISTS members_requires_user_or_profile;

ALTER TABLE members
    ADD CONSTRAINT members_requires_user_or_profile CHECK (
        (user_id IS NOT NULL AND staff_profile_id IS NULL) OR
        (user_id IS NULL AND staff_profile_id IS NOT NULL)
    );

-- Create index on staff_profile_id
CREATE INDEX IF NOT EXISTS idx_members_staff_profile_id ON members(staff_profile_id)
    WHERE staff_profile_id IS NOT NULL;

-- ============================================================================
-- 3. UPDATE LOCATION_MEMBERS TABLE
-- ============================================================================

-- Add merchant_id for easier querying (denormalized but useful)
ALTER TABLE location_members
    ADD COLUMN IF NOT EXISTS merchant_id UUID REFERENCES merchants(id) ON DELETE CASCADE;

-- Make user_id nullable (for POS staff)
ALTER TABLE location_members
    ALTER COLUMN user_id DROP NOT NULL;

-- Add staff_profile_id link
ALTER TABLE location_members
    ADD COLUMN IF NOT EXISTS staff_profile_id UUID REFERENCES staff_profiles(id) ON DELETE CASCADE;

-- Add constraint: either user_id or staff_profile_id must be set
ALTER TABLE location_members
    DROP CONSTRAINT IF EXISTS location_members_requires_user_or_profile;

ALTER TABLE location_members
    ADD CONSTRAINT location_members_requires_user_or_profile CHECK (
        (user_id IS NOT NULL AND staff_profile_id IS NULL) OR
        (user_id IS NULL AND staff_profile_id IS NOT NULL)
    );

-- Create index on merchant_id
CREATE INDEX IF NOT EXISTS idx_location_members_merchant_id ON location_members(merchant_id)
    WHERE merchant_id IS NOT NULL;

-- Create index on staff_profile_id
CREATE INDEX IF NOT EXISTS idx_location_members_staff_profile_id ON location_members(staff_profile_id)
    WHERE staff_profile_id IS NOT NULL;

-- Update unique constraint to handle both cases
ALTER TABLE location_members
    DROP CONSTRAINT IF EXISTS location_members_location_id_user_id_key;

-- Create partial unique indexes instead
DROP INDEX IF EXISTS location_members_location_user_unique;
DROP INDEX IF EXISTS location_members_location_profile_unique;

CREATE UNIQUE INDEX location_members_location_user_unique
    ON location_members(location_id, user_id)
    WHERE user_id IS NOT NULL;

CREATE UNIQUE INDEX location_members_location_profile_unique
    ON location_members(location_id, staff_profile_id)
    WHERE staff_profile_id IS NOT NULL;

-- ============================================================================
-- 4. UPDATE LOCATION_INVITES TABLE
-- ============================================================================

-- Add fields for better invite tracking
ALTER TABLE location_invites
    ADD COLUMN IF NOT EXISTS first_name TEXT,
    ADD COLUMN IF NOT EXISTS last_name TEXT,
    ADD COLUMN IF NOT EXISTS phone TEXT,
    ADD COLUMN IF NOT EXISTS invite_type TEXT CHECK (invite_type IN ('clerk', 'direct_clerk', 'pos')),
    ADD COLUMN IF NOT EXISTS location_assignments JSONB DEFAULT '[]'::jsonb;

-- Update to allow location_id to be nullable (for merchant-wide invites)
ALTER TABLE location_invites
    ALTER COLUMN location_id DROP NOT NULL;

-- Add merchant_id if it doesn't exist
ALTER TABLE location_invites
    ADD COLUMN IF NOT EXISTS merchant_id UUID REFERENCES merchants(id) ON DELETE CASCADE;

-- Add constraint: must have either location_id or merchant_id
ALTER TABLE location_invites
    DROP CONSTRAINT IF EXISTS location_invites_requires_location_or_merchant;

ALTER TABLE location_invites
    ADD CONSTRAINT location_invites_requires_location_or_merchant CHECK (
        location_id IS NOT NULL OR merchant_id IS NOT NULL
    );

-- ============================================================================
-- 5. UPDATE GET_UNIFIED_STAFF_VIEW RPC FUNCTION
-- ============================================================================

DROP FUNCTION IF EXISTS get_unified_staff_view(UUID, UUID);

CREATE OR REPLACE FUNCTION get_unified_staff_view(
    p_merchant_id UUID,
    p_location_id UUID DEFAULT NULL
)
RETURNS TABLE (
    -- Member fields
    member_id UUID,
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
    WITH staff_data AS (
        -- Combine Clerk users and POS-only staff from staff_profiles
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
            COUNT(*)::INT AS location_count,
            MAX(CASE WHEN lm.is_primary_location THEN l.id END) AS primary_loc_id,
            MAX(CASE WHEN lm.is_primary_location THEN l.name END) AS primary_loc_name,
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
    WHERE ld.staff_profile_id IS NOT NULL
    ORDER BY sd.last_name, sd.first_name;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION get_unified_staff_view(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_unified_staff_view(UUID, UUID) TO anon;

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================

-- Summary of changes:
-- ✓ Created staff_profiles table with RLS policies
-- ✓ Updated members table to support staff_profiles
-- ✓ Updated location_members table to support staff_profiles
-- ✓ Updated location_invites table for better tracking
-- ✓ Updated get_unified_staff_view RPC to use staff_profiles

COMMENT ON TABLE staff_profiles IS 'Stores profile information for all staff (both Clerk users and POS-only staff)';
COMMENT ON COLUMN staff_profiles.account_type IS 'Type of account: clerk (dashboard access) or pos_only (PIN access only)';
COMMENT ON COLUMN staff_profiles.user_id IS 'Link to Clerk user - NULL for POS-only staff';
COMMENT ON COLUMN members.staff_profile_id IS 'Link to staff profile - set for POS-only staff, NULL for Clerk users';
COMMENT ON COLUMN location_members.staff_profile_id IS 'Link to staff profile - allows location assignments for both Clerk and POS-only staff';
