import { getCardBrandLabel } from '@/lib/payments/method-display'

// How a saved billing card is presented. Every surface that shows one goes
// through `formatBillingCard` so the brand, mask and expiry cannot drift
// between the HQ and merchant views.

// Values that say how a card is funded, or merely that it is a card. They turn
// up where a brand is expected — Passage.js reports the payment method as
// "credit-card", Valor's `card_type` is "C" / "D" — and are never a brand.
const GENERIC_CARD_TYPES = new Set([
  'creditcard',
  'debitcard',
  'credit',
  'debit',
  'card',
  'c',
  'd',
])

// Billing spells the network out in full. The payment tables abbreviate it, so
// the shared label is overridden here rather than changed for every surface.
const BILLING_BRAND_LABELS: Record<string, string> = {
  Amex: 'American Express',
}

/** Display label for a real card brand, or null when the value is not one. */
export function normalizeBillingCardBrand(raw?: string | null): string | null {
  const trimmed = raw?.trim()
  if (!trimmed) return null

  const key = trimmed.toLowerCase().replace(/[\s\-_]/g, '')
  if (!key || GENERIC_CARD_TYPES.has(key)) return null

  const label = getCardBrandLabel(trimmed)
  return BILLING_BRAND_LABELS[label] ?? label
}

/**
 * Last four digits of a masked card number — "XXXX1111", or spaced as in
 * "3711 XXXX XXXX 1003" — or a bare "1111".
 */
export function readCardLastFour(raw?: string | null): string | null {
  const digits = (raw ?? '').replace(/\D/g, '')
  return digits.length >= 4 ? digits.slice(-4) : null
}

/** "MM/YY", or null unless both halves of the expiry are known. */
export function formatCardExpiry(
  month?: number | null,
  year?: number | null,
): string | null {
  if (!month || !year) return null
  return `${String(month).padStart(2, '0')}/${String(year).slice(-2)}`
}

export interface BillingCardDisplayInput {
  card_brand?: string | null
  card_last_four?: string | null
  card_exp_month?: number | null
  card_exp_year?: number | null
}

export interface BillingCardDisplay {
  /** "Visa •••• 1111", or just "Visa" / "Card" when the last four is unknown. */
  label: string
  /** "MM/YY", or null when the expiry is unknown. */
  expiry: string | null
  /** "Expires MM/YY" when the expiry is known, otherwise "Card on file". */
  detail: string
}

export function formatBillingCard(
  card: BillingCardDisplayInput,
): BillingCardDisplay {
  const brand = normalizeBillingCardBrand(card.card_brand) ?? 'Card'
  const lastFour = readCardLastFour(card.card_last_four)
  const expiry = formatCardExpiry(card.card_exp_month, card.card_exp_year)

  return {
    label: lastFour ? `${brand} •••• ${lastFour}` : brand,
    expiry,
    detail: expiry ? `Expires ${expiry}` : 'Card on file',
  }
}
