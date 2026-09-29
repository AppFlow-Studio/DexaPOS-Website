'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import type { DateRange } from 'react-day-picker'
import { Banknote, CheckCircle2, ChevronRight, CircleAlert, CreditCard, Link2, Link2Off, RefreshCcwDot, ShieldCheck } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { DateRangePicker } from '@/components/ui/date-range-picker'
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
import { PaginationBar } from '@/components/dashboard/PaginationBar'
import type { PaginationMeta } from '@/types/pagination'
import { useMerchantPayments } from '@/lib/queries/use-merchant-payments'
import { KpiStrip, type KpiCell } from './KpiStrip'

const PAYMENT_STATUSES = [
    'pending',
    'authorized',
    'captured',
    'failed',
    'voided',
    'refunded',
] as const

const CELL_BADGE = 'w-fit gap-1 rounded-full border-0 px-2.5 text-xs font-medium'

function formatMoney(n: number) {
    return n.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
}

function formatDateTime(iso?: string | null) {
    if (!iso) return '—'
    const d = new Date(iso)
    return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
}

function toIsoDate(d?: Date): string | null {
    if (!d) return null
    return d.toISOString().slice(0, 10)
}

function defaultRange(): DateRange {
    const to = new Date()
    const from = new Date()
    from.setDate(from.getDate() - 30)
    return { from, to }
}

export function MerchantPaymentsTab({
    merchantId,
    locations,
}: {
    merchantId: string
    locations: { id: string; name: string }[]
}) {
    const [locationId, setLocationId] = useState<string>('all')
    const [status, setStatus] = useState<string>('all')
    const [range, setRange] = useState<DateRange | undefined>(defaultRange())
    const [unsettledOnly, setUnsettledOnly] = useState(false)
    const [unmatchedOnly, setUnmatchedOnly] = useState(false)
    const [page, setPage] = useState(1)
    const count = 10

    const dateFrom = toIsoDate(range?.from)
    const dateTo = toIsoDate(range?.to)

    const filters = useMemo(
        () => ({
            locationId: locationId === 'all' ? null : locationId,
            status: status === 'all' ? null : status,
            dateFrom,
            dateTo,
            unsettledOnly,
            unmatchedOnly,
            page,
            count,
        }),
        [locationId, status, dateFrom, dateTo, unsettledOnly, unmatchedOnly, page]
    )

    const { data, isLoading, isFetching, refetch } = useMerchantPayments(merchantId, filters)

    const result = data?.success ? data.data : null
    const rows = result?.rows ?? []
    const totals = result?.totals
    const total = result?.total ?? 0
    const fetchError = data && !data.success ? data.error : null

    const pagination: PaginationMeta = {
        page,
        pageSize: count,
        total,
        totalPages: Math.max(1, Math.ceil(total / count)),
        hasNextPage: page * count < total,
        hasPreviousPage: page > 1,
    }

    const cells: KpiCell[] = [
        {
            icon: CreditCard,
            label: 'Payments',
            value: totals ? totals.count.toLocaleString() : '—',
            meta: 'In selected filter',
        },
        {
            icon: Banknote,
            label: 'Gross',
            value: totals ? formatMoney(totals.grossSum) : '—',
            meta: 'Sum of total_amount on this page',
        },
        {
            icon: ShieldCheck,
            label: 'Settled',
            value: totals && rows.length
                ? `${Math.round((totals.settledCount / rows.length) * 100)}%`
                : '—',
            meta: totals ? `${totals.settledCount}/${rows.length} on page` : 'No payments loaded',
        },
        {
            icon: Link2Off,
            label: 'Unmatched',
            value: totals ? totals.unmatchedCount.toLocaleString() : '—',
            meta: 'No Luqra reconciliation yet',
        },
    ]

    const batchLabel = (r: (typeof rows)[number]) => {
        // Prefer the host batch number ("009", optionally prefixed with the
        // acquirer like "TSYS-009"). Fall back to the legacy
        // settlement_batch_label only for pre-Wave-A.1 rows where batch_number
        // is null.
        const hostBatchNumber = r.batch_number ?? r.dejavoo_batch_number ?? null
        return hostBatchNumber
            ? (r.acquirer ? `${r.acquirer}-${hostBatchNumber}` : hostBatchNumber)
            : (r.settlement_batch_label ?? null)
    }

    const cardLabel = (r: (typeof rows)[number]) =>
        r.card_type ? `${r.card_type}${r.card_last_four ? ` •••${r.card_last_four}` : ''}` : '—'

    const emptyText = 'No payments match these filters. Widen the date range or clear a filter.'

    return (
        <div className="space-y-6">
            <KpiStrip cells={cells} loading={isLoading} />

            <div className="flex flex-wrap items-end gap-3">
                <Field label="Location">
                    <Select
                        value={locationId}
                        onValueChange={(v) => {
                            setLocationId(v)
                            setPage(1)
                        }}
                    >
                        <SelectTrigger className="h-9 w-full min-w-0 text-[0.8125rem] sm:w-56">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All locations</SelectItem>
                            {locations.map((loc) => (
                                <SelectItem key={loc.id} value={loc.id}>
                                    {loc.name}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </Field>

                <Field label="Status">
                    <Select
                        value={status}
                        onValueChange={(v) => {
                            setStatus(v)
                            setPage(1)
                        }}
                    >
                        <SelectTrigger className="h-9 w-full min-w-0 text-[0.8125rem] capitalize sm:w-40">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All</SelectItem>
                            {PAYMENT_STATUSES.map((s) => (
                                <SelectItem key={s} value={s} className="capitalize">
                                    {s}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </Field>

                <Field label="Date range">
                    <DateRangePicker
                        date={range}
                        setDate={(r) => {
                            setRange(r)
                            setPage(1)
                        }}
                    />
                </Field>

                <Field label="Unsettled only">
                    <div className="flex h-9 items-center">
                        <Switch
                            aria-label="Unsettled only"
                            checked={unsettledOnly}
                            onCheckedChange={(v) => {
                                setUnsettledOnly(v)
                                setPage(1)
                            }}
                        />
                    </div>
                </Field>

                <Field label="Unmatched only">
                    <div className="flex h-9 items-center">
                        <Switch
                            aria-label="Unmatched only"
                            checked={unmatchedOnly}
                            onCheckedChange={(v) => {
                                setUnmatchedOnly(v)
                                setPage(1)
                            }}
                        />
                    </div>
                </Field>

                <div className="flex items-center gap-2 sm:ml-auto">
                    <Button
                        variant="outline"
                        className="h-9 rounded-full px-4 text-[0.8125rem] font-medium shadow-sm"
                        onClick={() => void refetch()}
                        disabled={isFetching}
                    >
                        <RefreshCcwDot className="h-3.5 w-3.5" />
                        Refresh
                    </Button>
                </div>
            </div>

            {fetchError ? (
                <div className="rounded-2xl bg-muted/30 px-4 py-10 text-center">
                    <p className="text-sm font-medium">We hit a snag loading payments</p>
                    <p className="mt-1 text-sm text-muted-foreground">{fetchError}</p>
                    <Button variant="outline" size="sm" className="mt-3" onClick={() => void refetch()}>
                        Retry
                    </Button>
                </div>
            ) : (
                <div>
                    <Table variant="data" containerClassName="hidden xl:block" className="min-w-[960px]">
                        <TableHeader>
                            <TableRow>
                                <TableHead>Captured</TableHead>
                                <TableHead>Order</TableHead>
                                <TableHead>Location</TableHead>
                                <TableHead>Card</TableHead>
                                <TableHead>Batch</TableHead>
                                <TableHead className="text-right">Total</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead>Settled</TableHead>
                                <TableHead>Luqra</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {isLoading ? (
                                Array.from({ length: 6 }).map((_, idx) => (
                                    <TableRow key={`pmt-loading-${idx}`}>
                                        {Array.from({ length: 9 }).map((__, ci) => (
                                            <TableCell key={`pmt-loading-${idx}-${ci}`}>
                                                <Skeleton className="h-4 w-full" />
                                            </TableCell>
                                        ))}
                                    </TableRow>
                                ))
                            ) : rows.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={9} className="h-24 text-center text-muted-foreground">
                                        {emptyText}
                                    </TableCell>
                                </TableRow>
                            ) : (
                                rows.map((r) => {
                                    const batch = batchLabel(r)
                                    return (
                                        <TableRow key={r.id}>
                                            <TableCell className="whitespace-nowrap tabular-nums">
                                                {formatDateTime(r.captured_at ?? r.initiated_at)}
                                            </TableCell>
                                            <TableCell>
                                                <Link
                                                    href={`/manage/transactions?orderId=${r.order_id}`}
                                                    className="inline-flex items-center gap-1 font-mono text-xs text-foreground underline-offset-4 hover:underline"
                                                >
                                                    {r.order_number ?? r.order_id.slice(0, 8)}
                                                </Link>
                                            </TableCell>
                                            <TableCell className="text-muted-foreground">
                                                {r.location_name ?? '—'}
                                            </TableCell>
                                            {/* Method, card and auth share a cell so the table
                                                fits the `xl` content column (§5.3). */}
                                            <TableCell>
                                                <div className="font-medium">
                                                    {r.card_type ?? <span className="capitalize">{r.payment_method}</span>}
                                                    {r.card_type && r.card_last_four && (
                                                        <span className="ml-1 font-normal text-muted-foreground tabular-nums">
                                                            •••{r.card_last_four}
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="text-xs text-muted-foreground">
                                                    {r.card_type && <span className="capitalize">{r.payment_method} · </span>}
                                                    auth <span className="font-mono">{r.authorization_code ?? '—'}</span>
                                                </div>
                                            </TableCell>
                                            <TableCell className="font-mono text-xs">
                                                {batch ?? <span className="text-muted-foreground">—</span>}
                                            </TableCell>
                                            <TableCell className="text-right tabular-nums">
                                                {formatMoney(r.total_amount)}
                                            </TableCell>
                                            <TableCell>
                                                <Badge variant="secondary" className={`${CELL_BADGE} capitalize`}>
                                                    {r.status}
                                                </Badge>
                                            </TableCell>
                                            <TableCell>
                                                <Badge variant="secondary" className={CELL_BADGE}>
                                                    {r.is_settled && <CheckCircle2 className="h-3 w-3" />}
                                                    {r.is_settled ? 'Settled' : 'Pending'}
                                                </Badge>
                                            </TableCell>
                                            <TableCell>
                                                {r.luqra_transaction_id ? (
                                                    <Link
                                                        href={`/manage/transactions?paymentId=${r.id}`}
                                                        className="inline-flex items-center gap-1"
                                                        title="Open payment in transactions"
                                                    >
                                                        <Badge variant="secondary" className={CELL_BADGE}>
                                                            <Link2 className="h-3 w-3" />
                                                            {r.luqra_batch_id ?? 'Matched'}
                                                        </Badge>
                                                        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                                                    </Link>
                                                ) : (
                                                    <Badge variant="secondary" className={`${CELL_BADGE} text-muted-foreground`}>
                                                        <CircleAlert className="h-3 w-3" />
                                                        Unmatched
                                                    </Badge>
                                                )}
                                            </TableCell>
                                        </TableRow>
                                    )
                                })
                            )}
                        </TableBody>
                    </Table>

                    <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 xl:hidden">
                        {isLoading ? (
                            Array.from({ length: 4 }).map((_, idx) => (
                                <div key={`pmt-card-loading-${idx}`} className="space-y-3 rounded-2xl border-0 bg-muted/45 p-4">
                                    <Skeleton className="h-4 w-32" />
                                    <Skeleton className="h-4 w-full" />
                                    <Skeleton className="h-4 w-2/3" />
                                </div>
                            ))
                        ) : rows.length === 0 ? (
                            <div className="col-span-full flex min-h-40 flex-col items-center justify-center gap-2 rounded-2xl bg-muted/30 px-4 text-center text-sm text-muted-foreground">
                                {emptyText}
                            </div>
                        ) : (
                            rows.map((r) => (
                                <div key={r.id} className="min-w-0 rounded-2xl border-0 bg-muted/45 p-4">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <Link
                                                href={`/manage/transactions?orderId=${r.order_id}`}
                                                className="block truncate font-mono text-sm font-medium underline-offset-4 hover:underline"
                                            >
                                                {r.order_number ?? r.order_id.slice(0, 8)}
                                            </Link>
                                            <p className="text-xs text-muted-foreground tabular-nums">
                                                {formatDateTime(r.captured_at ?? r.initiated_at)}
                                            </p>
                                        </div>
                                        <div className="shrink-0 text-right">
                                            <p className="font-medium tabular-nums">{formatMoney(r.total_amount)}</p>
                                            <p className="text-sm capitalize text-muted-foreground">{r.status}</p>
                                        </div>
                                    </div>
                                    <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                                        <CardField label="Location" value={r.location_name ?? '—'} />
                                        <CardField label="Method" value={r.payment_method} capitalize />
                                        <CardField label="Card" value={cardLabel(r)} />
                                        <CardField label="Auth" value={r.authorization_code ?? '—'} />
                                        <CardField label="Batch" value={batchLabel(r) ?? '—'} />
                                        <CardField label="Settled" value={r.is_settled ? 'Settled' : 'Pending'} />
                                        <div className="min-w-0">
                                            <p className="text-xs text-muted-foreground">Luqra</p>
                                            {r.luqra_transaction_id ? (
                                                <Link
                                                    href={`/manage/transactions?paymentId=${r.id}`}
                                                    className="block truncate font-medium underline-offset-4 hover:underline"
                                                >
                                                    {r.luqra_batch_id ?? 'Matched'}
                                                </Link>
                                            ) : (
                                                <p className="truncate font-medium">Unmatched</p>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            )}

            <PaginationBar
                pagination={pagination}
                onPageChange={setPage}
                isLoading={isFetching}
                itemLabel="payments"
            />
            {!isLoading && rows.length > 0 && total <= count && (
                <p className="text-xs text-muted-foreground tabular-nums sm:text-sm">
                    {total.toLocaleString()} matching payment{total === 1 ? '' : 's'}
                </p>
            )}
        </div>
    )
}

function CardField({ label, value, capitalize = false }: { label: string; value: string; capitalize?: boolean }) {
    return (
        <div className="min-w-0">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className={`truncate font-medium tabular-nums${capitalize ? ' capitalize' : ''}`}>{value}</p>
        </div>
    )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="min-w-0 space-y-1">
            <span className="block text-xs text-muted-foreground">{label}</span>
            {children}
        </div>
    )
}
