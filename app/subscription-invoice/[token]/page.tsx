import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { loadPublicSubscriptionInvoiceDocument } from '@/lib/subscription-billing/public-invoice'
import { formatLongDate, formatUsd } from '@/lib/subscription-billing/invoice-template'

interface PageProps {
  params: Promise<{ token: string }>
}

export const metadata: Metadata = {
  title: 'Invoice · Dexa POS',
  robots: { index: false, follow: false },
}

const C = {
  bg: '#F4F6FB',
  card: '#FFFFFF',
  border: '#E6E8EF',
  rule: '#EEF0F5',
  ink: '#0F1424',
  body: '#3B4252',
  muted: '#64748B',
  faint: '#8A93A6',
  primary: '#0C4FD1',
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div
      style={{ borderBottom: `1px solid ${C.rule}` }}
      className="flex items-center justify-between py-2.5 text-sm last:border-b-0"
    >
      <span style={{ color: C.muted }}>{label}</span>
      <span style={{ color: strong ? C.ink : C.body, fontWeight: strong ? 700 : 400 }}>{value}</span>
    </div>
  )
}

export default async function PublicSubscriptionInvoicePage({ params }: PageProps) {
  const { token } = await params
  const result = await loadPublicSubscriptionInvoiceDocument(token)
  if (!result) notFound()

  const doc = result.document
  const paid = result.status === 'paid'
  const summaryLabel = paid ? 'Receipt from Dexa POS' : 'Invoice from Dexa POS'
  const summarySub = paid
    ? doc.issuedOn
      ? `Paid on ${formatLongDate(doc.issuedOn)}`
      : 'Paid'
    : doc.dueDate
      ? `Due ${formatLongDate(doc.dueDate)}`
      : 'Payment due'

  return (
    <main style={{ background: C.bg, minHeight: '100vh', fontFamily: 'var(--font-geist-sans), system-ui, sans-serif' }}>
      <div className="mx-auto w-full max-w-[640px] px-4 py-8">
        {/* Logo lockup */}
        <div className="mb-4 flex items-center gap-2.5 px-1">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/dexalogolight.png" alt="Dexa POS" width={30} height={30} style={{ borderRadius: 7 }} />
          <span style={{ color: C.ink, fontWeight: 700, fontSize: 17, letterSpacing: '-0.01em' }}>Dexa POS</span>
        </div>

        {/* Summary card */}
        <section
          style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14 }}
          className="mb-4 p-7"
        >
          <div style={{ color: C.muted }} className="text-sm">{summaryLabel}</div>
          <div style={{ color: C.ink, letterSpacing: '-0.02em' }} className="mt-1 text-4xl font-bold leading-tight">
            {formatUsd(doc.finalAmountValue ?? doc.total ?? 0)}
          </div>
          <div style={{ color: C.muted }} className="mt-2 text-sm">{summarySub}</div>

          <div className="mt-5 flex flex-wrap gap-6">
            <a
              href={`/subscription-invoice/${token}/pdf`}
              style={{ color: C.primary }}
              className="inline-flex items-center gap-1.5 text-sm font-semibold no-underline"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" /><polyline points="8 11 12 15 16 11" /><line x1="12" y1="3" x2="12" y2="15" /></svg>
              Download PDF
            </a>
            <a
              href="/dashboard/subscriptions/billing"
              style={{ color: C.primary }}
              className="inline-flex items-center gap-1.5 text-sm font-semibold no-underline"
            >
              Manage billing
            </a>
          </div>

          <div className="mt-5">
            {doc.invoiceNumber ? <Row label="Invoice number" value={doc.invoiceNumber} /> : null}
            {doc.issuedOn ? <Row label="Date of issue" value={formatLongDate(doc.issuedOn)} /> : null}
            {!paid && doc.dueDate ? <Row label="Date due" value={formatLongDate(doc.dueDate)} /> : null}
            {doc.toParty.lines.length ? <Row label="Billed to" value={doc.toParty.lines.join(', ')} /> : null}
          </div>
        </section>

        {/* Itemized card */}
        <section
          style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14 }}
          className="mb-4 p-7"
        >
          <div style={{ color: C.ink }} className="mb-1 text-base font-bold">
            {doc.invoiceNumber ? `Invoice ${doc.invoiceNumber}` : 'Invoice'}
          </div>

          <div className="mt-2">
            {doc.lineItems.map((item, i) => (
              <div
                key={`${item.code ?? item.description}-${i}`}
                style={{ borderBottom: `1px solid ${C.rule}` }}
                className="flex items-start justify-between py-3"
              >
                <div>
                  <div style={{ color: C.ink }} className="text-[15px] font-semibold">{item.description}</div>
                  {item.periodLabel ? <div style={{ color: C.muted }} className="mt-0.5 text-xs">{item.periodLabel}</div> : null}
                  {item.quantity ? <div style={{ color: C.muted }} className="mt-0.5 text-xs">Qty {item.quantity}</div> : null}
                </div>
                <div style={{ color: C.ink }} className="whitespace-nowrap text-[15px]">{formatUsd(item.amount)}</div>
              </div>
            ))}
          </div>

          <div className="mt-2">
            {doc.subtotal !== null ? <Row label="Subtotal" value={formatUsd(doc.subtotal)} /> : null}
            {doc.surcharge && doc.surcharge > 0 ? <Row label="Card surcharge" value={formatUsd(doc.surcharge)} /> : null}
            {doc.total !== null ? (
              <div style={{ borderBottom: `1px solid ${C.rule}` }} className="flex items-center justify-between py-3">
                <span style={{ color: C.ink }} className="font-semibold">Total</span>
                <span style={{ color: C.ink }} className="font-semibold">{formatUsd(doc.total)}</span>
              </div>
            ) : null}
            {doc.finalAmountValue !== null && doc.finalAmountValue !== undefined ? (
              <div className="flex items-center justify-between py-3">
                <span style={{ color: C.ink }} className="text-base font-bold">{doc.finalAmountLabel || (paid ? 'Amount paid' : 'Amount due')}</span>
                <span style={{ color: C.ink }} className="text-base font-bold">{formatUsd(doc.finalAmountValue)}</span>
              </div>
            ) : null}
          </div>

          {doc.footerNote ? (
            <div style={{ background: '#EEF1F6', borderRadius: 10 }} className="mt-4 p-3.5 text-sm">
              <span style={{ color: C.muted }}>{doc.footerNote}</span>
            </div>
          ) : null}
        </section>

        <p style={{ color: C.faint }} className="px-2 text-xs leading-relaxed">
          Questions about your bill? Contact us at{' '}
          <a href="mailto:support@dexaposai.com" style={{ color: C.primary }} className="no-underline">support@dexaposai.com</a>.
        </p>
      </div>
    </main>
  )
}
