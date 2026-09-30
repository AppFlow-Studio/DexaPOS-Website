import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260928130000_fix_staff_performance_stats_fanout.sql",
  ),
  "utf8",
);

// Strip comments so assertions only see executable SQL.
const sql = migration
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");

describe("get_staff_performance_stats fan-out fix migration", () => {
  it("replaces the function in place, keeping its signature", () => {
    expect(sql).toContain(
      "CREATE OR REPLACE FUNCTION public.get_staff_performance_stats(",
    );
    expect(sql).toContain("RETURNS jsonb");
    expect(sql).not.toContain("SECURITY DEFINER");
  });

  it("never joins per-order rows to per-payment rows on staff_id", () => {
    expect(sql).not.toContain("ON sod.staff_id = std.staff_id");
    expect(sql).not.toMatch(/JOIN\s+order_payment_tips\s+\w+\s+ON\s+\w+\.staff_id/i);
  });

  it("collapses payments to one row per order before joining back", () => {
    expect(sql).toMatch(
      /order_tips AS \(\s*SELECT\s+opt\.order_id,\s+SUM\(opt\.tip_amount\) AS tip_amount\s+FROM order_payment_tips opt\s+GROUP BY opt\.order_id/,
    );
    expect(sql).toContain("LEFT JOIN order_tips ot ON ot.order_id = ro.order_id");
  });

  it("gates on the canonical recognized-order predicate", () => {
    expect(sql).toContain(
      "public.is_order_reportable(o.status, o.payment_status)",
    );
    expect(sql).not.toContain("o.status NOT IN ('draft', 'cancelled', 'void')");
  });

  it("attributes each order to a single staff member", () => {
    expect(sql).toContain(
      "COALESCE(o.assigned_server_id, o.created_by_staff_id) AS staff_id",
    );
  });

  it("reports no-staff orders by channel and counts orders distinctly", () => {
    expect(sql).toContain("'unattributed',");
    expect(sql).toContain("WHERE ofx.staff_id IS NULL");
    expect(sql).toContain(
      "COUNT(DISTINCT CASE WHEN o.created_by_staff_id = sp.id THEN o.id END) AS orders_created",
    );
  });
});
