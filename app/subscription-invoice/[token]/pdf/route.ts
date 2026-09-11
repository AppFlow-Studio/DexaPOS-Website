import { NextResponse } from 'next/server'
import { loadPublicSubscriptionInvoiceDocument } from '@/lib/subscription-billing/public-invoice'
import {
  buildSubscriptionInvoiceFilename,
  renderSubscriptionInvoicePdfBuffer,
} from '@/lib/subscription-billing/invoice-pdf-buffer'

// jsPDF needs Node Buffer/arraybuffer, not Edge.
export const runtime = 'nodejs'

/** Public PDF download for the hosted invoice page — resolved by opaque token. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params
  const result = await loadPublicSubscriptionInvoiceDocument(token)
  if (!result) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }

  let pdfBuffer: Buffer
  try {
    pdfBuffer = await renderSubscriptionInvoicePdfBuffer(result.document)
  } catch (err) {
    console.error('[subscription-invoice pdf] generation failed:', err)
    return NextResponse.json({ error: 'pdf_generation_failed' }, { status: 500 })
  }

  const filename = buildSubscriptionInvoiceFilename(result.document, 'pdf')
  return new NextResponse(pdfBuffer as unknown as BodyInit, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${filename}"`,
      'Content-Length': String(pdfBuffer.length),
      'Cache-Control': 'private, no-store',
    },
  })
}
