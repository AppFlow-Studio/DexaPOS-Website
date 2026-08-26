import { describe, it, expect } from "vitest";
import { deriveCashPrice, deriveCardPrice } from "../pricing";

describe("deriveCashPrice", () => {
  it("cash discount: $12.00 at 4% → $11.52", () => {
    // 12 × 0.96 = 11.52
    expect(deriveCashPrice(12.0, 4)).toBe(11.52);
  });

  it("reported case: $28.00 at 4% → $26.88", () => {
    // 28 × 0.96 = 26.88
    expect(deriveCashPrice(28.0, 4)).toBe(26.88);
  });

  it("floors exact-boundary FP results correctly: $15.00 at 4% → $14.40", () => {
    // 15 × 0.96 = 14.3999999… in binary FP; must still floor to 14.40, not 14.39
    expect(deriveCashPrice(15.0, 4)).toBe(14.4);
  });

  it("never charges the customer more than the exact discount", () => {
    const raw = 12.0 * 0.96; // 11.52
    expect(deriveCashPrice(12.0, 4)).toBeLessThanOrEqual(raw + 1e-9);
  });

  it("handles 0% discount — cash equals card", () => {
    expect(deriveCashPrice(10.0, 0)).toBe(10.0);
  });

  it("handles a 3% discount: $10.00 → $9.70", () => {
    // 10 × 0.97 = 9.70 (9.6999999… in FP → must floor to 9.70)
    expect(deriveCashPrice(10.0, 3)).toBe(9.7);
  });
});

describe("deriveCardPrice", () => {
  it("inverse of the discount: $11.52 at 4% → $12.00", () => {
    // 11.52 / 0.96 = 12.00
    expect(deriveCardPrice(11.52, 4)).toBe(12.0);
  });

  it("reported case inverse: $26.88 at 4% → $28.00", () => {
    expect(deriveCardPrice(26.88, 4)).toBe(28.0);
  });

  it("handles 0% discount — card equals cash", () => {
    expect(deriveCardPrice(10.0, 0)).toBe(10.0);
  });

  it("treats a 100% discount as a no-op (avoids divide-by-zero)", () => {
    expect(deriveCardPrice(10.0, 100)).toBe(10.0);
  });

  it("round-trips: deriveCashPrice then deriveCardPrice returns the original", () => {
    const card = 15.0;
    const cash = deriveCashPrice(card, 4); // 14.40
    const backToCard = deriveCardPrice(cash, 4); // 15.00
    expect(Math.abs(backToCard - card)).toBeLessThanOrEqual(0.01);
  });
});
