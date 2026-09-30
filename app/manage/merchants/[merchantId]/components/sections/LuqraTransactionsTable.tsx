'use client'

import { Fragment, useState } from 'react'
import type { DateRange } from 'react-day-picker'
import Link from 'next/link'
import { CheckCircle2, ChevronRight, CircleAlert, Download, RefreshCcwDot } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
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
import {
    useCachedLuqraTransactions,
    useSyncLuqra,
} from '@/lib/queries/use-luqra'
import type { CachedTxnRow } from '@/app/manage/actions/admin-merchant/luqra-sync'
import { PaginationBar } from '@/components/dashboard/PaginationBar'
import type { PaginationMeta } from '@/types/pagination'
import { cn } from '@/lib/utils'
import { DetailToggle } from './LuqraDetailCard'
import { LuqraCacheEmpty } from './LuqraCacheEmpty'

const POS_ENTRY: Record<string, string> = {
    '1': 'Swipe',
    '5': 'Chip',
    '7': 'Contactless',
    '8': 'Manual',
}
const CARD_TYPE: Record<string, string> = {
    MC: 'Mastercard',
    VS: 'Visa',
    VD: 'Visa Debit',
    VB: 'Visa Business',
    AX: 'Amex',
    DI: 'Discover',
}

function formatMoney(n: number) {
    return n.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
}

function formatDate(iso?: string | null) {
    if (!iso) return '—'
    // Luqra dates are DATE columns ("2026-04-15"); `new Date()` reads those as
    // UTC midnight, which is the previous day west of UTC. Build them locally.
    const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
    const date = day ? new Date(Number(day[1]), Number(day[2]) - 1, Number(day[3])) : new Date(iso)
    return date.toLocaleDateString()
}

function formatDateTime(iso?: string | null) {
    if (!iso) return '—'
    return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

const DEBIT_CREDIT: Record<string, string> = { D: 'Debit', C: 'Credit' }

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

export function LuqraTransactionsTable({
    merchantId,
    locations,
    fixedDepositId,
    fixedBatchId,
}: {
    merchantId: string
    locations: { id: string; name: string }[]
    /** When set, scopes the cache read to a single deposit (for drilldown). */
    fixedDepositId?: string
    /** When set, scopes the cache read to a single batch. */
    fixedBatchId?: string
}) {
    const [locationId, setLocationId] = useState<string>('all')
    const [range, setRange] = useState<DateRange | undefined>(defaultRange())
    const [maxRowsInput, setMaxRowsInput] = useState<string>('')
    const [page, setPage] = useState(1)
    // A row's extra fields are few, so they open inline beneath it.
    const [expandedId, setExpandedId] = useState<string | null>(null)
    const toggleRow = (id: string) => setExpandedId((prev) => (prev === id ? null : id))
    const count = 50

    const dateFrom = toIsoDate(range?.from)
    const dateTo = toIsoDate(range?.to)

    const { data, isLoading, isFetching, refetch } = useCachedLuqraTransactions(merchantId, {
        locationId: locationId === 'all' ? null : locationId,
        dateFrom: fixedDepositId || fixedBatchId ? null : dateFrom,
        dateTo: fixedDepositId || fixedBatchId ? null : dateTo,
        depositId: fixedDepositId ?? null,
        batchId: fixedBatchId ?? null,
        page,
        count,
    })

    const sync = useSyncLuqra(merchantId)

    const rows: CachedTxnRow[] = data?.success ? data.data?.rows ?? [] : []
    const total = data?.success ? data.data?.total ?? 0 : 0

    const handleSync = async () => {
        const hasRange = !!(dateFrom || dateTo)
        const maxRows = maxRowsInput ? Math.max(1, Number(maxRowsInput)) : null
        if (!hasRange && !maxRows) {
            toast.error('Set a date range or a row count before syncing.')
            return
        }
        const res = await sync.mutateAsync({
            locationId: locationId === 'all' ? null : locationId,
            range: { dateFrom: dateFrom || undefined, dateTo: dateTo || undefined },
            maxRows,
        })
        if (!res.success) {
            const labels: Record<string, string> = {
                range_or_count_required: 'Set a date range or a row count before syncing.',
            }
            toast.error(labels[res.error ?? ''] ?? res.error ?? 'Sync failed')
            return
        }
        const totals = Object.values(res.perMid).reduce(
            (a, m) => ({
                ingested: a.ingested + m.transactionsIngested,
                updated: a.updated + m.transactionsUpdated,
                reconciled: a.reconciled + m.transactionsReconciled,
            }),
            { ingested: 0, updated: 0, reconciled: 0 }
        )
        toast.success(
            `Synced ${totals.ingested} new, ${totals.updated} updated, ${totals.reconciled} reconciled`
        )
    }

    const isDrilldown = !!(fixedDepositId || fixedBatchId)

    const emptyState = (
        <LuqraCacheEmpty
            hasRange={!isDrilldown && !!(dateFrom || dateTo)}
            onShowAllDates={() => {
                setRange(undefined)
                setPage(1)
            }}
            emptyText={EMPTY_TEXT}
        />
    )

    const pagination: PaginationMeta = {
        page,
        pageSize: count,
        total,
        totalPages: Math.max(1, Math.ceil(total / count)),
        hasNextPage: page * count < total,
        hasPreviousPage: page > 1,
    }

    const cardLabel = (r: CachedTxnRow) =>
        `${(r.card_type && CARD_TYPE[r.card_type]) || r.card_type || '—'}${r.account_last4 ? ` ****${r.account_last4}` : ''}`
    const entryLabel = (r: CachedTxnRow) =>
        (r.pos_entry_mode && POS_ENTRY[r.pos_entry_mode]) || r.pos_entry_mode || '—'

    return (
        <div className="space-y-4">
            {!isDrilldown && (
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

                <Field label="Date range">
                    <DateRangePicker
                        date={range}
                        setDate={(r) => {
                            setRange(r)
                            setPage(1)
                        }}
                    />
                </Field>

                <Field label="Max rows">
                    <Input
                        type="number"
                        inputMode="numeric"
                        min={1}
                        max={2500}
                        placeholder="optional"
                        className="h-9 w-28 text-[0.8125rem] tabular-nums"
                        value={maxRowsInput}
                        onChange={(e) => setMaxRowsInput(e.target.value.replace(/\D/g, ''))}
                    />
                </Field>

                <div className="ml-auto flex items-center gap-2">
                    <Button
                        variant="outline"
                        className="h-9 rounded-full px-4 text-[0.8125rem] font-medium shadow-sm"
                        onClick={() => void refetch()}
                        disabled={isFetching || sync.isPending}
                    >
                        <RefreshCcwDot className="h-3.5 w-3.5" />
                        Refresh
                    </Button>
                    <Button
                        className="h-9 rounded-full px-4 text-[0.8125rem] font-medium"
                        onClick={handleSync}
                        disabled={sync.isPending}
                    >
                        <Download className="h-3.5 w-3.5" />
                        {sync.isPending ? 'Syncing…' : 'Sync from Luqra'}
                    </Button>
                </div>
            </div>
            )}

            {!isDrilldown && (
                <p className="hidden text-xs text-muted-foreground sm:block">
                    Reading from local cache. To sync, set a <strong>date range</strong> or a{' '}
                    <strong>max row count</strong> — Luqra returns slowly when neither is set.
                </p>
            )}

            <div>
                <Table variant="data" containerClassName="hidden xl:block" className="min-w-[900px]">
                    <TableHeader>
                        <TableRow>
                            <TableHead>Date</TableHead>
                            <TableHead>Location</TableHead>
                            <TableHead>Terminal</TableHead>
                            <TableHead>Card</TableHead>
                            <TableHead>Entry</TableHead>
                            <TableHead>Batch</TableHead>
                            <TableHead>Auth</TableHead>
                            <TableHead className="text-right">Amount</TableHead>
                            <TableHead>Reconciled</TableHead>
                            <TableHead className="w-8" />
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {isLoading ? (
                            Array.from({ length: 6 }).map((_, idx) => (
                                <TableRow key={`luqra-loading-${idx}`}>
                                    {Array.from({ length: 10 }).map((__, cellIdx) => (
                                        <TableCell key={`luqra-loading-${idx}-${cellIdx}`}>
                                            <Skeleton className="h-4 w-full" />
                                        </TableCell>
                                    ))}
                                </TableRow>
                            ))
                        ) : rows.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={10} className="h-24 text-center text-muted-foreground">
                                    {emptyState}
                                </TableCell>
                            </TableRow>
                        ) : (
                            rows.map((r) => (
                                <Fragment key={r.id}>
                                <TableRow
                                    className="cursor-pointer"
                                    data-state={expandedId === r.id ? 'selected' : undefined}
                                    onClick={() => toggleRow(r.id)}
                                >
                                    <TableCell className="whitespace-nowrap tabular-nums">
                                        {formatDate(r.original_transaction_date)}
                                    </TableCell>
                                    <TableCell className="text-muted-foreground">
                                        {r.location_name ?? '—'}
                                    </TableCell>
                                    <TableCell className="font-mono text-xs">{r.terminal_id ?? '—'}</TableCell>
                                    <TableCell>
                                        <span className="font-medium">
                                            {(r.card_type && CARD_TYPE[r.card_type]) || r.card_type || '—'}
                                        </span>
                                        {r.account_last4 && (
                                            <span className="ml-1 text-muted-foreground tabular-nums">
                                                ****{r.account_last4}
                                            </span>
                                        )}
                                    </TableCell>
                                    <TableCell>
                                        {(r.pos_entry_mode && POS_ENTRY[r.pos_entry_mode]) || (
                                            <span className="font-mono text-muted-foreground">
                                                {r.pos_entry_mode ?? '—'}
                                            </span>
                                        )}
                                    </TableCell>
                                    <TableCell className="font-mono text-xs">{r.batch_id}</TableCell>
                                    <TableCell className="font-mono text-xs">
                                        {r.authorization_number}
                                    </TableCell>
                                    <TableCell className="text-right tabular-nums">
                                        {formatMoney(r.amount_dollars)}
                                    </TableCell>
                                    <TableCell>
                                        {r.reconciled_payment_id && r.reconciled_order_id ? (
                                            <Link
                                                href={`/manage/transactions?orderId=${r.reconciled_order_id}`}
                                                className="inline-flex items-center gap-1"
                                                title="Open linked order_payment"
                                                onClick={(e) => e.stopPropagation()}
                                            >
                                                <Badge
                                                    variant="secondary"
                                                    className="w-fit gap-1 rounded-full border-0 px-2.5 text-xs font-medium"
                                                >
                                                    <CheckCircle2 className="h-3 w-3" />
                                                    {r.reconciled_order_number ?? 'Matched'}
                                                </Badge>
                                                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                                            </Link>
                                        ) : (
                                            <Badge
                                                variant="secondary"
                                                className="w-fit gap-1 rounded-full border-0 px-2.5 text-xs font-medium text-muted-foreground"
                                            >
                                                <CircleAlert className="h-3 w-3" />
                                                Unmatched
                                            </Badge>
                                        )}
                                    </TableCell>
                                    <TableCell className="py-1">
                                        <DetailToggle
                                            open={expandedId === r.id}
                                            controls={`luqra-txn-${r.id}`}
                                            label={`Details for authorization ${r.authorization_number}`}
                                            onToggle={() => toggleRow(r.id)}
                                        />
                                    </TableCell>
                                </TableRow>
                                {expandedId === r.id && (
                                    <TableRow className="hover:bg-transparent">
                                        <TableCell
                                            id={`luqra-txn-${r.id}`}
                                            colSpan={10}
                                            className="whitespace-normal bg-muted/30 px-4 py-3"
                                        >
                                            <TxnDetails row={r} />
                                        </TableCell>
                                    </TableRow>
                                )}
                                </Fragment>
                            ))
                        )}
                    </TableBody>
                </Table>

                <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 xl:hidden">
                    {isLoading ? (
                        Array.from({ length: 4 }).map((_, idx) => (
                            <div key={`luqra-card-loading-${idx}`} className="space-y-3 rounded-2xl border-0 bg-muted/45 p-4">
                                <Skeleton className="h-4 w-32" />
                                <Skeleton className="h-4 w-full" />
                                <Skeleton className="h-4 w-2/3" />
                            </div>
                        ))
                    ) : rows.length === 0 ? (
                        <div className="col-span-full flex min-h-40 flex-col items-center justify-center gap-2 rounded-2xl bg-muted/30 px-4 text-center text-sm text-muted-foreground">
                            {emptyState}
                        </div>
                    ) : (
                        rows.map((r) => (
                            <div key={r.id} className="min-w-0 rounded-2xl border-0 bg-muted/45 p-4">
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <p className="truncate font-medium">{cardLabel(r)}</p>
                                        <p className="text-xs text-muted-foreground tabular-nums">
                                            {formatDate(r.original_transaction_date)}
                                        </p>
                                    </div>
                                    <p className="shrink-0 font-medium tabular-nums">{formatMoney(r.amount_dollars)}</p>
                                </div>
                                <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                                    <CardField label="Location" value={r.location_name ?? '—'} />
                                    <CardField label="Terminal" value={r.terminal_id ?? '—'} />
                                    <CardField label="Entry" value={entryLabel(r)} />
                                    <CardField label="Batch" value={r.batch_id} />
                                    <CardField label="Auth" value={r.authorization_number} />
                                    <div className="min-w-0">
                                        <p className="text-xs text-muted-foreground">Reconciled</p>
                                        {r.reconciled_payment_id && r.reconciled_order_id ? (
                                            <Link
                                                href={`/manage/transactions?orderId=${r.reconciled_order_id}`}
                                                className="block truncate font-medium underline-offset-4 hover:underline"
                                            >
                                                {r.reconciled_order_number ?? 'Matched'}
                                            </Link>
                                        ) : (
                                            <p className="truncate font-medium">Unmatched</p>
                                        )}
                                    </div>
                                </div>
                                {expandedId === r.id && (
                                    <div id={`luqra-txn-card-${r.id}`} className="mt-3 border-t pt-3">
                                        <TxnDetails row={r} />
                                    </div>
                                )}
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="-mb-1 -ml-2 mt-2 h-8 gap-1 rounded-full px-2 text-xs text-muted-foreground"
                                    aria-expanded={expandedId === r.id}
                                    aria-controls={expandedId === r.id ? `luqra-txn-card-${r.id}` : undefined}
                                    onClick={() => toggleRow(r.id)}
                                >
                                    <ChevronRight
                                        className={cn('h-3.5 w-3.5 transition-transform', expandedId === r.id && 'rotate-90')}
                                    />
                                    {expandedId === r.id ? 'Fewer details' : 'More details'}
                                </Button>
                            </div>
                        ))
                    )}
                </div>
            </div>

            <PaginationBar
                pagination={pagination}
                onPageChange={setPage}
                isLoading={isFetching}
                itemLabel="cached transactions"
            />
            {!isLoading && rows.length > 0 && total <= count && (
                <p className="text-xs text-muted-foreground tabular-nums sm:text-sm">
                    {total.toLocaleString()} cached transaction{total === 1 ? '' : 's'}
                </p>
            )}
        </div>
    )
}

const EMPTY_TEXT = 'No transactions in the local cache for this filter. Sync from Luqra to fetch them.'

/** The fields the row itself has no room for. Shared by the table and the phone cards. */
function TxnDetails({ row: r }: { row: CachedTxnRow }) {
    const cardNumber =
        r.account_first6 || r.account_last4
            ? `${r.account_first6 ?? '••••••'}••••••${r.account_last4 ?? '••••'}`
            : '—'
    const type = r.transaction_code_description
        ? `${r.transaction_code_description}${r.transaction_code ? ` (${r.transaction_code})` : ''}`
        : r.transaction_code ?? '—'
    const matched = !!(r.reconciled_payment_id && r.reconciled_order_id)

    return (
        <dl className="grid min-w-0 grid-cols-2 gap-x-6 gap-y-3 text-sm md:grid-cols-3 xl:grid-cols-4">
            <DetailField label="MID" value={r.mid} mono />
            <DetailField label="Card number" value={cardNumber} mono />
            <DetailField label="Type" value={type} />
            <DetailField
                label="Debit / credit"
                value={(r.debit_credit_indicator && DEBIT_CREDIT[r.debit_credit_indicator]) || r.debit_credit_indicator || '—'}
            />
            <DetailField label="Transaction date" value={formatDate(r.original_transaction_date)} />
            <DetailField label="Posted" value={formatDate(r.transaction_date)} />
            <DetailField
                label="Reconciled"
                value={matched ? formatDateTime(r.reconciled_at) : 'Not matched to a POS payment'}
            />
            {matched && <DetailField label="Payment ID" value={r.reconciled_payment_id!} mono />}
            {r.reject_reason && <DetailField label="Reject reason" value={r.reject_reason} />}
            <DetailField
                label="Synced"
                value={`First ${formatDateTime(r.first_seen_at)} · last ${formatDateTime(r.last_seen_at)}`}
                wide
            />
        </dl>
    )
}

function DetailField({
    label,
    value,
    mono = false,
    wide = false,
}: {
    label: string
    value: string
    mono?: boolean
    /** Spans two columns: for longer values like the sync timestamps. */
    wide?: boolean
}) {
    return (
        <div className={cn('min-w-0', wide && 'col-span-2')}>
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className={cn('break-words font-medium tabular-nums', mono && 'font-mono text-xs leading-5')}>{value}</dd>
        </div>
    )
}

function CardField({ label, value }: { label: string; value: string }) {
    return (
        <div className="min-w-0">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="truncate font-medium tabular-nums">{value}</p>
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
