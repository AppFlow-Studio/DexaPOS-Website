/**
 * Dual-pricing math — single source of truth used everywhere (dashboard form,
 * storefront display, any future API helpers).
 *
 * Rounding policy (consumer-protection):
 *   • cash  = floor to 2 dp  → customer always pays ≤ the exact math result
 *   • card  = round to 2 dp  → normal nearest-cent rounding is fine for card
 */

/**
 * Derive the cash price from a card price at a given dual-pricing surcharge %.
 * e.g. deriveCashPrice(12.00, 4) → 11.53  (floor of 11.5384…)
 */
export function deriveCashPrice(cardPrice: number, surchargePercent: number): number {
  if (surchargePercent <= 0) return cardPrice;
  const raw = cardPrice / (1 + surchargePercent / 100);
  return Math.floor(raw * 100) / 100;
}

/**
 * Derive the card price from a cash price at a given dual-pricing surcharge %.
 * e.g. deriveCardPrice(11.53, 4) → 11.99
 */
export function deriveCardPrice(cashPrice: number, surchargePercent: number): number {
  if (surchargePercent <= 0) return cashPrice;
  const raw = cashPrice * (1 + surchargePercent / 100);
  return Math.round(raw * 100) / 100;
}
