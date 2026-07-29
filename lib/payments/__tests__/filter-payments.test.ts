import { describe, expect, it } from "vitest";
import { filterPayments, hasActiveFilters } from "../filter-payments";
import type { PaymentRecord } from "@/types/payment";

function payment(overrides: Partial<PaymentRecord>): PaymentRecord {
  return {
    id: "p",
    order_id: "o",
    payment_method: "card",
    amount: 10,
    tip_amount: 0,
    total_amount: 10,
    status: "captured",
    initiated_at: "2026-07-20T10:00:00Z",
    created_at: "2026-07-20T10:00:00Z",
    ...overrides,
  } as unknown as PaymentRecord;
}

const VISA_CHIP = payment({
  id: "visa-chip",
  payment_method: "card",
  card_type: "Visa",
  card_entry_mode: "chip",
  amount: 100,
});

// Same brand and mode, but spelled the way the Castles payload spells them.
const VISA_CHIP_CASTLES = payment({
  id: "visa-chip-castles",
  payment_method: "card",
  card_type: undefined,
  amount: 200,
  processor_response: {
    castles_transaction: { cardType: "VISA", entryMode: "EMV" },
  },
});

const AMEX_TAP = payment({
  id: "amex-tap",
  payment_method: "card_manual",
  card_type: "Amex",
  card_entry_mode: "contactless",
  amount: 50,
});

const CASH = payment({
  id: "cash",
  payment_method: "cash",
  card_type: undefined,
  amount: 25,
});

const ALL = [VISA_CHIP, VISA_CHIP_CASTLES, AMEX_TAP, CASH];

const ids = (rows: PaymentRecord[]) => rows.map((r) => r.id).sort();

describe("hasActiveFilters", () => {
  it("is false for an empty filter set", () => {
    expect(hasActiveFilters({})).toBe(false);
    expect(hasActiveFilters({ methods: [], brands: [], amount: {} })).toBe(false);
  });

  it("is true when any filter is set", () => {
    expect(hasActiveFilters({ methods: ["cash"] })).toBe(true);
    expect(hasActiveFilters({ amount: { min: 5 } })).toBe(true);
    expect(hasActiveFilters({ amount: { max: 5 } })).toBe(true);
  });

  // A max of 0 is a real bound, not "unset".
  it("treats a zero bound as active", () => {
    expect(hasActiveFilters({ amount: { max: 0 } })).toBe(true);
  });
});

describe("filterPayments", () => {
  it("returns the original rows when nothing is filtered", () => {
    expect(filterPayments(ALL, {})).toBe(ALL);
  });

  it("filters by payment method", () => {
    expect(ids(filterPayments(ALL, { methods: ["cash"] }))).toEqual(["cash"]);
  });

  it("ORs multiple values within one filter", () => {
    expect(
      ids(filterPayments(ALL, { methods: ["cash", "card_manual"] }))
    ).toEqual(["amex-tap", "cash"]);
  });

  // The two-Visas bug, now as a filter concern.
  it("matches card brand across sources that disagree on casing", () => {
    expect(ids(filterPayments(ALL, { brands: ["visa"] }))).toEqual([
      "visa-chip",
      "visa-chip-castles",
    ]);
  });

  it("matches entry mode across alias vocabularies", () => {
    // "chip" and "EMV" are the same mode.
    expect(ids(filterPayments(ALL, { entryModes: ["chip"] }))).toEqual([
      "visa-chip",
      "visa-chip-castles",
    ]);
  });

  it("excludes rows with no brand when a brand filter is set", () => {
    expect(ids(filterPayments(ALL, { brands: ["visa"] }))).not.toContain("cash");
  });

  it("excludes rows with no entry mode when an entry filter is set", () => {
    expect(ids(filterPayments(ALL, { entryModes: ["chip"] }))).not.toContain(
      "cash"
    );
  });

  it("ANDs across different filters", () => {
    const rows = filterPayments(ALL, {
      brands: ["visa"],
      entryModes: ["chip"],
      amount: { min: 150 },
    });
    expect(ids(rows)).toEqual(["visa-chip-castles"]);
  });

  it("returns nothing when filters cannot be satisfied together", () => {
    expect(
      filterPayments(ALL, { methods: ["cash"], brands: ["visa"] })
    ).toEqual([]);
  });

  describe("amount bounds", () => {
    it("applies an inclusive minimum", () => {
      expect(ids(filterPayments(ALL, { amount: { min: 100 } }))).toEqual([
        "visa-chip",
        "visa-chip-castles",
      ]);
    });

    it("applies an inclusive maximum", () => {
      expect(ids(filterPayments(ALL, { amount: { max: 50 } }))).toEqual([
        "amex-tap",
        "cash",
      ]);
    });

    it("applies both bounds as a closed range", () => {
      expect(ids(filterPayments(ALL, { amount: { min: 50, max: 100 } }))).toEqual(
        ["amex-tap", "visa-chip"]
      );
    });

    it("filters on the Amount column, not total_amount", () => {
      const tipped = payment({ id: "tipped", amount: 10, total_amount: 999 });
      expect(filterPayments([tipped], { amount: { max: 20 } })).toHaveLength(1);
    });

    it("drops rows with a non-numeric amount", () => {
      const bad = payment({ id: "bad", amount: undefined });
      expect(filterPayments([bad], { amount: { min: 0 } })).toEqual([]);
    });

    it("supports a max of zero", () => {
      const free = payment({ id: "free", amount: 0 });
      expect(ids(filterPayments([free, VISA_CHIP], { amount: { max: 0 } }))).toEqual(
        ["free"]
      );
    });
  });
});
