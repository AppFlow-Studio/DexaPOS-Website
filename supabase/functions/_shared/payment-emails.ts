import { Resend } from 'npm:resend'
import {
  formatLongDate,
  formatShortDateRange,
  renderSubscriptionInvoiceEmailHtml,
} from './subscription-invoice-template.ts'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? ''
const RESEND_FROM_EMAIL = Deno.env.get('RESEND_FROM_EMAIL') ?? 'billing@resend.dev'

function formatUsd(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount)
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

function hasEmailConfig(): boolean {
  return RESEND_API_KEY.trim().length > 0
}

async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  if (!hasEmailConfig()) {
    console.warn('[payment-emails] RESEND_API_KEY is not configured. Skipping email send.')
    return
  }

  const resend = new Resend(RESEND_API_KEY)
  const { error } = await resend.emails.send({
    from: RESEND_FROM_EMAIL,
    to,
    subject,
    html,
  })

  if (error) {
    throw new Error(error.message)
  }
}

export async function sendOnlineOrderPaymentEmail(params: {
  to: string
  merchantName: string
  locationName: string
  displayNumber: string | null
  orderNumber: string | null
  totalAmount: number
  orderType: 'pickup' | 'delivery'
}): Promise<void> {
  const orderLabel = params.displayNumber || params.orderNumber || 'your order'
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;color:#111827;">
      <h2 style="margin-bottom:8px;">Payment received</h2>
      <p style="margin:0 0 16px;">Your ${params.orderType} order from <strong>${params.locationName}</strong> has been paid successfully.</p>
      <table style="width:100%;border-collapse:collapse;margin:16px 0;">
        <tr><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;">Merchant</td><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;text-align:right;">${params.merchantName}</td></tr>
        <tr><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;">Order</td><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;text-align:right;">${orderLabel}</td></tr>
        <tr><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;">Type</td><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;text-align:right;text-transform:capitalize;">${params.orderType}</td></tr>
        <tr><td style="padding:8px 0;font-weight:700;">Total</td><td style="padding:8px 0;text-align:right;font-weight:700;">${formatUsd(params.totalAmount)}</td></tr>
      </table>
      <p style="color:#4b5563;font-size:14px;">This email confirms payment only. The store will continue preparing the order based on its normal workflow.</p>
    </div>
  `

  await sendEmail(
    params.to,
    `Payment receipt from ${params.merchantName} - ${orderLabel}`,
    html,
  )
}

export async function sendSubscriptionInvoicePaymentEmail(params: {
  to: string
  merchantName: string
  locationName: string
  billingEmail?: string | null
  invoiceNumber: string
  issuedOn: string
  billingPeriodStart: string
  billingPeriodEnd: string
  lineItems: Array<Record<string, unknown>>
  subtotal: number
  cardSurcharge: number
  totalAmount: number
  dueDate: string
  transactionId: string | null
}): Promise<void> {
  const periodLabel = formatShortDateRange(params.billingPeriodStart, params.billingPeriodEnd)
  const normalizedLineItems = params.lineItems.map((item) => {
    const quantity = Math.max(1, Number(item.quantity ?? 1))
    const amount = Number(
      typeof item.amount !== 'undefined'
        ? item.amount
        : typeof item.subtotal !== 'undefined'
          ? item.subtotal
          : item.total_amount ?? 0,
    )
    const unitPrice = typeof item.unit_price !== 'undefined'
      ? Number(item.unit_price)
      : quantity > 0
        ? amount / quantity
        : amount

    return {
      description: String(item.description ?? item.display_name ?? item.service_code ?? item.code ?? 'Line item'),
      periodLabel,
      quantity,
      unitPrice,
      amount,
    }
  })

  const html = renderSubscriptionInvoiceEmailHtml({
    title: 'Invoice',
    invoiceNumber: params.invoiceNumber,
    issuedOn: params.issuedOn,
    dueDate: params.dueDate,
    statusLabel: 'paid',
    summaryTitle: `${formatUsd(params.totalAmount)} paid ${formatLongDate(params.issuedOn)}`,
    fromLines: ['Dexa POS Billing', RESEND_FROM_EMAIL],
    toLines: [params.merchantName, params.locationName, params.billingEmail || ''].filter(Boolean),
    lineItems: normalizedLineItems,
    subtotal: params.subtotal,
    surcharge: params.cardSurcharge,
    total: params.totalAmount,
    finalAmountLabel: 'Amount paid',
    finalAmountValue: params.totalAmount,
    footerNote: params.transactionId ? `Transaction reference: ${params.transactionId}` : null,
  })

  await sendEmail(
    params.to,
    `Dexa billing receipt - ${params.invoiceNumber}`,
    html,
  )
}

export async function sendSubscriptionPaymentFailedEmail(params: {
  to: string
  merchantName: string
  locationName: string
  invoiceNumber: string
  totalAmount: number
  dueDate: string
  failureMessage: string
}): Promise<void> {
  if (!hasEmailConfig()) {
    throw new Error('RESEND_API_KEY is not configured')
  }

  const merchantName = escapeHtml(params.merchantName)
  const locationName = escapeHtml(params.locationName)
  const invoiceNumber = escapeHtml(params.invoiceNumber)
  const failureMessage = escapeHtml(params.failureMessage)
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;color:#111827;">
      <h2 style="margin-bottom:8px;">Subscription payment failed</h2>
      <p style="margin:0 0 16px;">We could not process the DEXA POS subscription payment for <strong>${merchantName}</strong>.</p>
      <table style="width:100%;border-collapse:collapse;margin:16px 0;">
        <tr><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;">Location</td><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;text-align:right;">${locationName}</td></tr>
        <tr><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;">Invoice</td><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;text-align:right;">${invoiceNumber}</td></tr>
        <tr><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;">Due date</td><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;text-align:right;">${formatLongDate(params.dueDate)}</td></tr>
        <tr><td style="padding:8px 0;font-weight:700;">Amount due</td><td style="padding:8px 0;text-align:right;font-weight:700;">${formatUsd(params.totalAmount)}</td></tr>
      </table>
      <p style="margin:16px 0;color:#991b1b;"><strong>Processor response:</strong> ${failureMessage}</p>
      <p style="color:#4b5563;font-size:14px;">Update the merchant payment method and settle the outstanding balance. Continued non-payment may result in POS service deactivation.</p>
    </div>
  `

  await sendEmail(
    params.to,
    `Action required: Dexa billing payment failed - ${invoiceNumber}`,
    html,
  )
}
