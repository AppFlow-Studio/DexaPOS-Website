import { describe, expect, it } from "vitest";
import { getCardBrandLabel, normalizeCardBrand } from "../method-display";

describe("normalizeCardBrand", () => {
  // The reported bug: `card_type` returns "Visa", the Castles payload returns
  // "VISA", and grouping on the raw string rendered two "Visa" bars.
  it("collapses casing variants of the same brand to one key", () => {
    const keys = new Set(["Visa", "VISA", "visa"].map(normalizeCardBrand));
    expect(keys.size).toBe(1);
  });

  it("ignores spaces, dashes and underscores", () => {
    expect(normalizeCardBrand("Diners Club")).toBe("dinersclub");
    expect(normalizeCardBrand("DINERS-CLUB")).toBe("dinersclub");
    expect(normalizeCardBrand("diners_club")).toBe("dinersclub");
  });

  it("agrees with CardBrandIcon on which brands are the same", () => {
    // CardBrandIcon switches on brand.toLowerCase().replace(/[\s-_]/g, "") and
    // treats "mc"/"mastercard" (and "amex"/"americanexpress") as one brand.
    // normalizeCardBrand resolves those aliases too, so any pair the icon renders
    // identically must also share a grouping key.
    const sameBrand = [
      ["Mastercard", "MC"],
      ["Amex", "American Express"],
      ["Diners Club", "diners"],
    ];
    for (const [a, b] of sameBrand) {
      expect(normalizeCardBrand(a)).toBe(normalizeCardBrand(b));
    }
  });

  it("keeps distinct brands on distinct keys", () => {
    const keys = ["Visa", "Mastercard", "Amex", "Discover", "JCB"].map(
      normalizeCardBrand
    );
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("getCardBrandLabel", () => {
  it("renders one canonical label regardless of processor casing", () => {
    expect(getCardBrandLabel("VISA")).toBe("Visa");
    expect(getCardBrandLabel("Visa")).toBe("Visa");
    expect(getCardBrandLabel("visa")).toBe("Visa");
  });

  it("maps known aliases to a single brand", () => {
    expect(getCardBrandLabel("MC")).toBe("Mastercard");
    expect(getCardBrandLabel("mastercard")).toBe("Mastercard");
    expect(getCardBrandLabel("AMERICANEXPRESS")).toBe("Amex");
    expect(getCardBrandLabel("Diners Club")).toBe("Diners Club");
  });

  it("falls back to the processor's own string for unknown brands", () => {
    expect(getCardBrandLabel("Troy")).toBe("Troy");
  });

  // Guards the end-to-end shape of the fix: mixed-casing rows must merge into
  // one series whose count is the sum.
  it("merges mixed-casing rows into a single series", () => {
    const rows = [
      { cardType: "Visa", count: 12 },
      { cardType: "VISA", count: 5 },
      { cardType: "Mastercard", count: 3 },
    ];

    const merged = new Map<string, number>();
    for (const r of rows) {
      const key = normalizeCardBrand(r.cardType);
      merged.set(key, (merged.get(key) ?? 0) + r.count);
    }

    const out = [...merged.entries()].map(([k, count]) => ({
      label: getCardBrandLabel(k),
      count,
    }));

    expect(out).toEqual([
      { label: "Visa", count: 17 },
      { label: "Mastercard", count: 3 },
    ]);
  });
});
