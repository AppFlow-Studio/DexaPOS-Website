import { describe, expect, it } from 'vitest'
import * as node from '../lib/email/design-kit'
import * as deno from '../supabase/functions/_shared/email-design-kit'

/**
 * The email design kit is duplicated across the Next.js (Node) runtime and the
 * Deno edge runtime because Deno edge functions can't import from `lib/`. This
 * pins the two copies byte-for-byte equal so branded emails render identically
 * whether they're sent from a server action or an edge function.
 */

const APP = 'https://staging.dexaposai.com'

describe('email design kit Node/Deno parity', () => {
  it('shares identical brand tokens + constants', () => {
    expect(node.BRAND).toEqual(deno.BRAND)
    expect(node.COMPANY_NAME).toBe(deno.COMPANY_NAME)
    expect(node.SUPPORT_EMAIL).toBe(deno.SUPPORT_EMAIL)
    expect(node.FALLBACK_APP_URL).toBe(deno.FALLBACK_APP_URL)
  })

  it('emailShell renders identically (and contains logo + footer)', () => {
    const body = node.heading('Receipt') + node.paragraph('Thanks for your payment.')
    const n = node.emailShell({ appUrl: APP, previewText: 'Your receipt', bodyHtml: body })
    const d = deno.emailShell({ appUrl: APP, previewText: 'Your receipt', bodyHtml: body })
    expect(n).toBe(d)
    expect(n).toContain(`${APP}/dexalogolight.png`)
    expect(n).toContain(node.SUPPORT_EMAIL)
  })

  it('falls back to the canonical app url when none is passed', () => {
    const n = node.emailShell({ appUrl: '', bodyHtml: 'x' })
    expect(n).toContain(`${node.FALLBACK_APP_URL}/dexalogolight.png`)
    expect(n).toBe(deno.emailShell({ appUrl: '', bodyHtml: 'x' }))
  })

  it('emailButton / heading / paragraph / divider parity', () => {
    const btn = { href: 'https://x.test/subscription-invoice/abc', label: 'View invoice & billing' }
    expect(node.emailButton(btn)).toBe(deno.emailButton(btn))
    expect(node.heading('Payment failed')).toBe(deno.heading('Payment failed'))
    expect(node.paragraph('Hello <b>world</b>')).toBe(deno.paragraph('Hello <b>world</b>'))
    expect(node.divider()).toBe(deno.divider())
  })

  it('card / amountSummary / linkRow parity', () => {
    expect(node.card('<p>hi</p>')).toBe(deno.card('<p>hi</p>'))
    const summary = { label: 'Receipt from Dexa POS', amount: '$243.36', sub: 'Paid on September 10, 2026' }
    expect(node.amountSummary(summary)).toBe(deno.amountSummary(summary))
    const links = [
      { href: 'https://x.test/subscription-invoice/tok/pdf', label: 'Download PDF' },
      { href: 'https://x.test/subscription-invoice/tok', label: 'View online' },
    ]
    expect(node.linkRow(links)).toBe(deno.linkRow(links))
    expect(node.linkRow([])).toBe(deno.linkRow([]))
  })

  it('detailsTable / statusBadge / infoCallout parity', () => {
    const rows = [
      { label: 'Invoice', value: 'SUB-202609-0001' },
      { label: 'Amount due', value: '$243.36', strong: true },
    ]
    expect(node.detailsTable(rows)).toBe(deno.detailsTable(rows))
    for (const tone of ['success', 'neutral', 'alert', 'warn'] as const) {
      expect(node.statusBadge({ label: tone, tone })).toBe(deno.statusBadge({ label: tone, tone }))
      expect(node.infoCallout({ html: 'note', tone })).toBe(deno.infoCallout({ html: 'note', tone }))
    }
  })

  it('receiptItemsTable / totalsTable parity', () => {
    const items = [
      { description: 'POS Tablet', periodLabel: 'Sep 1-30, 2026', qtyLabel: 'Qty 3', amount: '$117.00' },
      { description: 'Kitchen Display (KDS)', qtyLabel: 'Qty 3', amount: '$87.00' },
    ]
    expect(node.receiptItemsTable(items)).toBe(deno.receiptItemsTable(items))
    expect(node.receiptItemsTable([])).toBe(deno.receiptItemsTable([]))
    const totals = [
      { label: 'Total', value: '$243.36' },
      { label: 'Amount paid', value: '$243.36', strong: true },
    ]
    expect(node.totalsTable(totals)).toBe(deno.totalsTable(totals))
  })

  it('escapes untrusted content identically', () => {
    const evil = `<script>"'&`
    expect(node.escapeHtml(evil)).toBe(deno.escapeHtml(evil))
    expect(node.heading(evil)).toBe(deno.heading(evil))
    expect(node.heading(evil)).not.toContain('<script>')
  })
})
