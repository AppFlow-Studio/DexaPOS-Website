'use client'

import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import {
  ChevronRight,
  Download,
  Eye,
  FileText,
  Loader2,
  Wallet,
} from 'lucide-react'
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
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  getMerchantSubscriptionInvoiceDocument,
  getMerchantSubscriptionOverview,
  type MerchantSubscriptionAssignmentViewRecord,
  type MerchantSubscriptionBillingProfileViewRecord,
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

function formatDate(value: string | null | undefined): string {
  if (!value) return '-'

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
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

function buildPaymentMethodLabel(profile: MerchantSubscriptionBillingProfileViewRecord | null): string {
  if (!profile) return 'No payment method on file'

  if (profile.billing_method === 'card') {
    const brand = profile.card_brand || 'Card'
    const suffix = profile.card_last_four ? `•••• ${profile.card_last_four}` : ''
    return [brand, suffix].filter(Boolean).join(' ')
  }

  const bank = profile.bank_name || 'Bank account'
  const suffix = profile.account_number_last_four ? `•••• ${profile.account_number_last_four}` : ''
  return [bank, suffix].filter(Boolean).join(' ')
}

function buildBillingContactLabel(profile: MerchantSubscriptionBillingProfileViewRecord | null): string {
  if (!profile) return '-'
  return profile.account_holder_name || profile.billing_email || '-'
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
  const [billingProfilesByLocationId, setBillingProfilesByLocationId] = useState<
    Record<string, MerchantSubscriptionBillingProfileViewRecord>
  >({})
  const [selectedLocationId, setSelectedLocationId] = useState('')
  const [invoicePreviewDocument, setInvoicePreviewDocument] = useState<SubscriptionInvoiceDocumentData | null>(null)
  const [isInvoicePreviewOpen, setIsInvoicePreviewOpen] = useState(false)
  const [isInvoicePreviewLoading, setIsInvoicePreviewLoading] = useState(false)
  const [invoiceActionId, setInvoiceActionId] = useState<string | null>(null)

  const invoicePreviewHtml = useMemo(
    () => (invoicePreviewDocument ? renderSubscriptionInvoiceHtml(invoicePreviewDocument) : ''),
    [invoicePreviewDocument],
  )

  const locationOptions = useMemo(
    () =>
      [...subscriptions]
        .sort((a, b) => a.location_name.localeCompare(b.location_name))
        .map((subscription) => ({
          id: subscription.location_id,
          name: subscription.location_name,
        })),
    [subscriptions],
  )

  const selectedLocation = useMemo(
    () => locationOptions.find((location) => location.id === selectedLocationId) ?? locationOptions[0] ?? null,
    [locationOptions, selectedLocationId],
  )

  const selectedSubscription = useMemo(
    () => subscriptions.find((subscription) => subscription.location_id === selectedLocation?.id) ?? null,
    [selectedLocation, subscriptions],
  )

  const selectedAssignments = useMemo(
    () => (selectedSubscription ? assignmentsBySubscriptionId[selectedSubscription.id] ?? [] : []),
    [assignmentsBySubscriptionId, selectedSubscription],
  )

  const selectedInvoices = useMemo(
    () => invoices.filter((invoice) => invoice.location_id === selectedLocation?.id),
    [invoices, selectedLocation],
  )

  const selectedBillingProfile = useMemo(
    () => (selectedLocation?.id ? billingProfilesByLocationId[selectedLocation.id] ?? null : null),
    [billingProfilesByLocationId, selectedLocation],
  )

  const transactionSummary = useMemo(() => {
    const paid = selectedInvoices
      .filter((invoice) => invoice.status === 'paid')
      .reduce((sum, invoice) => sum + Number(invoice.total_amount || 0), 0)

    const pending = selectedInvoices
      .filter((invoice) => ['open', 'processing', 'failed'].includes(invoice.status))
      .reduce((sum, invoice) => sum + Number(invoice.total_amount || 0), 0)

    return {
      paid,
      pending,
      count: selectedInvoices.length,
    }
  }, [selectedInvoices])

  const refresh = async () => {
    setIsLoading(true)
    try {
      const overview = await getMerchantSubscriptionOverview()
      setSubscriptions(overview.subscriptions)
      setInvoices(overview.invoices)
      setAssignmentsBySubscriptionId(overview.assignmentsBySubscriptionId)
      setBillingProfilesByLocationId(overview.billingProfilesByLocationId)
    } catch (error: any) {
      toast.error(error?.message || 'Failed to load subscription billing data.')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void refresh()
  }, [])

  useEffect(() => {
    if (!selectedLocationId && locationOptions[0]?.id) {
      setSelectedLocationId(locationOptions[0].id)
    }
  }, [locationOptions, selectedLocationId])

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
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>Billing</span>
          <ChevronRight className="h-4 w-4" />
          <span className="text-foreground">Manage Subscription</span>
        </div>
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Manage Subscription</h1>
          <p className="text-sm text-muted-foreground">
            Review your subscribed services, billing method, transactions, and invoice history by location.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader className="gap-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-2">
              <Label>Location</Label>
              <Select
                value={selectedLocation?.id || ''}
                onValueChange={setSelectedLocationId}
                disabled={isLoading || locationOptions.length === 0}
              >
                <SelectTrigger className="min-w-[260px]">
                  <SelectValue placeholder="Select location" />
                </SelectTrigger>
                <SelectContent>
                  {locationOptions.map((location) => (
                    <SelectItem key={location.id} value={location.id}>
                      {location.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {selectedSubscription ? (
              <Badge variant={statusVariant(selectedSubscription.status)} className="w-fit">
                {selectedSubscription.status}
              </Badge>
            ) : null}
          </div>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Subscription Details</CardTitle>
          <CardDescription>
            Current subscription state for {selectedLocation?.name || merchantName}.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-sm text-muted-foreground">Loading subscription details...</div>
          ) : !selectedSubscription ? (
            <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
              No active subscription exists for this location yet.
            </div>
          ) : (
            <div className="space-y-6">
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <div>
                  <div className="text-sm text-muted-foreground">Plan Status</div>
                  <div className="mt-1 text-2xl font-semibold capitalize">{selectedSubscription.status.replace('_', ' ')}</div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Services</div>
                  <div className="mt-1 text-2xl font-semibold">{selectedAssignments.length}</div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Price</div>
                  <div className="mt-1 text-2xl font-semibold">{formatMoney(selectedSubscription.monthly_amount)}/monthly</div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Next Billing Date</div>
                  <div className="mt-1 text-2xl font-semibold">{formatDate(selectedSubscription.next_billing_date)}</div>
                </div>
              </div>

              <div className="rounded-xl border">
                <div className="border-b px-5 py-4">
                  <div className="font-medium">Subscribed Services</div>
                </div>
                {selectedAssignments.length === 0 ? (
                  <div className="px-5 py-4 text-sm text-muted-foreground">
                    No services are currently assigned to this location.
                  </div>
                ) : (
                  <div className="divide-y">
                    {selectedAssignments.map((assignment) => (
                      <div key={assignment.id} className="grid gap-3 px-5 py-4 md:grid-cols-[minmax(0,1.2fr)_150px_150px_150px]">
                        <div>
                          <div className="font-medium">{assignment.display_name}</div>
                          <div className="text-xs text-muted-foreground">
                            {assignment.service_code} | {assignment.service_category} | {assignment.pricing_model}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs uppercase tracking-[0.08em] text-muted-foreground">Quantity</div>
                          <div className="mt-1 font-medium">
                            {assignment.pricing_model === 'flat' ? 'Included' : assignment.quantity}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs uppercase tracking-[0.08em] text-muted-foreground">Unit Price</div>
                          <div className="mt-1 font-medium">
                            {assignment.pricing_model === 'flat'
                              ? formatMoney(assignment.base_price_monthly)
                              : `${formatMoney(assignment.base_price_monthly)} / ${assignment.unit_label}`}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs uppercase tracking-[0.08em] text-muted-foreground">Billing Period</div>
                          <div className="mt-1 font-medium">
                            {formatDate(selectedSubscription.current_period_start)} - {formatDate(selectedSubscription.current_period_end)}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Payment Method</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-sm text-muted-foreground">Loading payment method...</div>
          ) : (
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div className="flex items-start gap-3">
                <div className="rounded-lg border p-2">
                  <Wallet className="h-5 w-5 text-muted-foreground" />
                </div>
                <div>
                  <div className="font-medium">{buildPaymentMethodLabel(selectedBillingProfile)}</div>
                  <div className="text-sm text-muted-foreground">
                    {selectedBillingProfile?.billing_method === 'card' && selectedBillingProfile?.card_exp_month && selectedBillingProfile?.card_exp_year
                      ? `Expires ${String(selectedBillingProfile.card_exp_month).padStart(2, '0')}/${selectedBillingProfile.card_exp_year}`
                      : selectedBillingProfile?.billing_method === 'ach'
                        ? 'Bank account on file'
                        : 'No payment method configured'}
                  </div>
                </div>
              </div>
              {selectedBillingProfile?.is_primary ? <Badge variant="outline">Default</Badge> : null}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Billing Information</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-sm text-muted-foreground">Loading billing information...</div>
          ) : (
            <div className="grid gap-4 md:grid-cols-3">
              <div>
                <div className="text-sm text-muted-foreground">Name</div>
                <div className="mt-1 font-medium">{buildBillingContactLabel(selectedBillingProfile)}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Email</div>
                <div className="mt-1 font-medium">{selectedBillingProfile?.billing_email || '-'}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Billing Cycle</div>
                <div className="mt-1 font-medium">Monthly</div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Transactions</CardTitle>
          <CardDescription>
            Payment activity tied to subscription invoices for this location.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-lg border p-4">
              <div className="text-sm text-muted-foreground">Collected</div>
              <div className="mt-1 text-2xl font-semibold">{formatMoney(transactionSummary.paid)}</div>
            </div>
            <div className="rounded-lg border p-4">
              <div className="text-sm text-muted-foreground">Pending</div>
              <div className="mt-1 text-2xl font-semibold">{formatMoney(transactionSummary.pending)}</div>
            </div>
            <div className="rounded-lg border p-4">
              <div className="text-sm text-muted-foreground">Transactions</div>
              <div className="mt-1 text-2xl font-semibold">{transactionSummary.count}</div>
            </div>
          </div>

          {isLoading ? (
            <div className="text-sm text-muted-foreground">Loading transactions...</div>
          ) : selectedInvoices.length === 0 ? (
            <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
              No subscription transactions for this location yet.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Invoice</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {selectedInvoices.map((invoice) => {
                  const activityDate = invoice.paid_at || invoice.last_payment_attempt_at || invoice.created_at
                  const reference = invoice.nmi_transaction_id || invoice.last_payment_error || '-'

                  return (
                    <TableRow key={`merchant-txn-${invoice.id}`}>
                      <TableCell>{formatDate(activityDate)}</TableCell>
                      <TableCell className="max-w-[300px] truncate text-muted-foreground">{reference}</TableCell>
                      <TableCell className="uppercase">{invoice.billing_method}</TableCell>
                      <TableCell>
                        <Badge variant={statusVariant(invoice.status)}>{invoice.status}</Badge>
                      </TableCell>
                      <TableCell className="font-medium">{invoice.invoice_number}</TableCell>
                      <TableCell className="text-right font-medium">{formatMoney(invoice.total_amount)}</TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Billing History
          </CardTitle>
          <CardDescription>
            View and download generated invoices for the selected location.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-sm text-muted-foreground">Loading invoices...</div>
          ) : selectedInvoices.length === 0 ? (
            <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
              No invoices have been generated for this location yet.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Invoice</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {selectedInvoices.map((invoice) => (
                  <TableRow key={invoice.id}>
                    <TableCell>{formatDate(invoice.created_at)}</TableCell>
                    <TableCell className="font-medium">{invoice.invoice_number}</TableCell>
                    <TableCell>
                      <Badge variant={statusVariant(invoice.status)}>{invoice.status}</Badge>
                    </TableCell>
                    <TableCell>
                      Subscription billing for {selectedLocation?.name || 'selected location'}
                    </TableCell>
                    <TableCell className="text-right font-medium">{formatMoney(invoice.total_amount)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
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
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
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
