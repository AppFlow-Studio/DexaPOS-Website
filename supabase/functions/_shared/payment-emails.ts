import { Resend } from 'npm:resend'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? ''
const RESEND_FROM_EMAIL = Deno.env.get('RESEND_FROM_EMAIL') ?? 'billing@resend.dev'

function formatUsd(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount)
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
    `Payment receipt from ${params.merchantName} · ${orderLabel}`,
    html,
  )
}

export async function sendSubscriptionInvoicePaymentEmail(params: {
  to: string
  merchantName: string
  locationName: string
  invoiceNumber: string
  totalAmount: number
  dueDate: string
  transactionId: string | null
}): Promise<void> {
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;color:#111827;">
      <h2 style="margin-bottom:8px;">Subscription invoice paid</h2>
      <p style="margin:0 0 16px;">Dexa successfully processed your subscription payment.</p>
      <table style="width:100%;border-collapse:collapse;margin:16px 0;">
        <tr><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;">Merchant</td><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;text-align:right;">${params.merchantName}</td></tr>
        <tr><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;">Location</td><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;text-align:right;">${params.locationName}</td></tr>
        <tr><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;">Invoice</td><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;text-align:right;">${params.invoiceNumber}</td></tr>
        <tr><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;">Due date</td><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;text-align:right;">${params.dueDate}</td></tr>
        <tr><td style="padding:8px 0;font-weight:700;">Amount paid</td><td style="padding:8px 0;text-align:right;font-weight:700;">${formatUsd(params.totalAmount)}</td></tr>
      </table>
      ${params.transactionId ? `<p style="color:#4b5563;font-size:14px;">Transaction reference: ${params.transactionId}</p>` : ''}
    </div>
  `

  await sendEmail(
    params.to,
    `Dexa billing receipt · ${params.invoiceNumber}`,
    html,
  )
}
