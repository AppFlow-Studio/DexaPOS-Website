import {
  amountSummary,
  card,
  detailsTable,
  divider,
  emailShell,
  infoCallout,
  linkRow,
  receiptItemsTable,
  totalsTable,
  type BadgeTone,
  type DetailsRow,
  type ReceiptItem,
} from './email-design-kit.ts'

export interface SubscriptionInvoiceEmailLineItem {
  description: string
  periodLabel?: string | null
  quantity: number
  unitPrice: number
  amount: number
}

export interface SubscriptionInvoiceEmailDocument {
  /** Absolute app origin for logo + links (Deno: APP_URL env). */
  appUrl?: string
  title: string
  invoiceNumber: string | null
  issuedOn: string | null
  dueDate: string | null
  statusLabel?: string | null
  statusTone?: BadgeTone
  summaryTitle: string
  /** Optional lead sentence rendered above the invoice details. */
  introHtml?: string | null
  fromLines: string[]
  toLines: string[]
  lineItems: SubscriptionInvoiceEmailLineItem[]
  subtotal: number | null
  surcharge: number | null
  total: number | null
  finalAmountLabel?: string | null
  finalAmountValue?: number | null
  /** Hosted invoice page URL — renders the "View online" link. */
  viewUrl?: string | null
  /** Direct PDF download URL — renders the "Download PDF" link. */
  pdfUrl?: string | null
  ctaLabel?: string | null
  footerNote?: string | null
}

export function formatUsd(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount)
}

export function formatLongDate(value: string | null | undefined): string {
  if (!value) return '-'
  // Billing dates are calendar dates; format in UTC so a date-only string like
  // "2026-09-10" (parsed as UTC midnight) never renders a day early in a
  // negative-offset timezone.
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date)
}

export function formatShortDateRange(start: string | null | undefined, end: string | null | undefined): string | null {
  if (!start || !end) return null
  const startDate = new Date(start)
  const endDate = new Date(end)
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    return `${start} - ${end}`
  }

  const startMonth = new Intl.DateTimeFormat('en-US', { month: 'short', timeZone: 'UTC' }).format(startDate)
  const endMonth = new Intl.DateTimeFormat('en-US', { month: 'short', timeZone: 'UTC' }).format(endDate)
  const startDay = startDate.getUTCDate()
  const endDay = endDate.getUTCDate()
  const endYear = endDate.getUTCFullYear()

  if (startDate.getUTCFullYear() === endDate.getUTCFullYear() && startDate.getUTCMonth() === endDate.getUTCMonth()) {
    return `${startMonth} ${startDay}-${endDay}, ${endYear}`
  }

  if (startDate.getUTCFullYear() === endDate.getUTCFullYear()) {
    return `${startMonth} ${startDay}-${endMonth} ${endDay}, ${endYear}`
  }

  return `${startMonth} ${startDay}, ${startDate.getUTCFullYear()} - ${endMonth} ${endDay}, ${endYear}`
}

function isPaidStatus(label: string | null | undefined, tone?: BadgeTone): boolean {
  if (tone) return tone === 'success'
  const s = (label || '').toLowerCase()
  return s.includes('paid')
}

/**
 * Two-card Stripe-style receipt: a summary card (big amount, download links,
 * meta) then an itemized card (line items + subtotal/surcharge/total). Dexa
 * themed via the shared design kit.
 */
export function renderSubscriptionInvoiceEmailHtml(document: SubscriptionInvoiceEmailDocument): string {
  const paid = isPaidStatus(document.statusLabel, document.statusTone)
  const amountValue =
    document.finalAmountValue ?? document.total ?? document.subtotal ?? 0
  const summaryLabel = paid ? 'Receipt from Dexa POS' : 'Invoice from Dexa POS'
  const summarySub = paid
    ? document.issuedOn
      ? `Paid on ${formatLongDate(document.issuedOn)}`
      : 'Paid'
    : document.dueDate
      ? `Due ${formatLongDate(document.dueDate)}`
      : 'Payment due'

  const links = [
    document.pdfUrl ? { href: document.pdfUrl, label: 'Download PDF' } : null,
    document.viewUrl ? { href: document.viewUrl, label: 'View online' } : null,
  ].filter((l): l is { href: string; label: string } => l !== null)

  const metaRows: DetailsRow[] = []
  if (document.invoiceNumber) metaRows.push({ label: 'Invoice number', value: document.invoiceNumber })
  if (document.issuedOn) metaRows.push({ label: 'Date of issue', value: formatLongDate(document.issuedOn) })
  if (!paid && document.dueDate) metaRows.push({ label: 'Date due', value: formatLongDate(document.dueDate) })
  const billedTo = document.toLines.filter(Boolean)
  if (billedTo.length) metaRows.push({ label: 'Billed to', value: billedTo.join(', ') })

  const summaryCard = card(
    [
      amountSummary({ label: summaryLabel, amount: formatUsd(amountValue), sub: summarySub }),
      document.introHtml
        ? `<div style="font-family:inherit;font-size:14px;color:#3B4252;line-height:1.55;margin:14px 0 0;">${document.introHtml}</div>`
        : '',
      links.length ? linkRow(links) : '',
      metaRows.length ? detailsTable(metaRows) : '',
    ]
      .filter(Boolean)
      .join('\n'),
  )

  const items: ReceiptItem[] = document.lineItems.map((item) => ({
    description: item.description,
    periodLabel: item.periodLabel ?? null,
    qtyLabel: item.quantity ? `Qty ${item.quantity}` : null,
    amount: formatUsd(item.amount),
  }))

  const secondaryTotals: DetailsRow[] = []
  if (document.subtotal !== null) secondaryTotals.push({ label: 'Subtotal', value: formatUsd(document.subtotal) })
  if (document.surcharge && document.surcharge > 0) secondaryTotals.push({ label: 'Card surcharge', value: formatUsd(document.surcharge) })

  const finalTotals = [
    document.total !== null ? { label: 'Total', value: formatUsd(document.total), strong: false } : null,
    document.finalAmountValue !== null && document.finalAmountValue !== undefined
      ? { label: document.finalAmountLabel || (paid ? 'Amount paid' : 'Amount due'), value: formatUsd(document.finalAmountValue), strong: true }
      : null,
  ].filter((r): r is { label: string; value: string; strong: boolean } => r !== null)

  const itemsCard = card(
    [
      `<div style="font-family:inherit;font-size:16px;font-weight:700;color:#0F1424;margin:0 0 4px;">${document.invoiceNumber ? `Invoice ${document.invoiceNumber}` : 'Invoice'}</div>`,
      receiptItemsTable(items),
      secondaryTotals.length ? detailsTable(secondaryTotals) : '',
      finalTotals.length ? totalsTable(finalTotals) : '',
      document.footerNote ? infoCallout({ html: document.footerNote, tone: 'neutral' }) : '',
    ]
      .filter(Boolean)
      .join('\n'),
  )

  return emailShell({
    appUrl: document.appUrl || '',
    previewText: document.summaryTitle,
    bodyHtml: summaryCard + itemsCard,
  })
}

