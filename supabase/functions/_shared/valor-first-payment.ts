// ============================================================================
// Matching Valor's first-payment webhook to an invoice that is already paid.
// ============================================================================
// WHY THIS EXISTS:
//   An activation charge is settled inline. billing-charge-subscription creates
//   the Valor schedule, Valor charges the card during that same call, and the
//   invoice is marked paid on Valor's `S00` - a response that carries a
//   subscription id but NO transaction id. About a minute later Valor reports
//   that same first payment through the recurring webhook. By then there is no
//   due invoice left, so the receiver has to find the settled one instead.
//
// First seen live 2026-09-29 (prod, subscription 253837): the webhook was
// rejected with `recurring_invoice_missing` and the invoice kept a null
// transaction id.
// ============================================================================

export interface SettledInvoiceCandidate {
  id: string
  invoice_number: string
  paid_at: string | null
  processor_transaction_id: string | null
}

/**
 * How long after the inline charge the first-payment event may still arrive.
 * Valor sends the subscription's original `invoice_no` on every later cycle
 * too, so without a window a future month's payment could be attached to an
 * old invoice that never received its transaction.
 */
export const FIRST_PAYMENT_MATCH_WINDOW_MS = 48 * 60 * 60 * 1000

/**
 * Pick the paid invoice Valor's first-payment event refers to, or null.
 *
 * A candidate qualifies only when it has no transaction yet, was paid inside
 * the match window, and its number normalizes to the `invoice_no` Valor sent.
 * `normalizeInvoiceNumber` is the same normalizer used when the invoice number
 * was sent to Valor (`normalizeValorInvoiceNumber`); it is passed in so this
 * module stays import-free and loads under both Deno and the Node test runner.
 */
export function findInlineSettledInvoice<T extends SettledInvoiceCandidate>(
  candidates: T[],
  valorInvoiceNo: string,
  nowMs: number,
  normalizeInvoiceNumber: (invoiceNumber: string) => string,
): T | null {
  const wanted = valorInvoiceNo.trim().toUpperCase()
  if (!wanted) return null

  for (const candidate of candidates) {
    if (candidate.processor_transaction_id) continue

    const paidAtMs = candidate.paid_at ? Date.parse(candidate.paid_at) : Number.NaN
    if (!Number.isFinite(paidAtMs)) continue
    if (Math.abs(nowMs - paidAtMs) > FIRST_PAYMENT_MATCH_WINDOW_MS) continue

    let normalized = ''
    try {
      normalized = normalizeInvoiceNumber(candidate.invoice_number).toUpperCase()
    } catch {
      continue
    }
    if (normalized === wanted) return candidate
  }

  return null
}
