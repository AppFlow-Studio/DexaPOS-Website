import Link from 'next/link'
import { Download, ExternalLink } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { getMerchantSubscriptionBillingHistory } from '@/app/dashboard/actions/subscription-billing'
import { formatLongDate, formatShortDateRange, formatUsd } from '@/lib/subscription-billing/invoice-template'

export const metadata = { title: 'Billing & payments · Dexa POS' }

const STATUS_STYLES: Record<string, string> = {
  paid: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  open: 'bg-slate-100 text-slate-600 ring-slate-500/20',
  processing: 'bg-blue-50 text-blue-700 ring-blue-600/20',
  failed: 'bg-red-50 text-red-700 ring-red-600/20',
  refunded: 'bg-amber-50 text-amber-700 ring-amber-600/20',
  voided: 'bg-slate-100 text-slate-400 ring-slate-400/20',
}

function StatusPill({ status }: { status: string }) {
  const cls = STATUS_STYLES[status] ?? STATUS_STYLES.open
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ring-1 ring-inset ${cls}`}>
      {status}
    </span>
  )
}

export default async function DashboardBillingPage() {
  let history
  try {
    history = await getMerchantSubscriptionBillingHistory()
  } catch {
    history = { invoices: [], payments: [], totalPaid: 0, outstanding: 0 }
  }

  const { invoices, totalPaid, outstanding, payments } = history

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Billing &amp; payments</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Every Dexa POS subscription invoice for your account. Open one to view the details or download a PDF.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Total paid</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">{formatUsd(totalPaid)}</div><p className="text-xs text-muted-foreground">{payments.length} payment{payments.length === 1 ? '' : 's'}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Outstanding</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">{formatUsd(outstanding)}</div><p className="text-xs text-muted-foreground">Open / failed invoices</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Invoices</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">{invoices.length}</div><p className="text-xs text-muted-foreground">Last 200 shown</p></CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Invoice history</CardTitle></CardHeader>
        <CardContent className="px-0">
          {invoices.length === 0 ? (
            <p className="px-6 py-8 text-center text-sm text-muted-foreground">No invoices yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-4 py-2 font-medium">Invoice</th>
                    <th className="px-4 py-2 font-medium">Location</th>
                    <th className="px-4 py-2 font-medium">Period</th>
                    <th className="px-4 py-2 font-medium">Status</th>
                    <th className="px-4 py-2 text-right font-medium">Amount</th>
                    <th className="px-4 py-2 text-right font-medium">Date</th>
                    <th className="px-4 py-2 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((inv) => (
                    <tr key={inv.id} className="border-b last:border-0 hover:bg-muted/40">
                      <td className="px-4 py-3 font-medium text-foreground">{inv.invoiceNumber ?? '—'}</td>
                      <td className="px-4 py-3 text-muted-foreground">{inv.locationName ?? '—'}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {formatShortDateRange(inv.billingPeriodStart, inv.billingPeriodEnd) ?? '—'}
                      </td>
                      <td className="px-4 py-3"><StatusPill status={inv.status} /></td>
                      <td className="px-4 py-3 text-right font-medium">{formatUsd(inv.totalAmount)}</td>
                      <td className="px-4 py-3 text-right text-muted-foreground">
                        {inv.status === 'paid' && inv.paidAt ? formatLongDate(inv.paidAt) : formatLongDate(inv.createdAt)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-3">
                          {inv.publicToken ? (
                            <>
                              <Link
                                href={`/subscription-invoice/${inv.publicToken}`}
                                className="inline-flex items-center gap-1 text-primary hover:underline"
                                target="_blank"
                              >
                                <ExternalLink className="h-3.5 w-3.5" /> View
                              </Link>
                              <a
                                href={`/subscription-invoice/${inv.publicToken}/pdf`}
                                className="inline-flex items-center gap-1 text-primary hover:underline"
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                <Download className="h-3.5 w-3.5" /> PDF
                              </a>
                            </>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
