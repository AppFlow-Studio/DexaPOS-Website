-- ============================================================================
-- DEXA POS - Locations Schema
-- ============================================================================
-- This schema handles:
-- 1. Enhanced location management with full business details
-- 2. Location-based user assignments with role inheritance
-- 3. Location-specific menu customizations
-- 4. Granular RLS policies for multi-location access control
-- ============================================================================

-- ============================================================================
-- SECTION 1: Enhanced Locations Table
-- ============================================================================

-- Drop existing locations table constraints if needed (be careful in production!)
-- ALTER TABLE locations DROP CONSTRAINT IF EXISTS locations_merchant_id_fkey;

-- Enhanced locations table with full business details
CREATE TABLE IF NOT EXISTS locations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    
    -- Basic Info
    name TEXT NOT NULL,
    code TEXT, -- Short code like "NYC-01", "LA-MAIN"
    description TEXT,
    
    -- Contact Info
    phone TEXT,
    email TEXT,
    
    -- Address (structured for better querying/display)
    address_line1 TEXT NOT NULL,
    address_line2 TEXT,
    city TEXT NOT NULL,
    state TEXT NOT NULL,
    postal_code TEXT NOT NULL,
    country TEXT NOT NULL DEFAULT 'US',
    
    -- Geolocation (for maps, delivery radius, etc.)
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),
    
    -- Timezone (critical for scheduling, reports)
    timezone TEXT NOT NULL DEFAULT 'America/New_York',
    
    -- Operating Status
    is_active BOOLEAN NOT NULL DEFAULT true,
    is_accepting_orders BOOLEAN NOT NULL DEFAULT true,
    
    -- Business Hours (stored as JSONB for flexibility)
    -- Format: {"monday": {"open": "09:00", "close": "22:00", "is_closed": false}, ...}
    business_hours JSONB DEFAULT '{}'::jsonb,
    
    -- Menu Configuration
    -- If true, location uses merchant's global menu. If false, uses custom menu setup.
    uses_global_menu BOOLEAN NOT NULL DEFAULT true,
    
    -- Metadata for extensibility
    public_metadata JSONB DEFAULT '{}'::jsonb,
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Constraints
    UNIQUE(merchant_id, code)
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_locations_merchant_id ON locations(merchant_id);
CREATE INDEX IF NOT EXISTS idx_locations_is_active ON locations(is_active);
CREATE INDEX IF NOT EXISTS idx_locations_city_state ON locations(city, state);

-- ============================================================================
-- SECTION 2: Location Members (User-Location-Role Assignment)
-- ============================================================================
-- This is the critical junction table that assigns users to locations
-- with specific roles. A user can have different roles at different locations.

CREATE TABLE IF NOT EXISTS location_members (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Foreign Keys
    location_id UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role_code TEXT NOT NULL REFERENCES roles(code) ON DELETE RESTRICT,
    
    -- Assignment Details
    is_primary_location BOOLEAN NOT NULL DEFAULT false, -- User's main work location
    is_active BOOLEAN NOT NULL DEFAULT true,
    
    -- Employment Info (optional, useful for scheduling)
    employment_type TEXT CHECK (employment_type IN ('full_time', 'part_time', 'contractor', 'seasonal')),
    hourly_rate DECIMAL(10, 2),
    
    -- Access Control
    pin_code TEXT, -- 4-6 digit PIN for POS login at this location
    
    -- Timestamps
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- A user can only have one role per location
    UNIQUE(location_id, user_id)
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_location_members_location_id ON location_members(location_id);
CREATE INDEX IF NOT EXISTS idx_location_members_user_id ON location_members(user_id);
CREATE INDEX IF NOT EXISTS idx_location_members_role_code ON location_members(role_code);
CREATE INDEX IF NOT EXISTS idx_location_members_pin ON location_members(location_id, pin_code) WHERE pin_code IS NOT NULL;

-- ============================================================================
-- SECTION 3: Location Invites (Pending Staff Invitations)
-- ============================================================================

CREATE TABLE IF NOT EXISTS location_invites (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Foreign Keys
    location_id UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
    invited_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Invite Details
    email TEXT NOT NULL,
    role_code TEXT NOT NULL REFERENCES roles(code) ON DELETE RESTRICT,
    
    -- Clerk Integration (if using Clerk for invite flow)
    clerk_invite_id TEXT,
    
    -- Status Tracking
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'expired', 'cancelled')),
    
    -- The user ID once they accept
    accepted_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    
    -- Expiration
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days'),
    accepted_at TIMESTAMPTZ,
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_location_invites_location_id ON location_invites(location_id);
CREATE INDEX IF NOT EXISTS idx_location_invites_email ON location_invites(email);
CREATE INDEX IF NOT EXISTS idx_location_invites_status ON location_invites(status);

-- ============================================================================
-- SECTION 4: Location-Specific Permissions
-- ============================================================================
-- Add location-scoped permissions to the existing permissions table

INSERT INTO permissions (code, name, description, category, scope) VALUES
    -- Location Management
    ('location.view', 'View Location', 'View location details', 'location', 'location'),
    ('location.manage', 'Manage Location', 'Edit location settings', 'location', 'location'),
    ('location.create', 'Create Location', 'Create new locations', 'location', 'merchant'),
    ('location.delete', 'Delete Location', 'Delete locations', 'location', 'merchant'),
    
    -- Location Team Management
    ('location.team.view', 'View Location Team', 'View staff assigned to location', 'team', 'location'),
    ('location.team.manage', 'Manage Location Team', 'Invite/remove staff at location', 'team', 'location'),
    ('location.team.schedule', 'Manage Schedules', 'Create and manage staff schedules', 'team', 'location'),
    
    -- Location Menu Customization
    ('location.menu.view', 'View Location Menu', 'View location menu settings', 'menu', 'location'),
    ('location.menu.manage', 'Manage Location Menu', 'Customize menu for location', 'menu', 'location'),
    ('location.menu.pricing', 'Manage Location Pricing', 'Set location-specific prices', 'menu', 'location'),
    
    -- Location Inventory
    ('location.inventory.view', 'View Location Inventory', 'View inventory at location', 'inventory', 'location'),
    ('location.inventory.manage', 'Manage Location Inventory', 'Manage stock levels at location', 'inventory', 'location'),
    
    -- Location Reports
    ('location.reports.view', 'View Location Reports', 'View reports for location', 'reports', 'location'),
    ('location.reports.export', 'Export Location Reports', 'Export location reports', 'reports', 'location'),
    
    -- Location Orders & Transactions
    ('location.orders.view', 'View Location Orders', 'View orders at location', 'orders', 'location'),
    ('location.orders.manage', 'Manage Location Orders', 'Process orders at location', 'orders', 'location'),
    ('location.transactions.view', 'View Location Transactions', 'View transactions at location', 'transactions', 'location'),
    ('location.transactions.refund', 'Process Location Refunds', 'Process refunds at location', 'transactions', 'location'),
    
    -- Location Devices
    ('location.devices.view', 'View Location Devices', 'View POS devices at location', 'devices', 'location'),
    ('location.devices.manage', 'Manage Location Devices', 'Configure devices at location', 'devices', 'location')
ON CONFLICT (code) DO NOTHING;

-- ============================================================================
-- SECTION 5: Role-Permission Mappings for Location Permissions
-- ============================================================================
-- Map the new location permissions to existing roles

-- Owner gets everything
INSERT INTO role_permissions (role_code, permission_code)
SELECT 'merchant.owner', code FROM permissions WHERE scope = 'location'
ON CONFLICT (role_code, permission_code) DO NOTHING;

-- Admin gets everything except delete
INSERT INTO role_permissions (role_code, permission_code)
SELECT 'merchant.admin', code FROM permissions WHERE scope = 'location' AND code != 'location.delete'
ON CONFLICT (role_code, permission_code) DO NOTHING;

-- Manager gets operational permissions
INSERT INTO role_permissions (role_code, permission_code) VALUES
    ('merchant.manager', 'location.view'),
    ('merchant.manager', 'location.manage'),
    ('merchant.manager', 'location.team.view'),
    ('merchant.manager', 'location.team.manage'),
    ('merchant.manager', 'location.team.schedule'),
    ('merchant.manager', 'location.menu.view'),
    ('merchant.manager', 'location.menu.manage'),
    ('merchant.manager', 'location.menu.pricing'),
    ('merchant.manager', 'location.inventory.view'),
    ('merchant.manager', 'location.inventory.manage'),
    ('merchant.manager', 'location.reports.view'),
    ('merchant.manager', 'location.reports.export'),
    ('merchant.manager', 'location.orders.view'),
    ('merchant.manager', 'location.orders.manage'),
    ('merchant.manager', 'location.transactions.view'),
    ('merchant.manager', 'location.transactions.refund'),
    ('merchant.manager', 'location.devices.view'),
    ('merchant.manager', 'location.devices.manage')
ON CONFLICT (role_code, permission_code) DO NOTHING;

-- Shift Manager gets day-to-day operational permissions
INSERT INTO role_permissions (role_code, permission_code) VALUES
    ('merchant.shift_manager', 'location.view'),
    ('merchant.shift_manager', 'location.team.view'),
    ('merchant.shift_manager', 'location.team.schedule'),
    ('merchant.shift_manager', 'location.menu.view'),
    ('merchant.shift_manager', 'location.inventory.view'),
    ('merchant.shift_manager', 'location.reports.view'),
    ('merchant.shift_manager', 'location.orders.view'),
    ('merchant.shift_manager', 'location.orders.manage'),
    ('merchant.shift_manager', 'location.transactions.view'),
    ('merchant.shift_manager', 'location.devices.view')
ON CONFLICT (role_code, permission_code) DO NOTHING;

-- Inventory Manager
INSERT INTO role_permissions (role_code, permission_code) VALUES
    ('merchant.inventory_manager', 'location.view'),
    ('merchant.inventory_manager', 'location.menu.view'),
    ('merchant.inventory_manager', 'location.inventory.view'),
    ('merchant.inventory_manager', 'location.inventory.manage'),
    ('merchant.inventory_manager', 'location.reports.view')
ON CONFLICT (role_code, permission_code) DO NOTHING;

-- Cashier gets basic operational permissions
INSERT INTO role_permissions (role_code, permission_code) VALUES
    ('merchant.cashier', 'location.view'),
    ('merchant.cashier', 'location.menu.view'),
    ('merchant.cashier', 'location.orders.view'),
    ('merchant.cashier', 'location.orders.manage'),
    ('merchant.cashier', 'location.transactions.view')
ON CONFLICT (role_code, permission_code) DO NOTHING;

-- Staff gets view-only
INSERT INTO role_permissions (role_code, permission_code) VALUES
    ('merchant.staff', 'location.view'),
    ('merchant.staff', 'location.menu.view'),
    ('merchant.staff', 'location.orders.view')
ON CONFLICT (role_code, permission_code) DO NOTHING;

-- ============================================================================
-- SECTION 6: Location Menu Customization Tables
-- ============================================================================

-- Location-specific menu availability (which menus are active at this location)
CREATE TABLE IF NOT EXISTS location_menus (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    location_id UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
    menu_id UUID NOT NULL REFERENCES menus(id) ON DELETE CASCADE,
    
    is_active BOOLEAN NOT NULL DEFAULT true,
    display_order INTEGER,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    UNIQUE(location_id, menu_id)
);

-- Location-specific item overrides (price, availability)
CREATE TABLE IF NOT EXISTS location_menu_item_overrides (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    location_id UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
    menu_item_id UUID NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
    
    -- Price overrides (NULL means use default)
    custom_price DECIMAL(10, 2),
    custom_cash_price DECIMAL(10, 2),
    
    -- Availability override
    is_available BOOLEAN NOT NULL DEFAULT true,
    
    -- Stock override at location level
    stock_tracking_mode TEXT CHECK (stock_tracking_mode IN ('in_stock', 'out_of_stock', 'quantity', 'use_default')),
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    UNIQUE(location_id, menu_item_id)
);

-- Location-specific category overrides
CREATE TABLE IF NOT EXISTS location_category_overrides (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    location_id UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
    category_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    
    is_active BOOLEAN NOT NULL DEFAULT true,
    display_order INTEGER,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    UNIQUE(location_id, category_id)
);

-- Location-only items (items that exist ONLY at specific locations)
CREATE TABLE IF NOT EXISTS location_exclusive_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    location_id UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
    
    -- Item Details (similar to menu_items but location-specific)
    name TEXT NOT NULL,
    description TEXT,
    price DECIMAL(10, 2) NOT NULL,
    cash_price DECIMAL(10, 2),
    image TEXT,
    category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
    
    meal_types TEXT[] DEFAULT '{}',
    allergens TEXT[] DEFAULT '{}',
    card_bg_color TEXT,
    availability BOOLEAN NOT NULL DEFAULT true,
    stock_tracking_mode TEXT CHECK (stock_tracking_mode IN ('in_stock', 'out_of_stock', 'quantity')),
    
    display_order INTEGER,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_location_exclusive_items_location ON location_exclusive_items(location_id);
CREATE INDEX IF NOT EXISTS idx_location_exclusive_items_category ON location_exclusive_items(category_id);

-- ============================================================================
-- SECTION 7: Helper Functions
-- ============================================================================

-- Function to check if a user has a specific permission at a location
CREATE OR REPLACE FUNCTION user_has_location_permission(
    p_user_id TEXT,
    p_location_id UUID,
    p_permission_code TEXT
) RETURNS BOOLEAN AS $$
DECLARE
    v_has_permission BOOLEAN := false;
    v_merchant_id UUID;
BEGIN
    -- Get the merchant_id for the location
    SELECT merchant_id INTO v_merchant_id FROM locations WHERE id = p_location_id;
    
    -- Check if user has permission through location membership
    SELECT EXISTS (
        SELECT 1
        FROM location_members lm
        JOIN role_permissions rp ON lm.role_code = rp.role_code
        WHERE lm.user_id = p_user_id
          AND lm.location_id = p_location_id
          AND lm.is_active = true
          AND rp.permission_code = p_permission_code
    ) INTO v_has_permission;
    
    -- If not found at location level, check merchant-level admin roles
    IF NOT v_has_permission THEN
        SELECT EXISTS (
            SELECT 1
            FROM members m
            JOIN merchants mer ON mer.clerk_org_id = m.organization_id
            JOIN users u ON u.id = m.user_id
            JOIN roles r ON r.code = ANY(
                SELECT jsonb_array_elements_text(u.public_metadata->'roles')
            )
            JOIN role_permissions rp ON r.code = rp.role_code
            WHERE m.user_id = p_user_id
              AND mer.id = v_merchant_id
              AND rp.permission_code = p_permission_code
              AND r.level_type = 'admin' -- Only admin-level roles get org-wide access
        ) INTO v_has_permission;
    END IF;
    
    RETURN v_has_permission;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get all locations a user can access
CREATE OR REPLACE FUNCTION get_user_accessible_locations(p_user_id TEXT)
RETURNS TABLE (
    location_id UUID,
    location_name TEXT,
    role_code TEXT,
    role_name TEXT,
    is_primary BOOLEAN
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        l.id as location_id,
        l.name as location_name,
        lm.role_code,
        r.name as role_name,
        lm.is_primary_location as is_primary
    FROM location_members lm
    JOIN locations l ON l.id = lm.location_id
    JOIN roles r ON r.code = lm.role_code
    WHERE lm.user_id = p_user_id
      AND lm.is_active = true
      AND l.is_active = true
    ORDER BY lm.is_primary_location DESC, l.name ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get effective menu item price at a location
CREATE OR REPLACE FUNCTION get_location_item_price(
    p_location_id UUID,
    p_menu_item_id UUID,
    p_is_cash BOOLEAN DEFAULT false
) RETURNS DECIMAL(10, 2) AS $$
DECLARE
    v_price DECIMAL(10, 2);
BEGIN
    -- First check for location override
    IF p_is_cash THEN
        SELECT COALESCE(o.custom_cash_price, mi.cash_price, mi.price)
        INTO v_price
        FROM menu_items mi
        LEFT JOIN location_menu_item_overrides o 
            ON o.menu_item_id = mi.id AND o.location_id = p_location_id
        WHERE mi.id = p_menu_item_id;
    ELSE
        SELECT COALESCE(o.custom_price, mi.price)
        INTO v_price
        FROM menu_items mi
        LEFT JOIN location_menu_item_overrides o 
            ON o.menu_item_id = mi.id AND o.location_id = p_location_id
        WHERE mi.id = p_menu_item_id;
    END IF;
    
    RETURN v_price;
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================================================
-- SECTION 8: Row Level Security (RLS) Policies
-- ============================================================================

-- Enable RLS on all location tables
ALTER TABLE locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE location_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE location_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE location_menus ENABLE ROW LEVEL SECURITY;
ALTER TABLE location_menu_item_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE location_category_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE location_exclusive_items ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- RLS: Locations Table
-- ============================================================================

-- Users can view locations they are assigned to OR all locations if they're a merchant admin
CREATE POLICY locations_select_policy ON locations
    FOR SELECT
    USING (
        -- User is assigned to this location
        EXISTS (
            SELECT 1 FROM location_members lm
            WHERE lm.location_id = locations.id
              AND lm.user_id = auth.uid()::TEXT
              AND lm.is_active = true
        )
        OR
        -- User is a merchant-level admin (owner/admin)
        EXISTS (
            SELECT 1 FROM members m
            JOIN merchants mer ON mer.clerk_org_id = m.organization_id
            JOIN users u ON u.id = m.user_id
            WHERE m.user_id = auth.uid()::TEXT
              AND mer.id = locations.merchant_id
              AND (
                  u.public_metadata->'roles' ? 'merchant.owner'
                  OR u.public_metadata->'roles' ? 'merchant.admin'
              )
        )
    );

-- Only merchant admins can create locations
CREATE POLICY locations_insert_policy ON locations
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM members m
            JOIN merchants mer ON mer.clerk_org_id = m.organization_id
            JOIN users u ON u.id = m.user_id
            WHERE m.user_id = auth.uid()::TEXT
              AND mer.id = locations.merchant_id
              AND (
                  u.public_metadata->'roles' ? 'merchant.owner'
                  OR u.public_metadata->'roles' ? 'merchant.admin'
              )
        )
    );

-- Merchant admins and location managers can update locations
CREATE POLICY locations_update_policy ON locations
    FOR UPDATE
    USING (
        -- Merchant-level admin
        EXISTS (
            SELECT 1 FROM members m
            JOIN merchants mer ON mer.clerk_org_id = m.organization_id
            JOIN users u ON u.id = m.user_id
            WHERE m.user_id = auth.uid()::TEXT
              AND mer.id = locations.merchant_id
              AND (
                  u.public_metadata->'roles' ? 'merchant.owner'
                  OR u.public_metadata->'roles' ? 'merchant.admin'
              )
        )
        OR
        -- Location manager with location.manage permission
        user_has_location_permission(auth.uid()::TEXT, locations.id, 'location.manage')
    );

-- Only merchant owners can delete locations
CREATE POLICY locations_delete_policy ON locations
    FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM members m
            JOIN merchants mer ON mer.clerk_org_id = m.organization_id
            JOIN users u ON u.id = m.user_id
            WHERE m.user_id = auth.uid()::TEXT
              AND mer.id = locations.merchant_id
              AND u.public_metadata->'roles' ? 'merchant.owner'
        )
    );

-- ============================================================================
-- RLS: Location Members Table
-- ============================================================================

-- Users can see members of locations they belong to (if they have team.view permission)
CREATE POLICY location_members_select_policy ON location_members
    FOR SELECT
    USING (
        -- Can see yourself always
        location_members.user_id = auth.uid()::TEXT
        OR
        -- Has permission to view team at this location
        user_has_location_permission(auth.uid()::TEXT, location_members.location_id, 'location.team.view')
    );

-- Only users with team.manage permission can add members
CREATE POLICY location_members_insert_policy ON location_members
    FOR INSERT
    WITH CHECK (
        user_has_location_permission(auth.uid()::TEXT, location_members.location_id, 'location.team.manage')
    );

-- Only users with team.manage permission can update members
CREATE POLICY location_members_update_policy ON location_members
    FOR UPDATE
    USING (
        user_has_location_permission(auth.uid()::TEXT, location_members.location_id, 'location.team.manage')
    );

-- Only users with team.manage permission can remove members
CREATE POLICY location_members_delete_policy ON location_members
    FOR DELETE
    USING (
        user_has_location_permission(auth.uid()::TEXT, location_members.location_id, 'location.team.manage')
    );

-- ============================================================================
-- RLS: Location Invites Table
-- ============================================================================

CREATE POLICY location_invites_select_policy ON location_invites
    FOR SELECT
    USING (
        user_has_location_permission(auth.uid()::TEXT, location_invites.location_id, 'location.team.view')
        OR location_invites.invited_by_user_id = auth.uid()::TEXT
    );

CREATE POLICY location_invites_insert_policy ON location_invites
    FOR INSERT
    WITH CHECK (
        user_has_location_permission(auth.uid()::TEXT, location_invites.location_id, 'location.team.manage')
    );

CREATE POLICY location_invites_update_policy ON location_invites
    FOR UPDATE
    USING (
        user_has_location_permission(auth.uid()::TEXT, location_invites.location_id, 'location.team.manage')
    );

CREATE POLICY location_invites_delete_policy ON location_invites
    FOR DELETE
    USING (
        user_has_location_permission(auth.uid()::TEXT, location_invites.location_id, 'location.team.manage')
    );

-- ============================================================================
-- RLS: Location Menu Tables
-- ============================================================================

-- Location Menus
CREATE POLICY location_menus_select_policy ON location_menus
    FOR SELECT
    USING (
        user_has_location_permission(auth.uid()::TEXT, location_menus.location_id, 'location.menu.view')
    );

CREATE POLICY location_menus_insert_policy ON location_menus
    FOR INSERT
    WITH CHECK (
        user_has_location_permission(auth.uid()::TEXT, location_menus.location_id, 'location.menu.manage')
    );

CREATE POLICY location_menus_update_policy ON location_menus
    FOR UPDATE
    USING (
        user_has_location_permission(auth.uid()::TEXT, location_menus.location_id, 'location.menu.manage')
    );

CREATE POLICY location_menus_delete_policy ON location_menus
    FOR DELETE
    USING (
        user_has_location_permission(auth.uid()::TEXT, location_menus.location_id, 'location.menu.manage')
    );

-- Location Menu Item Overrides
CREATE POLICY location_item_overrides_select_policy ON location_menu_item_overrides
    FOR SELECT
    USING (
        user_has_location_permission(auth.uid()::TEXT, location_menu_item_overrides.location_id, 'location.menu.view')
    );

CREATE POLICY location_item_overrides_insert_policy ON location_menu_item_overrides
    FOR INSERT
    WITH CHECK (
        user_has_location_permission(auth.uid()::TEXT, location_menu_item_overrides.location_id, 'location.menu.pricing')
    );

CREATE POLICY location_item_overrides_update_policy ON location_menu_item_overrides
    FOR UPDATE
    USING (
        user_has_location_permission(auth.uid()::TEXT, location_menu_item_overrides.location_id, 'location.menu.pricing')
    );

CREATE POLICY location_item_overrides_delete_policy ON location_menu_item_overrides
    FOR DELETE
    USING (
        user_has_location_permission(auth.uid()::TEXT, location_menu_item_overrides.location_id, 'location.menu.pricing')
    );

-- Location Category Overrides
CREATE POLICY location_category_overrides_select_policy ON location_category_overrides
    FOR SELECT
    USING (
        user_has_location_permission(auth.uid()::TEXT, location_category_overrides.location_id, 'location.menu.view')
    );

CREATE POLICY location_category_overrides_modify_policy ON location_category_overrides
    FOR ALL
    USING (
        user_has_location_permission(auth.uid()::TEXT, location_category_overrides.location_id, 'location.menu.manage')
    );

-- Location Exclusive Items
CREATE POLICY location_exclusive_items_select_policy ON location_exclusive_items
    FOR SELECT
    USING (
        user_has_location_permission(auth.uid()::TEXT, location_exclusive_items.location_id, 'location.menu.view')
    );

CREATE POLICY location_exclusive_items_modify_policy ON location_exclusive_items
    FOR ALL
    USING (
        user_has_location_permission(auth.uid()::TEXT, location_exclusive_items.location_id, 'location.menu.manage')
    );

-- ============================================================================
-- SECTION 9: Triggers for Updated Timestamps
-- ============================================================================

-- Generic updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply triggers to all location tables
CREATE TRIGGER update_locations_updated_at
    BEFORE UPDATE ON locations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_location_members_updated_at
    BEFORE UPDATE ON location_members
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_location_invites_updated_at
    BEFORE UPDATE ON location_invites
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_location_menus_updated_at
    BEFORE UPDATE ON location_menus
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_location_menu_item_overrides_updated_at
    BEFORE UPDATE ON location_menu_item_overrides
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_location_category_overrides_updated_at
    BEFORE UPDATE ON location_category_overrides
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_location_exclusive_items_updated_at
    BEFORE UPDATE ON location_exclusive_items
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- SECTION 10: Views for Common Queries
-- ============================================================================

-- View: Location with member count and summary
CREATE OR REPLACE VIEW location_summary AS
SELECT 
    l.id,
    l.merchant_id,
    l.name,
    l.code,
    l.city,
    l.state,
    l.is_active,
    l.is_accepting_orders,
    l.timezone,
    l.created_at,
    COUNT(DISTINCT lm.user_id) FILTER (WHERE lm.is_active = true) as active_staff_count,
    COUNT(DISTINCT lm.user_id) FILTER (WHERE lm.is_active = true AND r.level_type = 'manager') as manager_count
FROM locations l
LEFT JOIN location_members lm ON lm.location_id = l.id
LEFT JOIN roles r ON r.code = lm.role_code
GROUP BY l.id;

-- View: User's location assignments with full details
CREATE OR REPLACE VIEW user_location_assignments AS
SELECT 
    lm.user_id,
    lm.location_id,
    l.name as location_name,
    l.city,
    l.state,
    l.merchant_id,
    lm.role_code,
    r.name as role_name,
    r.level as role_level,
    r.level_type,
    lm.is_primary_location,
    lm.is_active,
    lm.assigned_at
FROM location_members lm
JOIN locations l ON l.id = lm.location_id
JOIN roles r ON r.code = lm.role_code;

-- ============================================================================
-- END OF SCHEMA
-- ============================================================================