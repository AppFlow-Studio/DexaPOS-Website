-- =============================================================================
-- Migration: Add location_item_modifier_groups table
-- Purpose: Allow location-scoped modifier group assignments to items.
--          A location can independently assign modifier groups to items
--          (including global items) that only apply at that location.
--          Global assignments (menu_item_modifier_groups) continue to apply
--          everywhere unless hidden via location_modifier_group_overrides.
-- =============================================================================

-- 1. Create the location_item_modifier_groups table
CREATE TABLE IF NOT EXISTS "public"."location_item_modifier_groups" (
    "id"                uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    "location_id"       uuid NOT NULL,
    "menu_item_id"      uuid NOT NULL,
    "modifier_group_id" uuid NOT NULL,
    "merchant_id"       uuid NOT NULL,
    "display_order"     integer,
    "created_at"        timestamptz DEFAULT now() NOT NULL,
    "updated_at"        timestamptz DEFAULT now()
);

-- Unique: one assignment per (location, item, modifier_group)
ALTER TABLE "public"."location_item_modifier_groups"
    ADD CONSTRAINT "location_item_modifier_groups_loc_item_mod_key"
    UNIQUE ("location_id", "menu_item_id", "modifier_group_id");

-- Foreign keys (CASCADE on delete)
ALTER TABLE "public"."location_item_modifier_groups"
    ADD CONSTRAINT "location_item_modifier_groups_location_id_fkey"
    FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE CASCADE;

ALTER TABLE "public"."location_item_modifier_groups"
    ADD CONSTRAINT "location_item_modifier_groups_menu_item_id_fkey"
    FOREIGN KEY ("menu_item_id") REFERENCES "public"."menu_items"("id") ON DELETE CASCADE;

ALTER TABLE "public"."location_item_modifier_groups"
    ADD CONSTRAINT "location_item_modifier_groups_modifier_group_id_fkey"
    FOREIGN KEY ("modifier_group_id") REFERENCES "public"."modifier_groups"("id") ON DELETE CASCADE;

ALTER TABLE "public"."location_item_modifier_groups"
    ADD CONSTRAINT "location_item_modifier_groups_merchant_id_fkey"
    FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE CASCADE;

-- Indexes for common lookups
CREATE INDEX idx_limg_location_item ON "public"."location_item_modifier_groups" USING btree ("location_id", "menu_item_id");
CREATE INDEX idx_limg_modifier_group ON "public"."location_item_modifier_groups" USING btree ("modifier_group_id");
CREATE INDEX idx_limg_merchant ON "public"."location_item_modifier_groups" USING btree ("merchant_id");

-- Reuse existing updated_at trigger
CREATE TRIGGER update_location_item_modifier_groups_updated_at
    BEFORE UPDATE ON "public"."location_item_modifier_groups"
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 2. RLS — location members and merchant admins
ALTER TABLE "public"."location_item_modifier_groups" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable read access for all users"
    ON "public"."location_item_modifier_groups" FOR SELECT USING (true);

CREATE POLICY "Enable insert for merchant admins"
    ON "public"."location_item_modifier_groups" FOR INSERT TO authenticated
    WITH CHECK (public.is_merchant_admin(merchant_id));

CREATE POLICY "Enable update for merchant admins"
    ON "public"."location_item_modifier_groups" FOR UPDATE
    USING (public.is_merchant_admin(merchant_id))
    WITH CHECK (public.is_merchant_admin(merchant_id));

CREATE POLICY "Enable delete for merchant admins"
    ON "public"."location_item_modifier_groups" FOR DELETE
    USING (public.is_merchant_admin(merchant_id));

-- Grants
GRANT ALL ON TABLE "public"."location_item_modifier_groups" TO "anon";
GRANT ALL ON TABLE "public"."location_item_modifier_groups" TO "authenticated";
GRANT ALL ON TABLE "public"."location_item_modifier_groups" TO "service_role";
