/**
 * Dual-pricing math — single source of truth used everywhere (dashboard form,
 * inline cascade editor, storefront display, bulk-adjust preview).
 *
 * Model: CASH DISCOUNT. The card price is the sticker/list price; paying with
 * cash earns a discount of `discountPercent`:
 *   • cash = card × (1 − pct/100)      e.g. $28.00 at 4% → $26.88
 *   • card = cash ÷ (1 − pct/100)      exact inverse, round-trips ($26.88 → $28.00)
 *
 * Rounding policy (consumer-protection):
 *   • cash = floor to 2 dp  → customer always pays ≤ the exact math result
 *   • card = round to 2 dp  → normal nearest-cent rounding is fine for card
 *
 * NOTE: the discount lands on exact cent boundaries (e.g. 28 × 0.96 = 26.88),
 * and binary floating point renders some of those as 26.8799999…, which a naive
 * Math.floor would drop a full cent (→ 26.87). We nudge by a sub-cent EPSILON
 * before flooring so exact results floor to themselves while genuine sub-cent
 * remainders are still floored down.
 */

const CENT_EPSILON = 1e-6;

/**
 * Derive the cash price from a card price at a given dual-pricing discount %.
 * e.g. deriveCashPrice(12.00, 4) → 11.52
 *      deriveCashPrice(28.00, 4) → 26.88
 */
export function deriveCashPrice(cardPrice: number, discountPercent: number): number {
  if (discountPercent <= 0) return cardPrice;
  const raw = cardPrice * (1 - discountPercent / 100);
  return Math.floor(raw * 100 + CENT_EPSILON) / 100;
}

/**
 * Derive the card price from a cash price at a given dual-pricing discount %.
 * Exact inverse of deriveCashPrice so the pair round-trips.
 * e.g. deriveCardPrice(11.52, 4) → 12.00
 *      deriveCardPrice(26.88, 4) → 28.00
 */
export function deriveCardPrice(cashPrice: number, discountPercent: number): number {
  // A 100%+ discount would divide by zero / go negative — treat as a no-op.
  if (discountPercent <= 0 || discountPercent >= 100) return cashPrice;
  const raw = cashPrice / (1 - discountPercent / 100);
  return Math.round(raw * 100) / 100;
}
