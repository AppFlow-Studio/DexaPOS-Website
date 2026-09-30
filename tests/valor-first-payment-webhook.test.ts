import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  FIRST_PAYMENT_MATCH_WINDOW_MS,
  findInlineSettledInvoice,
} from '../supabase/functions/_shared/valor-first-payment'
import { normalizeValorInvoiceNumber } from '../supabase/functions/_shared/valor'

const NOW = Date.parse('2026-09-29T21:36:26.000Z')

const find = (
  candidates: Parameters<typeof findInlineSettledInvoice>[0],
  valorInvoiceNo: string,
  nowMs: number,
) => findInlineSettledInvoice(candidates, valorInvoiceNo, nowMs, normalizeValorInvoiceNumber)

// The live case: invoice settled inline at 21:35:16, Valor's first-payment
// webhook arrived at 21:36:26 naming invoice_no "UB2026100001".
const settledInline = {
  id: 'invoice-1',
  invoice_number: 'SUB-202610-0001',
  paid_at: '2026-09-29T21:35:16.340Z',
  processor_transaction_id: null,
}

describe('Valor first-payment webhook matching', () => {
  it('matches the inline-settled invoice Valor names', () => {
    expect(find([settledInline], 'UB2026100001', NOW)).toBe(settledInline)
  })

  it('matches regardless of case and surrounding whitespace', () => {
    expect(find([settledInline], ' ub2026100001 ', NOW)).toBe(settledInline)
  })

  it('ignores an invoice that already has its transaction', () => {
    expect(
      find(
        [{ ...settledInline, processor_transaction_id: '11013174026' }],
        'UB2026100001',
        NOW,
      ),
    ).toBeNull()
  })

  it('ignores a different invoice number', () => {
    expect(find([settledInline], 'UB2026100002', NOW)).toBeNull()
  })

  it('does not attach a later cycle to an old invoice that reuses the invoice number', () => {
    const nextMonth = NOW + 30 * 24 * 60 * 60 * 1000
    expect(find([settledInline], 'UB2026100001', nextMonth)).toBeNull()
    expect(
      find(
        [settledInline],
        'UB2026100001',
        Date.parse(settledInline.paid_at) + FIRST_PAYMENT_MATCH_WINDOW_MS + 1,
      ),
    ).toBeNull()
  })

  it('returns null when Valor sends no invoice number or the invoice was never paid', () => {
    expect(find([settledInline], '', NOW)).toBeNull()
    expect(
      find([{ ...settledInline, paid_at: null }], 'UB2026100001', NOW),
    ).toBeNull()
  })

  it('is wired into the webhook before a new invoice is generated', () => {
    const webhook = readFileSync(
      join(process.cwd(), 'supabase/functions/valor-webhook/index.ts'),
      'utf8',
    )
    const attach = webhook.indexOf('findInlineSettledInvoice(')
    const generate = webhook.indexOf("'generate_subscription_invoice'")

    expect(attach).toBeGreaterThan(-1)
    expect(generate).toBeGreaterThan(attach)
    expect(webhook).toContain("detail: 'recurring_first_payment_attached'")
  })
})
