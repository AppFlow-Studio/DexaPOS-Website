import { describe, it, expect } from "vitest";
import { deriveCashPrice, deriveCardPrice } from "../pricing";

describe("deriveCashPrice", () => {
  it("floors to 2 dp — PM spec example: $12.00 at 4% → $11.53", () => {
    expect(deriveCashPrice(12.00, 4)).toBe(11.53);
  });

  it("never rounds up — raw result 11.5384 floors to 11.53 not 11.54", () => {
    const raw = 12.00 / 1.04; // 11.538461...
    expect(deriveCashPrice(12.00, 4)).toBeLessThanOrEqual(raw);
  });

  it("handles 0% surcharge — cash equals card", () => {
    expect(deriveCashPrice(10.00, 0)).toBe(10.00);
  });

  it("handles common 3% surcharge: $10.00 → $9.70", () => {
    // 10 / 1.03 = 9.708737... → floor → 9.70
    expect(deriveCashPrice(10.00, 3)).toBe(9.70);
  });
});

describe("deriveCardPrice", () => {
  it("rounds to nearest cent: $11.53 at 4% → $11.99", () => {
    // 11.53 * 1.04 = 11.9912 → round → 11.99
    expect(deriveCardPrice(11.53, 4)).toBe(11.99);
  });

  it("handles 0% surcharge — card equals cash", () => {
    expect(deriveCardPrice(10.00, 0)).toBe(10.00);
  });

  it("round-trips close to original: deriveCashPrice then deriveCardPrice within 1 cent", () => {
    const card = 15.00;
    const cash = deriveCashPrice(card, 4);
    const backToCard = deriveCardPrice(cash, 4);
    expect(Math.abs(backToCard - card)).toBeLessThanOrEqual(0.01);
  });
});
