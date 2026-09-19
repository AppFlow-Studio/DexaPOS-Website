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

  it("appends the new device view column without changing existing ordinals", () => {
    const moneyMigration = read(
      "supabase/migrations/20260428010000_money_numeric_cols.sql",
    );

    expect(moneyMigration).toMatch(
      /CREATE OR REPLACE VIEW public\.admin_device_inventory[\s\S]+di\.linked_printer_id,\s+dc\.monthly_fee\s+FROM/,
    );
  });

  it("uses the customer soft-delete flag in the phone uniqueness index", () => {
    const phoneMigration = read(
      "supabase/migrations/20260504000001_phone_e164_constraints.sql",
    );

    expect(phoneMigration).toContain(
      "WHERE phone IS NOT NULL AND is_active = true",
    );
    expect(phoneMigration).not.toContain("deleted_at IS NULL");
  });

  it("creates the processor fee snapshot before the payment backfill", () => {
    const feeColumns = read(
      "supabase/migrations/20260503234806_platform_fee_columns_columns_only.sql",
    );
    const backfill = read(
      "supabase/migrations/20260508084521_backfill_processor_fee_snapshot_recent.sql",
    );

    expect(feeColumns).toContain(
      "ADD COLUMN IF NOT EXISTS processor_fee_percentage_snapshot numeric(5,2) NOT NULL DEFAULT 0",
    );
    expect(backfill).toContain("processor_fee_percentage_snapshot = l.dual_pricing_percentage");
  });

  it("skips the one-off settlement when its historical batch is absent", () => {
    const settlementMigration = read(
      "supabase/migrations/20260510192118_wave_d4_manual_mark_batch_settled.sql",
    );

    expect(settlementMigration).toMatch(
      /IF EXISTS \([\s\S]+FROM public\.settlement_batches[\s\S]+a59f40fb-2960-4939-b019-c80d0fcf93ad[\s\S]+PERFORM public\.manual_mark_batch_settled/,
    );
  });

  it("keeps an explicit future deadline for the active batch-number shim", () => {
    const sentinel = read(
      "supabase/migrations/20260510210307_wave_h3_dejavoo_batch_number_shim_sentinel.sql",
    );

    expect(sentinel).toContain("DATE '2026-12-31'");
    expect(sentinel).toContain(
      "docs/engineering/preview-bootstrap-2026-09-20.md",
    );
  });

  it("creates HQ roles before the Clover import permission grants", () => {
    const grantMigration = read(
      "supabase/migrations/20260511130300_clover_import_permission.sql",
    );
    const seed = read("supabase/seed.sql");

    expect(grantMigration.indexOf('INSERT INTO "public"."roles"')).toBeLessThan(
      grantMigration.indexOf("INSERT INTO public.role_permissions"),
    );
    expect(grantMigration).toContain("ON CONFLICT (code) DO NOTHING");
    expect(seed).toMatch(/INSERT INTO "public"\."roles"[\s\S]+ON CONFLICT DO NOTHING;/);
    const roleRows = (sql: string) =>
      [...sql.matchAll(/^\s*\('[0-9a-f-]{36}', '([^']+)',/gm)].map(
        (match) => match[1],
      );
    const seedRoles = seed.match(
      /INSERT INTO "public"\."roles"[\s\S]+?ON CONFLICT DO NOTHING;/,
    );
    expect(seedRoles).not.toBeNull();
    expect(roleRows(grantMigration)).toEqual(roleRows(seedRoles![0]));
  });

  it("uses the transactional replacement for the May 18 prefetch indexes", () => {
    const superseded = read(
      "supabase/migrations/20260518000000_order_prefetch_indexes.sql",
    );
    const replacement = read(
      "supabase/migrations/20260518000001_order_prefetch_indexes.sql",
    );

    expect(superseded).toMatch(/SELECT 1;/);
    expect(superseded).not.toMatch(/^CREATE INDEX/gm);
    for (const index of [
      "idx_orders_location_created_at",
      "idx_order_items_order_active",
      "idx_order_payments_order_id",
    ]) {
      expect(replacement).toContain(`CREATE INDEX IF NOT EXISTS ${index}`);
    }
    expect(replacement).not.toMatch(/^CREATE INDEX CONCURRENTLY/gm);
  });
});
