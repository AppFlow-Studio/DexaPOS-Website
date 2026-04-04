-- ============================================================================
-- Migration 018: Simplified HQ Roles
-- ============================================================================
-- This migration simplifies the HQ admin role system from 8 roles to 3 core roles:
-- 1. Super Admin (level 10) - Full system access
-- 2. Platform Admin (level 8) - Platform management
-- 3. Manager (level 5) - Operational management
-- ============================================================================

-- ============================================================================
-- SECTION 1: Insert/Update Permissions (if not exists)
-- ============================================================================

-- Ensure all HQ permissions exist
INSERT INTO permissions (code, name, description, category, scope)
VALUES
    -- Merchant permissions
    ('hq.merchant.view', 'View Merchants', 'View merchant information and data', 'merchant', 'hq'),
    ('hq.merchant.create', 'Create Merchants', 'Create new merchant accounts', 'merchant', 'hq'),
    ('hq.merchant.update', 'Update Merchants', 'Update merchant information', 'merchant', 'hq'),
    ('hq.merchant.delete', 'Delete Merchants', 'Delete merchant accounts', 'merchant', 'hq'),
    ('hq.merchant.analytics', 'View Merchant Analytics', 'Access merchant analytics and reports', 'merchant', 'hq'),
    ('hq.merchant.transactions', 'View Merchant Transactions', 'View merchant transaction history', 'merchant', 'hq'),
    ('hq.merchant.manage_team', 'Manage Merchant Team', 'Manage merchant staff and team members', 'merchant', 'hq'),
    -- Support permissions
    ('hq.support.view', 'View Support', 'View support tickets and requests', 'support', 'hq'),
    ('hq.support.manage', 'Manage Support', 'Manage and respond to support requests', 'support', 'hq'),
    ('hq.support.access_data', 'Access Support Data', 'Access detailed support data and logs', 'support', 'hq'),
    -- Team permissions
    ('hq.team.view', 'View Team', 'View HQ team members', 'team', 'hq'),
    ('hq.team.manage', 'Manage Team', 'Manage HQ team members', 'team', 'hq'),
    ('hq.team.assign', 'Assign Team', 'Assign team members to tasks and merchants', 'team', 'hq'),
    -- Organization permissions
    ('hq.org.view', 'View Organizations', 'View organization information', 'organization', 'hq'),
    ('hq.org.manage', 'Manage Organizations', 'Manage organization settings', 'organization', 'hq'),
    -- System permissions
    ('system.analytics.view', 'View System Analytics', 'View system-wide analytics', 'system', 'system'),
    ('system.audit.view', 'View Audit Logs', 'View system audit logs', 'system', 'system'),
    ('system.config.manage', 'Manage System Config', 'Manage system configuration', 'system', 'system'),
    ('system.billing.manage', 'Manage Billing', 'Manage billing and subscriptions', 'system', 'system'),
    -- Merchant-level access permissions
    ('merchant.team.view', 'View Merchant Team', 'View merchant team members', 'merchant_access', 'merchant'),
    ('merchant.team.manage', 'Manage Merchant Team', 'Manage merchant team members', 'merchant_access', 'merchant'),
    ('merchant.transactions.view', 'View Merchant Transactions', 'View merchant transactions', 'merchant_access', 'merchant'),
    ('merchant.analytics.view', 'View Merchant Analytics', 'View merchant analytics', 'merchant_access', 'merchant'),
    ('merchant.reports.view', 'View Merchant Reports', 'View merchant reports', 'merchant_access', 'merchant'),
    ('merchant.reports.export', 'Export Merchant Reports', 'Export merchant reports', 'merchant_access', 'merchant')
ON CONFLICT (code) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    category = EXCLUDED.category,
    scope = EXCLUDED.scope;

-- ============================================================================
-- SECTION 2: Insert/Update Simplified HQ Roles
-- ============================================================================

-- Super Admin - Full system access
INSERT INTO roles (code, name, description, organization_type, level, is_system_role, level_type)
VALUES (
    'hq.super_admin',
    'Super Admin',
    'Full system access - can manage all aspects of the platform including billing, system config, and all merchants',
    'hq',
    10,
    true,
    'hq'
)
ON CONFLICT (code) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    level = EXCLUDED.level,
    updated_at = NOW();

-- Platform Admin - Platform management
INSERT INTO roles (code, name, description, organization_type, level, is_system_role, level_type)
VALUES (
    'hq.platform_admin',
    'Platform Admin',
    'Platform management - can manage merchants, teams, and view system analytics',
    'hq',
    8,
    true,
    'hq'
)
ON CONFLICT (code) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    level = EXCLUDED.level,
    updated_at = NOW();

-- Manager - Operational management
INSERT INTO roles (code, name, description, organization_type, level, is_system_role, level_type)
VALUES (
    'hq.manager',
    'Manager',
    'Operational management - can view and edit assigned merchants, view team info',
    'hq',
    5,
    true,
    'hq'
)
ON CONFLICT (code) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    level = EXCLUDED.level,
    updated_at = NOW();

-- ============================================================================
-- SECTION 3: Assign Permissions to Roles
-- ============================================================================

-- Clear existing role_permissions for these roles (to refresh)
DELETE FROM role_permissions WHERE role_code IN ('hq.super_admin', 'hq.platform_admin', 'hq.manager');

-- Super Admin - All permissions
INSERT INTO role_permissions (role_code, permission_code)
SELECT 'hq.super_admin', code FROM permissions
WHERE code IN (
    -- All merchant permissions
    'hq.merchant.view',
    'hq.merchant.create',
    'hq.merchant.update',
    'hq.merchant.delete',
    'hq.merchant.analytics',
    'hq.merchant.transactions',
    'hq.merchant.manage_team',
    -- All support permissions
    'hq.support.view',
    'hq.support.manage',
    'hq.support.access_data',
    -- All team permissions
    'hq.team.view',
    'hq.team.manage',
    'hq.team.assign',
    -- All org permissions
    'hq.org.view',
    'hq.org.manage',
    -- All system permissions
    'system.analytics.view',
    'system.audit.view',
    'system.config.manage',
    'system.billing.manage',
    -- All merchant-level access
    'merchant.team.view',
    'merchant.team.manage',
    'merchant.transactions.view',
    'merchant.analytics.view',
    'merchant.reports.view',
    'merchant.reports.export'
)
ON CONFLICT (role_code, permission_code) DO NOTHING;

-- Platform Admin - Management permissions (no delete, no system config/billing)
INSERT INTO role_permissions (role_code, permission_code)
SELECT 'hq.platform_admin', code FROM permissions
WHERE code IN (
    -- Merchant permissions (no delete)
    'hq.merchant.view',
    'hq.merchant.create',
    'hq.merchant.update',
    'hq.merchant.analytics',
    'hq.merchant.transactions',
    'hq.merchant.manage_team',
    -- Support permissions
    'hq.support.view',
    'hq.support.manage',
    -- Team permissions
    'hq.team.view',
    'hq.team.manage',
    -- Org permissions (view only)
    'hq.org.view',
    -- System permissions (view only)
    'system.analytics.view',
    'system.audit.view',
    -- Merchant-level access
    'merchant.team.view',
    'merchant.team.manage',
    'merchant.transactions.view',
    'merchant.analytics.view',
    'merchant.reports.view',
    'merchant.reports.export'
)
ON CONFLICT (role_code, permission_code) DO NOTHING;

-- Manager - View and basic edit permissions
INSERT INTO role_permissions (role_code, permission_code)
SELECT 'hq.manager', code FROM permissions
WHERE code IN (
    -- Merchant permissions (view and update only)
    'hq.merchant.view',
    'hq.merchant.update',
    'hq.merchant.analytics',
    'hq.merchant.transactions',
    -- Support permissions (view only)
    'hq.support.view',
    -- Team permissions (view only)
    'hq.team.view',
    -- Merchant-level access (view mostly)
    'merchant.team.view',
    'merchant.transactions.view',
    'merchant.analytics.view',
    'merchant.reports.view'
)
ON CONFLICT (role_code, permission_code) DO NOTHING;

-- ============================================================================
-- SECTION 4: Deprecate Old Roles (mark as non-system, lower level)
-- ============================================================================

-- Mark old HQ roles as deprecated by setting them to lower levels
-- This ensures they're not shown in the invite wizard but existing users still work
UPDATE roles 
SET 
    level = 1,
    description = CONCAT('[DEPRECATED] ', COALESCE(description, '')),
    updated_at = NOW()
WHERE code IN (
    'hq.operations_manager',
    'hq.finance_manager', 
    'hq.support_manager',
    'hq.account_manager',
    'hq.analyst',
    'hq.support_agent'
)
AND organization_type = 'hq';

-- ============================================================================
-- SECTION 5: Helper function to check role level
-- ============================================================================

-- Function to get a user's highest role level
CREATE OR REPLACE FUNCTION get_user_max_role_level(user_id_param TEXT)
RETURNS INTEGER AS $$
DECLARE
    max_level INTEGER;
BEGIN
    SELECT COALESCE(MAX(r.level), 0) INTO max_level
    FROM user_roles ur
    JOIN roles r ON ur.role_code = r.code
    WHERE ur.user_id = user_id_param;
    
    RETURN max_level;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check if a user can invite a specific role
CREATE OR REPLACE FUNCTION can_user_invite_role(inviter_user_id TEXT, target_role_code TEXT)
RETURNS BOOLEAN AS $$
DECLARE
    inviter_level INTEGER;
    target_level INTEGER;
BEGIN
    -- Get inviter's max role level
    inviter_level := get_user_max_role_level(inviter_user_id);
    
    -- Get target role level
    SELECT level INTO target_level
    FROM roles
    WHERE code = target_role_code;
    
    IF target_level IS NULL THEN
        RETURN FALSE;
    END IF;
    
    -- Can only invite roles at same level or below
    RETURN inviter_level >= target_level;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- SECTION 6: Update admin_merchant_access table (remove access_level if exists)
-- ============================================================================

-- Make access_level column optional (nullable) if it exists
-- The role now determines permissions, not per-merchant access levels
DO $$
BEGIN
    -- Check if access_level column exists and make it nullable
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'admin_merchant_access' 
        AND column_name = 'access_level'
    ) THEN
        ALTER TABLE admin_merchant_access 
        ALTER COLUMN access_level DROP NOT NULL;
        
        -- Set default to NULL for new records
        ALTER TABLE admin_merchant_access 
        ALTER COLUMN access_level SET DEFAULT NULL;
    END IF;
END $$;

-- Add comment explaining the change
COMMENT ON TABLE admin_merchant_access IS 
    'Maps admin users to merchants they can access. 
     Note: As of migration 018, access_level is deprecated. 
     The admin''s role determines their permissions within each merchant.';
