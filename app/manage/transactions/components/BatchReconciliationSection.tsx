'use client'

import { useEffect, useMemo, useState } from 'react'
import { format, parse, parseISO, subDays } from 'date-fns'
import { AlertTriangle, CalendarIcon, Download, RefreshCcwDot, ShieldCheck } from 'lucide-react'
import { InfoIcon } from '@/components/ui/info-icon'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
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
import { PermissionGate } from '@/components/admin/PermissionGate'
import { ManualBatchoutDialog } from './ManualBatchoutDialog'

// Batch statuses for which a manual batchout is a no-op (already closed out).
const SETTLED_BATCH_STATUSES = new Set(['settled', 'funded', 'closed'])

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

// Date filter using Popover + Calendar instead of a native <input type="date">.
// The native picker's calendar popup renders off-screen on narrow viewports;
// the Radix popover keeps itself inside the viewport via collision detection.
// Value is the same `yyyy-MM-dd` string the rest of the filter logic expects.
function DateField({
  value,
  onChange,
  placeholder = 'dd/mm/yyyy',
}: {
  value: string
  onChange: (value: string) => void
  placeholder?: string
}) {
  const selected = value ? parse(value, 'yyyy-MM-dd', new Date()) : undefined
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            'h-9 w-full justify-start px-3 text-left font-normal',
            !value && 'text-muted-foreground'
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
          <span className="truncate">
            {selected ? format(selected, 'MMM d, yyyy') : placeholder}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto min-w-[280px] p-0" align="start">
        <Calendar
          mode="single"
          initialFocus
          selected={selected}
          onSelect={(date) => onChange(date ? format(date, 'yyyy-MM-dd') : '')}
        />
      </PopoverContent>
    </Popover>
  )
}

// Bounded default window for the batch list so the reconciliation RPC never
// runs unfiltered (all-time), which times out at scale (Postgres 57014).
const defaultDateFrom = () => format(subDays(new Date(), 7), 'yyyy-MM-dd')

export function BatchReconciliationSection({
  scopedMerchantId,
  renderBatchPayments,
}: {
  scopedMerchantId?: string
  renderBatchPayments?: (batch: PlatformSettlementBatch) => React.ReactNode
} = {}) {
  const [merchantId, setMerchantId] = useState(scopedMerchantId ?? 'all')
  const [status, setStatus] = useState('all')
  // Default to the last week so the initial load is bounded. An unfiltered
  // (all-time) query fans the reconciliation RPC across every settlement batch
  // and times out (57014) once payment volume is large.
  const [dateFrom, setDateFrom] = useState(defaultDateFrom)
  const [dateTo, setDateTo] = useState('')
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null)
  const [merchants, setMerchants] = useState<PlatformMerchant[]>([])
  const [loadingMerchants, setLoadingMerchants] = useState(true)
  const [manualBatchoutOpen, setManualBatchoutOpen] = useState(false)

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
    // Reset to the bounded default window, not all-time, to avoid the timeout.
    setDateFrom(defaultDateFrom())
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
            <CardTitle className="flex items-center gap-1">
              Batch Reconciliation
              <InfoIcon tip="A batch groups all card payments submitted to the processor in a single settlement run (usually daily). Each batch shows the gross amount, any refunds, and the net deposit — the amount actually sent to the merchant's bank. A discrepancy means the batch total doesn't match the sum of linked order payments." />
            </CardTitle>
            <CardDescription>
              Compare settlement batches against linked order payments and flag mismatches.
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={() => void handleRefresh()} disabled={batchesFetching || batchPaymentsFetching}>
              <RefreshCcwDot className="mr-2 h-4 w-4" />
              Refresh
            </Button>
            <Button variant="outline" onClick={handleBatchExport} disabled={!selectedBatch}>
              <Download className="mr-2 h-4 w-4" />
              Export Selected
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className={scopedMerchantId ? 'grid gap-3 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4' : 'grid gap-3 grid-cols-1 sm:grid-cols-2 xl:grid-cols-5'}>
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

          <div className="flex flex-col gap-1 text-sm">
            <span className="text-muted-foreground">Date From</span>
            <DateField value={dateFrom} onChange={setDateFrom} />
          </div>

          <div className="flex flex-col gap-1 text-sm">
            <span className="text-muted-foreground">Date To</span>
            <DateField value={dateTo} onChange={setDateTo} />
          </div>

          <div className="flex items-end">
            <Button variant="ghost" onClick={clearFilters} className="w-full">
              Clear Filters
            </Button>
          </div>
        </div>

        {batchErrorCode && (
          <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
            {batchErrorCode === '57014'
              ? 'Batch reconciliation timed out. Narrow the date range or filter to a single merchant and try again.'
              : batchErrorCode === 'PGRST202' || batchErrorCode === '42883'
                ? 'Batch reconciliation RPC is not installed on this database. Apply the settlement batch migrations.'
                : 'Batch reconciliation data is unavailable.'}
            {` (Error: ${batchErrorCode})`}
          </div>
        )}

        <Table containerClassName="max-h-[42vh] overflow-auto rounded-md border">
          <TableHeader className="sticky top-0 z-20 bg-card">
            <TableRow>
              <TableHead>
                <span className="inline-flex items-center gap-1">Batch ID <InfoIcon tip="The settlement batch identifier, composed of acquirer prefix and batch number (e.g. TSYS-009)." side="bottom" /></span>
              </TableHead>
              <TableHead>Merchant</TableHead>
              <TableHead>
                <span className="inline-flex items-center gap-1">Business Date <InfoIcon tip="The processing date the batch belongs to. Usually the calendar date of the settlement run." side="bottom" /></span>
              </TableHead>
              <TableHead>Opened</TableHead>
              <TableHead>Closed</TableHead>
              <TableHead className="text-right">
                <span className="inline-flex items-center justify-end gap-1">Txns <InfoIcon tip="Number of payment transactions included in this batch." side="bottom" /></span>
              </TableHead>
              <TableHead className="text-right">
                <span className="inline-flex items-center justify-end gap-1">Gross <InfoIcon tip="Total charged amount before refunds. This is what the processor submitted for settlement." side="bottom" /></span>
              </TableHead>
              <TableHead className="text-right">
                <span className="inline-flex items-center justify-end gap-1">Tip <InfoIcon tip="Total gratuity included in this batch." side="bottom" /></span>
              </TableHead>
              <TableHead className="text-right">
                <span className="inline-flex items-center justify-end gap-1">Refund <InfoIcon tip="Total refunds processed within this batch." side="bottom" /></span>
              </TableHead>
              <TableHead className="text-right">
                <span className="inline-flex items-center justify-end gap-1">Net Deposit <InfoIcon tip="Amount deposited into the merchant's bank account. Formula: Gross − refunds − net fees (the 4% bank fee). Reconciles line-for-line with TSYS." side="bottom" /></span>
              </TableHead>
              <TableHead>
                <span className="inline-flex items-center gap-1">Status <InfoIcon tip="Open: batch is still collecting payments. Closed: submitted to processor. Settled: processor confirmed receipt. Funded: money deposited to merchant bank." side="bottom" /></span>
              </TableHead>
              <TableHead className="text-right">
                <span className="inline-flex items-center justify-end gap-1">Discrepancy <InfoIcon tip="The difference between the batch gross and the sum of linked order payments. A discrepancy indicates a payment was processed on the terminal but not found in the POS order system (or vice versa)." side="bottom" /></span>
              </TableHead>
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

            <PermissionGate minLevel={10}>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setManualBatchoutOpen(true)}
                  disabled={SETTLED_BATCH_STATUSES.has(selectedBatch.status.toLowerCase())}
                >
                  <ShieldCheck className="mr-2 h-4 w-4" />
                  Manual Batchout
                </Button>
                <span className="text-xs text-muted-foreground">
                  Super-admin only · marks this batch settled (reconciliation, not a terminal batchout).
                </span>
              </div>
            </PermissionGate>

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
                  <TableHead>
                    <span className="inline-flex items-center gap-1">Payment ID <InfoIcon tip="Internal payment record ID linked to this batch entry." side="bottom" /></span>
                  </TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">
                    <span className="inline-flex items-center justify-end gap-1">Total <InfoIcon tip="Full charge amount for this payment including tip." side="bottom" /></span>
                  </TableHead>
                  <TableHead className="text-right">Tip</TableHead>
                  <TableHead className="text-right">Refund</TableHead>
                  <TableHead>
                    <span className="inline-flex items-center gap-1">Flags <InfoIcon tip="Void = cancelled before settlement. Returned = reversed after capture." side="bottom" /></span>
                  </TableHead>
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

        <ManualBatchoutDialog
          batch={selectedBatch}
          open={manualBatchoutOpen}
          onOpenChange={setManualBatchoutOpen}
          onSuccess={handleRefresh}
        />
      </CardContent>
    </Card>
  )
}
