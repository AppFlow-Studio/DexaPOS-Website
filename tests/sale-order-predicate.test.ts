import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  applySalePredicate,
  isOrderSale,
  NON_SALE_ORDER_STATUSES,
  SALE_PAYMENT_STATUSES,
} from "@/lib/reporting/recognized-order";

const ORDER_STATUSES = [
  "draft", "pending", "sent_to_kitchen", "preparing", "ready", "completed",
  "cancelled", "refunded", "void", "accepted", "declined",
];
const PAYMENT_STATUSES = [
  "pending", "processing", "authorized", "captured", "failed", "declined",
  "refunded", "partially_refunded", "void", "paid", "partial",
];

describe("isOrderSale (mirror of SQL is_order_sale)", () => {
  it("counts paid orders, including ones later refunded", () => {
    expect(isOrderSale({ status: "ready", payment_status: "paid" })).toBe(true);
    expect(isOrderSale({ status: "completed", payment_status: "captured" })).toBe(true);
    expect(isOrderSale({ status: "ready", payment_status: "refunded" })).toBe(true);
    expect(isOrderSale({ status: "refunded", payment_status: "refunded" })).toBe(true);
    expect(isOrderSale({ status: "completed", payment_status: "partially_refunded" })).toBe(true);
  });

  it("excludes open, part-paid, voided and cancelled orders", () => {
    expect(isOrderSale({ status: "ready", payment_status: "pending" })).toBe(false);
    expect(isOrderSale({ status: "ready", payment_status: "partial" })).toBe(false);
    expect(isOrderSale({ status: "void", payment_status: "refunded" })).toBe(false);
    expect(isOrderSale({ status: "cancelled", payment_status: "paid" })).toBe(false);
    expect(isOrderSale({ status: "draft", payment_status: "paid" })).toBe(false);
    expect(isOrderSale({ status: "declined", payment_status: "paid" })).toBe(false);
  });

  it("matches the SQL definition for every status combination", () => {
    const sql = readFileSync(
      join(process.cwd(), "supabase/migrations/20260930150000_report_number_consistency.sql"),
      "utf8"
    );
    // The SQL body the TS mirror must agree with.
    expect(sql).toContain(
      "SELECT p_status NOT IN ('draft', 'cancelled', 'void', 'declined')\n     AND p_payment_status IN ('paid', 'captured', 'partially_refunded', 'refunded');"
    );
    const sqlSale = (s: string, p: string) =>
      !["draft", "cancelled", "void", "declined"].includes(s) &&
      ["paid", "captured", "partially_refunded", "refunded"].includes(p);
    for (const status of ORDER_STATUSES) {
      for (const payment_status of PAYMENT_STATUSES) {
        expect(isOrderSale({ status, payment_status })).toBe(sqlSale(status, payment_status));
      }
    }
  });

  it("applySalePredicate applies the same filters to a query builder", () => {
    const calls: Array<[string, ...unknown[]]> = [];
    const builder: any = {
      in: (...a: unknown[]) => (calls.push(["in", ...a]), builder),
      not: (...a: unknown[]) => (calls.push(["not", ...a]), builder),
    };
    applySalePredicate(builder, "orders.");
    expect(calls).toEqual([
      ["in", "orders.payment_status", [...SALE_PAYMENT_STATUSES]],
      ["not", "orders.status", "in", NON_SALE_ORDER_STATUSES],
    ]);
  });
});
