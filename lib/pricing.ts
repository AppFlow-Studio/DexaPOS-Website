/**
 * Dual-pricing math — single source of truth used everywhere (dashboard form,
 * inline cascade editor, storefront display, bulk-adjust preview).
 *
 * Model: CASH-AS-BASE (surcharge). The cash price is the base; you calculate the
 * card price UP from it by `dualPercent`:
 *   • card = cash × (1 + pct/100)      e.g. $10.00 at 4% → $10.40
 *   • cash = card ÷ (1 + pct/100)      exact inverse, round-trips ($10.40 → $10.00)
 *
 * This matches the POS, which already derives cash as card ÷ (1 + rate)
 * (see migration 20260706130000_open_item_dual_pricing_inverse.sql).
 *
 * Rounding policy (consumer-protection):
 *   • cash = floor to 2 dp  → customer always pays ≤ the exact math result
 *   • card = round to 2 dp  → normal nearest-cent rounding is fine for card
 *
 * NOTE: the inverse can land on exact cent boundaries (e.g. cash base $10 → card
 * $10.40 → 10.40 ÷ 1.04 = 10.00), which binary floating point renders as
 * 9.99999…, and a naive Math.floor would drop a full cent (→ 9.99). We nudge by a
 * sub-cent EPSILON before flooring so exact results floor to themselves while
 * genuine sub-cent remainders are still floored down.
 */

const CENT_EPSILON = 1e-6;

/**
 * Derive the cash price from a card price — exact inverse of the surcharge:
 * cash = card ÷ (1 + pct/100).
 * e.g. deriveCashPrice(10.40, 4) → 10.00
 *      deriveCashPrice(12.00, 4) → 11.53
 */
export function deriveCashPrice(cardPrice: number, dualPercent: number): number {
  if (dualPercent <= 0) return cardPrice;
  const raw = cardPrice / (1 + dualPercent / 100);
  return Math.floor(raw * 100 + CENT_EPSILON) / 100;
}

/**
 * Derive the card price from a cash price — cash is the base, so calculate up:
 * card = cash × (1 + pct/100). Exact inverse of deriveCashPrice.
 * e.g. deriveCardPrice(10.00, 4) → 10.40
 *      deriveCardPrice(11.53, 4) → 11.99
 */
export function deriveCardPrice(cashPrice: number, dualPercent: number): number {
  if (dualPercent <= 0) return cashPrice;
  const raw = cashPrice * (1 + dualPercent / 100);
  return Math.round(raw * 100) / 100;
}
