'use client'

import { useEffect, useMemo, useState } from 'react'
import { format, parseISO, subDays } from 'date-fns'
import { AlertTriangle, Download, RefreshCcwDot, ShieldCheck } from 'lucide-react'
import { InfoIcon } from '@/components/ui/info-icon'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { PaginationBar } from '@/components/dashboard/PaginationBar'
import { useClientPagination } from '@/lib/hooks/useClientPagination'
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
import { PermissionGate } from '@/components/admin/PermissionGate'
import { ManualBatchoutDialog } from './ManualBatchoutDialog'
import {
  CardField,
  CardFields,
  CardGridEmpty,
  FilterDate,
  FilterSelect,
  LoadError,
  RecordCard,
  RecordCardSkeletons,
  TableEmptyRow,
} from './ledger-primitives'

// Batch statuses for which a manual batchout is a no-op (already closed out).
const SETTLED_BATCH_STATUSES = new Set(['settled', 'funded', 'closed'])

const BATCH_STATUS_OPTIONS = ['open', 'closed', 'submitted', 'settled', 'funded'] as const

const BATCH_PAGE_SIZE = 25
const PAYMENT_PAGE_SIZE = 10
const BATCH_COLUMN_COUNT = 12
const PAYMENT_COLUMN_COUNT = 9

function formatCurrency(amount: number): string {
  return `$${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function formatDateOnly(dateValue?: string): string {
  if (!dateValue) return '—'
  return format(parseISO(dateValue), 'MMM d, yyyy')
}

function formatDateTime(dateValue?: string): string {
  if (!dateValue) return '—'
  return format(new Date(dateValue), 'MMM d, yyyy h:mm a')
}

/** `under_review` → "Under review". */
function formatLabel(value: string): string {
  const words = value.replace(/_/g, ' ').toLowerCase()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

function pluralize(count: number, singular: string, plural: string): string {
  return `${count.toLocaleString()} ${count === 1 ? singular : plural}`
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

// How the batch was settled — auto (Valor webhook / POS auto) vs manual.
function getOriginLabel(origin?: string | null): string | null {
  switch (origin) {
    case 'valor_webhook':
      return 'Auto · Webhook'
    case 'pos_auto':
      return 'Auto'
    case 'hq_manual':
      return 'Manual · HQ'
    case 'pos_manual':
      return 'Manual'
    default:
      return null
  }
}

function formatPaymentFlags(payment: PlatformSettlementBatchPayment): string {
  if (payment.is_voided && payment.is_returned) return 'Void / Returned'
  if (payment.is_voided) return 'Void'
  if (payment.is_returned) return 'Returned'
  return '—'
}

/**
 * The reconciliation alarm (UI-DESIGN-SYSTEM §3.5 use 4, HQ-2): the glyph is
 * amber, the figure and the screen-reader word carry the meaning.
 */
function DiscrepancyValue({ batch }: { batch: PlatformSettlementBatch }) {
  if (!batch.has_discrepancy) {
    return <span className="font-normal text-muted-foreground">Matched</span>
  }
  return (
    <span className="inline-flex items-center justify-end gap-1 font-medium tabular-nums">
      <AlertTriangle className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" aria-hidden />
      {formatCurrency(batch.discrepancy_amount)}
      <span className="sr-only">discrepancy</span>
    </span>
  )
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

function batchErrorTitle(code: string): string {
  if (code === '57014') return 'Batch reconciliation timed out'
  if (code === 'PGRST202' || code === '42883') return 'Batch reconciliation is not installed on this database'
  return 'Batch reconciliation could not load'
}

function batchErrorDetail(code: string): string {
  if (code === '57014') return `Narrow the date range or filter to one merchant. Error ${code}`
  if (code === 'PGRST202' || code === '42883') return `Apply the settlement batch migrations. Error ${code}`
  return `Error ${code}`
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

  const batches = useMemo(() => batchesResult?.data || [], [batchesResult])
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

  const batchPayments = useMemo(() => batchPaymentsResult?.data || [], [batchPaymentsResult])
  const batchPaymentsErrorCode = batchPaymentsResult?.errorCode

  // The batch list is capped at 250 server-side and paged here (§5.7).
  const {
    pageRows: batchPageRows,
    pagination: batchPagination,
    setPage: setBatchPage,
  } = useClientPagination(batches, BATCH_PAGE_SIZE)
  const {
    pageRows: paymentPageRows,
    pagination: paymentPagination,
    setPage: setPaymentPage,
  } = useClientPagination(batchPayments, PAYMENT_PAGE_SIZE)

  // A new filter set starts on page 1; so does a newly selected batch's payments.
  useEffect(() => {
    setBatchPage(1)
  }, [filters, setBatchPage])

  useEffect(() => {
    setPaymentPage(1)
  }, [selectedBatchId, setPaymentPage])

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

  const merchantOptions = useMemo(
    () => merchants.map((merchant) => ({ value: merchant.id, label: merchant.name })),
    [merchants]
  )
  const statusOptions = useMemo(
    () => BATCH_STATUS_OPTIONS.map((option) => ({ value: option, label: formatLabel(option) })),
    []
  )

  // The default window is the last 7 days, open-ended, every status, every
  // merchant (or the scoped one). "Clear filters" shows only when off it.
  const filtersOffDefault =
    (!scopedMerchantId && merchantId !== 'all') ||
    status !== 'all' ||
    dateFrom !== defaultDateFrom() ||
    dateTo !== ''

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
      return
    }

    if (batchPayments.length === 0) {
      return
    }

    const csv = buildBatchExportCsv(selectedBatch, batchPayments)
    const filename = `DEXA_Batch_${formatBatchLabel(selectedBatch)}_${selectedBatch.business_date}.csv`
    downloadCsv(csv, filename)
  }

  const showBatchEmpty = !batchesLoading && batches.length === 0

  return (
    <div className="min-w-0 space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {!scopedMerchantId && (
          <FilterSelect
            value={merchantId}
            onValueChange={setMerchantId}
            options={merchantOptions}
            allLabel="All merchants"
            ariaLabel="Merchant"
            disabled={loadingMerchants}
          />
        )}
        <FilterSelect
          value={status}
          onValueChange={setStatus}
          options={statusOptions}
          allLabel="All statuses"
          ariaLabel="Batch status"
        />
        <FilterDate value={dateFrom} onChange={setDateFrom} placeholder="From date" />
        <FilterDate value={dateTo} onChange={setDateTo} placeholder="To date" />
        {filtersOffDefault && (
          <Button variant="ghost" size="sm" className="h-9 px-4" onClick={clearFilters}>
            Clear filters
          </Button>
        )}
        <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
          <Button
            variant="outline"
            size="sm"
            className="h-9 px-4"
            onClick={() => void handleRefresh()}
            disabled={batchesFetching || batchPaymentsFetching}
          >
            <RefreshCcwDot className="mr-2 h-4 w-4" />
            Refresh
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-9 px-4"
            onClick={handleBatchExport}
            disabled={!selectedBatch}
          >
            <Download className="mr-2 h-4 w-4" />
            Export selected
          </Button>
        </div>
      </div>

      {batchErrorCode && (
        <LoadError
          title={batchErrorTitle(batchErrorCode)}
          detail={batchErrorDetail(batchErrorCode)}
          onRetry={() => void refetchBatches()}
        />
      )}

      <div>
        <Table variant="data" containerClassName="hidden border bg-card 2xl:block" className="min-w-[1180px]">
          <TableHeader>
            <TableRow>
              <TableHead>
                <span className="inline-flex items-center gap-1">Batch ID <InfoIcon tip="The settlement batch identifier, composed of acquirer prefix and batch number (e.g. TSYS-009)." side="bottom" /></span>
              </TableHead>
              <TableHead>Merchant</TableHead>
              <TableHead>
                <span className="inline-flex items-center gap-1">Business date <InfoIcon tip="The processing date the batch belongs to. Usually the calendar date of the settlement run." side="bottom" /></span>
              </TableHead>
              <TableHead>Opened</TableHead>
              <TableHead>Closed</TableHead>
              <TableHead className="text-right tabular-nums">
                <span className="inline-flex items-center justify-end gap-1">Txns <InfoIcon tip="Number of payment transactions included in this batch." side="bottom" /></span>
              </TableHead>
              <TableHead className="text-right tabular-nums">
                <span className="inline-flex items-center justify-end gap-1">Gross <InfoIcon tip="Total charged amount before refunds. This is what the processor submitted for settlement." side="bottom" /></span>
              </TableHead>
              <TableHead className="text-right tabular-nums">
                <span className="inline-flex items-center justify-end gap-1">Tip <InfoIcon tip="Total gratuity included in this batch." side="bottom" /></span>
              </TableHead>
              <TableHead className="text-right tabular-nums">
                <span className="inline-flex items-center justify-end gap-1">Refund <InfoIcon tip="Total refunds processed within this batch." side="bottom" /></span>
              </TableHead>
              <TableHead className="text-right tabular-nums">
                <span className="inline-flex items-center justify-end gap-1">Net deposit <InfoIcon tip="Amount deposited into the merchant's bank account. Formula: Gross − refunds − net fees (the 4% bank fee). Reconciles line-for-line with TSYS." side="bottom" /></span>
              </TableHead>
              <TableHead>
                <span className="inline-flex items-center gap-1">Status <InfoIcon tip="Open: batch is still collecting payments. Closed: submitted to processor. Settled: processor confirmed receipt. Funded: money deposited to merchant bank." side="bottom" /></span>
              </TableHead>
              <TableHead className="text-right tabular-nums">
                <span className="inline-flex items-center justify-end gap-1">Discrepancy <InfoIcon tip="The difference between the batch gross and the sum of linked order payments. A discrepancy indicates a payment was processed on the terminal but not found in the POS order system (or vice versa)." side="bottom" /></span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {batchesLoading ? (
              Array.from({ length: 6 }).map((_, idx) => (
                <TableRow key={`batch-loading-${idx}`}>
                  {Array.from({ length: BATCH_COLUMN_COUNT }).map((__, cellIdx) => (
                    <TableCell key={`batch-loading-${idx}-${cellIdx}`}>
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : showBatchEmpty ? (
              <TableEmptyRow
                colSpan={BATCH_COLUMN_COUNT}
                title="No settlement batches in this range"
                hint="Widen the dates or clear the filters."
              />
            ) : (
              batchPageRows.map((batch) => {
                const isSelected = selectedBatchId === batch.id
                const originLabel = getOriginLabel(batch.origin)
                return (
                  <TableRow
                    key={batch.id}
                    className="cursor-pointer"
                    data-state={isSelected ? 'selected' : undefined}
                    onClick={() => setSelectedBatchId(batch.id)}
                  >
                    <TableCell className="max-w-[9rem] truncate font-mono text-xs" title={formatBatchLabel(batch)}>
                      {formatBatchLabel(batch)}
                    </TableCell>
                    <TableCell className="min-w-[9rem] whitespace-normal">
                      <div className="font-medium">{batch.merchant_name}</div>
                      <div className="text-xs text-muted-foreground">{batch.location_name || 'No location'}</div>
                    </TableCell>
                    <TableCell>{formatDateOnly(batch.business_date)}</TableCell>
                    <TableCell className="whitespace-normal text-xs text-muted-foreground">{formatDateTime(batch.opened_at)}</TableCell>
                    <TableCell className="whitespace-normal text-xs text-muted-foreground">{formatDateTime(batch.closed_at)}</TableCell>
                    <TableCell className="text-right tabular-nums">{batch.transaction_count.toLocaleString()}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatCurrency(batch.gross_amount)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatCurrency(batch.tip_amount)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatCurrency(batch.refund_amount)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatCurrency(batch.net_deposit)}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge variant="outline">{formatLabel(batch.status)}</Badge>
                        {originLabel && <Badge variant="outline">{originLabel}</Badge>}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <DiscrepancyValue batch={batch} />
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>

        <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 2xl:hidden">
          {batchesLoading ? (
            <RecordCardSkeletons />
          ) : showBatchEmpty ? (
            <CardGridEmpty
              title="No settlement batches in this range"
              hint="Widen the dates or clear the filters."
            />
          ) : (
            batchPageRows.map((batch) => {
              const isSelected = selectedBatchId === batch.id
              const originLabel = getOriginLabel(batch.origin)
              return (
                <RecordCard key={batch.id} selected={isSelected} className="border bg-card">
                  <button
                    type="button"
                    className="w-full min-w-0 text-left"
                    aria-pressed={isSelected}
                    onClick={() => setSelectedBatchId(batch.id)}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-mono text-sm font-medium">{formatBatchLabel(batch)}</p>
                        <p className="truncate text-sm">{batch.merchant_name}</p>
                        <p className="truncate text-xs text-muted-foreground">{batch.location_name || 'No location'}</p>
                      </div>
                      <p className="shrink-0 text-sm text-muted-foreground">{formatLabel(batch.status)}</p>
                    </div>
                    <CardFields>
                      <CardField label="Business date" value={formatDateOnly(batch.business_date)} />
                      <CardField label="Transactions" value={batch.transaction_count.toLocaleString()} />
                      <CardField label="Gross" value={formatCurrency(batch.gross_amount)} />
                      <CardField label="Net deposit" value={formatCurrency(batch.net_deposit)} />
                      <CardField label="Tip" value={formatCurrency(batch.tip_amount)} />
                      <CardField label="Refund" value={formatCurrency(batch.refund_amount)} />
                      <CardField label="Opened" value={formatDateTime(batch.opened_at)} />
                      <CardField label="Closed" value={formatDateTime(batch.closed_at)} />
                      <CardField label="Origin" value={originLabel ?? '—'} />
                      <CardField label="Discrepancy" value={<DiscrepancyValue batch={batch} />} />
                    </CardFields>
                  </button>
                </RecordCard>
              )
            })
          )}
        </div>

        <PaginationBar
          pagination={batchPagination}
          onPageChange={setBatchPage}
          itemLabel="batches"
          isLoading={batchesFetching}
        />
        {!batchesLoading && batches.length > 0 && batches.length <= BATCH_PAGE_SIZE && (
          <p className="mt-3 text-xs text-muted-foreground sm:text-sm tabular-nums">
            {pluralize(batches.length, 'batch', 'batches')}
          </p>
        )}
      </div>

      {selectedBatch && (
        <div className="space-y-3 rounded-2xl border bg-card p-4">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
            <span>
              <span className="text-muted-foreground">Selected batch </span>
              <span className="font-mono font-medium">{formatBatchLabel(selectedBatch)}</span>
            </span>
            <span>
              <span className="text-muted-foreground">Linked payments </span>
              <span className="font-medium tabular-nums">{selectedBatch.linked_payment_count.toLocaleString()}</span>
            </span>
            <span>
              <span className="text-muted-foreground">Linked amount </span>
              <span className="font-medium tabular-nums">{formatCurrency(selectedBatch.linked_payment_amount)}</span>
            </span>
            <span>
              <span className="text-muted-foreground">Batch gross </span>
              <span className="font-medium tabular-nums">{formatCurrency(selectedBatch.gross_amount)}</span>
            </span>
          </div>

          <PermissionGate minLevel={10}>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-9 px-4"
                onClick={() => setManualBatchoutOpen(true)}
                disabled={SETTLED_BATCH_STATUSES.has(selectedBatch.status.toLowerCase())}
              >
                <ShieldCheck className="mr-2 h-4 w-4" />
                Manual batchout
              </Button>
              <span className="text-xs text-muted-foreground">
                Super-admin only · marks this batch settled (reconciliation, not a terminal batchout).
              </span>
            </div>
          </PermissionGate>

          {batchPaymentsErrorCode && (
            <LoadError
              className="bg-card"
              title="Batch payment details could not load"
              detail={`Error ${batchPaymentsErrorCode}`}
              onRetry={() => void refetchBatchPayments()}
            />
          )}

          {renderBatchPayments ? (
            renderBatchPayments(selectedBatch)
          ) : (
            <div>
              <Table variant="data" containerClassName="hidden 2xl:block" className="min-w-[960px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>Order #</TableHead>
                    <TableHead>
                      <span className="inline-flex items-center gap-1">Payment ID <InfoIcon tip="Internal payment record ID linked to this batch entry." side="bottom" /></span>
                    </TableHead>
                    <TableHead>Method</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right tabular-nums">
                      <span className="inline-flex items-center justify-end gap-1">Total <InfoIcon tip="Full charge amount for this payment including tip." side="bottom" /></span>
                    </TableHead>
                    <TableHead className="text-right tabular-nums">Tip</TableHead>
                    <TableHead className="text-right tabular-nums">Refund</TableHead>
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
                        {Array.from({ length: PAYMENT_COLUMN_COUNT }).map((__, cellIdx) => (
                          <TableCell key={`payment-loading-${idx}-${cellIdx}`}>
                            <Skeleton className="h-4 w-full" />
                          </TableCell>
                        ))}
                      </TableRow>
                    ))
                  ) : batchPayments.length === 0 ? (
                    <TableEmptyRow colSpan={PAYMENT_COLUMN_COUNT} title="No payments linked to this batch" />
                  ) : (
                    paymentPageRows.map((payment) => (
                      <TableRow key={payment.payment_id}>
                        <TableCell className="font-mono text-xs">{payment.order_number || '—'}</TableCell>
                        <TableCell className="font-mono text-xs">{payment.payment_id}</TableCell>
                        <TableCell>{formatLabel(payment.payment_method)}</TableCell>
                        <TableCell>{formatLabel(payment.payment_status)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatCurrency(payment.total_amount)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatCurrency(payment.tip_amount)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatCurrency(payment.refund_amount)}</TableCell>
                        <TableCell className="text-xs">{formatPaymentFlags(payment)}</TableCell>
                        <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                          {formatDateTime(payment.captured_at || payment.initiated_at)}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>

              {/* Cards sit on the muted well, so they take the card fill. */}
              <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 2xl:hidden">
                {batchPaymentsLoading ? (
                  <RecordCardSkeletons count={2} />
                ) : batchPayments.length === 0 ? (
                  <CardGridEmpty title="No payments linked to this batch" />
                ) : (
                  paymentPageRows.map((payment) => (
                    <RecordCard key={payment.payment_id} className="bg-card">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">
                            Order <span className="font-mono">{payment.order_number || '—'}</span>
                          </p>
                          <p className="truncate text-xs text-muted-foreground">{formatLabel(payment.payment_status)}</p>
                        </div>
                        <p className="shrink-0 text-sm font-medium tabular-nums">{formatCurrency(payment.total_amount)}</p>
                      </div>
                      <CardFields>
                        <CardField label="Payment ID" value={payment.payment_id} mono />
                        <CardField label="Method" value={formatLabel(payment.payment_method)} />
                        <CardField label="Tip" value={formatCurrency(payment.tip_amount)} />
                        <CardField label="Refund" value={formatCurrency(payment.refund_amount)} />
                        <CardField label="Flags" value={formatPaymentFlags(payment)} />
                        <CardField
                          label="Captured"
                          value={formatDateTime(payment.captured_at || payment.initiated_at)}
                        />
                      </CardFields>
                    </RecordCard>
                  ))
                )}
              </div>

              <PaginationBar
                pagination={paymentPagination}
                onPageChange={setPaymentPage}
                itemLabel="payments"
                isLoading={batchPaymentsFetching}
              />
              {!batchPaymentsLoading &&
                batchPayments.length > 0 &&
                batchPayments.length <= PAYMENT_PAGE_SIZE && (
                  <p className="mt-3 text-xs text-muted-foreground sm:text-sm tabular-nums">
                    {pluralize(batchPayments.length, 'payment', 'payments')}
                  </p>
                )}
            </div>
          )}
        </div>
      )}

      <ManualBatchoutDialog
        batch={selectedBatch}
        open={manualBatchoutOpen}
        onOpenChange={setManualBatchoutOpen}
        onSuccess={handleRefresh}
      />
    </div>
  )
}
