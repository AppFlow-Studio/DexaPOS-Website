import { describe, expect, it } from 'vitest'
import { renderSubscriptionInvoiceEmailHtml } from '../supabase/functions/_shared/subscription-invoice-template'

/**
 * The two-card Stripe-style invoice email. Pins the structure + Dexa branding +
 * that the hosted-page/PDF links and the charge breakdown render, and that
 * untrusted merchant/location strings are escaped.
 */

const base = {
  appUrl: 'https://staging.dexaposai.com',
  title: 'Invoice',
  invoiceNumber: 'SUB-202609-0008',
  issuedOn: '2026-09-10',
  dueDate: '2026-09-30',
  fromLines: ['Dexa POS Billing', 'billing@dexaposai.com'],
  toLines: ['Joes Coffee Shop', 'Uptown Branch', 'billing@example.com'],
  lineItems: [
    { description: 'POS Tablet License', periodLabel: 'Sep 1-30, 2026', quantity: 3, unitPrice: 39, amount: 117 },
    { description: 'Kitchen Display (KDS)', periodLabel: 'Sep 1-30, 2026', quantity: 3, unitPrice: 29, amount: 87 },
  ],
  subtotal: 204,
  surcharge: 8.16,
  total: 212.16,
  viewUrl: 'https://staging.dexaposai.com/subscription-invoice/tok_demo',
  pdfUrl: 'https://staging.dexaposai.com/subscription-invoice/tok_demo/pdf',
}

describe('subscription invoice email (two-card)', () => {
  it('renders a paid receipt with breakdown, download links, and Dexa branding', () => {
    const html = renderSubscriptionInvoiceEmailHtml({
      ...base,
      statusLabel: 'Paid',
      statusTone: 'success',
      summaryTitle: '$212.16 paid on September 10, 2026',
      finalAmountLabel: 'Amount paid',
      finalAmountValue: 212.16,
      footerNote: 'Transaction reference: 55000',
    })
    expect(html).toContain('Receipt from Dexa POS')
    expect(html).toContain('/dexalogolight.png')
    // download + view links
    expect(html).toContain(base.pdfUrl)
    expect(html).toContain(base.viewUrl)
    // breakdown
    expect(html).toContain('POS Tablet License')
    expect(html).toContain('Subtotal')
    expect(html).toContain('Card surcharge')
    expect(html).toContain('Amount paid')
    // UTC date, not a day early
    expect(html).toContain('September 10, 2026')
    expect(html).not.toContain('September 9, 2026')
  })

  it('renders an open invoice as "Invoice from Dexa POS" with a due date', () => {
    const html = renderSubscriptionInvoiceEmailHtml({
      ...base,
      statusLabel: 'Open',
      statusTone: 'neutral',
      summaryTitle: '$212.16 due September 30, 2026',
      finalAmountLabel: 'Amount due',
      finalAmountValue: 212.16,
    })
    expect(html).toContain('Invoice from Dexa POS')
    expect(html).toContain('Amount due')
    expect(html).toContain('September 30, 2026')
  })

  it('escapes untrusted merchant / location values', () => {
    const html = renderSubscriptionInvoiceEmailHtml({
      ...base,
      toLines: ['<script>alert(1)</script>', 'Loc'],
      statusLabel: 'Paid',
      statusTone: 'success',
      summaryTitle: 'x',
      finalAmountValue: 1,
    })
    expect(html).not.toContain('<script>alert(1)</script>')
    expect(html).toContain('&lt;script&gt;')
  })
})
