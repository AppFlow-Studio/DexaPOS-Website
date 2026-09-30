'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import type { DateRange } from 'react-day-picker'
import { format, parse } from 'date-fns'
import { InfoIcon } from '@/components/ui/info-icon'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table'
import { StatRow, StatTile } from '@/components/dashboard/shell'
import { PaginationBar } from '@/components/dashboard/PaginationBar'
import type { PaginationMeta } from '@/types/pagination'
import {
    getPlatformPayments,
    type PlatformPaymentFilters,
} from '@/app/manage/actions/hq-platform/payments'
import { paymentDetailHref } from '../routes'
import {
    batchLabel,
    capitalise,
    formatDateTime,
    formatMoney,
    netFeeLabel,
    tsysMatchLabel,
} from './payment-format'
import {
    CardGridEmpty,
    FilterDate,
    LedgerToolbar,
    LoadError,
    RecordCardSkeletons,
    RecordLinkCard,
    RowLink,
    TableEmptyRow,
} from './ledger-primitives'

/** A column the tablet table leaves out; it joins at `xl`. */
const XL_ONLY = 'hidden xl:table-cell'

/**
 * Per-column visibility, in table order, so the loading rows hide the same
 * cells the loaded rows do and nothing jumps.
 */
const COLUMN_CLASSES = ['', '', '', '', XL_ONLY, XL_ONLY, '', XL_ONLY, '', '', '', XL_ONLY]

function toIsoDate(d?: Date): string | null {
    if (!d) return null
    return d.toISOString().slice(0, 10)
}

/** `Date` → the `yyyy-MM-dd` string `FilterDate` holds. */
function toFieldValue(d?: Date): string {
    return d ? format(d, 'yyyy-MM-dd') : ''
}

/** `yyyy-MM-dd` from `FilterDate` → a local `Date`, or undefined when cleared. */
function fromFieldValue(value: string): Date | undefined {
    return value ? parse(value, 'yyyy-MM-dd', new Date()) : undefined
}

function defaultRange(): DateRange {
    const to = new Date()
    const from = new Date()
    from.setDate(from.getDate() - 30)
    return { from, to }
}

export function PaymentsLedger({
    initialMerchantIds,
}: {
    initialMerchantIds?: string[]
}) {
    const [range, setRange] = useState<DateRange | undefined>(defaultRange())
    const [unsettledOnly, setUnsettledOnly] = useState(false)
    const [unmatchedOnly, setUnmatchedOnly] = useState(false)
    const [page, setPage] = useState(1)
    const router = useRouter()
    // 10 a page, so the table sits in the page with no scroll of its own.
    const count = 10

    // The default window, as field strings, so "Clear filters" can tell when
    // the range has moved off it.
    const [defaultFields] = useState(() => {
        const initial = defaultRange()
        return { from: toFieldValue(initial.from), to: toFieldValue(initial.to) }
    })

    const dateFrom = toIsoDate(range?.from)
    const dateTo = toIsoDate(range?.to)
    const fromField = toFieldValue(range?.from)
    const toField = toFieldValue(range?.to)

    const filters: PlatformPaymentFilters = useMemo(
        () => ({
            merchantIds: initialMerchantIds,
            dateFrom,
            dateTo,
            unsettledOnly,
            unmatchedOnly,
            page,
            count,
        }),
        [initialMerchantIds, dateFrom, dateTo, unsettledOnly, unmatchedOnly, page]
    )

    const { data, isLoading, isFetching, refetch } = useQuery({
        queryKey: [
            'platform-payments',
            (initialMerchantIds ?? []).join(','),
            dateFrom ?? '',
            dateTo ?? '',
            unsettledOnly,
            unmatchedOnly,
            page,
        ],
        queryFn: () => getPlatformPayments(filters),
        staleTime: 30_000,
        refetchOnMount: 'always',
    })

    const result = data?.success ? data.data : null
    const rows = result?.rows ?? []
    const total = result?.total ?? 0
    const totals = result?.totals
    const fetchError = data && !data.success ? data.error : null

    const pagination: PaginationMeta = {
        page,
        pageSize: count,
        total,
        totalPages: Math.max(1, Math.ceil(total / count)),
        hasNextPage: page * count < total,
        hasPreviousPage: page > 1,
    }

    const rangeChanged = fromField !== defaultFields.from || toField !== defaultFields.to
    const hasActiveFilters = rangeChanged || unsettledOnly || unmatchedOnly

    const setRangeEdge = (edge: 'from' | 'to', value: string) => {
        const date = fromFieldValue(value)
        const next: DateRange =
            edge === 'from' ? { from: date, to: range?.to } : { from: range?.from, to: date }
        setRange(next.from || next.to ? next : undefined)
        setPage(1)
    }

    const clearFilters = () => {
        setRange(defaultRange())
        setUnsettledOnly(false)
        setUnmatchedOnly(false)
        setPage(1)
    }

    const emptyTitle = hasActiveFilters ? 'No payments match these filters' : 'No payments in the last 30 days'
    const emptyHint = hasActiveFilters
        ? 'Clear the filters to widen the results.'
        : 'Payments will appear here once merchants start taking card payments.'

    return (
        <div className="min-w-0 space-y-4">
            <LedgerToolbar onRefresh={() => void refetch()} refreshing={isFetching}>
                <FilterDate
                    value={fromField}
                    onChange={(value) => setRangeEdge('from', value)}
                    placeholder="From date"
                />
                <FilterDate
                    value={toField}
                    onChange={(value) => setRangeEdge('to', value)}
                    placeholder="To date"
                />
                <div className="flex h-9 items-center gap-2 rounded-full bg-muted/60 px-3 text-[0.8125rem] text-muted-foreground">
                    <label className="flex items-center gap-2">
                        <Switch
                            checked={unsettledOnly}
                            onCheckedChange={(v) => {
                                setUnsettledOnly(v)
                                setPage(1)
                            }}
                        />
                        Unsettled only
                    </label>
                    <InfoIcon tip="Show only payments the processor has not yet confirmed settled." side="top" />
                </div>
                <div className="flex h-9 items-center gap-2 rounded-full bg-muted/60 px-3 text-[0.8125rem] text-muted-foreground">
                    <label className="flex items-center gap-2">
                        <Switch
                            checked={unmatchedOnly}
                            onCheckedChange={(v) => {
                                setUnmatchedOnly(v)
                                setPage(1)
                            }}
                        />
                        Unmatched only
                    </label>
                    <InfoIcon tip="Show only TSYS payments with no corresponding POS order record. Use this to investigate sync gaps." side="top" />
                </div>
                {hasActiveFilters && (
                    <Button variant="ghost" size="sm" className="h-9 px-4" onClick={clearFilters}>
                        Clear filters
                    </Button>
                )}
            </LedgerToolbar>

            <StatRow columns={4}>
                <StatTile
                    isLoading={isLoading}
                    label={
                        <span className="inline-flex items-center gap-1">
                            Payments
                            <InfoIcon tip="Total number of payment records on this page." side="top" />
                        </span>
                    }
                    value={totals ? totals.count.toLocaleString() : '—'}
                />
                <StatTile
                    isLoading={isLoading}
                    label={
                        <span className="inline-flex items-center gap-1">
                            Gross
                            <InfoIcon tip="Total charged amount across all payments on this page, before any fees or refunds." side="top" />
                        </span>
                    }
                    value={totals ? formatMoney(totals.grossSum) : '—'}
                />
                <StatTile
                    isLoading={isLoading}
                    label={
                        <span className="inline-flex items-center gap-1">
                            Settled %
                            <InfoIcon tip="Percentage of payments on this page that have been settled — meaning the funds have been confirmed by the processor and will be deposited." side="top" />
                        </span>
                    }
                    value={totals && rows.length ? `${Math.round((totals.settledCount / rows.length) * 100)}%` : '—'}
                    meta={totals ? `${totals.settledCount}/${rows.length} on page` : undefined}
                />
                <StatTile
                    isLoading={isLoading}
                    label={
                        <span className="inline-flex items-center gap-1">
                            Unmatched
                            <InfoIcon tip="Payments from TSYS that have no matching order in the POS system. An unmatched payment may indicate a sync gap or a payment processed directly on the terminal outside the POS." side="top" />
                        </span>
                    }
                    value={totals ? totals.unmatchedCount.toLocaleString() : '—'}
                />
            </StatRow>

            {fetchError ? (
                <LoadError
                    title="Payments failed to load"
                    detail={fetchError}
                    onRetry={() => void refetch()}
                />
            ) : (
                <>
                    {/* A table from `md`; the four reconciliation columns join at
                        `xl`. Every row opens the payment's own page. */}
                    <Table
                        variant="data"
                        bounded={false}
                        containerClassName="hidden md:block"
                        className="md:min-w-[760px] xl:min-w-[1180px]"
                    >
                        <TableHeader>
                            <TableRow>
                                <TableHead>Captured</TableHead>
                                <TableHead>Merchant</TableHead>
                                <TableHead>Order</TableHead>
                                <TableHead>Method</TableHead>
                                <TableHead className={XL_ONLY}>Auth</TableHead>
                                <TableHead className={XL_ONLY}>Batch</TableHead>
                                <TableHead className="text-right tabular-nums">
                                    <span className="inline-flex items-center justify-end gap-1">Total <InfoIcon tip="Full payment amount including tip. This is the gross amount charged to the cardholder." side="bottom" /></span>
                                </TableHead>
                                <TableHead className={`${XL_ONLY} text-right tabular-nums`}>
                                    <span className="inline-flex items-center justify-end gap-1">Net fee <InfoIcon tip="Platform fee deducted from this payment. Equals the dual-pricing fee plus tip fee, minus any refunded fee portions. Reconciles with TSYS line-for-line." side="bottom" /></span>
                                </TableHead>
                                <TableHead className="text-right tabular-nums">
                                    <span className="inline-flex items-center justify-end gap-1">Net deposit <InfoIcon tip="Amount deposited to the merchant after deducting the net fee. Formula: Gross − Net fee. Matches the TSYS statement exactly." side="bottom" /></span>
                                </TableHead>
                                <TableHead>
                                    <span className="inline-flex items-center gap-1">Status <InfoIcon tip="Processor status. Captured = funds collected. Authorized = approved pending capture. Refunded = reversed. Failed/Voided = cancelled." side="bottom" /></span>
                                </TableHead>
                                <TableHead>
                                    <span className="inline-flex items-center gap-1">Settled <InfoIcon tip="Whether this payment has been confirmed settled by the processor and included in a net deposit to the merchant's bank." side="bottom" /></span>
                                </TableHead>
                                <TableHead className={XL_ONLY}>
                                    <span className="inline-flex items-center gap-1">TSYS match <InfoIcon tip="Whether this payment has a matching TSYS transaction ID. Matched = TSYS confirmed receipt. Unmatched = payment not yet reconciled with TSYS." side="bottom" /></span>
                                </TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {isLoading ? (
                                Array.from({ length: 6 }).map((_, idx) => (
                                    <TableRow key={`pmt-loading-${idx}`}>
                                        {COLUMN_CLASSES.map((cellClass, ci) => (
                                            <TableCell key={`pmt-loading-${idx}-${ci}`} className={cellClass}>
                                                <Skeleton className="h-4 w-full" />
                                            </TableCell>
                                        ))}
                                    </TableRow>
                                ))
                            ) : rows.length === 0 ? (
                                <TableEmptyRow colSpan={COLUMN_CLASSES.length} title={emptyTitle} hint={emptyHint} />
                            ) : (
                                rows.map((r) => {
                                    const batch = batchLabel(r)
                                    const href = paymentDetailHref(r.id)
                                    return (
                                        <TableRow
                                            key={r.id}
                                            className="cursor-pointer"
                                            onClick={() => router.push(href)}
                                        >
                                            <TableCell className="whitespace-nowrap tabular-nums text-muted-foreground">
                                                <RowLink href={href}>
                                                    {formatDateTime(r.captured_at ?? r.initiated_at)}
                                                </RowLink>
                                            </TableCell>
                                            <TableCell>
                                                {r.merchant_name ?? <span className="text-muted-foreground">—</span>}
                                                <p className="text-xs text-muted-foreground">
                                                    {r.location_name ?? '—'}
                                                </p>
                                            </TableCell>
                                            <TableCell className="font-mono text-xs">
                                                {r.order_number ?? <span className="text-muted-foreground">—</span>}
                                            </TableCell>
                                            <TableCell>
                                                <span className="capitalize">{r.payment_method}</span>
                                                {r.card_type && (
                                                    <p className="text-xs text-muted-foreground">
                                                        {r.card_type}
                                                        {r.card_last_four && ` •••${r.card_last_four}`}
                                                    </p>
                                                )}
                                            </TableCell>
                                            <TableCell className={`${XL_ONLY} font-mono text-xs`}>
                                                {r.authorization_code ?? '—'}
                                            </TableCell>
                                            <TableCell className={`${XL_ONLY} font-mono text-xs`}>
                                                {batch ?? <span className="text-muted-foreground">—</span>}
                                            </TableCell>
                                            <TableCell className="text-right tabular-nums">
                                                {formatMoney(r.total_amount)}
                                            </TableCell>
                                            <TableCell className={`${XL_ONLY} text-right tabular-nums`}>
                                                {r.net_fee > 0 ? (
                                                    netFeeLabel(r)
                                                ) : (
                                                    <span className="text-muted-foreground">—</span>
                                                )}
                                            </TableCell>
                                            <TableCell className="text-right tabular-nums">
                                                {formatMoney(r.net_deposit)}
                                            </TableCell>
                                            <TableCell>
                                                <Badge variant="outline">{capitalise(r.status)}</Badge>
                                            </TableCell>
                                            <TableCell>
                                                <Badge variant="outline">{r.is_settled ? 'Settled' : 'Pending'}</Badge>
                                            </TableCell>
                                            <TableCell className={XL_ONLY}>
                                                <Badge variant="outline">{tsysMatchLabel(r)}</Badge>
                                            </TableCell>
                                        </TableRow>
                                    )
                                })
                            )}
                        </TableBody>
                    </Table>

                    {/* Phones: amount, when, who and status only; the rest is on
                        the payment's page. */}
                    <div className="grid min-w-0 grid-cols-1 gap-3 md:hidden">
                        {isLoading ? (
                            <RecordCardSkeletons count={4} />
                        ) : rows.length === 0 ? (
                            <CardGridEmpty title={emptyTitle} hint={emptyHint} />
                        ) : (
                            rows.map((r) => (
                                <RecordLinkCard
                                    key={r.id}
                                    href={paymentDetailHref(r.id)}
                                    title={r.merchant_name ?? '—'}
                                    figure={formatMoney(r.total_amount)}
                                    subtitle={formatDateTime(r.captured_at ?? r.initiated_at)}
                                    status={`${capitalise(r.status)} · ${r.is_settled ? 'Settled' : 'Pending'}`}
                                />
                            ))
                        )}
                    </div>

                    <PaginationBar
                        pagination={pagination}
                        onPageChange={setPage}
                        itemLabel="payments"
                        isLoading={isFetching}
                    />
                    {total > 0 && total <= count && (
                        <p className="mt-3 text-xs text-muted-foreground sm:text-sm tabular-nums">
                            {total.toLocaleString()} payments
                        </p>
                    )}
                </>
            )}
        </div>
    )
}
