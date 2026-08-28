import { describe, it, expect } from "vitest";
import { deriveCashPrice, deriveCardPrice } from "../pricing";

describe("deriveCardPrice", () => {
  it("cash-as-base: $10.00 at 4% → $10.40", () => {
    // 10 × 1.04 = 10.40 (calculate up from the cash price)
    expect(deriveCardPrice(10.0, 4)).toBe(10.4);
  });

  it("rounds to the nearest cent: $11.53 at 4% → $11.99", () => {
    // 11.53 × 1.04 = 11.9912 → 11.99
    expect(deriveCardPrice(11.53, 4)).toBe(11.99);
  });

  it("handles 0% — card equals cash", () => {
    expect(deriveCardPrice(10.0, 0)).toBe(10.0);
  });
});

describe("deriveCashPrice", () => {
  it("inverse of the surcharge: $10.40 at 4% → $10.00", () => {
    // 10.40 / 1.04 = 10.00 (9.99999… in FP → must floor to 10.00, not 9.99)
    expect(deriveCashPrice(10.4, 4)).toBe(10.0);
  });

  it("floors sub-cent remainders: $12.00 at 4% → $11.53", () => {
    // 12 / 1.04 = 11.538… → floor → 11.53
    expect(deriveCashPrice(12.0, 4)).toBe(11.53);
  });

  it("floors sub-cent remainders: $28.00 at 4% → $26.92", () => {
    // 28 / 1.04 = 26.923… → floor → 26.92
    expect(deriveCashPrice(28.0, 4)).toBe(26.92);
  });

  it("never charges the customer more than the exact inverse", () => {
    const raw = 12.0 / 1.04; // 11.538…
    expect(deriveCashPrice(12.0, 4)).toBeLessThanOrEqual(raw + 1e-9);
  });

  it("handles 0% — cash equals card", () => {
    expect(deriveCashPrice(10.0, 0)).toBe(10.0);
  });
});

describe("round-trip", () => {
  it("cash base → card → cash returns the original", () => {
    const cash = 10.0;
    const card = deriveCardPrice(cash, 4); // 10.40
    const backToCash = deriveCashPrice(card, 4); // 10.00
    expect(backToCash).toBe(cash);
  });

  it("round-trips a non-integer cash base within a cent", () => {
    const cash = 15.0;
    const card = deriveCardPrice(cash, 4); // 15.60
    const backToCash = deriveCashPrice(card, 4); // 15.00
    expect(Math.abs(backToCash - cash)).toBeLessThanOrEqual(0.01);
  });
});
