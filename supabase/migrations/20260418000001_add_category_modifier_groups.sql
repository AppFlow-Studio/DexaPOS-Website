-- =============================================================================
-- Migration: Add category_modifier_groups table
-- Purpose: Track modifier group assignments at the category level.
--          Assigning a modifier group to a category propagates it to all items
--          in that category. Supports multiple modifier groups per category.
-- =============================================================================

-- 1. Create the category_modifier_groups junction table
CREATE TABLE IF NOT EXISTS "public"."category_modifier_groups" (
    "id"                uuid DEFAULT extensions.uuid_generate_v4() NOT NULL PRIMARY KEY,
    "category_id"       uuid NOT NULL,
    "modifier_group_id" uuid NOT NULL,
    "merchant_id"       uuid NOT NULL,
    "display_order"     integer,
    "created_at"        timestamptz DEFAULT now() NOT NULL,
    "updated_at"        timestamptz DEFAULT now()
);
-- Prevent duplicate assignment of the same modifier group to the same category
-- (a category can still have MANY different modifier groups)
ALTER TABLE "public"."category_modifier_groups"
    ADD CONSTRAINT "category_modifier_groups_category_id_modifier_group_id_key"
    UNIQUE ("category_id", "modifier_group_id");
-- Foreign keys (CASCADE on delete for clean parent removal)
ALTER TABLE "public"."category_modifier_groups"
    ADD CONSTRAINT "category_modifier_groups_category_id_fkey"
    FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE CASCADE;
ALTER TABLE "public"."category_modifier_groups"
    ADD CONSTRAINT "category_modifier_groups_modifier_group_id_fkey"
    FOREIGN KEY ("modifier_group_id") REFERENCES "public"."modifier_groups"("id") ON DELETE CASCADE;
ALTER TABLE "public"."category_modifier_groups"
    ADD CONSTRAINT "category_modifier_groups_merchant_id_fkey"
    FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE CASCADE;
-- Indexes for common lookups
CREATE INDEX idx_cmg_category_id ON "public"."category_modifier_groups" USING btree ("category_id");
CREATE INDEX idx_cmg_modifier_group_id ON "public"."category_modifier_groups" USING btree ("modifier_group_id");
CREATE INDEX idx_cmg_merchant_id ON "public"."category_modifier_groups" USING btree ("merchant_id");
-- Reuse existing updated_at trigger function
CREATE TRIGGER update_category_modifier_groups_updated_at
    BEFORE UPDATE ON "public"."category_modifier_groups"
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
-- 2. RLS (mirrors menu_item_modifier_groups policies)
ALTER TABLE "public"."category_modifier_groups" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Enable read access for all users"
    ON "public"."category_modifier_groups" FOR SELECT USING (true);
CREATE POLICY "Enable insert for merchant admins"
    ON "public"."category_modifier_groups" FOR INSERT TO authenticated
    WITH CHECK (public.is_merchant_admin(merchant_id));
CREATE POLICY "Enable update for merchant admins"
    ON "public"."category_modifier_groups" FOR UPDATE
    USING (public.is_merchant_admin(merchant_id))
    WITH CHECK (public.is_merchant_admin(merchant_id));
CREATE POLICY "Enable delete for merchant admins"
    ON "public"."category_modifier_groups" FOR DELETE
    USING (public.is_merchant_admin(merchant_id));
-- Grants
GRANT ALL ON TABLE "public"."category_modifier_groups" TO "anon";
GRANT ALL ON TABLE "public"."category_modifier_groups" TO "authenticated";
GRANT ALL ON TABLE "public"."category_modifier_groups" TO "service_role";
-- 3. Add unique constraint on menu_item_modifier_groups for batch upsert support
-- This prevents duplicate (menu_item_id, modifier_group_id) pairs and enables
-- ON CONFLICT upserts for efficient bulk assignment
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'menu_item_modifier_groups_item_modifier_key'
    ) THEN
        ALTER TABLE "public"."menu_item_modifier_groups"
            ADD CONSTRAINT "menu_item_modifier_groups_item_modifier_key"
            UNIQUE ("menu_item_id", "modifier_group_id");
    END IF;
END $$;
