import { NextResponse } from 'next/server'
import { loadSubscriptionInvoiceDocumentById } from '@/lib/subscription-billing/public-invoice'
import {
  buildSubscriptionInvoiceFilename,
  renderSubscriptionInvoicePdfBuffer,
} from '@/lib/subscription-billing/invoice-pdf-buffer'

// jsPDF needs Node Buffer/arraybuffer, not Edge.
export const runtime = 'nodejs'

/**
 * Internal PDF render for edge functions to attach to receipt/issued emails.
 * Guarded by the internal-billing secret (edge fns run in Deno and can't run
 * jsPDF; they fetch this route with `x-internal-secret`).
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const secret = process.env.INTERNAL_NOTIFICATION_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'not_configured' }, { status: 500 })
  }
  if (request.headers.get('x-internal-secret') !== secret) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const result = await loadSubscriptionInvoiceDocumentById(id)
  if (!result) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }

  let pdfBuffer: Buffer
  try {
    pdfBuffer = await renderSubscriptionInvoicePdfBuffer(result.document)
  } catch (err) {
    console.error('[internal subscription-invoice pdf] generation failed:', err)
    return NextResponse.json({ error: 'pdf_generation_failed' }, { status: 500 })
  }

  const filename = buildSubscriptionInvoiceFilename(result.document, 'pdf')
  return new NextResponse(pdfBuffer as unknown as BodyInit, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': String(pdfBuffer.length),
      'Cache-Control': 'private, no-store',
    },
  })
}
