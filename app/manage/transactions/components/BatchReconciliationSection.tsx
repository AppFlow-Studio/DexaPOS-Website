'use client'

import { useEffect, useMemo, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { AlertTriangle, Download, RefreshCcwDot } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
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
  PlatformMerchant,
  PlatformSettlementBatch,
  PlatformSettlementBatchFilters,
  PlatformSettlementBatchPayment,
} from '@/app/manage/actions/hq-platform/transactions'
import {
  usePlatformSettlementBatchPayments,
  usePlatformSettlementBatches,
} from '@/lib/queries/use-platform-analytics'
import { toast } from 'sonner'

const BATCH_STATUS_OPTIONS = ['open', 'closed', 'submitted', 'settled', 'funded'] as const

function formatCurrency(amount: number): string {
  return `$${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function formatDateOnly(dateValue?: string): string {
  if (!dateValue) return '-'
  return format(parseISO(dateValue), 'MMM d, yyyy')
}

function formatDateTime(dateValue?: string): string {
  if (!dateValue) return '-'
  return format(new Date(dateValue), 'MMM d, yyyy h:mm a')
}

/**
 * Display label for a batch. Prefer the host batch_number ("009") with the
 * acquirer prefix ("TSYS-009"); fall back to the legacy batch_id text only
 * for pre-Wave-A.1 rows where batch_number was never populated.
 */
function formatBatchLabel(batch: Pick<PlatformSettlementBatch, 'batch_number' | 'acquirer' | 'batch_id'>): string {
  if (batch.batch_number) {
    return batch.acquirer ? `${batch.acquirer}-${batch.batch_number}` : batch.batch_number
  }
  return batch.batch_id
}

function getStatusBadge(status: string) {
  const normalized = status.toLowerCase()

  if (normalized === 'open') {
    return <Badge variant="outline" className="border-amber-300 bg-amber-100 text-amber-800">Open</Badge>
  }
  if (normalized === 'closed') {
    return <Badge variant="outline" className="border-blue-300 bg-blue-100 text-blue-800">Closed</Badge>
  }
  if (normalized === 'submitted') {
    return <Badge variant="outline" className="border-purple-300 bg-purple-100 text-purple-800">Submitted</Badge>
  }
  if (normalized === 'settled') {
    return <Badge variant="outline" className="border-emerald-300 bg-emerald-100 text-emerald-800">Settled</Badge>
  }
  if (normalized === 'funded') {
    return <Badge variant="outline" className="border-green-300 bg-green-100 text-green-800">Funded</Badge>
  }

  return <Badge variant="outline">{status}</Badge>
}

function buildBatchExportCsv(batch: PlatformSettlementBatch, rows: PlatformSettlementBatchPayment[]): string {
  const headers = [
    'batch_id',
    'business_date',
    'merchant',
    'location',
    'batch_status',
    'batch_gross_amount',
    'linked_payment_amount',
    'discrepancy_amount',
    'payment_id',
    'order_number',
    'payment_method',
    'payment_status',
    'total_amount',
    'tip_amount',
    'refund_amount',
    'is_voided',
    'is_returned',
    'captured_at',
    'initiated_at',
  ]

  const bodyRows = rows.map((row) => [
    batch.batch_id,
    batch.business_date,
    batch.merchant_name,
    batch.location_name || '',
    batch.status,
    batch.gross_amount,
    batch.linked_payment_amount,
    batch.discrepancy_amount,
    row.payment_id,
    row.order_number || '',
    row.payment_method,
    row.payment_status,
    row.total_amount,
    row.tip_amount,
    row.refund_amount,
    row.is_voided ? 'yes' : 'no',
    row.is_returned ? 'yes' : 'no',
    row.captured_at || '',
    row.initiated_at || '',
  ])

  const allRows = [headers, ...bodyRows]
  return allRows
    .map((row) => row.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(','))
    .join('\n')
}

function downloadCsv(content: string, filename: string) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

export function BatchReconciliationSection({
  scopedMerchantId,
  renderBatchPayments,
}: {
  scopedMerchantId?: string
  renderBatchPayments?: (batch: PlatformSettlementBatch) => React.ReactNode
} = {}) {
  const [merchantId, setMerchantId] = useState(scopedMerchantId ?? 'all')
  const [status, setStatus] = useState('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null)
  const [merchants, setMerchants] = useState<PlatformMerchant[]>([])
  const [loadingMerchants, setLoadingMerchants] = useState(true)

  const filters = useMemo<PlatformSettlementBatchFilters>(() => ({
    merchantIds: merchantId !== 'all' ? [merchantId] : undefined,
    statuses: status !== 'all' ? [status] : undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    limit: 250,
  }), [merchantId, status, dateFrom, dateTo])

  const {
    data: batchesResult,
    isLoading: batchesLoading,
    isFetching: batchesFetching,
    refetch: refetchBatches,
  } = usePlatformSettlementBatches(filters)

  const batches = batchesResult?.data || []
  const batchErrorCode = batchesResult?.errorCode

  const selectedBatch = useMemo(
    () => batches.find((batch) => batch.id === selectedBatchId) || null,
    [batches, selectedBatchId]
  )

  // Pass the settlement_batches UUID. The RPC resolves it to the canonical
  // (batch_number, acquirer) tuple and joins on order_payments.batch_number,
  // so lazy-created rows ('LAZY-...' batch_id) link correctly.
  const {
    data: batchPaymentsResult,
    isLoading: batchPaymentsLoading,
    isFetching: batchPaymentsFetching,
    refetch: refetchBatchPayments,
  } = usePlatformSettlementBatchPayments(
    selectedBatch?.id || null,
    selectedBatch?.merchant_id,
    !!selectedBatch
  )

  const batchPayments = batchPaymentsResult?.data || []
  const batchPaymentsErrorCode = batchPaymentsResult?.errorCode

  useEffect(() => {
    let active = true
    setLoadingMerchants(true)

    getPlatformMerchants()
      .then((rows) => {
        if (!active) return
        setMerchants(rows)
      })
      .catch((error) => {
        console.error('[BatchReconciliationSection] Failed to load merchants:', error)
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
    if (!selectedBatchId) return
    if (!batches.some((batch) => batch.id === selectedBatchId)) {
      setSelectedBatchId(null)
    }
  }, [batches, selectedBatchId])

  const clearFilters = () => {
    if (!scopedMerchantId) setMerchantId('all')
    setStatus('all')
    setDateFrom('')
    setDateTo('')
    setSelectedBatchId(null)
  }

  const handleRefresh = async () => {
    await refetchBatches()
    if (selectedBatch) {
      await refetchBatchPayments()
    }
  }

  const handleBatchExport = () => {
    if (!selectedBatch) {
      toast.info('Select a batch first.')
      return
    }

    if (batchPayments.length === 0) {
      toast.info('No linked payments to export for this batch.')
      return
    }

    const csv = buildBatchExportCsv(selectedBatch, batchPayments)
    const filename = `DEXA_Batch_${formatBatchLabel(selectedBatch)}_${selectedBatch.business_date}.csv`
    downloadCsv(csv, filename)
    toast.success(`Exported ${batchPayments.length.toLocaleString()} payment rows.`)
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>Batch Reconciliation</CardTitle>
            <CardDescription>
              Compare settlement batches against linked order payments and flag mismatches.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => void handleRefresh()} disabled={batchesFetching || batchPaymentsFetching}>
              <RefreshCcwDot className="mr-2 h-4 w-4" />
              Refresh
            </Button>
            <Button variant="outline" onClick={handleBatchExport} disabled={!selectedBatch}>
              <Download className="mr-2 h-4 w-4" />
              Export Selected Batch
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className={scopedMerchantId ? 'grid gap-3 md:grid-cols-4' : 'grid gap-3 md:grid-cols-5'}>
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
            <span className="text-muted-foreground">Batch Status</span>
            <select
              className="h-9 rounded-md border bg-background px-2"
              value={status}
              onChange={(event) => setStatus(event.target.value)}
            >
              <option value="all">All statuses</option>
              {BATCH_STATUS_OPTIONS.map((statusOption) => (
                <option key={statusOption} value={statusOption}>
                  {statusOption}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted-foreground">Date From</span>
            <Input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted-foreground">Date To</span>
            <Input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
          </label>

          <div className="flex items-end">
            <Button variant="ghost" onClick={clearFilters} className="w-full">
              Clear Filters
            </Button>
          </div>
        </div>

        {batchErrorCode && (
          <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
            Batch reconciliation data unavailable (apply migration `027_adm_016_batch_reconciliation_rpc.sql`).
            {` Error: ${batchErrorCode}`}
          </div>
        )}

        <Table containerClassName="max-h-[42vh] overflow-auto rounded-md border">
          <TableHeader className="sticky top-0 z-20 bg-card">
            <TableRow>
              <TableHead>Batch</TableHead>
              <TableHead>Merchant</TableHead>
              <TableHead>Business Date</TableHead>
              <TableHead>Opened</TableHead>
              <TableHead>Closed</TableHead>
              <TableHead className="text-right">Txns</TableHead>
              <TableHead className="text-right">Gross</TableHead>
              <TableHead className="text-right">Tip</TableHead>
              <TableHead className="text-right">Refund</TableHead>
              <TableHead className="text-right">Net Deposit</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Discrepancy</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {batchesLoading ? (
              Array.from({ length: 6 }).map((_, idx) => (
                <TableRow key={`batch-loading-${idx}`}>
                  {Array.from({ length: 12 }).map((__, cellIdx) => (
                    <TableCell key={`batch-loading-${idx}-${cellIdx}`}>
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : batches.length === 0 ? (
              <TableRow>
                <TableCell colSpan={12} className="py-8 text-center text-muted-foreground">
                  No settlement batches match current filters.
                </TableCell>
              </TableRow>
            ) : (
              batches.map((batch) => (
                <TableRow
                  key={batch.id}
                  className={`cursor-pointer ${selectedBatchId === batch.id ? 'bg-muted/30' : ''}`}
                  onClick={() => setSelectedBatchId(batch.id)}
                >
                  <TableCell className="font-mono text-xs">{formatBatchLabel(batch)}</TableCell>
                  <TableCell>
                    <div className="font-medium">{batch.merchant_name}</div>
                    <div className="text-xs text-muted-foreground">{batch.location_name || 'No location'}</div>
                  </TableCell>
                  <TableCell>{formatDateOnly(batch.business_date)}</TableCell>
                  <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{formatDateTime(batch.opened_at)}</TableCell>
                  <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{formatDateTime(batch.closed_at)}</TableCell>
                  <TableCell className="text-right font-mono">{batch.transaction_count.toLocaleString()}</TableCell>
                  <TableCell className="text-right font-mono">{formatCurrency(batch.gross_amount)}</TableCell>
                  <TableCell className="text-right font-mono">{formatCurrency(batch.tip_amount)}</TableCell>
                  <TableCell className="text-right font-mono">{formatCurrency(batch.refund_amount)}</TableCell>
                  <TableCell className="text-right font-mono">{formatCurrency(batch.net_deposit)}</TableCell>
                  <TableCell>{getStatusBadge(batch.status)}</TableCell>
                  <TableCell className="text-right">
                    {batch.has_discrepancy ? (
                      <Badge variant="outline" className="border-red-300 bg-red-100 text-red-800">
                        <AlertTriangle className="mr-1 h-3 w-3" />
                        {formatCurrency(batch.discrepancy_amount)}
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="border-green-300 bg-green-100 text-green-800">
                        Matched
                      </Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>

        {selectedBatch && (
          <div className="space-y-3 rounded-md border p-3">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-medium">Selected batch:</span>
              <Badge variant="outline" className="font-mono text-xs">{formatBatchLabel(selectedBatch)}</Badge>
              <span className="text-muted-foreground">Linked payments:</span>
              <span className="font-medium">{selectedBatch.linked_payment_count.toLocaleString()}</span>
              <span className="text-muted-foreground">Linked amount:</span>
              <span className="font-medium">{formatCurrency(selectedBatch.linked_payment_amount)}</span>
              <span className="text-muted-foreground">Batch gross:</span>
              <span className="font-medium">{formatCurrency(selectedBatch.gross_amount)}</span>
            </div>

            {batchPaymentsErrorCode && (
              <div className="rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-800">
                Batch payment details unavailable. Error: {batchPaymentsErrorCode}
              </div>
            )}

            {renderBatchPayments ? (
              renderBatchPayments(selectedBatch)
            ) : (
            <Table containerClassName="max-h-[32vh] overflow-auto rounded-md border">
              <TableHeader className="sticky top-0 z-20 bg-card">
                <TableRow>
                  <TableHead>Order #</TableHead>
                  <TableHead>Payment ID</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Tip</TableHead>
                  <TableHead className="text-right">Refund</TableHead>
                  <TableHead>Flags</TableHead>
                  <TableHead>Captured</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {batchPaymentsLoading ? (
                  Array.from({ length: 4 }).map((_, idx) => (
                    <TableRow key={`payment-loading-${idx}`}>
                      {Array.from({ length: 9 }).map((__, cellIdx) => (
                        <TableCell key={`payment-loading-${idx}-${cellIdx}`}>
                          <Skeleton className="h-4 w-full" />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : batchPayments.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="py-6 text-center text-muted-foreground">
                      No payments linked to this batch.
                    </TableCell>
                  </TableRow>
                ) : (
                  batchPayments.map((payment) => (
                    <TableRow key={payment.payment_id}>
                      <TableCell className="font-mono text-xs">{payment.order_number || '-'}</TableCell>
                      <TableCell className="font-mono text-xs">{payment.payment_id}</TableCell>
                      <TableCell>{payment.payment_method}</TableCell>
                      <TableCell>{payment.payment_status}</TableCell>
                      <TableCell className="text-right font-mono">{formatCurrency(payment.total_amount)}</TableCell>
                      <TableCell className="text-right font-mono">{formatCurrency(payment.tip_amount)}</TableCell>
                      <TableCell className="text-right font-mono">{formatCurrency(payment.refund_amount)}</TableCell>
                      <TableCell className="text-xs">
                        {payment.is_voided || payment.is_returned
                          ? `${payment.is_voided ? 'Void' : ''}${payment.is_voided && payment.is_returned ? ' / ' : ''}${payment.is_returned ? 'Returned' : ''}`
                          : '-'}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                        {formatDateTime(payment.captured_at || payment.initiated_at)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
