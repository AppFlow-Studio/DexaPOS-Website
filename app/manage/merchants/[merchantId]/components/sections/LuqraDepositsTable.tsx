'use client'

import { useMemo, useState } from 'react'
import type { DateRange } from 'react-day-picker'
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
import { useCachedLuqraDeposits } from '@/lib/queries/use-luqra'
import type { CachedDepositRow } from '@/app/manage/actions/admin-merchant/luqra-sync'
import { cn } from '@/lib/utils'
import { LuqraTransactionsTable } from './LuqraTransactionsTable'
import { DetailToggle, LuqraDetailCard } from './LuqraDetailCard'
import { LuqraCacheEmpty } from './LuqraCacheEmpty'

const DETAIL_ID = 'luqra-deposit-detail'

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
    'No cached deposits in this range. Run Sync from Luqra on the TSYS transactions tab — it pulls deposits in the same call.'

export function LuqraDepositsTable({
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

    const { data, isLoading } = useCachedLuqraDeposits(merchantId, {
        locationId: locationId === 'all' ? null : locationId,
        dateFrom,
        dateTo,
    })

    const rows: CachedDepositRow[] = useMemo(
        () => (data?.success ? data.data?.rows ?? [] : []),
        [data]
    )
    const { pageRows, pagination, setPage } = useClientPagination(rows, 10)

    // Derived from the current rows, so a filter that drops the deposit closes it.
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
                net: acc.net + r.net_deposit,
                fees: acc.fees + r.daily_fees,
                cb: acc.cb + r.chargeback_amount,
                adj: acc.adj + r.adjustment_amount,
            }),
            { count: 0, net: 0, fees: 0, cb: 0, adj: 0 }
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

                <Field label="Date range">
                    <DateRangePicker date={range} setDate={setRange} />
                </Field>

                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm sm:ml-auto">
                    <span className="tabular-nums text-muted-foreground">{totals.count} deposits</span>
                    <span className="tabular-nums text-muted-foreground">
                        Fees {formatMoney(totals.fees)}
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
                            <TableHead>Date</TableHead>
                            <TableHead>Reference</TableHead>
                            <TableHead>Location</TableHead>
                            <TableHead>DDA</TableHead>
                            <TableHead className="text-right">Batch total</TableHead>
                            <TableHead className="text-right">Fees</TableHead>
                            <TableHead className="text-right">CB</TableHead>
                            <TableHead className="text-right">Adj</TableHead>
                            <TableHead className="text-right">Net deposit</TableHead>
                            <TableHead className="text-right">Batches / Txns</TableHead>
                            <TableHead className="w-8" />
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {isLoading ? (
                            Array.from({ length: 5 }).map((_, idx) => (
                                <TableRow key={`dep-loading-${idx}`}>
                                    {Array.from({ length: 11 }).map((__, cellIdx) => (
                                        <TableCell key={`dep-loading-${idx}-${cellIdx}`}>
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
                                        {formatDate(r.deposit_date)}
                                    </TableCell>
                                    <TableCell className="font-mono text-xs">
                                        {r.reference_number ?? '—'}
                                    </TableCell>
                                    <TableCell className="text-muted-foreground">
                                        {r.location_name ?? r.mid}
                                    </TableCell>
                                    <TableCell className="font-mono text-xs">{r.dda_number ?? '—'}</TableCell>
                                    <TableCell className="text-right tabular-nums">
                                        {formatMoney(r.batch_total)}
                                    </TableCell>
                                    <TableCell className="text-right tabular-nums text-muted-foreground">
                                        {formatMoney(r.daily_fees)}
                                    </TableCell>
                                    <TableCell className="text-right tabular-nums text-muted-foreground">
                                        {formatMoney(r.chargeback_amount)}
                                    </TableCell>
                                    <TableCell className="text-right tabular-nums text-muted-foreground">
                                        {formatMoney(r.adjustment_amount)}
                                    </TableCell>
                                    <TableCell className="text-right font-medium tabular-nums">
                                        {formatMoney(r.net_deposit)}
                                    </TableCell>
                                    <TableCell className="text-right tabular-nums">
                                        {r.batch_count} / {r.txn_count}
                                    </TableCell>
                                    <TableCell className="py-1">
                                        <DetailToggle
                                            open={selectedId === r.id}
                                            controls={DETAIL_ID}
                                            label={`Transactions in deposit ${r.reference_number ?? formatDate(r.deposit_date)}`}
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
                            <div key={`dep-card-loading-${idx}`} className="space-y-3 rounded-2xl border-0 bg-muted/45 p-4">
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
                                        <span className="block truncate font-mono text-sm font-medium">
                                            {r.reference_number ?? '—'}
                                        </span>
                                        <span className="block text-xs text-muted-foreground tabular-nums">
                                            {formatDate(r.deposit_date)}
                                        </span>
                                    </span>
                                    <span className="shrink-0 font-medium tabular-nums">{formatMoney(r.net_deposit)}</span>
                                </span>
                                <span className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                                    <CardField label="Location" value={r.location_name ?? r.mid} />
                                    <CardField label="DDA" value={r.dda_number ?? '—'} />
                                    <CardField label="Batch total" value={formatMoney(r.batch_total)} />
                                    <CardField label="Fees" value={formatMoney(r.daily_fees)} />
                                    <CardField label="CB" value={formatMoney(r.chargeback_amount)} />
                                    <CardField label="Adj" value={formatMoney(r.adjustment_amount)} />
                                    <CardField label="Batches / Txns" value={`${r.batch_count} / ${r.txn_count}`} />
                                </span>
                            </button>
                        ))
                    )}
                </div>
            </div>

            <PaginationBar pagination={pagination} onPageChange={setPage} itemLabel="deposits" />

            {selected && (
                <LuqraDetailCard
                    id={DETAIL_ID}
                    title="Deposit"
                    reference={selected.reference_number ?? selected.id}
                    onClose={() => setSelectedId(null)}
                    facts={
                        <>
                            <span className="text-muted-foreground">{formatDate(selected.deposit_date)}</span>
                            <span className="text-muted-foreground">{selected.location_name ?? selected.mid}</span>
                            <span className="tabular-nums">Net {formatMoney(selected.net_deposit)}</span>
                            <span className="tabular-nums text-muted-foreground">
                                Fees {formatMoney(selected.daily_fees)}
                            </span>
                            <span className="tabular-nums text-muted-foreground">
                                CB {formatMoney(selected.chargeback_amount)}
                            </span>
                        </>
                    }
                >
                    <LuqraTransactionsTable
                        key={selected.id}
                        merchantId={merchantId}
                        locations={locations}
                        fixedDepositId={selected.id}
                    />
                </LuqraDetailCard>
            )}
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
