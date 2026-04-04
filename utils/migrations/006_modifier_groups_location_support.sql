-- ============================================================================
-- Migration 006: Modifier Groups Location Support
-- ============================================================================
-- Purpose: Add location-scoping to modifier groups to support:
--   1. Location-specific modifier groups (can be created and managed per location)
--   2. Location overrides for global modifier groups (pricing, visibility, order, stock)
-- ============================================================================

-- ============================================================================
-- STEP 1: Add location_id column to modifier_groups
-- ============================================================================

-- Add nullable location_id column
-- NULL = global (merchant-wide), UUID = location-specific
ALTER TABLE modifier_groups
ADD COLUMN location_id UUID REFERENCES locations(id) ON DELETE CASCADE;

-- Add indexes for performance
CREATE INDEX idx_modifier_groups_location_id ON modifier_groups(location_id);
CREATE INDEX idx_modifier_groups_merchant_location ON modifier_groups(merchant_id, location_id);

-- Add documentation
COMMENT ON COLUMN modifier_groups.location_id IS
'NULL = global (merchant-wide), UUID = location-specific group. Follows same pattern as menus.location_id';

-- ============================================================================
-- STEP 2: Add unique constraints to override tables
-- ============================================================================

-- Ensure one override per location+group combination
ALTER TABLE location_modifier_group_overrides
ADD CONSTRAINT location_modifier_group_overrides_unique
UNIQUE (location_id, modifier_group_id);

-- Ensure one override per location+item combination
ALTER TABLE location_modifier_item_overrides
ADD CONSTRAINT location_modifier_item_overrides_unique
UNIQUE (location_id, modifier_group_item_id);

-- ============================================================================
-- STEP 3: Add display_order to location_modifier_item_overrides
-- ============================================================================

-- Allow locations to reorder modifier items independently from global order
ALTER TABLE location_modifier_item_overrides
ADD COLUMN display_order INTEGER;

COMMENT ON COLUMN location_modifier_item_overrides.display_order IS
'Override display order for this modifier item at this location. NULL = use global display_order';

-- ============================================================================
-- STEP 4: Create deletion protection function for location-specific groups
-- ============================================================================

CREATE OR REPLACE FUNCTION check_modifier_group_usage()
RETURNS TRIGGER AS $$
DECLARE
    v_usage_count INTEGER;
    v_is_location_specific BOOLEAN;
BEGIN
    -- Check if this is a location-specific group
    SELECT (location_id IS NOT NULL) INTO v_is_location_specific
    FROM modifier_groups WHERE id = OLD.id;

    -- Only check usage for location-specific groups
    -- Global groups can always be deleted (they cascade to overrides)
    IF v_is_location_specific THEN
        -- Count how many menu items use this modifier group
        SELECT COUNT(*) INTO v_usage_count
        FROM menu_item_modifier_groups
        WHERE modifier_group_id = OLD.id;

        IF v_usage_count > 0 THEN
            RAISE EXCEPTION
                'Cannot delete location-specific modifier group: assigned to % menu item(s). Please unassign it from all menu items first.',
                v_usage_count;
        END IF;
    END IF;

    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- Create trigger
DROP TRIGGER IF EXISTS prevent_location_modifier_group_deletion ON modifier_groups;
CREATE TRIGGER prevent_location_modifier_group_deletion
    BEFORE DELETE ON modifier_groups
    FOR EACH ROW
    EXECUTE FUNCTION check_modifier_group_usage();

COMMENT ON FUNCTION check_modifier_group_usage() IS
'Prevents deletion of location-specific modifier groups that are assigned to menu items. Global groups can always be deleted.';

-- ============================================================================
-- STEP 5: Update RLS policies (if RLS is enabled)
-- ============================================================================

-- Drop existing policy if it exists
DROP POLICY IF EXISTS modifier_groups_select_policy ON modifier_groups;

-- Allow merchants to see their global groups + location-specific groups they have access to
CREATE POLICY modifier_groups_select_policy ON modifier_groups
    FOR SELECT
    USING (
        merchant_id IN (
            SELECT m.id FROM merchants m WHERE m.clerk_org_id = auth.jwt() ->> 'org_id'
        )
    );

-- ============================================================================
-- STEP 6: Grant permissions
-- ============================================================================

GRANT EXECUTE ON FUNCTION check_modifier_group_usage() TO authenticated;
GRANT EXECUTE ON FUNCTION check_modifier_group_usage() TO anon;

-- ============================================================================
-- Migration Complete
-- ============================================================================

-- Summary of changes:
-- 1. ✅ Added location_id column to modifier_groups (nullable)
-- 2. ✅ Added indexes for location queries
-- 3. ✅ Added unique constraints to override tables
-- 4. ✅ Added display_order column to location_modifier_item_overrides
-- 5. ✅ Created deletion protection trigger for location-specific groups
-- 6. ✅ Updated RLS policies for location support

-- Usage examples:
--
-- Create global modifier group:
--   INSERT INTO modifier_groups (merchant_id, name, location_id)
--   VALUES ('merchant-uuid', 'Sizes', NULL);
--
-- Create location-specific modifier group:
--   INSERT INTO modifier_groups (merchant_id, name, location_id)
--   VALUES ('merchant-uuid', 'Downtown Specials', 'location-uuid');
--
-- Query global groups:
--   SELECT * FROM modifier_groups WHERE merchant_id = 'merchant-uuid' AND location_id IS NULL;
--
-- Query groups for specific location (global + location-specific):
--   SELECT * FROM modifier_groups
--   WHERE merchant_id = 'merchant-uuid'
--   AND (location_id IS NULL OR location_id = 'location-uuid');
