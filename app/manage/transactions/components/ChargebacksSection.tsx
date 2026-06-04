'use client'

import { Fragment, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { format } from 'date-fns'
import { AlertTriangle, ChevronDown, ChevronUp, RefreshCcwDot, ShieldAlert } from 'lucide-react'
import { InfoIcon } from '@/components/ui/info-icon'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  getPlatformMerchants,
  PlatformChargebackFilters,
  PlatformMerchant,
} from '@/app/manage/actions/hq-platform/transactions'
import {
  PLATFORM_CHARGEBACK_STATUSES,
  type PlatformChargebackStatus,
} from '@/app/manage/actions/hq-platform/transactions-shared'
import { usePlatformChargebacks } from '@/lib/queries/use-platform-analytics'

const PAGE_SIZE = 25
const CARD_NETWORK_OPTIONS = ['visa', 'mastercard', 'amex', 'discover', 'other'] as const
const OPEN_CHARGEBACK_STATUSES = new Set(['notified', 'under_review', 'defended'])

function formatCurrency(amount: number): string {
  return `$${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function formatDateTime(value?: string): string {
  if (!value) return '-'
  return format(new Date(value), 'MMM d, yyyy h:mm a')
}

function formatStatusLabel(value: string): string {
  return value
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function getStatusBadge(status: string) {
  const normalized = status.toLowerCase()

  if (normalized === 'notified') {
    return <Badge variant="outline" className="border-amber-300 bg-amber-100 text-amber-800">Notified</Badge>
  }
  if (normalized === 'under_review') {
    return <Badge variant="outline" className="border-blue-300 bg-blue-100 text-blue-800">Under Review</Badge>
  }
  if (normalized === 'defended') {
    return <Badge variant="outline" className="border-purple-300 bg-purple-100 text-purple-800">Defended</Badge>
  }
  if (normalized === 'won') {
    return <Badge variant="outline" className="border-emerald-300 bg-emerald-100 text-emerald-800">Won</Badge>
  }
  if (normalized === 'lost') {
    return <Badge variant="outline" className="border-red-300 bg-red-100 text-red-800">Lost</Badge>
  }
  if (normalized === 'expired') {
    return <Badge variant="outline" className="border-gray-300 bg-gray-100 text-gray-700">Expired</Badge>
  }

  return <Badge variant="outline">{formatStatusLabel(status)}</Badge>
}

function getDefendableBadge(defendable: boolean) {
  if (defendable) {
    return <Badge variant="outline" className="border-emerald-300 bg-emerald-100 text-emerald-800">Yes</Badge>
  }
  return <Badge variant="outline" className="border-gray-300 bg-gray-100 text-gray-700">No</Badge>
}

function getDeadlineBadge(deadline?: string, status?: string) {
  if (!deadline) {
    return <span className="text-muted-foreground">-</span>
  }

  const deadlineDate = new Date(deadline)
  const now = Date.now()
  const diffMs = deadlineDate.getTime() - now
  const isOpen = status ? OPEN_CHARGEBACK_STATUSES.has(status.toLowerCase()) : true

  const dateLabel = formatDateTime(deadline)

  if (!isOpen) {
    return <span className="text-xs text-muted-foreground">{dateLabel}</span>
  }

  if (diffMs <= 0) {
    return (
      <Badge variant="outline" className="border-red-300 bg-red-100 text-red-800">
        Overdue
      </Badge>
    )
  }

  if (diffMs <= 72 * 60 * 60 * 1000) {
    const hoursLeft = Math.ceil(diffMs / (60 * 60 * 1000))
    const relative = hoursLeft < 24 ? `${hoursLeft}h left` : `${Math.ceil(hoursLeft / 24)}d left`
    return (
      <div className="flex flex-col gap-1">
        <Badge variant="outline" className="w-fit border-amber-300 bg-amber-100 text-amber-800">
          {relative}
        </Badge>
        <span className="text-xs text-muted-foreground">{dateLabel}</span>
      </div>
    )
  }

  return <span className="text-xs">{dateLabel}</span>
}

export function ChargebacksSection({
  scopedMerchantId,
  defaultOpen = false,
}: { scopedMerchantId?: string; defaultOpen?: boolean } = {}) {
  const [open, setOpen] = useState(defaultOpen)
  const [merchantId, setMerchantId] = useState(scopedMerchantId ?? 'all')
  const [status, setStatus] = useState<'all' | PlatformChargebackStatus>('all')
  const [cardNetwork, setCardNetwork] = useState('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [page, setPage] = useState(1)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [merchants, setMerchants] = useState<PlatformMerchant[]>([])
  const [loadingMerchants, setLoadingMerchants] = useState(true)

  const filters = useMemo<PlatformChargebackFilters>(
    () => ({
      merchantIds: merchantId !== 'all' ? [merchantId] : undefined,
      statuses: status === 'all' ? undefined : [status],
      cardNetworks: cardNetwork !== 'all' ? [cardNetwork] : undefined,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
    }),
    [merchantId, status, cardNetwork, dateFrom, dateTo]
  )

  useEffect(() => {
    let active = true
    setLoadingMerchants(true)

    getPlatformMerchants()
      .then((rows) => {
        if (!active) return
        setMerchants(rows)
      })
      .catch((error) => {
        console.error('[ChargebacksSection] Failed to load merchants:', error)
      })
      .finally(() => {
        if (!active) return
        setLoadingMerchants(false)
      })

    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    setPage(1)
    setExpandedId(null)
  }, [merchantId, status, cardNetwork, dateFrom, dateTo])

  const {
    data: chargebacksResult,
    isLoading,
    isFetching,
    refetch,
  } = usePlatformChargebacks(filters, PAGE_SIZE, (page - 1) * PAGE_SIZE)

  const rows = chargebacksResult?.data || []
  const total = chargebacksResult?.total || 0
  const pendingCount = chargebacksResult?.pendingCount || 0
  const urgentCount = chargebacksResult?.urgentCount || 0
  const errorCode = chargebacksResult?.errorCode
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const showingFrom = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1
  const showingTo = total === 0 ? 0 : Math.min((page - 1) * PAGE_SIZE + rows.length, total)

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages)
    }
  }, [page, totalPages])

  const clearFilters = () => {
    if (!scopedMerchantId) setMerchantId('all')
    setStatus('all')
    setCardNetwork('all')
    setDateFrom('')
    setDateTo('')
    setPage(1)
    setExpandedId(null)
  }

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <ShieldAlert className="h-4 w-4" />
                Chargebacks
                <InfoIcon tip="A chargeback is when a customer disputes a charge with their bank. The bank reverses the transaction and the merchant must defend it or lose the funds. Each dispute has a deadline — missing it forfeits the right to contest." />
              </CardTitle>
              <CardDescription>
                Review disputes, deadlines, and defense status across merchants.
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1">
                <Badge variant="outline">{pendingCount.toLocaleString()} pending/notified</Badge>
                <InfoIcon tip="Chargebacks that are awaiting action — either just received (Notified) or actively being reviewed. These require attention before their defense deadline." side="left" />
              </span>
              <Badge variant="outline">{total.toLocaleString()} total</Badge>
              <CollapsibleTrigger asChild>
                <Button variant="outline" size="sm">
                  {open ? (
                    <>
                      Hide
                      <ChevronUp className="ml-2 h-4 w-4" />
                    </>
                  ) : (
                    <>
                      Show
                      <ChevronDown className="ml-2 h-4 w-4" />
                    </>
                  )}
                </Button>
              </CollapsibleTrigger>
            </div>
          </div>
        </CardHeader>

        <CollapsibleContent>
          <CardContent className="space-y-4">
            {urgentCount > 0 && (
              <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">
                <div className="flex items-center gap-2 font-medium">
                  <AlertTriangle className="h-4 w-4" />
                  {urgentCount.toLocaleString()} chargeback deadline(s) due within 72 hours.
                </div>
              </div>
            )}

            <div className={scopedMerchantId ? 'grid gap-3 grid-cols-2 lg:grid-cols-5' : 'grid gap-3 grid-cols-2 lg:grid-cols-6'}>
              {!scopedMerchantId && (
                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-muted-foreground">Merchant</span>
                  <select
                    className="h-9 rounded-md border bg-background px-2"
                    value={merchantId}
                    onChange={(event) => setMerchantId(event.target.value)}
                    disabled={loadingMerchants}
                  >
                    <option value="all">All merchants</option>
                    {merchants.map((merchant) => (
                      <option key={merchant.id} value={merchant.id}>
                        {merchant.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              <label className="flex flex-col gap-1 text-sm">
                <span className="text-muted-foreground">Status</span>
                <select
                  className="h-9 rounded-md border bg-background px-2"
                  value={status}
                  onChange={(event) => setStatus(event.target.value as 'all' | PlatformChargebackStatus)}
                >
                  <option value="all">All statuses</option>
                  {PLATFORM_CHARGEBACK_STATUSES.map((statusValue) => (
                    <option key={statusValue} value={statusValue}>
                      {formatStatusLabel(statusValue)}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col gap-1 text-sm">
                <span className="text-muted-foreground">Card Network</span>
                <select
                  className="h-9 rounded-md border bg-background px-2"
                  value={cardNetwork}
                  onChange={(event) => setCardNetwork(event.target.value)}
                >
                  <option value="all">All networks</option>
                  {CARD_NETWORK_OPTIONS.map((network) => (
                    <option key={network} value={network}>
                      {network.toUpperCase()}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col gap-1 text-sm">
                <span className="text-muted-foreground">Received From</span>
                <Input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
              </label>

              <label className="flex flex-col gap-1 text-sm">
                <span className="text-muted-foreground">Received To</span>
                <Input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
              </label>

              <div className="flex items-end gap-2 col-span-2 lg:col-span-1">
                <Button variant="outline" className="w-full" onClick={() => void refetch()} disabled={isFetching}>
                  <RefreshCcwDot className="mr-2 h-4 w-4" />
                  Refresh
                </Button>
                <Button variant="ghost" className="w-full" onClick={clearFilters}>
                  Clear
                </Button>
              </div>
            </div>

            {errorCode && (
              <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
                Chargeback data unavailable. Check table access and schema. {`Error: ${errorCode}`}
              </div>
            )}

            <Table containerClassName="max-h-[44vh] overflow-auto rounded-md border">
              <TableHeader className="sticky top-0 z-20 bg-card">
                <TableRow>
                  <TableHead>
                    <span className="inline-flex items-center gap-1">Chargeback ID <InfoIcon tip="The ID of the original payment being disputed. Click to view that transaction in the payments table." side="bottom" /></span>
                  </TableHead>
                  {!scopedMerchantId && <TableHead>Merchant</TableHead>}
                  <TableHead className="text-right">
                    <span className="inline-flex items-center justify-end gap-1">Amount <InfoIcon tip="The amount being disputed by the cardholder." side="bottom" /></span>
                  </TableHead>
                  <TableHead>
                    <span className="inline-flex items-center gap-1">Reason Code <InfoIcon tip="The card network's standardized code for the dispute type (e.g. 4853 = Cardholder Dispute, 4837 = No Cardholder Authorization)." side="bottom" /></span>
                  </TableHead>
                  <TableHead>Reason Description</TableHead>
                  <TableHead>Card Network</TableHead>
                  <TableHead>
                    <span className="inline-flex items-center gap-1">Status <InfoIcon tip="Notified: bank has filed the dispute. Under Review: being investigated. Defended: merchant submitted evidence. Won: merchant kept funds. Lost: funds reversed to cardholder." side="bottom" /></span>
                  </TableHead>
                  <TableHead>
                    <span className="inline-flex items-center gap-1">Defendable <InfoIcon tip="Whether there is enough evidence (receipt, EMV data, cardholder signature) to submit a defense before the deadline." side="bottom" /></span>
                  </TableHead>
                  <TableHead>
                    <span className="inline-flex items-center gap-1">Defense Deadline <InfoIcon tip="The final date to submit defense evidence to the card network. Missing this date permanently forfeits the merchant's right to contest the dispute." side="bottom" /></span>
                  </TableHead>
                  <TableHead>Received</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading || isFetching ? (
                  Array.from({ length: 6 }).map((_, rowIndex) => (
                    <TableRow key={`chargeback-loading-${rowIndex}`}>
                      {Array.from({ length: scopedMerchantId ? 9 : 10 }).map((__, cellIndex) => (
                        <TableCell key={`chargeback-loading-${rowIndex}-${cellIndex}`}>
                          <Skeleton className="h-4 w-full" />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={scopedMerchantId ? 9 : 10} className="py-8 text-center text-muted-foreground">
                      No chargebacks found for current filters.
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((row) => {
                    const isExpanded = expandedId === row.id

                    return (
                      <Fragment key={row.id}>
                        <TableRow
                          className={`cursor-pointer ${isExpanded ? 'bg-muted/30' : ''}`}
                          onClick={() => setExpandedId((current) => (current === row.id ? null : row.id))}
                        >
                          <TableCell className="font-mono text-xs">
                            <Link
                              href={`/manage/transactions?search=${encodeURIComponent(row.original_payment_id)}`}
                              className="underline-offset-2 hover:underline"
                              onClick={(event) => event.stopPropagation()}
                            >
                              {row.original_payment_id}
                            </Link>
                          </TableCell>
                          {!scopedMerchantId && (
                            <TableCell>{row.merchant_name || row.merchant_id}</TableCell>
                          )}
                          <TableCell className="text-right font-mono">{formatCurrency(row.amount)}</TableCell>
                          <TableCell className="font-mono text-xs">{row.reason_code}</TableCell>
                          <TableCell className="max-w-[280px] truncate">{row.reason_description || '-'}</TableCell>
                          <TableCell>{row.card_network ? row.card_network.toUpperCase() : '-'}</TableCell>
                          <TableCell>{getStatusBadge(row.status)}</TableCell>
                          <TableCell>{getDefendableBadge(row.defendable)}</TableCell>
                          <TableCell>{getDeadlineBadge(row.defense_deadline, row.status)}</TableCell>
                          <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                            {formatDateTime(row.received_at)}
                          </TableCell>
                        </TableRow>

                        {isExpanded && (
                          <TableRow className="bg-muted/10">
                            <TableCell colSpan={scopedMerchantId ? 9 : 10}>
                              <div className="grid gap-4 lg:grid-cols-3">
                                <div className="space-y-2 rounded-md border p-3">
                                  <h4 className="text-sm font-semibold">Original Payment</h4>
                                  {row.original_payment ? (
                                    <div className="space-y-1 text-sm">
                                      <div><span className="text-muted-foreground">Payment ID:</span> <span className="font-mono text-xs">{row.original_payment.payment_id}</span></div>
                                      <div><span className="text-muted-foreground">Order #:</span> {row.original_payment.order_number || '-'}</div>
                                      <div><span className="text-muted-foreground">Customer:</span> {row.original_payment.customer_name || 'Walk-in'}</div>
                                      <div><span className="text-muted-foreground">Method:</span> {row.original_payment.payment_method || '-'}</div>
                                      <div><span className="text-muted-foreground">Status:</span> {row.original_payment.payment_status || '-'}</div>
                                      <div><span className="text-muted-foreground">Amount:</span> {formatCurrency(row.original_payment.total_amount)}</div>
                                      <div><span className="text-muted-foreground">Card Last 4:</span> {row.original_payment.card_last_four ? `****${row.original_payment.card_last_four}` : '-'}</div>
                                      <div><span className="text-muted-foreground">Auth Code:</span> {row.original_payment.authorization_code || '-'}</div>
                                      <div><span className="text-muted-foreground">Reference #:</span> {row.original_payment.reference_number || '-'}</div>
                                    </div>
                                  ) : (
                                    <div className="text-sm text-muted-foreground">
                                      Original payment details unavailable.
                                    </div>
                                  )}
                                </div>

                                <div className="space-y-2 rounded-md border p-3">
                                  <h4 className="text-sm font-semibold">Defense Documents</h4>
                                  {row.defense_documents.length === 0 ? (
                                    <p className="text-sm text-muted-foreground">No defense documents attached.</p>
                                  ) : (
                                    <div className="space-y-2">
                                      {row.defense_documents.map((doc, index) => (
                                        <div key={`${row.id}-doc-${index}`} className="rounded border p-2 text-sm">
                                          <div className="font-medium">{doc.name}</div>
                                          {doc.url ? (
                                            <a
                                              href={doc.url}
                                              target="_blank"
                                              rel="noreferrer"
                                              className="text-xs text-blue-700 underline-offset-2 hover:underline"
                                            >
                                              Open document
                                            </a>
                                          ) : (
                                            <div className="text-xs text-muted-foreground">No URL provided</div>
                                          )}
                                          {doc.uploaded_at && (
                                            <div className="text-xs text-muted-foreground">
                                              Uploaded: {formatDateTime(doc.uploaded_at)}
                                            </div>
                                          )}
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>

                                <div className="space-y-2 rounded-md border p-3">
                                  <h4 className="text-sm font-semibold">Resolution</h4>
                                  <div className="space-y-1 text-sm">
                                    <div><span className="text-muted-foreground">PSP Reference:</span> {row.dispute_psp_reference || '-'}</div>
                                    <div><span className="text-muted-foreground">Defense Submitted:</span> {formatDateTime(row.defense_submitted_at)}</div>
                                    <div><span className="text-muted-foreground">Resolved At:</span> {formatDateTime(row.resolved_at)}</div>
                                    <div><span className="text-muted-foreground">Resolution:</span> {row.resolution || '-'}</div>
                                    <div><span className="text-muted-foreground">Resolution Amount:</span> {row.resolution_amount ? formatCurrency(row.resolution_amount) : '-'}</div>
                                  </div>
                                </div>
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </Fragment>
                    )
                  })
                )}
              </TableBody>
            </Table>

            <div className="flex flex-col gap-2 text-sm text-muted-foreground md:flex-row md:items-center md:justify-between">
              <span>
                Showing {showingFrom.toLocaleString()}-{showingTo.toLocaleString()} of {total.toLocaleString()}
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                >
                  Previous
                </Button>
                <span>
                  Page {page.toLocaleString()} of {totalPages.toLocaleString()}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                >
                  Next
                </Button>
              </div>
            </div>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  )
}
