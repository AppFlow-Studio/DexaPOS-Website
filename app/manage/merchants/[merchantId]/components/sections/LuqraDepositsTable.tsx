'use client'

import { useMemo, useState } from 'react'
import type { DateRange } from 'react-day-picker'
import { ChevronRight, Layers } from 'lucide-react'
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

    const rows: CachedDepositRow[] = data?.success ? data.data?.rows ?? [] : []

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
            <div className="space-y-3">
                <button
                    type="button"
                    onClick={() => setDrilldown(null)}
                    className="flex items-center gap-1.5 text-[12px] text-muted-foreground hover:text-foreground"
                >
                    ← Back to deposits
                </button>
                <div className="rounded-md border bg-muted/30 px-4 py-3 text-[12px]">
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                        <span className="font-medium">Deposit</span>
                        <span className="font-mono text-[11.5px]">{drilldown.reference_number ?? drilldown.id}</span>
                        <span className="text-muted-foreground">{formatDate(drilldown.deposit_date)}</span>
                        <span className="text-muted-foreground">{drilldown.location_name ?? drilldown.mid}</span>
                        <span className="ml-auto font-mono tabular-nums">
                            Net {formatMoney(drilldown.net_deposit)}
                        </span>
                        <span className="font-mono tabular-nums text-muted-foreground">
                            Fees {formatMoney(drilldown.daily_fees)}
                        </span>
                        <span className="font-mono tabular-nums text-muted-foreground">
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

                <Field label="Date range">
                    <DateRangePicker date={range} setDate={setRange} />
                </Field>

                <div className="ml-auto flex items-center gap-3 text-[12px]">
                    <span className="text-muted-foreground">{totals.count} deposits</span>
                    <span className="font-mono tabular-nums text-muted-foreground">
                        Fees {formatMoney(totals.fees)}
                    </span>
                    <span className="font-mono tabular-nums">
                        Net {formatMoney(totals.net)}
                    </span>
                </div>
            </div>

            <Table containerClassName="overflow-auto rounded-md border">
                <TableHeader className="sticky top-0 z-20 bg-card">
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
                            <TableCell colSpan={11} className="py-10 text-center text-muted-foreground">
                                No cached deposits in this range. Run <strong>Sync from Luqra</strong> on the
                                Transactions tab — it pulls deposits in the same call.
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
                                    {formatDate(r.deposit_date)}
                                </TableCell>
                                <TableCell className="font-mono text-[11.5px]">
                                    {r.reference_number ?? '—'}
                                </TableCell>
                                <TableCell className="text-[12px] text-muted-foreground">
                                    {r.location_name ?? r.mid}
                                </TableCell>
                                <TableCell className="font-mono text-[11.5px]">{r.dda_number ?? '—'}</TableCell>
                                <TableCell className="text-right font-mono tabular-nums">
                                    {formatMoney(r.batch_total)}
                                </TableCell>
                                <TableCell className="text-right font-mono tabular-nums text-muted-foreground">
                                    {formatMoney(r.daily_fees)}
                                </TableCell>
                                <TableCell className="text-right font-mono tabular-nums text-muted-foreground">
                                    {formatMoney(r.chargeback_amount)}
                                </TableCell>
                                <TableCell className="text-right font-mono tabular-nums text-muted-foreground">
                                    {formatMoney(r.adjustment_amount)}
                                </TableCell>
                                <TableCell className="text-right font-mono tabular-nums font-medium">
                                    {formatMoney(r.net_deposit)}
                                </TableCell>
                                <TableCell className="text-right">
                                    <Badge variant="outline" className="gap-1 font-mono text-[10.5px]">
                                        <Layers className="h-3 w-3" />
                                        {r.batch_count} / {r.txn_count}
                                    </Badge>
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
