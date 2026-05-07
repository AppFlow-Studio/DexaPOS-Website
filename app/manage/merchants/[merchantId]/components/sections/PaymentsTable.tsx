'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import type { DateRange } from 'react-day-picker'
import { Banknote, CheckCircle2, ChevronRight, CircleAlert, CreditCard, Layers, Link2, Link2Off, RefreshCcwDot, ShieldCheck } from 'lucide-react'
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

function statusTone(status: string): string {
    const s = status.toLowerCase()
    if (s === 'captured' || s === 'authorized') return 'border-emerald-200 bg-emerald-100 text-emerald-800'
    if (s === 'pending') return 'border-amber-200 bg-amber-100 text-amber-800'
    if (s === 'failed' || s === 'voided') return 'border-red-200 bg-red-100 text-red-800'
    if (s === 'refunded') return 'border-blue-200 bg-blue-100 text-blue-800'
    return 'border-zinc-300 bg-zinc-100 text-zinc-700'
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
    const count = 50

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
            meta: totals ? `${totals.settledCount}/${rows.length} on page` : 'No data',
        },
        {
            icon: Link2Off,
            label: 'Unmatched',
            value: totals ? totals.unmatchedCount.toLocaleString() : '—',
            meta: 'No Luqra reconciliation yet',
            tone: totals && totals.unmatchedCount > 0 ? 'warn' : 'good',
        },
    ]

    return (
        <div className="space-y-4">
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

                <Field label="Status">
                    <Select
                        value={status}
                        onValueChange={(v) => {
                            setStatus(v)
                            setPage(1)
                        }}
                    >
                        <SelectTrigger className="h-9 w-40">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All</SelectItem>
                            {PAYMENT_STATUSES.map((s) => (
                                <SelectItem key={s} value={s}>
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
                            checked={unmatchedOnly}
                            onCheckedChange={(v) => {
                                setUnmatchedOnly(v)
                                setPage(1)
                            }}
                        />
                    </div>
                </Field>

                <div className="ml-auto flex items-center gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => void refetch()}
                        disabled={isFetching}
                    >
                        <RefreshCcwDot className="h-3.5 w-3.5" />
                        Refresh
                    </Button>
                </div>
            </div>

            {fetchError && (
                <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-[12.5px] text-amber-800">
                    Failed to load payments: {fetchError}
                </div>
            )}

            <Table containerClassName="overflow-auto rounded-md border">
                <TableHeader className="sticky top-0 z-20 bg-card">
                    <TableRow>
                        <TableHead>Captured</TableHead>
                        <TableHead>Order</TableHead>
                        <TableHead>Location</TableHead>
                        <TableHead>Method</TableHead>
                        <TableHead>Card</TableHead>
                        <TableHead>Auth</TableHead>
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
                                {Array.from({ length: 11 }).map((__, ci) => (
                                    <TableCell key={`pmt-loading-${idx}-${ci}`}>
                                        <Skeleton className="h-4 w-full" />
                                    </TableCell>
                                ))}
                            </TableRow>
                        ))
                    ) : rows.length === 0 ? (
                        <TableRow>
                            <TableCell colSpan={11} className="py-10 text-center text-muted-foreground">
                                No payments match this filter.
                            </TableCell>
                        </TableRow>
                    ) : (
                        rows.map((r) => {
                            const batch =
                                r.settlement_batch_label ??
                                r.batch_number ??
                                r.dejavoo_batch_number ??
                                null
                            return (
                                <TableRow key={r.id}>
                                    <TableCell className="whitespace-nowrap text-[12px]">
                                        {formatDateTime(r.captured_at ?? r.initiated_at)}
                                    </TableCell>
                                    <TableCell>
                                        <Link
                                            href={`/manage/transactions?orderId=${r.order_id}`}
                                            className="inline-flex items-center gap-1 font-mono text-[11.5px] text-primary hover:underline"
                                        >
                                            {r.order_number ?? r.order_id.slice(0, 8)}
                                        </Link>
                                    </TableCell>
                                    <TableCell className="text-[12px] text-muted-foreground">
                                        {r.location_name ?? '—'}
                                    </TableCell>
                                    <TableCell className="text-[12px] capitalize">
                                        {r.payment_method}
                                    </TableCell>
                                    <TableCell className="text-[12px]">
                                        {r.card_type ? (
                                            <span>
                                                <span className="font-medium">{r.card_type}</span>
                                                {r.card_last_four && (
                                                    <span className="ml-1 text-muted-foreground">
                                                        •••{r.card_last_four}
                                                    </span>
                                                )}
                                            </span>
                                        ) : (
                                            '—'
                                        )}
                                    </TableCell>
                                    <TableCell className="font-mono text-[11.5px]">
                                        {r.authorization_code ?? '—'}
                                    </TableCell>
                                    <TableCell className="font-mono text-[11.5px]">
                                        {batch ? (
                                            <Badge variant="outline" className="text-[10.5px]">
                                                {batch}
                                            </Badge>
                                        ) : (
                                            <span className="text-muted-foreground">—</span>
                                        )}
                                    </TableCell>
                                    <TableCell className="text-right font-mono tabular-nums">
                                        {formatMoney(r.total_amount)}
                                    </TableCell>
                                    <TableCell>
                                        <Badge className={statusTone(r.status)}>{r.status}</Badge>
                                    </TableCell>
                                    <TableCell>
                                        {r.is_settled ? (
                                            <Badge className="border-emerald-200 bg-emerald-100 text-emerald-800">
                                                <CheckCircle2 className="h-3 w-3" />
                                                Settled
                                            </Badge>
                                        ) : (
                                            <Badge variant="outline" className="text-muted-foreground">
                                                Pending
                                            </Badge>
                                        )}
                                    </TableCell>
                                    <TableCell>
                                        {r.luqra_transaction_id ? (
                                            <Link
                                                href={`/manage/transactions?paymentId=${r.id}`}
                                                className="inline-flex items-center gap-1"
                                                title="Open payment in transactions"
                                            >
                                                <Badge className="border-emerald-200 bg-emerald-100 text-emerald-800 hover:bg-emerald-200">
                                                    <Link2 className="h-3 w-3" />
                                                    {r.luqra_batch_id ?? 'Matched'}
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
                            )
                        })
                    )}
                </TableBody>
            </Table>

            <div className="flex items-center justify-between text-[12px] text-muted-foreground">
                <span>
                    Page {page} · {rows.length} of {total} matching
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

void Layers
