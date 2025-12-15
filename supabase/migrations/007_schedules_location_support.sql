-- ============================================================================
-- Migration 007: Schedules Location Support
-- ============================================================================
-- Purpose: Add location-scoping to schedules to support:
--   1. Location-specific schedules (can be created and managed per location)
--   2. Location overrides for global schedules (visibility control)
-- ============================================================================

-- ============================================================================
-- STEP 1: Add location_id column to schedules
-- ============================================================================

-- Add nullable location_id column
-- NULL = global (merchant-wide), UUID = location-specific
ALTER TABLE schedules
ADD COLUMN location_id UUID REFERENCES locations(id) ON DELETE CASCADE;

-- Add indexes for performance
CREATE INDEX idx_schedules_location_id ON schedules(location_id);
CREATE INDEX idx_schedules_merchant_location ON schedules(merchant_id, location_id);

-- Add documentation
COMMENT ON COLUMN schedules.location_id IS
'NULL = global (merchant-wide), UUID = location-specific schedule. Follows same pattern as modifier_groups.location_id';

-- ============================================================================
-- STEP 2: Create location_schedule_overrides table
-- ============================================================================

CREATE TABLE IF NOT EXISTS location_schedule_overrides (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    location_id UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
    schedule_id UUID NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- Ensure one override per location+schedule combination
    CONSTRAINT location_schedule_overrides_unique UNIQUE (location_id, schedule_id)
);

-- Add indexes
CREATE INDEX idx_location_schedule_overrides_location_id
    ON location_schedule_overrides(location_id);
CREATE INDEX idx_location_schedule_overrides_schedule_id
    ON location_schedule_overrides(schedule_id);
CREATE INDEX idx_location_schedule_overrides_merchant_location
    ON location_schedule_overrides(merchant_id, location_id);

COMMENT ON TABLE location_schedule_overrides IS
'Allows locations to override visibility of global schedules. Similar to location_modifier_group_overrides.';

-- ============================================================================
-- STEP 3: Create deletion protection function for location-specific schedules
-- ============================================================================

CREATE OR REPLACE FUNCTION check_schedule_usage()
RETURNS TRIGGER AS $$
DECLARE
    v_usage_count INTEGER;
    v_is_location_specific BOOLEAN;
BEGIN
    -- Check if this is a location-specific schedule
    SELECT (location_id IS NOT NULL) INTO v_is_location_specific
    FROM schedules WHERE id = OLD.id;

    -- Only check usage for location-specific schedules
    -- Global schedules can always be deleted (they cascade to overrides)
    IF v_is_location_specific THEN
        -- Count how many categories/menus use this schedule
        SELECT
            (SELECT COUNT(*) FROM category_schedules WHERE schedule_id = OLD.id) +
            (SELECT COUNT(*) FROM menu_schedules WHERE schedule_id = OLD.id)
        INTO v_usage_count;

        IF v_usage_count > 0 THEN
            RAISE EXCEPTION
                'Cannot delete location-specific schedule: assigned to % menu(s) or category(ies). Please unassign it first.',
                v_usage_count;
        END IF;
    END IF;

    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- Create trigger
DROP TRIGGER IF EXISTS prevent_location_schedule_deletion ON schedules;
CREATE TRIGGER prevent_location_schedule_deletion
    BEFORE DELETE ON schedules
    FOR EACH ROW
    EXECUTE FUNCTION check_schedule_usage();

COMMENT ON FUNCTION check_schedule_usage() IS
'Prevents deletion of location-specific schedules that are assigned to categories/menus. Global schedules can always be deleted.';

-- ============================================================================
-- STEP 4: Add trigger for updated_at on location_schedule_overrides
-- ============================================================================

CREATE TRIGGER update_location_schedule_overrides_updated_at
    BEFORE UPDATE ON location_schedule_overrides
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- STEP 5: Update RLS policies
-- ============================================================================

-- Enable RLS on location_schedule_overrides
ALTER TABLE location_schedule_overrides ENABLE ROW LEVEL SECURITY;

-- Drop existing policy if it exists
DROP POLICY IF EXISTS schedules_select_policy ON schedules;

-- Allow merchants to see their global schedules + location-specific schedules they have access to
CREATE POLICY schedules_select_policy ON schedules
    FOR SELECT
    USING (
        merchant_id IN (
            SELECT m.id FROM merchants m WHERE m.clerk_org_id = auth.jwt() ->> 'org_id'
        )
    );

-- Drop existing policy if it exists
DROP POLICY IF EXISTS location_schedule_overrides_select_policy ON location_schedule_overrides;

-- Allow merchants to see their location schedule overrides
CREATE POLICY location_schedule_overrides_select_policy ON location_schedule_overrides
    FOR SELECT
    USING (
        merchant_id IN (
            SELECT m.id FROM merchants m WHERE m.clerk_org_id = auth.jwt() ->> 'org_id'
        )
    );

-- ============================================================================
-- STEP 6: Grant permissions
-- ============================================================================

GRANT EXECUTE ON FUNCTION check_schedule_usage() TO authenticated;
GRANT EXECUTE ON FUNCTION check_schedule_usage() TO anon;

-- ============================================================================
-- Migration Complete
-- ============================================================================

-- Summary of changes:
-- 1. ✅ Added location_id column to schedules (nullable)
-- 2. ✅ Added indexes for location queries
-- 3. ✅ Created location_schedule_overrides table
-- 4. ✅ Created deletion protection trigger for location-specific schedules
-- 5. ✅ Added updated_at trigger for override table
-- 6. ✅ Updated RLS policies for location support

-- Usage examples:
--
-- Create global schedule:
--   INSERT INTO schedules (merchant_id, name, location_id)
--   VALUES ('merchant-uuid', 'Breakfast Hours', NULL);
--
-- Create location-specific schedule:
--   INSERT INTO schedules (merchant_id, name, location_id)
--   VALUES ('merchant-uuid', 'Downtown Special Hours', 'location-uuid');
--
-- Query global schedules:
--   SELECT * FROM schedules WHERE merchant_id = 'merchant-uuid' AND location_id IS NULL;
--
-- Query schedules for specific location (global + location-specific):
--   SELECT * FROM schedules
--   WHERE merchant_id = 'merchant-uuid'
--   AND (location_id IS NULL OR location_id = 'location-uuid');
