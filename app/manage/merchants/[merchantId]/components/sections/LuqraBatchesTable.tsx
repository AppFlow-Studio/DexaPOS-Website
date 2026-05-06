'use client'

import { useMemo, useState } from 'react'
import type { DateRange } from 'react-day-picker'
import { ChevronRight, Layers, Banknote } from 'lucide-react'
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
import { useCachedLuqraBatches } from '@/lib/queries/use-luqra'
import type { CachedBatchRow } from '@/app/manage/actions/admin-merchant/luqra-sync'
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

export function LuqraBatchesTable({
    merchantId,
    locations,
}: {
    merchantId: string
    locations: { id: string; name: string }[]
}) {
    const [locationId, setLocationId] = useState<string>('all')
    const [range, setRange] = useState<DateRange | undefined>(defaultRange())
    const [drilldown, setDrilldown] = useState<CachedBatchRow | null>(null)

    const dateFrom = toIsoDate(range?.from)
    const dateTo = toIsoDate(range?.to)

    const { data, isLoading } = useCachedLuqraBatches(merchantId, {
        locationId: locationId === 'all' ? null : locationId,
        dateFrom,
        dateTo,
    })

    const rows: CachedBatchRow[] = data?.success ? data.data?.rows ?? [] : []

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

    if (drilldown) {
        return (
            <div className="space-y-3">
                <button
                    type="button"
                    onClick={() => setDrilldown(null)}
                    className="flex items-center gap-1.5 text-[12px] text-muted-foreground hover:text-foreground"
                >
                    ← Back to batches
                </button>
                <div className="rounded-md border bg-muted/30 px-4 py-3 text-[12px]">
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                        <span className="font-medium">Batch</span>
                        <span className="font-mono text-[11.5px]">{drilldown.id}</span>
                        <span className="text-muted-foreground">
                            statement {formatDate(drilldown.statement_date)}
                        </span>
                        <span className="text-muted-foreground">
                            {drilldown.location_name ?? drilldown.mid}
                        </span>
                        {drilldown.deposit_id && (
                            <Badge variant="outline" className="gap-1 font-mono text-[10.5px]">
                                <Banknote className="h-3 w-3" />
                                deposit linked
                            </Badge>
                        )}
                        <span className="ml-auto font-mono tabular-nums">
                            Net {formatMoney(drilldown.net_deposit)}
                        </span>
                        <span className="font-mono tabular-nums text-muted-foreground">
                            {drilldown.transactions_count} txns (luqra)
                        </span>
                        <span className="font-mono tabular-nums text-muted-foreground">
                            {drilldown.local_txn_count} cached locally
                        </span>
                    </div>
                </div>
                <LuqraTransactionsTable
                    merchantId={merchantId}
                    locations={locations}
                    fixedBatchId={drilldown.id}
                />
            </div>
        )
    }

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-end gap-3">
                <Field label="Location">
                    <Select value={locationId} onValueChange={setLocationId}>
                        <SelectTrigger className="h-9 w-56">
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

                <div className="ml-auto flex items-center gap-3 text-[12px]">
                    <span className="text-muted-foreground">
                        {totals.count} batches · {totals.txns} txns
                    </span>
                    <span className="font-mono tabular-nums text-muted-foreground">
                        Rejects {formatMoney(totals.rejects)}
                    </span>
                    <span className="font-mono tabular-nums">
                        Net {formatMoney(totals.net)}
                    </span>
                </div>
            </div>

            <Table containerClassName="overflow-auto rounded-md border">
                <TableHeader className="sticky top-0 z-20 bg-card">
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
                            <TableCell colSpan={11} className="py-10 text-center text-muted-foreground">
                                No cached batches in this range. Run <strong>Sync from Luqra</strong> from the
                                Transactions tab — batches sync alongside.
                            </TableCell>
                        </TableRow>
                    ) : (
                        rows.map((r) => (
                            <TableRow
                                key={r.id}
                                className="cursor-pointer hover:bg-muted/30"
                                onClick={() => setDrilldown(r)}
                            >
                                <TableCell className="whitespace-nowrap text-[12px]">
                                    {formatDate(r.statement_date)}
                                </TableCell>
                                <TableCell className="font-mono text-[11.5px]">{r.id}</TableCell>
                                <TableCell className="text-[12px] text-muted-foreground">
                                    {r.location_name ?? r.mid}
                                </TableCell>
                                <TableCell className="text-right font-mono tabular-nums">
                                    {r.transactions_count}
                                </TableCell>
                                <TableCell className="text-right font-mono tabular-nums text-muted-foreground">
                                    {formatMoney(r.approved_batches)}
                                </TableCell>
                                <TableCell className="text-right font-mono tabular-nums text-muted-foreground">
                                    {formatMoney(r.credits_amount)}
                                </TableCell>
                                <TableCell className="text-right font-mono tabular-nums text-muted-foreground">
                                    {formatMoney(r.rejects_amount)}
                                </TableCell>
                                <TableCell className="text-right font-mono tabular-nums font-medium">
                                    {formatMoney(r.net_deposit)}
                                </TableCell>
                                <TableCell className="text-[11px]">
                                    <NetworkPills row={r} />
                                </TableCell>
                                <TableCell>
                                    {r.deposit_id ? (
                                        <Badge variant="outline" className="gap-1 text-[10.5px]">
                                            <Banknote className="h-3 w-3" />
                                            linked
                                        </Badge>
                                    ) : (
                                        <span className="text-[11px] text-muted-foreground">—</span>
                                    )}
                                </TableCell>
                                <TableCell>
                                    <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                                </TableCell>
                            </TableRow>
                        ))
                    )}
                </TableBody>
            </Table>
        </div>
    )
}

function NetworkPills({ row }: { row: CachedBatchRow }) {
    const items: Array<{ label: string; count: number; sales: number }> = [
        { label: 'V', count: row.visa_count, sales: row.visa_sales },
        { label: 'MC', count: row.mastercard_count, sales: row.mastercard_sales },
        { label: 'AX', count: row.amex_count, sales: row.amex_sales },
        { label: 'DI', count: row.discover_count, sales: row.discover_sales },
    ].filter((x) => x.count > 0 || x.sales !== 0)
    if (!items.length) return <span className="text-muted-foreground">—</span>
    return (
        <div className="flex flex-wrap gap-1">
            {items.map((it) => (
                <span
                    key={it.label}
                    className="inline-flex items-center gap-1 rounded border bg-muted/30 px-1.5 py-0.5 font-mono"
                    title={`${it.label}: ${it.count} txns / ${formatMoney(it.sales)}`}
                >
                    <span className="font-semibold">{it.label}</span>
                    <span className="text-muted-foreground">{it.count}</span>
                </span>
            ))}
        </div>
    )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="space-y-1">
            <span className="text-[10.5px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                {label}
            </span>
            {children}
        </div>
    )
}
