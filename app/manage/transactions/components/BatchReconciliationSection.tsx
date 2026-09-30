'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { format, subDays } from 'date-fns'
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
} from '@/app/manage/actions/hq-platform/transactions'
import { usePlatformSettlementBatches } from '@/lib/queries/use-platform-analytics'
import { settlementBatchDetailHref } from '../routes'
import {
  CardGridEmpty,
  FilterDate,
  FilterSelect,
  LedgerToolbar,
  LoadError,
  RecordCardSkeletons,
  RecordLinkCard,
  RowLink,
  TableEmptyRow,
} from './ledger-primitives'
import {
  batchErrorDetail,
  batchErrorTitle,
  DiscrepancyValue,
  formatBatchLabel,
  formatCurrency,
  formatDateOnly,
  formatDateTime,
  formatLabel,
  getOriginLabel,
  pluralize,
  SettlementBatchPanel,
} from './SettlementBatchPanel'

const BATCH_STATUS_OPTIONS = ['open', 'closed', 'submitted', 'settled', 'funded'] as const

// 10 a page, so the table sits in the page with no scroll of its own.
const BATCH_PAGE_SIZE = 10

/** A column the tablet table leaves out; it joins at `xl`. */
const XL_ONLY = 'hidden xl:table-cell'
/** Per-column visibility, in table order, shared by the loading rows. */
const BATCH_COLUMN_CLASSES = ['', '', '', XL_ONLY, XL_ONLY, '', '', XL_ONLY, XL_ONLY, '', '', '']

// Bounded default window for the batch list so the reconciliation RPC never
// runs unfiltered (all-time), which times out at scale (Postgres 57014).
const defaultDateFrom = () => format(subDays(new Date(), 7), 'yyyy-MM-dd')

/**
 * The settlement batch list. On /manage/transactions each batch opens its own
 * page. With `renderBatchPayments` (merchant detail → Settlements) a batch is
 * selected in place instead and its payments render beneath the list.
 */
export function BatchReconciliationSection({
  scopedMerchantId,
  renderBatchPayments,
}: {
  scopedMerchantId?: string
  renderBatchPayments?: (batch: PlatformSettlementBatch) => React.ReactNode
} = {}) {
  const router = useRouter()
  const selectsInPlace = !!renderBatchPayments

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
    () => (selectsInPlace ? batches.find((batch) => batch.id === selectedBatchId) || null : null),
    [batches, selectedBatchId, selectsInPlace]
  )

  // The batch list is capped at 250 server-side and paged here (§5.7).
  const {
    pageRows: batchPageRows,
    pagination: batchPagination,
    setPage: setBatchPage,
  } = useClientPagination(batches, BATCH_PAGE_SIZE)

  // A new filter set starts on page 1.
  useEffect(() => {
    setBatchPage(1)
  }, [filters, setBatchPage])

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

  /** Opens the batch: its own page here, or in place on merchant detail. */
  const openBatch = (batch: PlatformSettlementBatch) => {
    if (selectsInPlace) setSelectedBatchId(batch.id)
    else router.push(settlementBatchDetailHref(batch.id))
  }

  const showBatchEmpty = !batchesLoading && batches.length === 0

  return (
    <div className="min-w-0 space-y-4">
      <LedgerToolbar onRefresh={() => void refetchBatches()} refreshing={batchesFetching}>
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
      </LedgerToolbar>

      {batchErrorCode && (
        <LoadError
          title={batchErrorTitle(batchErrorCode)}
          detail={batchErrorDetail(batchErrorCode)}
          onRetry={() => void refetchBatches()}
        />
      )}

      <div>
        {/* A table from `md`; open/close times, tip and refund join at `xl`. */}
        <Table
          variant="data"
          bounded={false}
          containerClassName="hidden md:block"
          className="md:min-w-[760px] xl:min-w-[1180px]"
        >
          <TableHeader>
            <TableRow>
              <TableHead>
                <span className="inline-flex items-center gap-1">Batch ID <InfoIcon tip="The settlement batch identifier, composed of acquirer prefix and batch number (e.g. TSYS-009)." side="bottom" /></span>
              </TableHead>
              <TableHead>Merchant</TableHead>
              <TableHead>
                <span className="inline-flex items-center gap-1">Business date <InfoIcon tip="The processing date the batch belongs to. Usually the calendar date of the settlement run." side="bottom" /></span>
              </TableHead>
              <TableHead className={XL_ONLY}>Opened</TableHead>
              <TableHead className={XL_ONLY}>Closed</TableHead>
              <TableHead className="text-right tabular-nums">
                <span className="inline-flex items-center justify-end gap-1">Txns <InfoIcon tip="Number of payment transactions included in this batch." side="bottom" /></span>
              </TableHead>
              <TableHead className="text-right tabular-nums">
                <span className="inline-flex items-center justify-end gap-1">Gross <InfoIcon tip="Total charged amount before refunds. This is what the processor submitted for settlement." side="bottom" /></span>
              </TableHead>
              <TableHead className={`${XL_ONLY} text-right tabular-nums`}>
                <span className="inline-flex items-center justify-end gap-1">Tip <InfoIcon tip="Total gratuity included in this batch." side="bottom" /></span>
              </TableHead>
              <TableHead className={`${XL_ONLY} text-right tabular-nums`}>
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
                  {BATCH_COLUMN_CLASSES.map((cellClass, cellIdx) => (
                    <TableCell key={`batch-loading-${idx}-${cellIdx}`} className={cellClass}>
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : showBatchEmpty ? (
              <TableEmptyRow
                colSpan={BATCH_COLUMN_CLASSES.length}
                title="No settlement batches in this range"
                hint="Widen the dates or clear the filters."
              />
            ) : (
              batchPageRows.map((batch) => {
                const isSelected = selectedBatchId === batch.id
                const originLabel = getOriginLabel(batch.origin)
                const label = formatBatchLabel(batch)
                return (
                  <TableRow
                    key={batch.id}
                    className="cursor-pointer"
                    data-state={selectsInPlace && isSelected ? 'selected' : undefined}
                    onClick={() => openBatch(batch)}
                  >
                    <TableCell className="max-w-[9rem] truncate font-mono text-xs" title={label}>
                      {selectsInPlace ? label : <RowLink href={settlementBatchDetailHref(batch.id)}>{label}</RowLink>}
                    </TableCell>
                    <TableCell className="min-w-[9rem] whitespace-normal">
                      <div className="font-medium">{batch.merchant_name}</div>
                      <div className="text-xs text-muted-foreground">{batch.location_name || 'No location'}</div>
                    </TableCell>
                    <TableCell>{formatDateOnly(batch.business_date)}</TableCell>
                    <TableCell className={`${XL_ONLY} whitespace-normal text-xs text-muted-foreground`}>{formatDateTime(batch.opened_at)}</TableCell>
                    <TableCell className={`${XL_ONLY} whitespace-normal text-xs text-muted-foreground`}>{formatDateTime(batch.closed_at)}</TableCell>
                    <TableCell className="text-right tabular-nums">{batch.transaction_count.toLocaleString()}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatCurrency(batch.gross_amount)}</TableCell>
                    <TableCell className={`${XL_ONLY} text-right tabular-nums`}>{formatCurrency(batch.tip_amount)}</TableCell>
                    <TableCell className={`${XL_ONLY} text-right tabular-nums`}>{formatCurrency(batch.refund_amount)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatCurrency(batch.net_deposit)}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge variant="outline">{formatLabel(batch.status)}</Badge>
                        {originLabel && <Badge variant="outline" className="hidden xl:inline-flex">{originLabel}</Badge>}
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

        {/* Phones: batch, merchant, net deposit and status — plus the
            discrepancy alarm only when there is one. */}
        <div className="grid min-w-0 grid-cols-1 gap-3 md:hidden">
          {batchesLoading ? (
            <RecordCardSkeletons />
          ) : showBatchEmpty ? (
            <CardGridEmpty
              title="No settlement batches in this range"
              hint="Widen the dates or clear the filters."
            />
          ) : (
            batchPageRows.map((batch) => (
              <RecordLinkCard
                key={batch.id}
                href={selectsInPlace ? undefined : settlementBatchDetailHref(batch.id)}
                onSelect={selectsInPlace ? () => openBatch(batch) : undefined}
                selected={selectsInPlace && selectedBatchId === batch.id}
                title={<span className="font-mono">{formatBatchLabel(batch)}</span>}
                figure={formatCurrency(batch.net_deposit)}
                subtitle={batch.merchant_name}
                status={
                  batch.has_discrepancy ? (
                    <DiscrepancyValue batch={batch} />
                  ) : (
                    formatLabel(batch.status)
                  )
                }
              />
            ))
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
        <div className="rounded-2xl border bg-card p-4">
          <SettlementBatchPanel
            batch={selectedBatch}
            renderBatchPayments={renderBatchPayments}
            onBatchChanged={() => refetchBatches()}
          />
        </div>
      )}
    </div>
  )
}
