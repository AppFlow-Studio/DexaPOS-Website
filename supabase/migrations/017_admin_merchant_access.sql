-- Migration: Admin Merchant Access System
-- Description: Creates table to track which merchants HQ admins can access,
--              and updates pending_org_admin_invites with richer invite data

-- ============================================================================
-- ADMIN MERCHANT ACCESS TABLE
-- ============================================================================

-- Table to track which merchants an HQ admin can access
CREATE TABLE IF NOT EXISTS admin_merchant_access (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    admin_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    access_level TEXT NOT NULL DEFAULT 'view' CHECK (access_level IN ('view', 'manage', 'full')),
    granted_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    revoked_at TIMESTAMPTZ,
    is_active BOOLEAN NOT NULL DEFAULT true,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(admin_user_id, merchant_id)
);

-- Add comment for documentation
COMMENT ON TABLE admin_merchant_access IS 'Tracks which merchants HQ admin users can access and at what level';
COMMENT ON COLUMN admin_merchant_access.access_level IS 'view = read-only, manage = operational access, full = complete access including delete';

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_admin_merchant_access_admin 
    ON admin_merchant_access(admin_user_id) 
    WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_admin_merchant_access_merchant 
    ON admin_merchant_access(merchant_id) 
    WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_admin_merchant_access_granted_by 
    ON admin_merchant_access(granted_by);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_admin_merchant_access_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_admin_merchant_access_updated_at ON admin_merchant_access;
CREATE TRIGGER trigger_admin_merchant_access_updated_at
    BEFORE UPDATE ON admin_merchant_access
    FOR EACH ROW
    EXECUTE FUNCTION update_admin_merchant_access_updated_at();

-- ============================================================================
-- RLS POLICIES FOR ADMIN MERCHANT ACCESS
-- ============================================================================

ALTER TABLE admin_merchant_access ENABLE ROW LEVEL SECURITY;

-- Only HQ admins can view admin merchant access records
CREATE POLICY admin_merchant_access_select ON admin_merchant_access
    FOR SELECT
    USING (is_dexapos_admin());

-- Only HQ admins can insert admin merchant access records
CREATE POLICY admin_merchant_access_insert ON admin_merchant_access
    FOR INSERT
    WITH CHECK (is_dexapos_admin());

-- Only HQ admins can update admin merchant access records
CREATE POLICY admin_merchant_access_update ON admin_merchant_access
    FOR UPDATE
    USING (is_dexapos_admin())
    WITH CHECK (is_dexapos_admin());

-- Only HQ admins can delete admin merchant access records
CREATE POLICY admin_merchant_access_delete ON admin_merchant_access
    FOR DELETE
    USING (is_dexapos_admin());

-- ============================================================================
-- UPDATE PENDING_ORG_ADMIN_INVITES TABLE
-- ============================================================================

-- Add columns for richer invite data
ALTER TABLE pending_org_admin_invites
    ADD COLUMN IF NOT EXISTS first_name TEXT,
    ADD COLUMN IF NOT EXISTS last_name TEXT,
    ADD COLUMN IF NOT EXISTS merchant_access JSONB DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS invited_by TEXT REFERENCES users(id) ON DELETE SET NULL;

-- Add comment for the new columns
COMMENT ON COLUMN pending_org_admin_invites.merchant_access IS 'JSON array of {merchantId, accessLevel} objects for merchant access assignments';
COMMENT ON COLUMN pending_org_admin_invites.invited_by IS 'User ID of the admin who sent the invitation';

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Function to check if an admin has access to a specific merchant
CREATE OR REPLACE FUNCTION admin_has_merchant_access(
    p_admin_user_id TEXT,
    p_merchant_id UUID,
    p_min_access_level TEXT DEFAULT 'view'
) RETURNS BOOLEAN AS $$
DECLARE
    v_access_level TEXT;
    v_level_order INTEGER;
    v_min_level_order INTEGER;
BEGIN
    -- Super admins always have access
    IF is_dexapos_admin() THEN
        RETURN true;
    END IF;
    
    -- Get the admin's access level for this merchant
    SELECT access_level INTO v_access_level
    FROM admin_merchant_access
    WHERE admin_user_id = p_admin_user_id
      AND merchant_id = p_merchant_id
      AND is_active = true;
    
    -- If no access record found, deny access
    IF v_access_level IS NULL THEN
        RETURN false;
    END IF;
    
    -- Convert access levels to numeric order for comparison
    v_level_order := CASE v_access_level
        WHEN 'view' THEN 1
        WHEN 'manage' THEN 2
        WHEN 'full' THEN 3
        ELSE 0
    END;
    
    v_min_level_order := CASE p_min_access_level
        WHEN 'view' THEN 1
        WHEN 'manage' THEN 2
        WHEN 'full' THEN 3
        ELSE 0
    END;
    
    RETURN v_level_order >= v_min_level_order;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Function to get all merchants an admin can access
CREATE OR REPLACE FUNCTION get_admin_accessible_merchants(
    p_admin_user_id TEXT,
    p_min_access_level TEXT DEFAULT 'view'
) RETURNS TABLE (
    merchant_id UUID,
    merchant_name TEXT,
    access_level TEXT,
    location_count BIGINT
) AS $$
BEGIN
    -- If super admin, return all merchants
    IF is_dexapos_admin() THEN
        RETURN QUERY
        SELECT 
            m.id,
            m.name,
            'full'::TEXT,
            COUNT(l.id)::BIGINT
        FROM merchants m
        LEFT JOIN locations l ON l.merchant_id = m.id
        GROUP BY m.id, m.name;
    ELSE
        -- Return only merchants the admin has access to
        RETURN QUERY
        SELECT 
            m.id,
            m.name,
            ama.access_level,
            COUNT(l.id)::BIGINT
        FROM admin_merchant_access ama
        JOIN merchants m ON m.id = ama.merchant_id
        LEFT JOIN locations l ON l.merchant_id = m.id
        WHERE ama.admin_user_id = p_admin_user_id
          AND ama.is_active = true
          AND CASE ama.access_level
              WHEN 'view' THEN 1
              WHEN 'manage' THEN 2
              WHEN 'full' THEN 3
              ELSE 0
          END >= CASE p_min_access_level
              WHEN 'view' THEN 1
              WHEN 'manage' THEN 2
              WHEN 'full' THEN 3
              ELSE 0
          END
        GROUP BY m.id, m.name, ama.access_level;
    END IF;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Function to grant merchant access to an admin
CREATE OR REPLACE FUNCTION grant_admin_merchant_access(
    p_admin_user_id TEXT,
    p_merchant_id UUID,
    p_access_level TEXT DEFAULT 'view',
    p_granted_by TEXT DEFAULT NULL,
    p_notes TEXT DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
    v_access_id UUID;
BEGIN
    INSERT INTO admin_merchant_access (
        admin_user_id,
        merchant_id,
        access_level,
        granted_by,
        notes
    ) VALUES (
        p_admin_user_id,
        p_merchant_id,
        p_access_level,
        p_granted_by,
        p_notes
    )
    ON CONFLICT (admin_user_id, merchant_id) 
    DO UPDATE SET
        access_level = EXCLUDED.access_level,
        granted_by = EXCLUDED.granted_by,
        granted_at = NOW(),
        is_active = true,
        revoked_at = NULL,
        notes = EXCLUDED.notes,
        updated_at = NOW()
    RETURNING id INTO v_access_id;
    
    RETURN v_access_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to revoke merchant access from an admin
CREATE OR REPLACE FUNCTION revoke_admin_merchant_access(
    p_admin_user_id TEXT,
    p_merchant_id UUID
) RETURNS BOOLEAN AS $$
BEGIN
    UPDATE admin_merchant_access
    SET 
        is_active = false,
        revoked_at = NOW(),
        updated_at = NOW()
    WHERE admin_user_id = p_admin_user_id
      AND merchant_id = p_merchant_id;
    
    RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- TYPE FOR ADMIN MERCHANT ACCESS
-- ============================================================================

-- Create a type for the merchant access response (useful for queries)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'admin_merchant_access_info') THEN
        CREATE TYPE admin_merchant_access_info AS (
            merchant_id UUID,
            merchant_name TEXT,
            access_level TEXT,
            location_count BIGINT,
            granted_at TIMESTAMPTZ,
            granted_by_name TEXT
        );
    END IF;
END $$;
