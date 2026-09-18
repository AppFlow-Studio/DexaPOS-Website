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
});
