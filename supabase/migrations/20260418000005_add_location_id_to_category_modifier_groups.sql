-- =============================================================================
-- Migration: Add location_id to category_modifier_groups
-- Purpose: Allow location-scoped category-modifier assignments.
--          location_id = NULL means global, UUID means location-specific.
-- =============================================================================

-- 1. Add nullable location_id column
ALTER TABLE "public"."category_modifier_groups"
    ADD COLUMN IF NOT EXISTS "location_id" uuid REFERENCES "public"."locations"("id") ON DELETE CASCADE;
-- 2. Drop old unique constraint (category_id, modifier_group_id)
ALTER TABLE "public"."category_modifier_groups"
    DROP CONSTRAINT IF EXISTS "category_modifier_groups_category_id_modifier_group_id_key";
-- 3. Add partial unique indexes for both scopes
-- Global: one global assignment per (category, modifier_group)
CREATE UNIQUE INDEX IF NOT EXISTS "cmg_category_modifier_global_unique"
    ON "public"."category_modifier_groups" ("category_id", "modifier_group_id")
    WHERE "location_id" IS NULL;
-- Location-scoped: one per (category, modifier_group, location)
CREATE UNIQUE INDEX IF NOT EXISTS "cmg_category_modifier_location_unique"
    ON "public"."category_modifier_groups" ("category_id", "modifier_group_id", "location_id")
    WHERE "location_id" IS NOT NULL;
-- 4. Index for location filtering
CREATE INDEX IF NOT EXISTS "idx_cmg_location_id"
    ON "public"."category_modifier_groups" ("location_id");
