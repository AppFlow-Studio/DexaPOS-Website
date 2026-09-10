import type { EmailAttachment } from './payment-emails.ts'

/**
 * Hosted-invoice link + PDF-attachment helpers for billing edge functions.
 * Edge functions run in Deno and can't run jsPDF, so the PDF is rendered by a
 * Node route (`/api/internal/subscription-invoices/:id/pdf`) which this fetches
 * with the internal-billing secret and returns base64 for a Resend attachment.
 */

const APP_URL = (Deno.env.get('APP_URL') ?? Deno.env.get('NEXT_PUBLIC_APP_URL') ?? '').replace(/\/+$/, '')
const INTERNAL_SECRET = Deno.env.get('INTERNAL_NOTIFICATION_SECRET') ?? ''

/** Build the public hosted-invoice + PDF URLs from an invoice's public_token. */
export function buildSubscriptionInvoiceLinks(
  publicToken: string | null | undefined,
): { viewUrl: string | null; pdfUrl: string | null } {
  if (!APP_URL || !publicToken) return { viewUrl: null, pdfUrl: null }
  const viewUrl = `${APP_URL}/subscription-invoice/${publicToken}`
  return { viewUrl, pdfUrl: `${viewUrl}/pdf` }
}

/** Fetch the server-rendered invoice PDF and return it as a base64 Resend attachment. */
export async function fetchSubscriptionInvoicePdfAttachment(
  invoiceId: string,
  filenameBase: string,
): Promise<EmailAttachment | null> {
  if (!APP_URL || !INTERNAL_SECRET) return null
  try {
    const res = await fetch(`${APP_URL}/api/internal/subscription-invoices/${invoiceId}/pdf`, {
      headers: { 'x-internal-secret': INTERNAL_SECRET },
    })
    if (!res.ok) {
      console.warn(`[subscription-invoice-links] PDF fetch ${res.status} for invoice ${invoiceId}`)
      return null
    }
    const bytes = new Uint8Array(await res.arrayBuffer())
    let binary = ''
    const chunk = 0x8000
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
    }
    const filename = `${filenameBase.replace(/[^A-Za-z0-9._-]+/g, '-')}.pdf`
    return { filename, content: btoa(binary) }
  } catch (err) {
    console.warn('[subscription-invoice-links] PDF fetch failed:', err)
    return null
  }
}
