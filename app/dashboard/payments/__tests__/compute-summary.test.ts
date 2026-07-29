import { describe, expect, it } from "vitest";
import { computePaymentSummary } from "../page";
import type { PaymentRecord } from "@/types/payment";

function payment(
  overrides: Partial<PaymentRecord> & { total_amount: number }
): PaymentRecord {
  return {
    id: "p",
    order_id: "o",
    payment_method: "card",
    amount: overrides.total_amount,
    tip_amount: 0,
    status: "captured",
    refunded_amount: 0,
    initiated_at: "2026-07-20T10:00:00Z",
    created_at: "2026-07-20T10:00:00Z",
    ...overrides,
  } as unknown as PaymentRecord;
}

/** A payment whose brand only appears in the Castles processor payload. */
function castlesPayment(cardType: string, total: number): PaymentRecord {
  return payment({
    total_amount: total,
    card_type: undefined,
    processor_response: { castles_transaction: { cardType } },
  });
}

describe("computePaymentSummary — byCardType", () => {
  // The reported bug: two "Visa" bars, because `card_type` says "Visa" and the
  // Castles payload says "VISA".
  it("merges the same brand across sources that disagree on casing", () => {
    const summary = computePaymentSummary([
      payment({ total_amount: 100, card_type: "Visa" }),
      payment({ total_amount: 100, card_type: "Visa" }),
      castlesPayment("VISA", 100),
      castlesPayment("VISA", 100),
    ]);

    expect(summary.byCardType).toEqual([
      { cardType: "Visa", count: 4, amount: 400 },
    ]);
  });

  it("renders one canonical label rather than the normalized key", () => {
    const summary = computePaymentSummary([castlesPayment("VISA", 10)]);
    expect(summary.byCardType[0].cardType).toBe("Visa");
  });

  it("merges brand aliases and spacing variants", () => {
    const summary = computePaymentSummary([
      payment({ total_amount: 50, card_type: "Mastercard" }),
      castlesPayment("MC", 50),
      payment({ total_amount: 25, card_type: "Diners Club" }),
      castlesPayment("DINERS-CLUB", 25),
    ]);

    const byLabel = Object.fromEntries(
      summary.byCardType.map((c) => [c.cardType, c.count])
    );
    expect(byLabel).toEqual({ Mastercard: 2, "Diners Club": 2 });
  });

  it("keeps genuinely different brands separate", () => {
    const summary = computePaymentSummary([
      payment({ total_amount: 10, card_type: "Visa" }),
      payment({ total_amount: 10, card_type: "Amex" }),
      payment({ total_amount: 10, card_type: "Discover" }),
    ]);
    expect(summary.byCardType).toHaveLength(3);
  });

  it("preserves an unknown brand's original string", () => {
    const summary = computePaymentSummary([
      payment({ total_amount: 10, card_type: "Troy" }),
    ]);
    expect(summary.byCardType[0].cardType).toBe("Troy");
  });

  it("omits payments with no brand on either source", () => {
    const summary = computePaymentSummary([
      payment({ total_amount: 10, card_type: undefined }),
    ]);
    expect(summary.byCardType).toEqual([]);
  });

  it("still totals every payment regardless of brand merging", () => {
    const summary = computePaymentSummary([
      payment({ total_amount: 100, card_type: "Visa" }),
      castlesPayment("VISA", 100),
      payment({ total_amount: 10, card_type: undefined }),
    ]);
    expect(summary.totalCount).toBe(3);
    expect(summary.totalAmount).toBe(210);
  });
});
