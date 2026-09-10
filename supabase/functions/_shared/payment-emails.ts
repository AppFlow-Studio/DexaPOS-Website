import { Resend } from 'npm:resend'
import {
  formatLongDate,
  formatShortDateRange,
  renderSubscriptionInvoiceEmailHtml,
} from './subscription-invoice-template.ts'
import {
  card,
  detailsTable,
  emailButton,
  emailShell,
  heading,
  infoCallout,
  paragraph,
} from './email-design-kit.ts'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? ''
const RESEND_FROM_EMAIL = Deno.env.get('RESEND_FROM_EMAIL') ?? 'billing@resend.dev'
const APP_URL = Deno.env.get('APP_URL') ?? Deno.env.get('NEXT_PUBLIC_APP_URL') ?? ''

/** Optional Resend attachment (base64 content). */
export interface EmailAttachment {
  filename: string
  content: string
}

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

/** Normalize the DB `line_items` JSON into the email template's line-item shape. */
function normalizeEmailLineItems(
  lineItems: Array<Record<string, unknown>>,
  periodLabel: string | null,
) {
  return lineItems.map((item) => {
    const quantity = Math.max(1, Number(item.quantity ?? 1))
    const amount = Number(
      typeof item.amount !== 'undefined'
        ? item.amount
        : typeof item.subtotal !== 'undefined'
          ? item.subtotal
          : item.total_amount ?? 0,
    )
    const unitPrice =
      typeof item.unit_price !== 'undefined'
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
}

async function sendEmail(
  to: string,
  subject: string,
  html: string,
  attachments?: EmailAttachment[],
): Promise<void> {
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
    ...(attachments && attachments.length ? { attachments } : {}),
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
  orderType: 'pickup' | 'delivery' | 'qr_dine_in'
}): Promise<void> {
  const orderLabel = params.displayNumber || params.orderNumber || 'your order'
  const orderTypeLabel = params.orderType === 'qr_dine_in' ? 'dine-in' : params.orderType
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;color:#111827;">
      <h2 style="margin-bottom:8px;">Payment received</h2>
      <p style="margin:0 0 16px;">Your ${orderTypeLabel} order from <strong>${params.locationName}</strong> has been paid successfully.</p>
      <table style="width:100%;border-collapse:collapse;margin:16px 0;">
        <tr><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;">Merchant</td><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;text-align:right;">${params.merchantName}</td></tr>
        <tr><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;">Order</td><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;text-align:right;">${orderLabel}</td></tr>
        <tr><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;">Type</td><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;text-align:right;text-transform:capitalize;">${orderTypeLabel}</td></tr>
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
  viewUrl?: string | null
  pdfUrl?: string | null
  attachments?: EmailAttachment[]
}): Promise<void> {
  const periodLabel = formatShortDateRange(params.billingPeriodStart, params.billingPeriodEnd)
  const normalizedLineItems = normalizeEmailLineItems(params.lineItems, periodLabel)

  const html = renderSubscriptionInvoiceEmailHtml({
    appUrl: APP_URL,
    title: 'Invoice',
    invoiceNumber: params.invoiceNumber,
    issuedOn: params.issuedOn,
    dueDate: params.dueDate,
    statusLabel: 'Paid',
    statusTone: 'success',
    summaryTitle: `${formatUsd(params.totalAmount)} paid on ${formatLongDate(params.issuedOn)}`,
    introHtml: `Thanks &mdash; we received your Dexa POS subscription payment for <strong>${escapeHtml(params.locationName)}</strong>. Your receipt is below.`,
    fromLines: ['Dexa POS Billing', RESEND_FROM_EMAIL],
    toLines: [params.merchantName, params.locationName, params.billingEmail || ''].filter(Boolean),
    lineItems: normalizedLineItems,
    subtotal: params.subtotal,
    surcharge: params.cardSurcharge,
    total: params.totalAmount,
    finalAmountLabel: 'Amount paid',
    finalAmountValue: params.totalAmount,
    viewUrl: params.viewUrl ?? null,
    pdfUrl: params.pdfUrl ?? null,
    footerNote: params.transactionId ? `Transaction reference: ${params.transactionId}` : null,
  })

  await sendEmail(
    params.to,
    `Dexa billing receipt - ${params.invoiceNumber}`,
    html,
    params.attachments,
  )
}

export async function sendSubscriptionInvoiceIssuedEmail(params: {
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
  viewUrl?: string | null
  pdfUrl?: string | null
  attachments?: EmailAttachment[]
}): Promise<void> {
  const periodLabel = formatShortDateRange(params.billingPeriodStart, params.billingPeriodEnd)
  const html = renderSubscriptionInvoiceEmailHtml({
    appUrl: APP_URL,
    title: 'Invoice',
    invoiceNumber: params.invoiceNumber,
    issuedOn: params.issuedOn,
    dueDate: params.dueDate,
    statusLabel: 'Open',
    statusTone: 'neutral',
    summaryTitle: `${formatUsd(params.totalAmount)} due ${formatLongDate(params.dueDate)}`,
    introHtml: `Your new Dexa POS invoice for <strong>${escapeHtml(params.locationName)}</strong> is ready. The card on file will be charged automatically on the due date &mdash; no action is required.`,
    fromLines: ['Dexa POS Billing', RESEND_FROM_EMAIL],
    toLines: [params.merchantName, params.locationName, params.billingEmail || ''].filter(Boolean),
    lineItems: normalizeEmailLineItems(params.lineItems, periodLabel),
    subtotal: params.subtotal,
    surcharge: params.cardSurcharge,
    total: params.totalAmount,
    finalAmountLabel: 'Amount due',
    finalAmountValue: params.totalAmount,
    viewUrl: params.viewUrl ?? null,
    pdfUrl: params.pdfUrl ?? null,
    footerNote: null,
  })

  await sendEmail(
    params.to,
    `Your Dexa POS invoice - ${params.invoiceNumber}`,
    html,
    params.attachments,
  )
}

export async function sendSubscriptionRenewalReminderEmail(params: {
  to: string
  merchantName: string
  locationName: string
  amount: number
  renewalDate: string
  viewUrl?: string | null
}): Promise<void> {
  if (!hasEmailConfig()) throw new Error('RESEND_API_KEY is not configured')

  const bodyHtml = [
    heading('Your subscription renews soon'),
    paragraph(
      `This is a heads-up that your Dexa POS subscription for <strong>${escapeHtml(params.locationName)}</strong> renews on <strong>${formatLongDate(params.renewalDate)}</strong>. The card on file will be charged automatically &mdash; no action is required.`,
    ),
    detailsTable([
      { label: 'Location', value: params.locationName },
      { label: 'Renews on', value: formatLongDate(params.renewalDate) },
      { label: 'Estimated amount', value: formatUsd(params.amount), strong: true },
    ]),
    params.viewUrl ? emailButton({ href: params.viewUrl, label: 'View billing & payments' }) : '',
  ]
    .filter(Boolean)
    .join('\n')

  await sendEmail(
    params.to,
    `Your Dexa POS subscription renews ${formatLongDate(params.renewalDate)}`,
    emailShell({
      appUrl: APP_URL,
      previewText: `Renews ${formatLongDate(params.renewalDate)}`,
      bodyHtml: card(bodyHtml),
    }),
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
  viewUrl?: string | null
}): Promise<void> {
  if (!hasEmailConfig()) {
    throw new Error('RESEND_API_KEY is not configured')
  }

  const bodyHtml = [
    heading('Subscription payment failed'),
    paragraph(
      `We could not process the Dexa POS subscription payment for <strong>${escapeHtml(params.merchantName)}</strong>. Please review the payment method on file so service continues without interruption.`,
    ),
    detailsTable([
      { label: 'Location', value: params.locationName },
      { label: 'Invoice', value: params.invoiceNumber },
      { label: 'Due date', value: formatLongDate(params.dueDate) },
      { label: 'Amount due', value: formatUsd(params.totalAmount), strong: true },
    ]),
    infoCallout({ html: `<strong>Processor response:</strong> ${escapeHtml(params.failureMessage)}`, tone: 'alert' }),
    params.viewUrl ? emailButton({ href: params.viewUrl, label: 'View invoice & billing' }) : '',
    paragraph(
      `<span style="color:#64748B;font-size:14px;">Update the payment method and settle the outstanding balance. Continued non-payment may result in POS service deactivation.</span>`,
    ),
  ]
    .filter(Boolean)
    .join('\n')

  await sendEmail(
    params.to,
    `Action required: Dexa billing payment failed - ${params.invoiceNumber}`,
    emailShell({ appUrl: APP_URL, previewText: `Payment failed for ${params.invoiceNumber}`, bodyHtml: card(bodyHtml) }),
  )
}

export async function sendSubscriptionRestoredEmail(params: {
  to: string
  merchantName: string
  locationName: string
  invoiceNumber: string
  totalAmount: number
  viewUrl?: string | null
}): Promise<void> {
  if (!hasEmailConfig()) throw new Error('RESEND_API_KEY is not configured')

  const bodyHtml = [
    heading('Subscription billing restored'),
    paragraph(
      `The outstanding payment for <strong>${escapeHtml(params.merchantName)}</strong> was collected successfully and the subscription is current again.`,
    ),
    detailsTable([
      { label: 'Location', value: params.locationName },
      { label: 'Invoice', value: params.invoiceNumber },
      { label: 'Amount paid', value: formatUsd(params.totalAmount), strong: true },
    ]),
    infoCallout({ html: 'Any billing suspension is being removed automatically. No further action is needed.', tone: 'success' }),
    params.viewUrl ? emailButton({ href: params.viewUrl, label: 'View invoice & billing' }) : '',
  ]
    .filter(Boolean)
    .join('\n')

  await sendEmail(
    params.to,
    `Dexa subscription restored - ${params.invoiceNumber}`,
    emailShell({ appUrl: APP_URL, previewText: `Subscription restored - ${params.invoiceNumber}`, bodyHtml: card(bodyHtml) }),
  )
}
