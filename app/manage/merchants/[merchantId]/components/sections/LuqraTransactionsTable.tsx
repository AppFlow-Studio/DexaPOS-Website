'use client'

import { useState } from 'react'
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
                        className="h-9 w-28 tabular-nums"
                        value={maxRowsInput}
                        onChange={(e) => setMaxRowsInput(e.target.value.replace(/\D/g, ''))}
                    />
                </Field>

                <div className="ml-auto flex items-center gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => void refetch()}
                        disabled={isFetching || sync.isPending}
                    >
                        <RefreshCcwDot className="h-3.5 w-3.5" />
                        Refresh
                    </Button>
                    <Button size="sm" onClick={handleSync} disabled={sync.isPending}>
                        <Download className="h-3.5 w-3.5" />
                        {sync.isPending ? 'Syncing…' : 'Sync from Luqra'}
                    </Button>
                </div>
            </div>
            )}

            {!isDrilldown && (
                <div className="text-[11.5px] text-muted-foreground">
                    Reading from local cache. To sync, set a <strong>date range</strong> or a{' '}
                    <strong>max row count</strong> — Luqra returns slowly when neither is set.
                </div>
            )}

            <Table containerClassName="overflow-auto rounded-md border">
                <TableHeader className="sticky top-0 z-20 bg-card">
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
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {isLoading ? (
                        Array.from({ length: 6 }).map((_, idx) => (
                            <TableRow key={`luqra-loading-${idx}`}>
                                {Array.from({ length: 9 }).map((__, cellIdx) => (
                                    <TableCell key={`luqra-loading-${idx}-${cellIdx}`}>
                                        <Skeleton className="h-4 w-full" />
                                    </TableCell>
                                ))}
                            </TableRow>
                        ))
                    ) : rows.length === 0 ? (
                        <TableRow>
                            <TableCell colSpan={9} className="py-10 text-center text-muted-foreground">
                                No transactions in the local cache for this filter. Click{' '}
                                <strong>Sync from Luqra</strong> to fetch.
                            </TableCell>
                        </TableRow>
                    ) : (
                        rows.map((r) => (
                            <TableRow key={r.id}>
                                <TableCell className="whitespace-nowrap text-[12px]">
                                    {formatDate(r.original_transaction_date)}
                                </TableCell>
                                <TableCell className="text-[12px] text-muted-foreground">
                                    {r.location_name ?? '—'}
                                </TableCell>
                                <TableCell className="font-mono text-[11.5px]">{r.terminal_id ?? '—'}</TableCell>
                                <TableCell className="text-[12px]">
                                    <span className="font-medium">
                                        {(r.card_type && CARD_TYPE[r.card_type]) || r.card_type || '—'}
                                    </span>
                                    {r.account_last4 && (
                                        <span className="ml-1 text-muted-foreground">
                                            ****{r.account_last4}
                                        </span>
                                    )}
                                </TableCell>
                                <TableCell className="text-[12px]">
                                    {(r.pos_entry_mode && POS_ENTRY[r.pos_entry_mode]) || (
                                        <span className="font-mono text-muted-foreground">
                                            {r.pos_entry_mode ?? '—'}
                                        </span>
                                    )}
                                </TableCell>
                                <TableCell className="font-mono text-[11.5px]">{r.batch_id}</TableCell>
                                <TableCell className="font-mono text-[11.5px]">
                                    {r.authorization_number}
                                </TableCell>
                                <TableCell className="text-right font-mono tabular-nums">
                                    {formatMoney(r.amount_dollars)}
                                </TableCell>
                                <TableCell>
                                    {r.reconciled_payment_id && r.reconciled_order_id ? (
                                        <Link
                                            href={`/manage/transactions?orderId=${r.reconciled_order_id}`}
                                            className="inline-flex items-center gap-1"
                                            title="Open linked order_payment"
                                        >
                                            <Badge className="border-emerald-200 bg-emerald-100 text-emerald-800 hover:bg-emerald-200">
                                                <CheckCircle2 className="h-3 w-3" />
                                                {r.reconciled_order_number ?? 'Matched'}
                                            </Badge>
                                            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                                        </Link>
                                    ) : (
                                        <Badge variant="outline" className="text-muted-foreground">
                                            <CircleAlert className="h-3 w-3" />
                                            Unmatched
                                        </Badge>
                                    )}
                                </TableCell>
                            </TableRow>
                        ))
                    )}
                </TableBody>
            </Table>

            <div className="flex items-center justify-between text-[12px] text-muted-foreground">
                <span>
                    Page {page} · {rows.length} of {total} cached
                </span>
                <div className="flex gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        disabled={page <= 1 || isFetching}
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                    >
                        Previous
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        disabled={rows.length < count || isFetching}
                        onClick={() => setPage((p) => p + 1)}
                    >
                        Next
                    </Button>
                </div>
            </div>
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
