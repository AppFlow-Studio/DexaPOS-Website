import { describe, it, expect } from "vitest";
import {
  effectiveDueDate,
  isOverdue,
  OVERDUE_CANDIDATE_STATUSES,
  SENT_FILTER_STATUSES,
  type OverdueInput,
} from "../lifecycle";

/**
 * The client-side port of the `effective_due` / `overdue_count` SQL in
 * `get_invoice_kpis` (migration 20260615120002). The two must agree: the
 * invoices page sizes its loading skeleton from the RPC's count and fills it
 * with rows this predicate selects, so any drift leaves a tab stuck on a
 * skeleton that never resolves — the original bug.
 */

const NOW = new Date("2026-09-03T12:00:00.000Z");

function invoice(overrides: Partial<OverdueInput> = {}): OverdueInput {
  return {
    status: "sent",
    payment_due_type: "net_30",
    due_date: null,
    sent_at: "2026-07-01T00:00:00.000Z",
    created_at: "2026-06-25T00:00:00.000Z",
    total_amount: 100,
    amount_paid: 0,
    ...overrides,
  };
}

describe("effectiveDueDate — mirrors the RPC's CASE", () => {
  it("counts net terms from sent_at, not created_at", () => {
    const due = effectiveDueDate(
      invoice({ payment_due_type: "net_15", sent_at: "2026-07-01T00:00:00.000Z" }),
    );
    expect(due?.toISOString().slice(0, 10)).toBe("2026-07-16");
  });

  it("falls back to created_at when the invoice was never sent", () => {
    const due = effectiveDueDate(
      invoice({ payment_due_type: "net_15", sent_at: null }),
    );
    // created_at is 2026-06-25, so +15d lands on 2026-07-10.
    expect(due?.toISOString().slice(0, 10)).toBe("2026-07-10");
  });

  it("treats upon_receipt as due immediately", () => {
    const due = effectiveDueDate(invoice({ payment_due_type: "upon_receipt" }));
    expect(due?.toISOString()).toBe("2026-07-01T00:00:00.000Z");
  });

  it("uses the explicit due_date only for custom terms", () => {
    const due = effectiveDueDate(
      invoice({ payment_due_type: "custom", due_date: "2026-08-15" }),
    );
    expect(due?.toISOString().slice(0, 10)).toBe("2026-08-15");
  });

  it("returns null for custom terms with no date set", () => {
    expect(
      effectiveDueDate(invoice({ payment_due_type: "custom", due_date: null })),
    ).toBeNull();
  });

  it("ignores due_date when the terms are net — the RPC does too", () => {
    // A stale due_date must not override net terms, or the two counts diverge.
    const due = effectiveDueDate(
      invoice({ payment_due_type: "net_30", due_date: "2020-01-01" }),
    );
    expect(due?.toISOString().slice(0, 10)).toBe("2026-07-31");
  });
});

describe("isOverdue — past due AND still owing", () => {
  it("flags a sent invoice past its due date", () => {
    expect(isOverdue(invoice(), NOW)).toBe(true);
  });

  it("does not flag an invoice still within its terms", () => {
    expect(
      isOverdue(invoice({ sent_at: "2026-09-01T00:00:00.000Z" }), NOW),
    ).toBe(false);
  });

  it("does not flag a fully paid invoice, however late", () => {
    expect(
      isOverdue(invoice({ total_amount: 100, amount_paid: 100 }), NOW),
    ).toBe(false);
  });

  it("flags a partially paid invoice that still owes a balance", () => {
    expect(
      isOverdue(invoice({ total_amount: 100, amount_paid: 40 }), NOW),
    ).toBe(true);
  });

  it("never flags draft, paid or cancelled invoices", () => {
    for (const status of ["draft", "paid", "cancelled"] as const) {
      expect(isOverdue(invoice({ status }), NOW)).toBe(false);
    }
  });

  it("flags viewed and payment_failed — both still owe money", () => {
    for (const status of ["viewed", "payment_failed"] as const) {
      expect(isOverdue(invoice({ status }), NOW)).toBe(true);
    }
  });

  it("tolerates an unparseable timestamp instead of throwing", () => {
    expect(isOverdue(invoice({ sent_at: "not-a-date" }), NOW)).toBe(false);
  });
});

describe("status filter sets", () => {
  /**
   * The regression this suite exists for: filtering the Sent tab on the
   * literal column value dropped every invoice the customer had opened.
   */
  it("Sent covers viewed and payment_failed, not just sent", () => {
    expect([...SENT_FILTER_STATUSES].sort()).toEqual([
      "payment_failed",
      "sent",
      "viewed",
    ]);
  });

  it("Overdue candidates match the RPC's NOT IN (paid, cancelled, draft)", () => {
    expect([...OVERDUE_CANDIDATE_STATUSES].sort()).toEqual([
      "overdue",
      "payment_failed",
      "sent",
      "viewed",
    ]);
  });

  it("excludes settled statuses from the overdue candidates", () => {
    for (const settled of ["paid", "cancelled", "draft"]) {
      expect(OVERDUE_CANDIDATE_STATUSES).not.toContain(settled);
    }
  });
});
