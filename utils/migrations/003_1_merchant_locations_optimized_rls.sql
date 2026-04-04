-- ============================================================================
-- DEXA POS - OPTIMIZED RLS Policies for Locations
-- ============================================================================
-- This version addresses performance bottlenecks:
-- 1. Materialized user context (computed once per transaction)
-- 2. Indexed columns for RLS checks
-- 3. Simplified permission lookups
-- 4. Reduced subquery nesting
-- ============================================================================

-- ============================================================================
-- SECTION 1: Required Indexes
-- ============================================================================
-- These indexes are CRITICAL for RLS performance

-- Location members - the most frequently queried table in RLS
CREATE INDEX IF NOT EXISTS idx_location_members_user_location 
    ON location_members(user_id, location_id) 
    WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_location_members_user_active 
    ON location_members(user_id) 
    WHERE is_active = true;

-- Members table - for org membership checks
CREATE INDEX IF NOT EXISTS idx_members_user_org 
    ON members(user_id, organization_id);

-- Merchants - for org to merchant lookups
CREATE INDEX IF NOT EXISTS idx_merchants_clerk_org 
    ON merchants(clerk_org_id);

-- Locations - for merchant lookups
CREATE INDEX IF NOT EXISTS idx_locations_merchant 
    ON locations(merchant_id);

-- Role permissions - for permission checks
CREATE INDEX IF NOT EXISTS idx_role_permissions_role_perm 
    ON role_permissions(role_code, permission_code);

-- GIN index for JSONB roles lookup (THIS IS KEY for the ? operator)
CREATE INDEX IF NOT EXISTS idx_users_roles_gin 
    ON users USING GIN ((public_metadata->'roles'));

-- ============================================================================
-- SECTION 2: Denormalized User Roles Table (Optional but Recommended)
-- ============================================================================
-- Instead of querying JSONB every time, maintain a normalized roles table
-- This is updated via trigger when user metadata changes

CREATE TABLE IF NOT EXISTS user_roles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role_code TEXT NOT NULL REFERENCES roles(code) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, role_code)
);

CREATE INDEX IF NOT EXISTS idx_user_roles_user ON user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_role ON user_roles(role_code);

-- Trigger to sync user_roles when users.public_metadata changes
CREATE OR REPLACE FUNCTION sync_user_roles() RETURNS TRIGGER AS $$
BEGIN
    -- Delete existing roles for this user
    DELETE FROM user_roles WHERE user_id = NEW.id;
    
    -- Insert new roles from metadata
    INSERT INTO user_roles (user_id, role_code)
    SELECT NEW.id, role_code
    FROM jsonb_array_elements_text(COALESCE(NEW.public_metadata->'roles', '[]'::jsonb)) AS role_code
    WHERE EXISTS (SELECT 1 FROM roles WHERE code = role_code);
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_user_roles ON users;
CREATE TRIGGER trg_sync_user_roles
    AFTER INSERT OR UPDATE OF public_metadata ON users
    FOR EACH ROW EXECUTE FUNCTION sync_user_roles();

-- ============================================================================
-- SECTION 3: Optimized Helper Functions
-- ============================================================================

-- Get current user ID (cached per statement)
CREATE OR REPLACE FUNCTION current_user_id() RETURNS TEXT AS $$
    SELECT NULLIF(get_my_claim('sub')::TEXT, '')::TEXT;
$$ LANGUAGE SQL STABLE;

-- Check if current user is a merchant admin (owner or admin role)
-- Uses the denormalized user_roles table for speed
CREATE OR REPLACE FUNCTION is_merchant_admin(p_merchant_id UUID) RETURNS BOOLEAN AS $$
    SELECT EXISTS (
        SELECT 1 
        FROM members m
        JOIN merchants mer ON mer.clerk_org_id = m.organization_id
        JOIN user_roles ur ON ur.user_id = m.user_id
        WHERE m.user_id = current_user_id()
          AND mer.id = p_merchant_id
          AND ur.role_code IN ('merchant.owner', 'merchant.admin')
    );
$$ LANGUAGE SQL STABLE SECURITY DEFINER;

-- Check if current user is merchant owner specifically
CREATE OR REPLACE FUNCTION is_merchant_owner(p_merchant_id UUID) RETURNS BOOLEAN AS $$
    SELECT EXISTS (
        SELECT 1 
        FROM members m
        JOIN merchants mer ON mer.clerk_org_id = m.organization_id
        JOIN user_roles ur ON ur.user_id = m.user_id
        WHERE m.user_id = current_user_id()
          AND mer.id = p_merchant_id
          AND ur.role_code = 'merchant.owner'
    );
$$ LANGUAGE SQL STABLE SECURITY DEFINER;

-- Check if user is assigned to a location (any role)
CREATE OR REPLACE FUNCTION is_location_member(p_location_id UUID) RETURNS BOOLEAN AS $$
    SELECT EXISTS (
        SELECT 1 FROM location_members
        WHERE user_id = current_user_id()
          AND location_id = p_location_id
          AND is_active = true
    );
$$ LANGUAGE SQL STABLE SECURITY DEFINER;

-- Get user's role at a specific location (returns NULL if not a member)
CREATE OR REPLACE FUNCTION get_location_role(p_location_id UUID) RETURNS TEXT AS $$
    SELECT role_code FROM location_members
    WHERE user_id = current_user_id()
      AND location_id = p_location_id
      AND is_active = true
    LIMIT 1;
$$ LANGUAGE SQL STABLE SECURITY DEFINER;

-- OPTIMIZED: Check if user has a specific permission at a location
-- This version minimizes joins and uses indexed lookups
CREATE OR REPLACE FUNCTION user_has_location_permission(
    p_location_id UUID,
    p_permission_code TEXT
) RETURNS BOOLEAN AS $$
DECLARE
    v_user_id TEXT;
    v_merchant_id UUID;
    v_role_code TEXT;
BEGIN
    v_user_id := current_user_id();
    
    -- Fast path: check location membership first (most common case)
    SELECT lm.role_code, l.merchant_id 
    INTO v_role_code, v_merchant_id
    FROM location_members lm
    JOIN locations l ON l.id = lm.location_id
    WHERE lm.user_id = v_user_id
      AND lm.location_id = p_location_id
      AND lm.is_active = true;
    
    -- If user is a location member, check their role's permissions
    IF v_role_code IS NOT NULL THEN
        RETURN EXISTS (
            SELECT 1 FROM role_permissions
            WHERE role_code = v_role_code
              AND permission_code = p_permission_code
        );
    END IF;
    
    -- Fallback: get merchant_id and check if user is merchant admin
    IF v_merchant_id IS NULL THEN
        SELECT merchant_id INTO v_merchant_id 
        FROM locations WHERE id = p_location_id;
    END IF;
    
    -- Check if merchant admin (they have all location permissions)
    IF is_merchant_admin(v_merchant_id) THEN
        RETURN true;
    END IF;
    
    RETURN false;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- ============================================================================
-- SECTION 4: Precomputed Access View (for complex queries)
-- ============================================================================
-- This materialized view can be refreshed periodically for dashboards/reports
-- where real-time RLS is too slow

CREATE MATERIALIZED VIEW IF NOT EXISTS mv_user_location_access AS
SELECT DISTINCT
    u.id as user_id,
    l.id as location_id,
    l.merchant_id,
    COALESCE(lm.role_code, ur.role_code) as effective_role,
    CASE 
        WHEN lm.id IS NOT NULL THEN 'location_member'
        WHEN ur.role_code IN ('merchant.owner', 'merchant.admin') THEN 'merchant_admin'
        ELSE NULL
    END as access_type,
    lm.is_primary_location
FROM users u
CROSS JOIN locations l
LEFT JOIN location_members lm ON lm.user_id = u.id AND lm.location_id = l.id AND lm.is_active = true
LEFT JOIN members m ON m.user_id = u.id
LEFT JOIN merchants mer ON mer.clerk_org_id = m.organization_id AND mer.id = l.merchant_id
LEFT JOIN user_roles ur ON ur.user_id = u.id AND ur.role_code IN ('merchant.owner', 'merchant.admin')
WHERE lm.id IS NOT NULL OR (mer.id IS NOT NULL AND ur.role_code IS NOT NULL);

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_user_location_access 
    ON mv_user_location_access(user_id, location_id);

-- Refresh function (call periodically or after bulk changes)
CREATE OR REPLACE FUNCTION refresh_user_location_access() RETURNS void AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_user_location_access;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- SECTION 5: Optimized RLS Policies
-- ============================================================================

-- Drop all existing policies first
DO $$ 
DECLARE
    pol RECORD;
BEGIN
    FOR pol IN 
        SELECT policyname, tablename 
        FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename IN ('locations', 'location_members', 'location_invites', 
                          'location_menus', 'location_menu_item_overrides',
                          'location_category_overrides', 'location_exclusive_items')
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON %I', pol.policyname, pol.tablename);
    END LOOP;
END $$;

-- ============================================================================
-- LOCATIONS TABLE - Optimized Policies
-- ============================================================================

-- SELECT: Can view if member OR merchant admin
CREATE POLICY locations_select ON locations FOR SELECT USING (
    -- Direct location membership (fast indexed lookup)
    EXISTS (
        SELECT 1 FROM location_members lm
        WHERE lm.location_id = locations.id
          AND lm.user_id = current_user_id()
          AND lm.is_active = true
    )
    OR
    -- Merchant admin check (uses optimized function)
    is_merchant_admin(locations.merchant_id)
);

-- INSERT: Only merchant admins
CREATE POLICY locations_insert ON locations FOR INSERT WITH CHECK (
    is_merchant_admin(locations.merchant_id)
);

-- UPDATE: Merchant admin OR location manager with permission
CREATE POLICY locations_update ON locations FOR UPDATE USING (
    is_merchant_admin(locations.merchant_id)
    OR
    user_has_location_permission(locations.id, 'location.manage')
);

-- DELETE: Only merchant owner
CREATE POLICY locations_delete ON locations FOR DELETE USING (
    is_merchant_owner(locations.merchant_id)
);

-- ============================================================================
-- LOCATION_MEMBERS TABLE - Optimized Policies
-- ============================================================================

-- SELECT: Can see self OR has team.view permission
CREATE POLICY location_members_select ON location_members FOR SELECT USING (
    -- Can always see yourself (fast)
    location_members.user_id = current_user_id()
    OR
    -- Has team view permission
    user_has_location_permission(location_members.location_id, 'location.team.view')
);

-- INSERT: Has team.manage permission
CREATE POLICY location_members_insert ON location_members FOR INSERT WITH CHECK (
    user_has_location_permission(location_members.location_id, 'location.team.manage')
);

-- UPDATE: Has team.manage permission
CREATE POLICY location_members_update ON location_members FOR UPDATE USING (
    user_has_location_permission(location_members.location_id, 'location.team.manage')
);

-- DELETE: Has team.manage permission
CREATE POLICY location_members_delete ON location_members FOR DELETE USING (
    user_has_location_permission(location_members.location_id, 'location.team.manage')
);

-- ============================================================================
-- LOCATION_INVITES TABLE - Optimized Policies
-- ============================================================================

CREATE POLICY location_invites_select ON location_invites FOR SELECT USING (
    location_invites.invited_by_user_id = current_user_id()
    OR
    user_has_location_permission(location_invites.location_id, 'location.team.view')
);

CREATE POLICY location_invites_insert ON location_invites FOR INSERT WITH CHECK (
    user_has_location_permission(location_invites.location_id, 'location.team.manage')
);

CREATE POLICY location_invites_update ON location_invites FOR UPDATE USING (
    user_has_location_permission(location_invites.location_id, 'location.team.manage')
);

CREATE POLICY location_invites_delete ON location_invites FOR DELETE USING (
    user_has_location_permission(location_invites.location_id, 'location.team.manage')
);

-- ============================================================================
-- LOCATION_MENUS TABLE - Optimized Policies
-- ============================================================================

CREATE POLICY location_menus_select ON location_menus FOR SELECT USING (
    user_has_location_permission(location_menus.location_id, 'location.menu.view')
);

CREATE POLICY location_menus_insert ON location_menus FOR INSERT WITH CHECK (
    user_has_location_permission(location_menus.location_id, 'location.menu.manage')
);

CREATE POLICY location_menus_update ON location_menus FOR UPDATE USING (
    user_has_location_permission(location_menus.location_id, 'location.menu.manage')
);

CREATE POLICY location_menus_delete ON location_menus FOR DELETE USING (
    user_has_location_permission(location_menus.location_id, 'location.menu.manage')
);

-- ============================================================================
-- LOCATION_MENU_ITEM_OVERRIDES TABLE - Optimized Policies
-- ============================================================================

CREATE POLICY location_item_overrides_select ON location_menu_item_overrides FOR SELECT USING (
    user_has_location_permission(location_menu_item_overrides.location_id, 'location.menu.view')
);

CREATE POLICY location_item_overrides_insert ON location_menu_item_overrides FOR INSERT WITH CHECK (
    user_has_location_permission(location_menu_item_overrides.location_id, 'location.menu.pricing')
);

CREATE POLICY location_item_overrides_update ON location_menu_item_overrides FOR UPDATE USING (
    user_has_location_permission(location_menu_item_overrides.location_id, 'location.menu.pricing')
);

CREATE POLICY location_item_overrides_delete ON location_menu_item_overrides FOR DELETE USING (
    user_has_location_permission(location_menu_item_overrides.location_id, 'location.menu.pricing')
);

-- ============================================================================
-- LOCATION_CATEGORY_OVERRIDES TABLE - Optimized Policies
-- ============================================================================

CREATE POLICY location_category_overrides_select ON location_category_overrides FOR SELECT USING (
    user_has_location_permission(location_category_overrides.location_id, 'location.menu.view')
);

CREATE POLICY location_category_overrides_insert ON location_category_overrides FOR INSERT WITH CHECK (
    user_has_location_permission(location_category_overrides.location_id, 'location.menu.manage')
);

CREATE POLICY location_category_overrides_update ON location_category_overrides FOR UPDATE USING (
    user_has_location_permission(location_category_overrides.location_id, 'location.menu.manage')
);

CREATE POLICY location_category_overrides_delete ON location_category_overrides FOR DELETE USING (
    user_has_location_permission(location_category_overrides.location_id, 'location.menu.manage')
);

-- ============================================================================
-- LOCATION_EXCLUSIVE_ITEMS TABLE - Optimized Policies
-- ============================================================================

CREATE POLICY location_exclusive_items_select ON location_exclusive_items FOR SELECT USING (
    user_has_location_permission(location_exclusive_items.location_id, 'location.menu.view')
);

CREATE POLICY location_exclusive_items_insert ON location_exclusive_items FOR INSERT WITH CHECK (
    user_has_location_permission(location_exclusive_items.location_id, 'location.menu.manage')
);

CREATE POLICY location_exclusive_items_update ON location_exclusive_items FOR UPDATE USING (
    user_has_location_permission(location_exclusive_items.location_id, 'location.menu.manage')
);

CREATE POLICY location_exclusive_items_delete ON location_exclusive_items FOR DELETE USING (
    user_has_location_permission(location_exclusive_items.location_id, 'location.menu.manage')
);

-- ============================================================================
-- SECTION 6: Performance Testing Queries
-- ============================================================================
-- Run these to verify RLS performance after applying policies

/*
-- Test 1: Check policy execution time for locations SELECT
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT * FROM locations;

-- Test 2: Check permission function performance
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT user_has_location_permission('location-uuid-here', 'location.menu.view');

-- Test 3: Check location members with joins
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT lm.*, u.first_name, u.last_name, r.name as role_name
FROM location_members lm
JOIN users u ON u.id = lm.user_id
JOIN roles r ON r.code = lm.role_code
WHERE lm.location_id = 'location-uuid-here';

-- Test 4: Verify indexes are being used
SELECT 
    schemaname,
    tablename,
    indexname,
    idx_scan,
    idx_tup_read,
    idx_tup_fetch
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
ORDER BY idx_scan DESC;
*/

-- ============================================================================
-- END OF OPTIMIZED RLS
-- ============================================================================