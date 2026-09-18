import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("pre-snapshot migration bootstrap ordering", () => {
  it("guards category_items mutations before the schema snapshot", () => {
    const addMenuId = read(
      "supabase/migrations/20260413000000_add_menu_id_to_category_items_l4_pricing.sql",
    );
    const dropConstraint = read(
      "supabase/migrations/20260413030000_drop_old_category_items_unique_constraint.sql",
    );

    expect(addMenuId).toContain("to_regclass('public.category_items')");
    expect(addMenuId).toContain("to_regclass('public.menus')");
    expect(dropConstraint).toContain("to_regclass('public.category_items')");
  });

  it("keeps the skipped state in the following schema snapshot", () => {
    const snapshot = read(
      "supabase/migrations/20260413215901_remote_schema.sql",
    );

    expect(snapshot).toContain(
      'CREATE TABLE IF NOT EXISTS "public"."category_items"',
    );
    expect(snapshot).toContain('"menu_id" "uuid"');
    expect(snapshot).toContain('"category_items_item_cat_nomenu_idx"');
    expect(snapshot).toContain('"category_items_item_cat_menu_idx"');
  });

  it("terminates the order broadcast function before altering it", () => {
    const snapshot = read(
      "supabase/migrations/20260413215901_remote_schema.sql",
    );

    expect(snapshot).toMatch(
      /RAISE WARNING 'broadcast_order_changes failed: %', SQLERRM;\s+RETURN NULL;\s+END;\s+\$\$;\s+ALTER FUNCTION "public"\."broadcast_order_changes"/,
    );
  });

  it("rebuilds the generated tip total around source type changes", () => {
    const tipMigration = read(
      "supabase/migrations/20260419000000_tip_system_v1_1_bolstering.sql",
    );

    expect(tipMigration).toContain("DROP COLUMN IF EXISTS total_tips");
    expect(tipMigration).not.toMatch(/ALTER COLUMN total_tips\s+TYPE/);
    expect(tipMigration).toMatch(
      /ADD COLUMN total_tips NUMERIC\(12,2\) GENERATED ALWAYS AS/,
    );
  });

  it("creates POS role permissions before their mappings", () => {
    const roleMigration = read(
      "supabase/migrations/20260420000000_add_pos_staff_roles.sql",
    );
    const seed = read("supabase/seed.sql");

    expect(roleMigration.indexOf("INSERT INTO public.permissions")).toBeLessThan(
      roleMigration.indexOf("INSERT INTO public.role_permissions"),
    );
    expect(roleMigration).toContain("ON CONFLICT (code) DO NOTHING");
    expect(seed).toMatch(
      /INSERT INTO "public"\."permissions"[\s\S]+ON CONFLICT DO NOTHING;/,
    );
  });

  it("guards the RLS helper altered before its creation", () => {
    const hardeningMigration = read(
      "supabase/migrations/20260427120000_fix_remaining_empty_search_path_rpcs.sql",
    );

    expect(hardeningMigration).toContain(
      "to_regprocedure('public.user_belongs_to_merchant(uuid)')",
    );
  });
});
