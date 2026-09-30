'use client'

import { useMemo, useState } from 'react'
import type { DateRange } from 'react-day-picker'
import { Banknote } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
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
import { PaginationBar } from '@/components/dashboard/PaginationBar'
import { useClientPagination } from '@/lib/hooks/useClientPagination'
import { useCachedLuqraBatches } from '@/lib/queries/use-luqra'
import type { CachedBatchRow } from '@/app/manage/actions/admin-merchant/luqra-sync'
import { cn } from '@/lib/utils'
import { LuqraTransactionsTable } from './LuqraTransactionsTable'
import { DetailToggle, LuqraDetailCard } from './LuqraDetailCard'
import { LuqraCacheEmpty } from './LuqraCacheEmpty'

const DETAIL_ID = 'luqra-batch-detail'

function formatMoney(n: number) {
    return n.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
}

function formatDate(iso?: string | null) {
    if (!iso) return '—'
    // DATE column ("2026-04-15"): build it locally, not as UTC midnight.
    const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
    const date = day ? new Date(Number(day[1]), Number(day[2]) - 1, Number(day[3])) : new Date(iso)
    return date.toLocaleDateString()
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

const EMPTY_TEXT =
    'No cached batches in this range. Run Sync from Luqra from the TSYS transactions tab — batches sync alongside.'

export function LuqraBatchesTable({
    merchantId,
    locations,
}: {
    merchantId: string
    locations: { id: string; name: string }[]
}) {
    const [locationId, setLocationId] = useState<string>('all')
    const [range, setRange] = useState<DateRange | undefined>(defaultRange())
    const [selectedId, setSelectedId] = useState<string | null>(null)

    const dateFrom = toIsoDate(range?.from)
    const dateTo = toIsoDate(range?.to)

    const { data, isLoading } = useCachedLuqraBatches(merchantId, {
        locationId: locationId === 'all' ? null : locationId,
        dateFrom,
        dateTo,
    })

    const rows: CachedBatchRow[] = useMemo(
        () => (data?.success ? data.data?.rows ?? [] : []),
        [data]
    )
    const { pageRows, pagination, setPage } = useClientPagination(rows, 10)

    // Derived from the current rows, so a filter that drops the batch closes it.
    const selected = useMemo(
        () => rows.find((r) => r.id === selectedId) ?? null,
        [rows, selectedId]
    )
    const toggle = (id: string) => setSelectedId((prev) => (prev === id ? null : id))

    const emptyState = (
        <LuqraCacheEmpty
            hasRange={!!(dateFrom || dateTo)}
            onShowAllDates={() => setRange(undefined)}
            emptyText={EMPTY_TEXT}
        />
    )

    const totals = useMemo(() => {
        return rows.reduce(
            (acc, r) => ({
                count: acc.count + 1,
                txns: acc.txns + r.transactions_count,
                net: acc.net + r.net_deposit,
                rejects: acc.rejects + r.rejects_amount,
            }),
            { count: 0, txns: 0, net: 0, rejects: 0 }
        )
    }, [rows])

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-end gap-3">
                <Field label="Location">
                    <Select value={locationId} onValueChange={setLocationId}>
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

                <Field label="Statement date range">
                    <DateRangePicker date={range} setDate={setRange} />
                </Field>

                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm sm:ml-auto">
                    <span className="tabular-nums text-muted-foreground">
                        {totals.count} batches · {totals.txns} txns
                    </span>
                    <span className="tabular-nums text-muted-foreground">
                        Rejects {formatMoney(totals.rejects)}
                    </span>
                    <span className="font-medium tabular-nums">
                        Net {formatMoney(totals.net)}
                    </span>
                </div>
            </div>

            <div>
                <Table variant="data" containerClassName="hidden xl:block" className="min-w-[960px]">
                    <TableHeader>
                        <TableRow>
                            <TableHead>Statement</TableHead>
                            <TableHead>Batch ID</TableHead>
                            <TableHead>Location</TableHead>
                            <TableHead className="text-right">Txns</TableHead>
                            <TableHead className="text-right">Approved</TableHead>
                            <TableHead className="text-right">Credits</TableHead>
                            <TableHead className="text-right">Rejects</TableHead>
                            <TableHead className="text-right">Net</TableHead>
                            <TableHead>Networks</TableHead>
                            <TableHead>Deposit</TableHead>
                            <TableHead className="w-8" />
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {isLoading ? (
                            Array.from({ length: 5 }).map((_, idx) => (
                                <TableRow key={`b-loading-${idx}`}>
                                    {Array.from({ length: 11 }).map((__, cellIdx) => (
                                        <TableCell key={`b-loading-${idx}-${cellIdx}`}>
                                            <Skeleton className="h-4 w-full" />
                                        </TableCell>
                                    ))}
                                </TableRow>
                            ))
                        ) : rows.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={11} className="h-24 text-center text-muted-foreground">
                                    {emptyState}
                                </TableCell>
                            </TableRow>
                        ) : (
                            pageRows.map((r) => (
                                <TableRow
                                    key={r.id}
                                    className="cursor-pointer"
                                    data-state={selectedId === r.id ? 'selected' : undefined}
                                    onClick={() => toggle(r.id)}
                                >
                                    <TableCell className="whitespace-nowrap tabular-nums">
                                        {formatDate(r.statement_date)}
                                    </TableCell>
                                    <TableCell className="font-mono text-xs">{r.id}</TableCell>
                                    <TableCell className="text-muted-foreground">
                                        {r.location_name ?? r.mid}
                                    </TableCell>
                                    <TableCell className="text-right tabular-nums">
                                        {r.transactions_count}
                                    </TableCell>
                                    <TableCell className="text-right tabular-nums text-muted-foreground">
                                        {formatMoney(r.approved_batches)}
                                    </TableCell>
                                    <TableCell className="text-right tabular-nums text-muted-foreground">
                                        {formatMoney(r.credits_amount)}
                                    </TableCell>
                                    <TableCell className="text-right tabular-nums text-muted-foreground">
                                        {formatMoney(r.rejects_amount)}
                                    </TableCell>
                                    <TableCell className="text-right font-medium tabular-nums">
                                        {formatMoney(r.net_deposit)}
                                    </TableCell>
                                    <TableCell className="text-xs">
                                        <NetworkPills row={r} />
                                    </TableCell>
                                    <TableCell>
                                        {r.deposit_id ? (
                                            <Badge
                                                variant="secondary"
                                                className="w-fit gap-1 rounded-full border-0 px-2.5 text-xs font-medium"
                                            >
                                                <Banknote className="h-3 w-3" />
                                                linked
                                            </Badge>
                                        ) : (
                                            <span className="text-muted-foreground">—</span>
                                        )}
                                    </TableCell>
                                    <TableCell className="py-1">
                                        <DetailToggle
                                            open={selectedId === r.id}
                                            controls={DETAIL_ID}
                                            label={`Transactions in batch ${r.id}`}
                                            onToggle={() => toggle(r.id)}
                                        />
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>

                <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 xl:hidden">
                    {isLoading ? (
                        Array.from({ length: 4 }).map((_, idx) => (
                            <div key={`b-card-loading-${idx}`} className="space-y-3 rounded-2xl border-0 bg-muted/45 p-4">
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
                        pageRows.map((r) => (
                            <button
                                key={r.id}
                                type="button"
                                onClick={() => toggle(r.id)}
                                aria-expanded={selectedId === r.id}
                                aria-controls={selectedId === r.id ? DETAIL_ID : undefined}
                                className={cn(
                                    'min-w-0 rounded-2xl border-0 bg-muted/45 p-4 text-left transition-colors hover:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                                    selectedId === r.id && 'bg-muted ring-1 ring-border'
                                )}
                            >
                                <span className="flex items-start justify-between gap-3">
                                    <span className="min-w-0">
                                        <span className="block truncate font-mono text-sm font-medium">{r.id}</span>
                                        <span className="block text-xs text-muted-foreground tabular-nums">
                                            Statement {formatDate(r.statement_date)}
                                        </span>
                                    </span>
                                    <span className="shrink-0 font-medium tabular-nums">{formatMoney(r.net_deposit)}</span>
                                </span>
                                <span className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                                    <CardField label="Location" value={r.location_name ?? r.mid} />
                                    <CardField label="Txns" value={String(r.transactions_count)} />
                                    <CardField label="Approved" value={formatMoney(r.approved_batches)} />
                                    <CardField label="Credits" value={formatMoney(r.credits_amount)} />
                                    <CardField label="Rejects" value={formatMoney(r.rejects_amount)} />
                                    <CardField label="Deposit" value={r.deposit_id ? 'Linked' : '—'} />
                                    <CardField label="Networks" value={networkSummary(r)} />
                                </span>
                            </button>
                        ))
                    )}
                </div>
            </div>

            <PaginationBar pagination={pagination} onPageChange={setPage} itemLabel="batches" />

            {selected && (
                <LuqraDetailCard
                    id={DETAIL_ID}
                    title="Batch"
                    reference={selected.id}
                    onClose={() => setSelectedId(null)}
                    facts={
                        <>
                            <span className="text-muted-foreground">
                                Statement {formatDate(selected.statement_date)}
                            </span>
                            <span className="text-muted-foreground">
                                {selected.location_name ?? selected.mid}
                            </span>
                            {selected.deposit_id && (
                                <span className="inline-flex items-center gap-1 text-muted-foreground">
                                    <Banknote className="h-3.5 w-3.5" />
                                    Deposit linked
                                </span>
                            )}
                            <span className="tabular-nums">Net {formatMoney(selected.net_deposit)}</span>
                            <span className="tabular-nums text-muted-foreground">
                                {selected.transactions_count} txns (Luqra) · {selected.local_txn_count} cached locally
                            </span>
                        </>
                    }
                >
                    <LuqraTransactionsTable
                        key={selected.id}
                        merchantId={merchantId}
                        locations={locations}
                        fixedBatchId={selected.id}
                    />
                </LuqraDetailCard>
            )}
        </div>
    )
}

function networkItems(row: CachedBatchRow) {
    return [
        { label: 'V', count: row.visa_count, sales: row.visa_sales },
        { label: 'MC', count: row.mastercard_count, sales: row.mastercard_sales },
        { label: 'AX', count: row.amex_count, sales: row.amex_sales },
        { label: 'DI', count: row.discover_count, sales: row.discover_sales },
    ].filter((x) => x.count > 0 || x.sales !== 0)
}

function networkSummary(row: CachedBatchRow): string {
    const items = networkItems(row)
    return items.length ? items.map((it) => `${it.label} ${it.count}`).join(' · ') : '—'
}

function NetworkPills({ row }: { row: CachedBatchRow }) {
    const items = networkItems(row)
    if (!items.length) return <span className="text-muted-foreground">—</span>
    return (
        <div className="flex flex-wrap gap-1">
            {items.map((it) => (
                <span
                    key={it.label}
                    className="inline-flex items-center gap-1 rounded-full bg-muted/60 px-2 py-0.5 font-mono tabular-nums"
                    title={`${it.label}: ${it.count} txns / ${formatMoney(it.sales)}`}
                >
                    <span className="font-semibold">{it.label}</span>
                    <span className="text-muted-foreground">{it.count}</span>
                </span>
            ))}
        </div>
    )
}

/** Spans only: these sit inside a <button>, which allows phrasing content alone. */
function CardField({ label, value }: { label: string; value: string }) {
    return (
        <span className="block min-w-0">
            <span className="block text-xs text-muted-foreground">{label}</span>
            <span className="block truncate font-medium tabular-nums">{value}</span>
        </span>
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
