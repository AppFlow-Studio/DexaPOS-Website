// tests/order-breakdown.test.ts
import { describe, it, expect } from "vitest";
import { getOrderBreakdown, type BreakdownOrderInput } from "@/lib/orders/order-breakdown";
import type { OrderPayment } from "@/types/order-management";

/** Build a captured payment of a given tender for lane resolution. */
function payment(method: string): OrderPayment {
  return {
    payment_method: method,
    status: "captured",
    total_amount: 1,
  } as unknown as OrderPayment;
}

/**
 * The footing invariant every single-track render relies on:
 * subtotal − discount + tax + serviceCharge === total  (tip excluded; tip is
 * captured at tender and tracked separately from the order/lane total).
 */
function expectFoots(lane: {
  subtotal: number;
  discount: number;
  tax: number;
  serviceCharge: number;
  total: number;
}) {
  expect(lane.subtotal - lane.discount + lane.tax + lane.serviceCharge).toBeCloseTo(
    lane.total,
    2
  );
}

// ── Real production rows (pulled during verification) ───────────────────────

// Cash-charged, cash discount applied. This is the regression: today the
// receipts show effective_* (= card) subtotal/tax with cash_total → don't foot.
const CASH_ORDER: BreakdownOrderInput = {
  payment_pricing_mode: "cash",
  subtotal: "6.25",
  card_subtotal: "6.25",
  cash_subtotal: "6.00",
  tax_amount: "0.65",
  card_tax_amount: "0.65",
  cash_tax_amount: "0.63",
  service_charge: "1.13",
  discount_amount: "0.00",
  tip_amount: "0.00",
  total_amount: "8.03",
  card_total: "8.03",
  cash_total: "7.76",
  amount_paid: "7.76",
  amount_due: "0.00",
};

// Dual pricing available, unpaid (pre-tender). Should default to the card lane.
const UNPAID_DUAL_ORDER: BreakdownOrderInput = {
  payment_pricing_mode: null,
  subtotal: "58.75",
  card_subtotal: "58.75",
  cash_subtotal: "33.75",
  tax_amount: "6.17",
  card_tax_amount: "6.17",
  cash_tax_amount: "3.94",
  service_charge: "10.58",
  discount_amount: "0.00",
  tip_amount: "0.00",
  total_amount: "75.50",
  card_total: "75.50",
  cash_total: "48.27",
  amount_paid: "0.00",
  amount_due: "75.50",
};

// Split tender: paid part cash (discounted) + part card. Collected 16.57 sits
// between cash_total (15.15) and card_total (18.96); amount_due settled to 0.
const MIXED_ORDER: BreakdownOrderInput = {
  payment_pricing_mode: "mixed",
  subtotal: "14.75",
  card_subtotal: "14.75",
  cash_subtotal: "11.25",
  tax_amount: "1.55",
  card_tax_amount: "1.55",
  cash_tax_amount: "1.24",
  service_charge: "2.66",
  discount_amount: "0.00",
  tip_amount: "0.00",
  total_amount: "18.96",
  card_total: "18.96",
  cash_total: "15.15",
  amount_paid: "16.57",
  amount_due: "0.00",
};

// No dual pricing (single-location merchant): card == cash.
const NO_DUAL_ORDER: BreakdownOrderInput = {
  payment_pricing_mode: "card",
  subtotal: "20.00",
  card_subtotal: "20.00",
  cash_subtotal: "20.00",
  tax_amount: "1.65",
  card_tax_amount: "1.65",
  cash_tax_amount: "1.65",
  service_charge: "0.00",
  total_amount: "21.65",
  card_total: "21.65",
  cash_total: "21.65",
};

describe("getOrderBreakdown", () => {
  it("cash-charged order renders the cash lane and foots to cash_total", () => {
    const b = getOrderBreakdown(CASH_ORDER, [payment("cash")]);
    expect(b.charged).toBe("cash");
    expect(b.display).toBe("cash");
    expect(b.dual).toBe(true);
    // The fix: primary lane is fully cash-track and sums to the cash total.
    expect(b.primary.subtotal).toBeCloseTo(6.0, 2);
    expect(b.primary.tax).toBeCloseTo(0.63, 2);
    expect(b.primary.serviceCharge).toBeCloseTo(1.13, 2);
    expect(b.primary.total).toBeCloseTo(7.76, 2);
    expectFoots(b.primary);
  });

  it("cash mode resolves the cash lane even before any payment is captured", () => {
    const b = getOrderBreakdown(CASH_ORDER, []);
    expect(b.charged).toBe("cash");
    expect(b.display).toBe("cash");
    expect(b.primary.total).toBeCloseTo(7.76, 2);
  });

  it("unpaid dual order defaults to the card (list) lane and both lanes foot", () => {
    const b = getOrderBreakdown(UNPAID_DUAL_ORDER, []);
    expect(b.charged).toBeNull();
    expect(b.display).toBe("card");
    expect(b.dual).toBe(true);
    expect(b.primary.subtotal).toBeCloseTo(58.75, 2);
    expect(b.primary.total).toBeCloseTo(75.5, 2);
    expectFoots(b.card);
    expectFoots(b.cash);
  });

  it("card payment on a dual order renders the card lane", () => {
    const b = getOrderBreakdown(UNPAID_DUAL_ORDER, [payment("card_spinapi")]);
    expect(b.charged).toBe("card");
    expect(b.display).toBe("card");
    expect(b.primary.total).toBeCloseTo(75.5, 2);
    expectFoots(b.primary);
  });

  it("mixed (split tender) bridges list total to amount paid via cash discount", () => {
    const b = getOrderBreakdown(MIXED_ORDER, [payment("cash"), payment("card_spinapi")]);
    expect(b.charged).toBe("mixed");
    expect(b.isMixed).toBe(true);
    expect(b.display).toBe("card"); // mixed shows the list (card) ladder
    // List ladder foots to card_total…
    expect(b.primary.subtotal).toBeCloseTo(14.75, 2);
    expect(b.primary.tax).toBeCloseTo(1.55, 2);
    expect(b.primary.serviceCharge).toBeCloseTo(2.66, 2);
    expect(b.primary.total).toBeCloseTo(18.96, 2);
    // …and the cash-discount bridge lands on what was actually collected.
    expect(b.mixedCashDiscount).toBeCloseTo(2.39, 2);
    expect(
      b.primary.subtotal +
        b.primary.serviceCharge +
        b.primary.tax -
        b.mixedCashDiscount
    ).toBeCloseTo(b.primary.amountPaid, 2); // 16.57
  });

  it("non-mixed orders never produce a cash-discount bridge", () => {
    expect(getOrderBreakdown(CASH_ORDER, [payment("cash")]).mixedCashDiscount).toBe(0);
    expect(getOrderBreakdown(UNPAID_DUAL_ORDER, []).mixedCashDiscount).toBe(0);
  });

  it("no-dual order reports dual=false and identical lanes", () => {
    const b = getOrderBreakdown(NO_DUAL_ORDER, []);
    expect(b.dual).toBe(false);
    expect(b.card.total).toBeCloseTo(b.cash.total, 2);
    expectFoots(b.primary);
  });

  it("service_charge = 0 yields a zero service-charge line (caller hides it)", () => {
    const b = getOrderBreakdown(NO_DUAL_ORDER, []);
    expect(b.primary.serviceCharge).toBe(0);
  });

  it("falls back to bare columns (card track) when per-lane columns are absent", () => {
    const bare: BreakdownOrderInput = {
      subtotal: "10.00",
      tax_amount: "0.80",
      service_charge: "0.00",
      total_amount: "10.80",
    };
    const b = getOrderBreakdown(bare, []);
    expect(b.dual).toBe(false);
    expect(b.card.subtotal).toBeCloseTo(10.0, 2);
    expect(b.card.total).toBeCloseTo(10.8, 2);
    expectFoots(b.card);
  });

  it("is null-safe", () => {
    const b = getOrderBreakdown(null, undefined);
    expect(b.card.total).toBe(0);
    expect(b.display).toBe("card");
    expect(b.dual).toBe(false);
  });
});
