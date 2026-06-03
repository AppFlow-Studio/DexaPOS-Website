'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import type { DateRange } from 'react-day-picker'
import { Banknote, CheckCircle2, ChevronRight, CircleAlert, CreditCard, Link2, Link2Off, RefreshCcwDot } from 'lucide-react'
import { InfoIcon } from '@/components/ui/info-icon'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { DateRangePicker } from '@/components/ui/date-range-picker'
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table'
import {
    getPlatformPayments,
    type PlatformPaymentFilters,
} from '@/app/manage/actions/hq-platform/payments'

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
    if (s === 'failed' || s === 'voided' || s === 'declined') return 'border-red-200 bg-red-100 text-red-800'
    if (s === 'refunded') return 'border-blue-200 bg-blue-100 text-blue-800'
    return 'border-zinc-300 bg-zinc-100 text-zinc-700'
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
    const count = 50

    const dateFrom = toIsoDate(range?.from)
    const dateTo = toIsoDate(range?.to)

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

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-end gap-3">
                <Field label="Date range">
                    <DateRangePicker
                        date={range}
                        setDate={(r) => {
                            setRange(r)
                            setPage(1)
                        }}
                    />
                </Field>
                <div className="space-y-1">
                    <span className="flex items-center gap-1 text-[10.5px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                        Settled Only
                        <InfoIcon tip="Show only payments that have been confirmed settled by the processor." side="top" />
                    </span>
                    <div className="flex h-9 items-center">
                        <Switch
                            checked={unsettledOnly}
                            onCheckedChange={(v) => {
                                setUnsettledOnly(v)
                                setPage(1)
                            }}
                        />
                    </div>
                </div>
                <div className="space-y-1">
                    <span className="flex items-center gap-1 text-[10.5px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                        Unmatched Only
                        <InfoIcon tip="Show only TSYS payments with no corresponding POS order record. Use this to investigate sync gaps." side="top" />
                    </span>
                    <div className="flex h-9 items-center">
                        <Switch
                            checked={unmatchedOnly}
                            onCheckedChange={(v) => {
                                setUnmatchedOnly(v)
                                setPage(1)
                            }}
                        />
                    </div>
                </div>
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

            {totals && (
                <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                    <Tile icon={CreditCard} label="Payments" tip="Total number of payment records on this page." value={totals.count.toLocaleString()} />
                    <Tile icon={Banknote} label="Gross" tip="Total charged amount across all payments on this page, before any fees or refunds." value={formatMoney(totals.grossSum)} />
                    <Tile
                        icon={CheckCircle2}
                        label="Settled %"
                        tip="Percentage of payments on this page that have been settled — meaning the funds have been confirmed by the processor and will be deposited."
                        value={rows.length ? `${Math.round((totals.settledCount / rows.length) * 100)}%` : '—'}
                        meta={`${totals.settledCount}/${rows.length} on page`}
                    />
                    <Tile
                        icon={Link2Off}
                        label="Unmatched"
                        tip="Payments from TSYS that have no matching order in the POS system. An unmatched payment may indicate a sync gap or a payment processed directly on the terminal outside the POS."
                        value={totals.unmatchedCount.toLocaleString()}
                        tone={totals.unmatchedCount > 0 ? 'warn' : 'good'}
                    />
                </div>
            )}

            {fetchError && (
                <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-[12.5px] text-amber-800">
                    Failed to load payments: {fetchError}
                </div>
            )}

            <Table containerClassName="overflow-auto rounded-md border">
                <TableHeader className="sticky top-0 z-20 bg-card">
                    <TableRow>
                        <TableHead>Captured</TableHead>
                        <TableHead>Merchant</TableHead>
                        <TableHead>Location</TableHead>
                        <TableHead>Order</TableHead>
                        <TableHead>Method</TableHead>
                        <TableHead>Card</TableHead>
                        <TableHead>Auth</TableHead>
                        <TableHead>Batch</TableHead>
                        <TableHead className="text-right">
                            <span className="inline-flex items-center justify-end gap-1">Total <InfoIcon tip="Full payment amount including tip. This is the gross amount charged to the cardholder." side="bottom" /></span>
                        </TableHead>
                        <TableHead className="text-right">
                            <span className="inline-flex items-center justify-end gap-1">Net fee <InfoIcon tip="Platform fee deducted from this payment. Equals the dual-pricing fee plus tip fee, minus any refunded fee portions. Reconciles with TSYS line-for-line." side="bottom" /></span>
                        </TableHead>
                        <TableHead className="text-right">
                            <span className="inline-flex items-center justify-end gap-1">Net deposit <InfoIcon tip="Amount deposited to the merchant after deducting the net fee. Formula: Gross − Net fee. Matches the TSYS statement exactly." side="bottom" /></span>
                        </TableHead>
                        <TableHead>
                            <span className="inline-flex items-center gap-1">Status <InfoIcon tip="Processor status. Captured = funds collected. Authorized = approved pending capture. Refunded = reversed. Failed/Voided = cancelled." side="bottom" /></span>
                        </TableHead>
                        <TableHead>
                            <span className="inline-flex items-center gap-1">Settled <InfoIcon tip="Whether this payment has been confirmed settled by the processor and included in a net deposit to the merchant's bank." side="bottom" /></span>
                        </TableHead>
                        <TableHead>
                            <span className="inline-flex items-center gap-1">Luqra <InfoIcon tip="Whether this payment has a matching TSYS transaction ID. Matched = TSYS confirmed receipt. Unmatched = payment not yet reconciled with TSYS." side="bottom" /></span>
                        </TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {isLoading ? (
                        Array.from({ length: 6 }).map((_, idx) => (
                            <TableRow key={`pmt-loading-${idx}`}>
                                {Array.from({ length: 14 }).map((__, ci) => (
                                    <TableCell key={`pmt-loading-${idx}-${ci}`}>
                                        <Skeleton className="h-4 w-full" />
                                    </TableCell>
                                ))}
                            </TableRow>
                        ))
                    ) : rows.length === 0 ? (
                        <TableRow>
                            <TableCell colSpan={14} className="py-10 text-center text-muted-foreground">
                                No payments match this filter.
                            </TableCell>
                        </TableRow>
                    ) : (
                        rows.map((r) => {
                            // Prefer host batch number ("009", optionally
                            // prefixed with acquirer like "TSYS-009"). Fall
                            // back to settlement_batch_label only for pre-
                            // Wave-A.1 rows where batch_number is null.
                            const hostBatchNumber = r.batch_number ?? r.dejavoo_batch_number ?? null
                            const batch = hostBatchNumber
                                ? (r.acquirer ? `${r.acquirer}-${hostBatchNumber}` : hostBatchNumber)
                                : (r.settlement_batch_label ?? null)
                            return (
                                <TableRow key={r.id}>
                                    <TableCell className="whitespace-nowrap text-[12px]">
                                        {formatDateTime(r.captured_at ?? r.initiated_at)}
                                    </TableCell>
                                    <TableCell className="text-[12px]">
                                        {r.merchant_name ? (
                                            <Link
                                                href={`/manage/merchants/${r.merchant_id}`}
                                                className="hover:underline"
                                            >
                                                {r.merchant_name}
                                            </Link>
                                        ) : (
                                            <span className="text-muted-foreground">—</span>
                                        )}
                                    </TableCell>
                                    <TableCell className="text-[12px] text-muted-foreground">
                                        {r.location_name ?? '—'}
                                    </TableCell>
                                    <TableCell>
                                        {r.order_number ? (
                                            <Link
                                                href={`/manage/transactions?orderId=${r.order_id}`}
                                                className="font-mono text-[11.5px] text-primary hover:underline"
                                            >
                                                {r.order_number}
                                            </Link>
                                        ) : (
                                            <span className="text-muted-foreground">—</span>
                                        )}
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
                                    <TableCell className="text-right font-mono tabular-nums text-[12px]">
                                        {r.net_fee > 0 ? (
                                            <span className="text-rose-600 dark:text-rose-400">
                                                -{formatMoney(r.net_fee)}
                                            </span>
                                        ) : (
                                            <span className="text-muted-foreground">—</span>
                                        )}
                                    </TableCell>
                                    <TableCell className="text-right font-mono tabular-nums text-[12px]">
                                        {formatMoney(r.net_deposit)}
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

function Tile({
    icon: Icon,
    label,
    tip,
    value,
    meta,
    tone,
}: {
    icon: React.ComponentType<{ className?: string }>
    label: string
    tip?: string
    value: string
    meta?: string
    tone?: 'good' | 'warn'
}) {
    const toneClass =
        tone === 'warn'
            ? 'border-amber-200 bg-amber-50'
            : tone === 'good'
                ? 'border-emerald-200 bg-emerald-50'
                : 'border-border bg-card'
    return (
        <div className={`rounded-md border p-3 ${toneClass}`}>
            <div className="flex items-center gap-2 text-[10.5px] uppercase tracking-[0.08em] text-muted-foreground">
                <Icon className="h-3.5 w-3.5" />
                {label}
                {tip && <InfoIcon tip={tip} side="top" />}
            </div>
            <div className="mt-1 text-lg font-semibold tabular-nums">{value}</div>
            {meta && <div className="text-[11px] text-muted-foreground">{meta}</div>}
        </div>
    )
}
