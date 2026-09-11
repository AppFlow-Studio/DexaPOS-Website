import { buildSubscriptionInvoicePdfDoc, buildSubscriptionInvoiceFilename } from './invoice-pdf'
import type { SubscriptionInvoiceDocumentData } from './invoice-template'

export { buildSubscriptionInvoiceFilename }

/**
 * Server-side (Node): render a subscription invoice to a PDF Buffer, reusing the
 * exact same jsPDF layout as the client "Download PDF" button. Used by the
 * internal PDF route (edge fn attaches it to receipt/issued emails) and the
 * public token PDF route (hosted-page download). Mirrors
 * lib/invoices/invoice-pdf.ts's `generateInvoicePdfBuffer` pattern.
 */
export async function renderSubscriptionInvoicePdfBuffer(
  document: SubscriptionInvoiceDocumentData,
): Promise<Buffer> {
  const pdf = await buildSubscriptionInvoicePdfDoc(document)
  return Buffer.from(pdf.output('arraybuffer'))
}
