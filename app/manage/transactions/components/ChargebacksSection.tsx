'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'
import { AlertTriangle } from 'lucide-react'
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
import { chargebackDetailHref, paymentDetailHref } from '../routes'
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

// 10 a page, so the table sits in the page with no scroll of its own.
const PAGE_SIZE = 10
/** A column the tablet table leaves out; it joins at `xl`. */
const XL_ONLY = 'hidden xl:table-cell'
const CARD_NETWORK_OPTIONS = ['visa', 'mastercard', 'amex', 'discover', 'other'] as const
const OPEN_CHARGEBACK_STATUSES = new Set(['notified', 'under_review', 'defended'])

const CARD_NETWORK_LABELS: Record<string, string> = {
  visa: 'Visa',
  mastercard: 'Mastercard',
  amex: 'Amex',
  discover: 'Discover',
  other: 'Other',
}

export function formatCurrency(amount: number): string {
  return `$${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function formatDateTime(value?: string): string {
  if (!value) return '—'
  return format(new Date(value), 'MMM d, yyyy h:mm a')
}

export function formatDate(value?: string): string {
  if (!value) return '—'
  return format(new Date(value), 'MMM d, yyyy')
}

export function formatStatusLabel(value: string): string {
  return value
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

export function formatNetwork(network?: string): string {
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
export function renderDeadline(deadline?: string, status?: string) {
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
 * A chargeback's original payment, defense documents and resolution, as three
 * tiles. Rendered on the chargeback detail page.
 */
export function ChargebackDetail({
  row,
  className,
}: {
  row: PlatformChargebackRow
  className?: string
}) {
  return (
    <div className={cn('grid min-w-0 grid-cols-1 gap-3 lg:grid-cols-3', className)}>
      <div className="min-w-0 space-y-2 rounded-2xl bg-muted/45 p-4">
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
        {row.original_payment_id && (
          <Link
            href={paymentDetailHref(row.original_payment_id)}
            className="inline-block text-xs font-medium underline-offset-2 hover:underline"
          >
            Open payment
          </Link>
        )}
      </div>

      <div className="min-w-0 space-y-2 rounded-2xl bg-muted/45 p-4">
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

      <div className="min-w-0 space-y-2 rounded-2xl bg-muted/45 p-4">
        <h4 className="text-sm font-semibold">Resolution</h4>
        <div className="space-y-1 text-sm">
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

/**
 * The chargeback list. Each chargeback opens its own page; `from` tells that
 * page where "Back" goes (the transactions tab by default).
 */
export function ChargebacksSection({
  scopedMerchantId,
  from,
}: { scopedMerchantId?: string; from?: 'disputes' } = {}) {
  const router = useRouter()
  const [merchantId, setMerchantId] = useState(scopedMerchantId ?? 'all')
  const [status, setStatus] = useState<'all' | PlatformChargebackStatus>('all')
  const [cardNetwork, setCardNetwork] = useState('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [page, setPage] = useState(1)
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
  }

  // Per-column visibility, in table order, shared by the loading rows.
  const columnClasses = scopedMerchantId
    ? [XL_ONLY, '', XL_ONLY, '', XL_ONLY, '', XL_ONLY, '', '']
    : [XL_ONLY, '', '', XL_ONLY, '', XL_ONLY, '', XL_ONLY, '', '']
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

      <LedgerToolbar>
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
      </LedgerToolbar>

      {errorCode && (
        <LoadError
          title="Chargebacks could not load"
          detail={`Check table access and schema. Error ${errorCode}`}
          onRetry={() => void refetch()}
        />
      )}

      <div>
        {/* A table from `md`; the ID, reason code, network and defendable
            columns join at `xl`. Every row opens the chargeback's own page. */}
        <Table
          variant="data"
          bounded={false}
          containerClassName="hidden md:block"
          className={scopedMerchantId ? 'md:min-w-[620px] xl:min-w-[1000px]' : 'md:min-w-[720px] xl:min-w-[1120px]'}
        >
          <TableHeader>
            <TableRow>
              <TableHead className={XL_ONLY}>
                <span className="inline-flex items-center gap-1">Chargeback ID <InfoIcon tip="The ID of the original payment being disputed." side="bottom" /></span>
              </TableHead>
              {!scopedMerchantId && <TableHead>Merchant</TableHead>}
              <TableHead className="text-right tabular-nums">
                <span className="inline-flex items-center justify-end gap-1">Amount <InfoIcon tip="The amount being disputed by the cardholder." side="bottom" /></span>
              </TableHead>
              <TableHead className={XL_ONLY}>
                <span className="inline-flex items-center gap-1">Reason code <InfoIcon tip="The card network's standardized code for the dispute type (e.g. 4853 = Cardholder Dispute, 4837 = No Cardholder Authorization)." side="bottom" /></span>
              </TableHead>
              <TableHead>Reason</TableHead>
              <TableHead className={XL_ONLY}>Network</TableHead>
              <TableHead>
                <span className="inline-flex items-center gap-1">Status <InfoIcon tip="Notified: bank has filed the dispute. Under Review: being investigated. Defended: merchant submitted evidence. Won: merchant kept funds. Lost: funds reversed to cardholder." side="bottom" /></span>
              </TableHead>
              <TableHead className={XL_ONLY}>
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
                  {columnClasses.map((cellClass, cellIndex) => (
                    <TableCell key={`chargeback-loading-${rowIndex}-${cellIndex}`} className={cellClass}>
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : showEmpty ? (
              <TableEmptyRow
                colSpan={columnClasses.length}
                title="No chargebacks match these filters"
                hint={filtersOffDefault ? 'Clear the filters to widen the results.' : undefined}
              />
            ) : (
              rows.map((row) => {
                const href = chargebackDetailHref(row.id, from)
                return (
                  <TableRow key={row.id} className="cursor-pointer" onClick={() => router.push(href)}>
                    <TableCell
                      className={`${XL_ONLY} max-w-[10rem] truncate font-mono text-xs`}
                      title={row.original_payment_id}
                    >
                      {row.original_payment_id}
                    </TableCell>
                    {!scopedMerchantId && (
                      <TableCell className="min-w-[8rem] whitespace-normal">
                        {row.merchant_name || row.merchant_id}
                      </TableCell>
                    )}
                    <TableCell className="text-right tabular-nums">
                      <RowLink href={href}>{formatCurrency(row.amount)}</RowLink>
                    </TableCell>
                    <TableCell className={`${XL_ONLY} font-mono text-xs`}>{row.reason_code}</TableCell>
                    <TableCell className="max-w-[14rem] truncate" title={row.reason_description || undefined}>
                      {row.reason_description || '—'}
                    </TableCell>
                    <TableCell className={XL_ONLY}>{formatNetwork(row.card_network)}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{formatStatusLabel(row.status)}</Badge>
                    </TableCell>
                    <TableCell className={XL_ONLY}>
                      <Badge variant="outline">{row.defendable ? 'Yes' : 'No'}</Badge>
                    </TableCell>
                    <TableCell className="whitespace-normal">
                      {renderDeadline(row.defense_deadline, row.status)}
                    </TableCell>
                    <TableCell className="whitespace-normal text-xs text-muted-foreground">
                      {formatDateTime(row.received_at)}
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>

        {/* Phones: amount, merchant, status and the deadline (with its alarm);
            the rest is on the chargeback's page. */}
        <div className="grid min-w-0 grid-cols-1 gap-3 md:hidden">
          {showLoading ? (
            <RecordCardSkeletons />
          ) : showEmpty ? (
            <CardGridEmpty
              title="No chargebacks match these filters"
              hint={filtersOffDefault ? 'Clear the filters to widen the results.' : undefined}
            />
          ) : (
            rows.map((row) => (
              <RecordLinkCard
                key={row.id}
                href={chargebackDetailHref(row.id, from)}
                title={scopedMerchantId ? formatStatusLabel(row.status) : row.merchant_name || row.merchant_id}
                figure={formatCurrency(row.amount)}
                subtitle={scopedMerchantId ? `Received ${formatDate(row.received_at)}` : formatStatusLabel(row.status)}
                status={renderDeadline(row.defense_deadline, row.status)}
              />
            ))
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
