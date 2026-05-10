'use client'

import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { CalendarDays, Download, Eye, FileText, Loader2, Store } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  getMerchantSubscriptionInvoiceDocument,
  getMerchantSubscriptionOverview,
  type MerchantSubscriptionAssignmentViewRecord,
  type MerchantSubscriptionInvoiceViewRecord,
  type MerchantSubscriptionViewRecord,
} from '@/app/dashboard/actions/subscription-billing'
import {
  renderSubscriptionInvoiceHtml,
  type SubscriptionInvoiceDocumentData,
} from '@/lib/subscription-billing/invoice-template'
import { downloadSubscriptionInvoicePdf } from '@/lib/subscription-billing/invoice-pdf'

interface MerchantSubscriptionOverviewCardProps {
  merchantName: string
}

function formatMoney(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount)
}

function statusVariant(status: string): 'default' | 'secondary' | 'outline' | 'destructive' {
  switch (status) {
    case 'active':
    case 'paid':
      return 'default'
    case 'trial':
    case 'open':
    case 'processing':
      return 'outline'
    case 'past_due':
    case 'failed':
    case 'suspended':
      return 'destructive'
    default:
      return 'secondary'
  }
}

export function MerchantSubscriptionOverviewCard({
  merchantName,
}: MerchantSubscriptionOverviewCardProps) {
  const [isLoading, setIsLoading] = useState(true)
  const [subscriptions, setSubscriptions] = useState<MerchantSubscriptionViewRecord[]>([])
  const [invoices, setInvoices] = useState<MerchantSubscriptionInvoiceViewRecord[]>([])
  const [assignmentsBySubscriptionId, setAssignmentsBySubscriptionId] = useState<
    Record<string, MerchantSubscriptionAssignmentViewRecord[]>
  >({})
  const [invoicePreviewDocument, setInvoicePreviewDocument] = useState<SubscriptionInvoiceDocumentData | null>(null)
  const [isInvoicePreviewOpen, setIsInvoicePreviewOpen] = useState(false)
  const [isInvoicePreviewLoading, setIsInvoicePreviewLoading] = useState(false)
  const [invoiceActionId, setInvoiceActionId] = useState<string | null>(null)

  const invoicePreviewHtml = useMemo(
    () => (invoicePreviewDocument ? renderSubscriptionInvoiceHtml(invoicePreviewDocument) : ''),
    [invoicePreviewDocument],
  )

  const refresh = async () => {
    setIsLoading(true)
    try {
      const overview = await getMerchantSubscriptionOverview()
      setSubscriptions(overview.subscriptions)
      setInvoices(overview.invoices)
      setAssignmentsBySubscriptionId(overview.assignmentsBySubscriptionId)
    } catch (error: any) {
      toast.error(error?.message || 'Failed to load subscription billing data.')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void refresh()
  }, [])

  const loadInvoiceDocument = async (invoiceId: string): Promise<SubscriptionInvoiceDocumentData | null> => {
    setInvoiceActionId(invoiceId)
    const result = await getMerchantSubscriptionInvoiceDocument(invoiceId)
    setInvoiceActionId(null)

    if (!result.success || !result.document) {
      toast.error(result.error || 'Failed to load invoice document.')
      return null
    }

    return result.document
  }

  const handlePreviewInvoice = async (invoiceId: string) => {
    setIsInvoicePreviewLoading(true)
    const document = await loadInvoiceDocument(invoiceId)
    if (document) {
      setInvoicePreviewDocument(document)
      setIsInvoicePreviewOpen(true)
    }
    setIsInvoicePreviewLoading(false)
  }

  const handleDownloadInvoice = async (invoiceId: string) => {
    const document = await loadInvoiceDocument(invoiceId)
    if (!document) return

    try {
      await downloadSubscriptionInvoicePdf(document)
    } catch (error: any) {
      toast.error(error?.message || 'Failed to download invoice.')
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Subscriptions</h2>
        <p className="text-sm text-muted-foreground">
          Read-only subscription billing view for {merchantName}. Each location can have its own subscription,
          assigned services, and invoice history.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Store className="h-5 w-5" />
            Location Subscriptions
          </CardTitle>
          <CardDescription>
            Per-location subscription status, assigned services, billing method, and recurring amount.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {isLoading ? (
            <div className="text-sm text-muted-foreground">Loading subscriptions...</div>
          ) : subscriptions.length === 0 ? (
            <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
              No subscriptions have been created for this merchant yet.
            </div>
          ) : (
            subscriptions.map((subscription) => {
              const assignmentSummary = assignmentsBySubscriptionId[subscription.id] ?? []

              return (
                <div key={subscription.id} className="rounded-lg border p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="font-medium">{subscription.location_name}</div>
                      <div className="text-xs text-muted-foreground">
                        {assignmentSummary.length} assigned service{assignmentSummary.length === 1 ? '' : 's'}
                      </div>
                    </div>
                    <Badge variant={statusVariant(subscription.status)}>{subscription.status}</Badge>
                  </div>
                  <div className="mt-3 grid gap-1 text-sm text-muted-foreground">
                    <div>Monthly amount: {formatMoney(subscription.monthly_amount)}</div>
                    <div>Billing method: {subscription.billing_method || 'No primary profile'}</div>
                    <div>
                      Period: {subscription.current_period_start} to {subscription.current_period_end}
                    </div>
                    <div>Next billing date: {subscription.next_billing_date}</div>
                  </div>
                  {assignmentSummary.length > 0 ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {assignmentSummary.map((assignment) => (
                        <Badge key={assignment.id} variant="secondary">
                          {assignment.display_name} x {assignment.quantity}
                        </Badge>
                      ))}
                    </div>
                  ) : null}
                </div>
              )
            })
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Generated Invoices
          </CardTitle>
          <CardDescription>
            View and download the invoices generated for your subscribed locations.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-sm text-muted-foreground">Loading invoices...</div>
          ) : invoices.length === 0 ? (
            <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
              No subscription invoices have been generated yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="py-2 pr-4 font-medium">Invoice</th>
                    <th className="py-2 pr-4 font-medium">Location</th>
                    <th className="py-2 pr-4 font-medium">Period</th>
                    <th className="py-2 pr-4 font-medium">Method</th>
                    <th className="py-2 pr-4 font-medium">Total</th>
                    <th className="py-2 pr-4 font-medium">Status</th>
                    <th className="py-2 pr-4 font-medium">Due</th>
                    <th className="py-2 pr-4 font-medium">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((invoice) => (
                    <tr key={invoice.id} className="border-b last:border-0">
                      <td className="py-3 pr-4 font-medium">{invoice.invoice_number}</td>
                      <td className="py-3 pr-4">{invoice.location_name}</td>
                      <td className="py-3 pr-4">
                        <div className="flex items-center gap-2">
                          <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" />
                          <span>
                            {invoice.billing_period_start} to {invoice.billing_period_end}
                          </span>
                        </div>
                      </td>
                      <td className="py-3 pr-4 uppercase">{invoice.billing_method}</td>
                      <td className="py-3 pr-4">{formatMoney(invoice.total_amount)}</td>
                      <td className="py-3 pr-4">
                        <Badge variant={statusVariant(invoice.status)}>{invoice.status}</Badge>
                      </td>
                      <td className="py-3 pr-4">{invoice.due_date}</td>
                      <td className="py-3 pr-4">
                        <div className="flex flex-wrap items-center gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handlePreviewInvoice(invoice.id)}
                            disabled={isInvoicePreviewLoading}
                          >
                            {isInvoicePreviewLoading && invoiceActionId === invoice.id ? (
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                              <Eye className="mr-2 h-4 w-4" />
                            )}
                            View
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => handleDownloadInvoice(invoice.id)}>
                            {invoiceActionId === invoice.id && !isInvoicePreviewLoading ? (
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                              <Download className="mr-2 h-4 w-4" />
                            )}
                            Download
                          </Button>
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

      <Dialog open={isInvoicePreviewOpen} onOpenChange={setIsInvoicePreviewOpen}>
        <DialogContent className="max-w-5xl">
          <DialogHeader>
            <DialogTitle>Invoice Preview</DialogTitle>
            <DialogDescription>
              Preview the customer-facing subscription invoice layout before downloading it.
            </DialogDescription>
          </DialogHeader>
          {invoicePreviewDocument ? (
            <div className="overflow-hidden rounded-md border">
              <iframe
                title="Subscription invoice preview"
                srcDoc={invoicePreviewHtml}
                className="h-[720px] w-full bg-white"
              />
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">No invoice selected.</div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
