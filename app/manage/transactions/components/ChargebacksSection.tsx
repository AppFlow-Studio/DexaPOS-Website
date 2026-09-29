'use client'

import { Fragment, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { format } from 'date-fns'
import { AlertTriangle, RefreshCcwDot } from 'lucide-react'
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
import { cn } from '@/lib/utils'
import type { PaginationMeta } from '@/types/pagination'
import {
  getPlatformMerchants,
  PlatformChargebackFilters,
  PlatformChargebackRow,
  PlatformMerchant,
} from '@/app/manage/actions/hq-platform/transactions'
import {
  PLATFORM_CHARGEBACK_STATUSES,
  type PlatformChargebackStatus,
} from '@/app/manage/actions/hq-platform/transactions-shared'
import { usePlatformChargebacks } from '@/lib/queries/use-platform-analytics'
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

const PAGE_SIZE = 25
const CARD_NETWORK_OPTIONS = ['visa', 'mastercard', 'amex', 'discover', 'other'] as const
const OPEN_CHARGEBACK_STATUSES = new Set(['notified', 'under_review', 'defended'])

const CARD_NETWORK_LABELS: Record<string, string> = {
  visa: 'Visa',
  mastercard: 'Mastercard',
  amex: 'Amex',
  discover: 'Discover',
  other: 'Other',
}

function formatCurrency(amount: number): string {
  return `$${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function formatDateTime(value?: string): string {
  if (!value) return '—'
  return format(new Date(value), 'MMM d, yyyy h:mm a')
}

function formatDate(value?: string): string {
  if (!value) return '—'
  return format(new Date(value), 'MMM d, yyyy')
}

function formatStatusLabel(value: string): string {
  return value
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function formatNetwork(network?: string): string {
  if (!network) return '—'
  return CARD_NETWORK_LABELS[network.toLowerCase()] ?? network.toUpperCase()
}

function pluralize(count: number, singular: string, plural: string): string {
  return `${count.toLocaleString()} ${count === 1 ? singular : plural}`
}

/**
 * The defense deadline. Overdue and due-within-72h are real alarms
 * (UI-DESIGN-SYSTEM §3.5 use 4, HQ-2): the glyph takes red or amber, the
 * words say it too. Spans only, so it can sit inside a card field's <p>.
 */
function renderDeadline(deadline?: string, status?: string) {
  if (!deadline) {
    return <span className="text-muted-foreground">—</span>
  }

  const diffMs = new Date(deadline).getTime() - Date.now()
  const isOpen = status ? OPEN_CHARGEBACK_STATUSES.has(status.toLowerCase()) : true
  const dateLabel = formatDateTime(deadline)

  if (!isOpen) {
    return <span className="text-muted-foreground">{dateLabel}</span>
  }

  if (diffMs <= 0) {
    return (
      <span className="inline-flex items-center gap-1 font-medium">
        <AlertTriangle className="h-3.5 w-3.5 text-red-600 dark:text-red-400" aria-hidden />
        Overdue
      </span>
    )
  }

  if (diffMs <= 72 * 60 * 60 * 1000) {
    const hoursLeft = Math.ceil(diffMs / (60 * 60 * 1000))
    const relative = hoursLeft < 24 ? `${hoursLeft}h left` : `${Math.ceil(hoursLeft / 24)}d left`
    return (
      <span className="flex flex-col gap-0.5">
        <span className="inline-flex items-center gap-1 font-medium tabular-nums">
          <AlertTriangle className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" aria-hidden />
          {relative}
        </span>
        <span className="text-xs font-normal text-muted-foreground">{dateLabel}</span>
      </span>
    )
  }

  return <span>{dateLabel}</span>
}

function DetailLine({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 items-baseline justify-between gap-3">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 truncate text-right tabular-nums">{children}</span>
    </div>
  )
}

/**
 * The expanded chargeback. The table row and the phone card render this same
 * component (§5.3), so the two views cannot drift apart. The tiles take the
 * card fill: they sit on a selected row or a selected (muted) card.
 * `withPhoneFacts` shows, on phones only, the reason, network, reason code and
 * defendable flag that the slimmed phone card leaves out.
 */
function ChargebackDetail({
  row,
  className,
  withPhoneFacts = false,
}: {
  row: PlatformChargebackRow
  className?: string
  withPhoneFacts?: boolean
}) {
  return (
    <div className={cn('grid min-w-0 gap-3 lg:grid-cols-3', className)}>
      <div className="min-w-0 space-y-2 rounded-2xl bg-card p-4">
        <h4 className="text-sm font-semibold">Original payment</h4>
        {row.original_payment ? (
          <div className="space-y-1 text-sm">
            <DetailLine label="Payment ID">
              <span className="font-mono text-xs">{row.original_payment.payment_id}</span>
            </DetailLine>
            <DetailLine label="Order #">{row.original_payment.order_number || '—'}</DetailLine>
            <DetailLine label="Customer">{row.original_payment.customer_name || 'Walk-in'}</DetailLine>
            <DetailLine label="Method">{row.original_payment.payment_method || '—'}</DetailLine>
            <DetailLine label="Status">{row.original_payment.payment_status || '—'}</DetailLine>
            <DetailLine label="Amount">{formatCurrency(row.original_payment.total_amount)}</DetailLine>
            <DetailLine label="Card last 4">
              {row.original_payment.card_last_four ? `****${row.original_payment.card_last_four}` : '—'}
            </DetailLine>
            <DetailLine label="Auth code">{row.original_payment.authorization_code || '—'}</DetailLine>
            <DetailLine label="Reference #">{row.original_payment.reference_number || '—'}</DetailLine>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Original payment details unavailable.</p>
        )}
        <Link
          href={`/manage/transactions?search=${encodeURIComponent(row.original_payment_id)}`}
          className="inline-block text-xs font-medium underline-offset-2 hover:underline"
        >
          View in payments
        </Link>
      </div>

      <div className="min-w-0 space-y-2 rounded-2xl bg-card p-4">
        <h4 className="text-sm font-semibold">Defense documents</h4>
        {row.defense_documents.length === 0 ? (
          <p className="text-sm text-muted-foreground">No defense documents attached.</p>
        ) : (
          <div className="space-y-3">
            {row.defense_documents.map((doc, index) => (
              <div key={`${row.id}-doc-${index}`} className="min-w-0 text-sm">
                <div className="truncate font-medium">{doc.name}</div>
                {doc.url ? (
                  <a
                    href={doc.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs underline-offset-2 hover:underline"
                  >
                    Open document
                  </a>
                ) : (
                  <div className="text-xs text-muted-foreground">No URL provided</div>
                )}
                {doc.uploaded_at && (
                  <div className="text-xs text-muted-foreground">
                    Uploaded {formatDateTime(doc.uploaded_at)}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="min-w-0 space-y-2 rounded-2xl bg-card p-4">
        <h4 className="text-sm font-semibold">Resolution</h4>
        <div className="space-y-1 text-sm">
          {withPhoneFacts && (
            <div className="space-y-1 sm:hidden">
              <DetailLine label="Reason">{row.reason_description || '—'}</DetailLine>
              <DetailLine label="Network">{formatNetwork(row.card_network)}</DetailLine>
              <DetailLine label="Reason code">
                <span className="font-mono text-xs">{row.reason_code}</span>
              </DetailLine>
              <DetailLine label="Defendable">{row.defendable ? 'Yes' : 'No'}</DetailLine>
            </div>
          )}
          <DetailLine label="PSP reference">{row.dispute_psp_reference || '—'}</DetailLine>
          <DetailLine label="Defense submitted">{formatDateTime(row.defense_submitted_at)}</DetailLine>
          <DetailLine label="Resolved">{formatDateTime(row.resolved_at)}</DetailLine>
          <DetailLine label="Resolution">{row.resolution || '—'}</DetailLine>
          <DetailLine label="Resolution amount">
            {row.resolution_amount ? formatCurrency(row.resolution_amount) : '—'}
          </DetailLine>
        </div>
      </div>
    </div>
  )
}

export function ChargebacksSection({
  scopedMerchantId,
}: { scopedMerchantId?: string } = {}) {
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

  const pagination: PaginationMeta = {
    page,
    pageSize: PAGE_SIZE,
    total,
    totalPages,
    hasNextPage: page < totalPages,
    hasPreviousPage: page > 1,
  }

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages)
    }
  }, [page, totalPages])

  const merchantOptions = useMemo(
    () => merchants.map((merchant) => ({ value: merchant.id, label: merchant.name })),
    [merchants]
  )
  const statusOptions = useMemo(
    () => PLATFORM_CHARGEBACK_STATUSES.map((value) => ({ value, label: formatStatusLabel(value) })),
    []
  )
  const networkOptions = useMemo(
    () => CARD_NETWORK_OPTIONS.map((value) => ({ value, label: CARD_NETWORK_LABELS[value] })),
    []
  )

  const filtersOffDefault =
    (!scopedMerchantId && merchantId !== 'all') ||
    status !== 'all' ||
    cardNetwork !== 'all' ||
    dateFrom !== '' ||
    dateTo !== ''

  const clearFilters = () => {
    if (!scopedMerchantId) setMerchantId('all')
    setStatus('all')
    setCardNetwork('all')
    setDateFrom('')
    setDateTo('')
    setPage(1)
    setExpandedId(null)
  }

  const toggleExpanded = (id: string) =>
    setExpandedId((current) => (current === id ? null : id))

  const columnCount = scopedMerchantId ? 9 : 10
  const showLoading = isLoading || isFetching
  const showEmpty = !showLoading && rows.length === 0

  return (
    <div className="min-w-0 space-y-4">
      {chargebacksResult ? (
        <div className="hidden items-center gap-1 sm:flex">
          <p className="text-sm text-muted-foreground tabular-nums">
            {pendingCount.toLocaleString()} pending or notified · {total.toLocaleString()} total
          </p>
          <InfoIcon tip="Chargebacks that are awaiting action — either just received (Notified) or actively being reviewed. These require attention before their defense deadline." side="bottom" />
        </div>
      ) : (
        <Skeleton className="hidden h-5 w-56 sm:block" />
      )}

      {urgentCount > 0 && (
        <div role="status" className="flex items-center gap-2 rounded-2xl bg-muted/60 px-4 py-3 text-sm">
          <AlertTriangle className="h-4 w-4 shrink-0 text-red-600 dark:text-red-400" aria-hidden />
          <span className="font-medium tabular-nums">
            {urgentCount === 1
              ? '1 chargeback deadline is due within 72 hours'
              : `${urgentCount.toLocaleString()} chargeback deadlines are due within 72 hours`}
          </span>
        </div>
      )}

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
          onValueChange={(value) => setStatus(value as 'all' | PlatformChargebackStatus)}
          options={statusOptions}
          allLabel="All statuses"
          ariaLabel="Status"
        />
        <FilterSelect
          value={cardNetwork}
          onValueChange={setCardNetwork}
          options={networkOptions}
          allLabel="All networks"
          ariaLabel="Card network"
        />
        <FilterDate value={dateFrom} onChange={setDateFrom} placeholder="Received from" />
        <FilterDate value={dateTo} onChange={setDateTo} placeholder="Received to" />
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
            onClick={() => void refetch()}
            disabled={isFetching}
          >
            <RefreshCcwDot className="mr-2 h-4 w-4" />
            Refresh
          </Button>
        </div>
      </div>

      {errorCode && (
        <LoadError
          title="Chargebacks could not load"
          detail={`Check table access and schema. Error ${errorCode}`}
          onRetry={() => void refetch()}
        />
      )}

      <div>
        <Table
          variant="data"
          containerClassName="hidden 2xl:block"
          className={scopedMerchantId ? 'min-w-[1000px]' : 'min-w-[1120px]'}
        >
          <TableHeader>
            <TableRow>
              <TableHead>
                <span className="inline-flex items-center gap-1">Chargeback ID <InfoIcon tip="The ID of the original payment being disputed. Click to view that transaction in the payments table." side="bottom" /></span>
              </TableHead>
              {!scopedMerchantId && <TableHead>Merchant</TableHead>}
              <TableHead className="text-right tabular-nums">
                <span className="inline-flex items-center justify-end gap-1">Amount <InfoIcon tip="The amount being disputed by the cardholder." side="bottom" /></span>
              </TableHead>
              <TableHead>
                <span className="inline-flex items-center gap-1">Reason code <InfoIcon tip="The card network's standardized code for the dispute type (e.g. 4853 = Cardholder Dispute, 4837 = No Cardholder Authorization)." side="bottom" /></span>
              </TableHead>
              <TableHead>Reason</TableHead>
              <TableHead>Network</TableHead>
              <TableHead>
                <span className="inline-flex items-center gap-1">Status <InfoIcon tip="Notified: bank has filed the dispute. Under Review: being investigated. Defended: merchant submitted evidence. Won: merchant kept funds. Lost: funds reversed to cardholder." side="bottom" /></span>
              </TableHead>
              <TableHead>
                <span className="inline-flex items-center gap-1">Defendable <InfoIcon tip="Whether there is enough evidence (receipt, EMV data, cardholder signature) to submit a defense before the deadline." side="bottom" /></span>
              </TableHead>
              <TableHead>
                <span className="inline-flex items-center gap-1">Defense deadline <InfoIcon tip="The final date to submit defense evidence to the card network. Missing this date permanently forfeits the merchant's right to contest the dispute." side="bottom" /></span>
              </TableHead>
              <TableHead>Received</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {showLoading ? (
              Array.from({ length: 6 }).map((_, rowIndex) => (
                <TableRow key={`chargeback-loading-${rowIndex}`}>
                  {Array.from({ length: columnCount }).map((__, cellIndex) => (
                    <TableCell key={`chargeback-loading-${rowIndex}-${cellIndex}`}>
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : showEmpty ? (
              <TableEmptyRow
                colSpan={columnCount}
                title="No chargebacks match these filters"
                hint={filtersOffDefault ? 'Clear the filters to widen the results.' : undefined}
              />
            ) : (
              rows.map((row) => {
                const isExpanded = expandedId === row.id

                return (
                  <Fragment key={row.id}>
                    <TableRow
                      className="cursor-pointer"
                      data-state={isExpanded ? 'selected' : undefined}
                      aria-expanded={isExpanded}
                      onClick={() => toggleExpanded(row.id)}
                    >
                      <TableCell className="max-w-[10rem] truncate font-mono text-xs">
                        <Link
                          href={`/manage/transactions?search=${encodeURIComponent(row.original_payment_id)}`}
                          className="underline-offset-2 hover:underline"
                          title={row.original_payment_id}
                          onClick={(event) => event.stopPropagation()}
                        >
                          {row.original_payment_id}
                        </Link>
                      </TableCell>
                      {!scopedMerchantId && (
                        <TableCell className="min-w-[8rem] whitespace-normal">
                          {row.merchant_name || row.merchant_id}
                        </TableCell>
                      )}
                      <TableCell className="text-right tabular-nums">{formatCurrency(row.amount)}</TableCell>
                      <TableCell className="font-mono text-xs">{row.reason_code}</TableCell>
                      <TableCell className="max-w-[14rem] truncate" title={row.reason_description || undefined}>
                        {row.reason_description || '—'}
                      </TableCell>
                      <TableCell>{formatNetwork(row.card_network)}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{formatStatusLabel(row.status)}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{row.defendable ? 'Yes' : 'No'}</Badge>
                      </TableCell>
                      <TableCell className="whitespace-normal">
                        {renderDeadline(row.defense_deadline, row.status)}
                      </TableCell>
                      <TableCell className="whitespace-normal text-xs text-muted-foreground">
                        {formatDateTime(row.received_at)}
                      </TableCell>
                    </TableRow>

                    {isExpanded && (
                      <TableRow data-state="selected">
                        <TableCell colSpan={columnCount} className="whitespace-normal">
                          <ChargebackDetail row={row} />
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                )
              })
            )}
          </TableBody>
        </Table>

        <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 2xl:hidden">
          {showLoading ? (
            <RecordCardSkeletons />
          ) : showEmpty ? (
            <CardGridEmpty
              title="No chargebacks match these filters"
              hint={filtersOffDefault ? 'Clear the filters to widen the results.' : undefined}
            />
          ) : (
            rows.map((row) => {
              const isExpanded = expandedId === row.id
              return (
                <RecordCard
                  key={row.id}
                  selected={isExpanded}
                  className={isExpanded ? 'sm:col-span-2' : undefined}
                >
                  <button
                    type="button"
                    className="w-full min-w-0 text-left"
                    aria-expanded={isExpanded}
                    onClick={() => toggleExpanded(row.id)}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-base font-medium tabular-nums">{formatCurrency(row.amount)}</p>
                      <p className="shrink-0 text-sm text-muted-foreground">{formatStatusLabel(row.status)}</p>
                    </div>
                    {/* Full card width, and wraps rather than truncates, so the
                        status beside the amount never cuts the name short. */}
                    {!scopedMerchantId && (
                      <p className="break-words text-sm text-muted-foreground">
                        {row.merchant_name || row.merchant_id}
                      </p>
                    )}
                    {/* Phones keep only amount, merchant, deadline and received;
                        the rest moves to the expanded view (withPhoneFacts). */}
                    <CardFields>
                      <CardField label="Chargeback ID" value={row.original_payment_id} mono className="hidden sm:block" />
                      <CardField label="Reason code" value={row.reason_code} mono className="hidden sm:block" />
                      <CardField label="Reason" value={row.reason_description || '—'} className="hidden sm:block" />
                      <CardField label="Network" value={formatNetwork(row.card_network)} className="hidden sm:block" />
                      <CardField label="Defendable" value={row.defendable ? 'Yes' : 'No'} className="hidden sm:block" />
                      <CardField
                        label="Defense deadline"
                        value={renderDeadline(row.defense_deadline, row.status)}
                      />
                      <CardField
                        label="Received"
                        value={
                          <>
                            <span className="sm:hidden">{formatDate(row.received_at)}</span>
                            <span className="hidden sm:inline">{formatDateTime(row.received_at)}</span>
                          </>
                        }
                      />
                    </CardFields>
                  </button>
                  {isExpanded && <ChargebackDetail row={row} className="mt-4" withPhoneFacts />}
                </RecordCard>
              )
            })
          )}
        </div>

        <PaginationBar
          pagination={pagination}
          onPageChange={setPage}
          itemLabel="chargebacks"
          isLoading={isFetching}
        />
        {total > 0 && total <= PAGE_SIZE && (
          <p className="mt-3 text-xs text-muted-foreground sm:text-sm tabular-nums">
            {pluralize(total, 'chargeback', 'chargebacks')}
          </p>
        )}
      </div>
    </div>
  )
}
