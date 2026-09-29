'use client'

import { useMemo, useState } from 'react'
import type { DateRange } from 'react-day-picker'
import { ArrowLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
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
import { LuqraTransactionsTable } from './LuqraTransactionsTable'

function formatMoney(n: number) {
    return n.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
}

function formatDate(iso?: string | null) {
    if (!iso) return '—'
    return new Date(iso).toLocaleDateString()
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
    const [drilldown, setDrilldown] = useState<CachedDepositRow | null>(null)

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

    if (drilldown) {
        return (
            <div className="space-y-4">
                <Button
                    variant="ghost"
                    size="sm"
                    className="-ml-2 h-8 gap-1.5 rounded-full text-muted-foreground"
                    onClick={() => setDrilldown(null)}
                >
                    <ArrowLeft className="h-3.5 w-3.5" />
                    Back to deposits
                </Button>
                <div className="rounded-2xl bg-muted/60 px-4 py-3 text-sm">
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                        <span className="font-medium">Deposit</span>
                        <span className="font-mono text-xs">{drilldown.reference_number ?? drilldown.id}</span>
                        <span className="text-muted-foreground">{formatDate(drilldown.deposit_date)}</span>
                        <span className="text-muted-foreground">{drilldown.location_name ?? drilldown.mid}</span>
                        <span className="tabular-nums sm:ml-auto">
                            Net {formatMoney(drilldown.net_deposit)}
                        </span>
                        <span className="tabular-nums text-muted-foreground">
                            Fees {formatMoney(drilldown.daily_fees)}
                        </span>
                        <span className="tabular-nums text-muted-foreground">
                            CB {formatMoney(drilldown.chargeback_amount)}
                        </span>
                    </div>
                </div>
                <LuqraTransactionsTable
                    merchantId={merchantId}
                    locations={locations}
                    fixedDepositId={drilldown.id}
                />
            </div>
        )
    }

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
                                    {EMPTY_TEXT}
                                </TableCell>
                            </TableRow>
                        ) : (
                            pageRows.map((r) => (
                                <TableRow
                                    key={r.id}
                                    className="cursor-pointer"
                                    onClick={() => setDrilldown(r)}
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
                                    <TableCell>
                                        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
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
                            {EMPTY_TEXT}
                        </div>
                    ) : (
                        pageRows.map((r) => (
                            <button
                                key={r.id}
                                type="button"
                                onClick={() => setDrilldown(r)}
                                className="min-w-0 rounded-2xl border-0 bg-muted/45 p-4 text-left transition-colors hover:bg-muted/70"
                            >
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <p className="truncate font-mono text-sm font-medium">
                                            {r.reference_number ?? '—'}
                                        </p>
                                        <p className="text-xs text-muted-foreground tabular-nums">
                                            {formatDate(r.deposit_date)}
                                        </p>
                                    </div>
                                    <p className="shrink-0 font-medium tabular-nums">{formatMoney(r.net_deposit)}</p>
                                </div>
                                <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                                    <CardField label="Location" value={r.location_name ?? r.mid} />
                                    <CardField label="DDA" value={r.dda_number ?? '—'} />
                                    <CardField label="Batch total" value={formatMoney(r.batch_total)} />
                                    <CardField label="Fees" value={formatMoney(r.daily_fees)} />
                                    <CardField label="CB" value={formatMoney(r.chargeback_amount)} />
                                    <CardField label="Adj" value={formatMoney(r.adjustment_amount)} />
                                    <CardField label="Batches / Txns" value={`${r.batch_count} / ${r.txn_count}`} />
                                </div>
                            </button>
                        ))
                    )}
                </div>
            </div>

            <PaginationBar pagination={pagination} onPageChange={setPage} itemLabel="deposits" />
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
