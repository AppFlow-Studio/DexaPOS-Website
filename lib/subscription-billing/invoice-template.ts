export interface SubscriptionInvoiceParty {
  title: string
  lines: string[]
}

export interface SubscriptionInvoiceLineItem {
  code?: string | null
  description: string
  periodLabel?: string | null
  quantity: number
  unitPrice: number
  amount: number
}

export interface SubscriptionInvoiceDocumentData {
  title: string
  invoiceNumber: string | null
  issuedOn: string | null
  dueDate: string | null
  statusLabel?: string | null
  summaryTitle: string
  fromParty: SubscriptionInvoiceParty
  toParty: SubscriptionInvoiceParty
  lineItems: SubscriptionInvoiceLineItem[]
  subtotal: number | null
  surcharge: number | null
  total: number | null
  finalAmountLabel?: string | null
  finalAmountValue?: number | null
  footerNote?: string | null
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function formatUsd(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount)
}

export function formatLongDate(value: string | null | undefined): string {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(date)
}

export function formatShortDateRange(start: string | null | undefined, end: string | null | undefined): string | null {
  if (!start || !end) return null
  const startDate = new Date(start)
  const endDate = new Date(end)
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    return `${start} - ${end}`
  }

  const startMonth = new Intl.DateTimeFormat('en-US', { month: 'short' }).format(startDate)
  const endMonth = new Intl.DateTimeFormat('en-US', { month: 'short' }).format(endDate)
  const startDay = startDate.getDate()
  const endDay = endDate.getDate()
  const endYear = endDate.getFullYear()

  if (startDate.getFullYear() === endDate.getFullYear() && startDate.getMonth() === endDate.getMonth()) {
    return `${startMonth} ${startDay}-${endDay}, ${endYear}`
  }

  if (startDate.getFullYear() === endDate.getFullYear()) {
    return `${startMonth} ${startDay}-${endMonth} ${endDay}, ${endYear}`
  }

  return `${startMonth} ${startDay}, ${startDate.getFullYear()} - ${endMonth} ${endDay}, ${endYear}`
}

export function renderSubscriptionInvoiceHtml(document: SubscriptionInvoiceDocumentData): string {
  const lineItemsHtml = document.lineItems.length
    ? document.lineItems
        .map((item) => {
          const period = item.periodLabel
            ? `<div class="line-subtitle">${escapeHtml(item.periodLabel)}</div>`
            : ''

          return `
            <tr>
              <td class="description-cell">
                <div class="line-title">${escapeHtml(item.description)}</div>
                ${period}
              </td>
              <td class="qty-cell">${item.quantity}</td>
              <td class="money-cell">${formatUsd(item.unitPrice)}</td>
              <td class="money-cell">${formatUsd(item.amount)}</td>
            </tr>
          `
        })
        .join('')
    : `
      <tr>
        <td class="description-cell">
          <div class="line-title">No billable line items</div>
        </td>
        <td class="qty-cell">-</td>
        <td class="money-cell">-</td>
        <td class="money-cell">-</td>
      </tr>
    `

  const totalsRows = [
    document.subtotal !== null
      ? `<tr><td colspan="3" class="totals-label">Subtotal</td><td class="money-cell">${formatUsd(document.subtotal)}</td></tr>`
      : '',
    document.surcharge && document.surcharge > 0
      ? `<tr><td colspan="3" class="totals-label">Card surcharge</td><td class="money-cell">${formatUsd(document.surcharge)}</td></tr>`
      : '',
    document.total !== null
      ? `<tr><td colspan="3" class="totals-label">Total</td><td class="money-cell">${formatUsd(document.total)}</td></tr>`
      : '',
    document.finalAmountValue !== null && document.finalAmountValue !== undefined
      ? `<tr class="final-total-row"><td colspan="3" class="totals-label strong">${escapeHtml(document.finalAmountLabel || 'Amount due')}</td><td class="money-cell strong">${formatUsd(document.finalAmountValue)}</td></tr>`
      : '',
  ]
    .filter(Boolean)
    .join('')

  const fromLines = document.fromParty.lines
    .filter(Boolean)
    .map((line) => `<div>${escapeHtml(line)}</div>`)
    .join('')

  const toLines = document.toParty.lines
    .filter(Boolean)
    .map((line) => `<div>${escapeHtml(line)}</div>`)
    .join('')

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(document.invoiceNumber || document.title)}</title>
  <style>
    :root {
      color-scheme: light;
    }
    * {
      box-sizing: border-box;
    }
    body {
      margin: 0;
      padding: 24px;
      background: #f4f4f5;
      color: #111827;
      font-family: Arial, Helvetica, sans-serif;
    }
    .page {
      width: 100%;
      max-width: 820px;
      margin: 0 auto;
      background: #ffffff;
      border: 1px solid #111827;
      padding: 28px 30px 36px;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 16px;
      margin-bottom: 18px;
    }
    .title {
      font-size: 34px;
      font-weight: 700;
      line-height: 1;
      margin: 0 0 16px;
      letter-spacing: -0.02em;
    }
    .meta-grid {
      display: grid;
      gap: 4px;
      font-size: 13px;
    }
    .meta-label {
      display: inline-block;
      min-width: 98px;
      font-weight: 700;
    }
    .status-badge {
      border: 1px solid #111827;
      border-radius: 999px;
      padding: 8px 14px;
      font-size: 12px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      white-space: nowrap;
    }
    .parties {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 24px;
      margin: 18px 0 24px;
      font-size: 13px;
      line-height: 1.5;
    }
    .party-title {
      font-weight: 700;
      margin-bottom: 6px;
    }
    .summary {
      margin: 0 0 14px;
      font-size: 24px;
      font-weight: 700;
    }
    .invoice-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
      margin-top: 18px;
    }
    .invoice-table th {
      text-align: left;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: #4b5563;
      border-bottom: 1px solid #d1d5db;
      padding: 8px 0;
    }
    .invoice-table td {
      border-bottom: 1px solid #e5e7eb;
      padding: 10px 0;
      vertical-align: top;
    }
    .description-cell {
      width: 58%;
      padding-right: 14px;
    }
    .qty-cell {
      width: 10%;
      text-align: center;
    }
    .money-cell {
      width: 16%;
      text-align: right;
      white-space: nowrap;
    }
    .line-title {
      font-weight: 700;
      margin-bottom: 2px;
    }
    .line-subtitle {
      color: #4b5563;
      font-size: 12px;
    }
    .totals {
      margin-top: 16px;
      display: flex;
      justify-content: flex-end;
    }
    .totals-table {
      width: 320px;
      border-collapse: collapse;
      font-size: 13px;
    }
    .totals-table td {
      padding: 4px 0;
      border-bottom: 1px solid #e5e7eb;
    }
    .totals-label {
      text-align: right;
      padding-right: 14px;
      color: #374151;
    }
    .strong {
      font-weight: 700;
      color: #111827;
    }
    .final-total-row td {
      border-bottom: 0;
      padding-top: 8px;
    }
    .footer-note {
      margin-top: 24px;
      font-size: 12px;
      color: #4b5563;
      line-height: 1.5;
      white-space: pre-line;
    }
    @media print {
      body {
        background: #ffffff;
        padding: 0;
      }
      .page {
        border: 0;
        max-width: none;
        padding: 20px 24px 28px;
      }
    }
  </style>
</head>
<body>
  <div class="page">
    <div class="header">
      <div>
        <h1 class="title">${escapeHtml(document.title)}</h1>
        <div class="meta-grid">
          ${document.invoiceNumber ? `<div><span class="meta-label">Invoice number</span>${escapeHtml(document.invoiceNumber)}</div>` : ''}
          ${document.issuedOn ? `<div><span class="meta-label">Date of issue</span>${escapeHtml(formatLongDate(document.issuedOn))}</div>` : ''}
          ${document.dueDate ? `<div><span class="meta-label">Date due</span>${escapeHtml(formatLongDate(document.dueDate))}</div>` : ''}
        </div>
      </div>
      ${document.statusLabel ? `<div class="status-badge">${escapeHtml(document.statusLabel)}</div>` : ''}
    </div>

    <div class="parties">
      <div>
        <div class="party-title">${escapeHtml(document.fromParty.title)}</div>
        ${fromLines}
      </div>
      <div>
        <div class="party-title">${escapeHtml(document.toParty.title)}</div>
        ${toLines}
      </div>
    </div>

    <div class="summary">${escapeHtml(document.summaryTitle)}</div>

    <table class="invoice-table">
      <thead>
        <tr>
          <th>Description</th>
          <th class="qty-cell">Qty</th>
          <th class="money-cell">Unit price</th>
          <th class="money-cell">Amount</th>
        </tr>
      </thead>
      <tbody>
        ${lineItemsHtml}
      </tbody>
    </table>

    <div class="totals">
      <table class="totals-table">
        <tbody>
          ${totalsRows}
        </tbody>
      </table>
    </div>

    ${document.footerNote ? `<div class="footer-note">${escapeHtml(document.footerNote)}</div>` : ''}
  </div>
</body>
</html>
  `.trim()
}

