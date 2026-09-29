'use client'

import { Fragment, useMemo, useState } from 'react'
import Link from 'next/link'
import type { DateRange } from 'react-day-picker'
import { ChevronDown, ChevronRight, Download, Link2, Link2Off, RefreshCcwDot, ShieldAlert, ShieldCheck, AlertTriangle, Scale } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DateRangePicker } from '@/components/ui/date-range-picker'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
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
import { Panel, PanelSection } from '@/components/dashboard/shell'
import { PaginationBar } from '@/components/dashboard/PaginationBar'
import { useClientPagination } from '@/lib/hooks/useClientPagination'
import {
    useCachedLuqraChargebacks,
    useMerchantLocationMids,
    useSyncLuqra,
} from '@/lib/queries/use-luqra'
import type { CachedCbRow } from '@/app/manage/actions/admin-merchant/luqra-sync'
import { KpiStrip, type KpiCell } from './KpiStrip'
import { EmptySection } from './EmptySection'

function formatCurrency(amount: number): string {
    return amount.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
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
    from.setDate(from.getDate() - 90)
    return { from, to }
}

const EMPTY_TEXT = 'No disputes for this filter. Widen the date range or sync from Luqra.'

/** The expanded detail — rendered by both the table row and the phone card (§5.3). */
function DisputeDetail({ r }: { r: CachedCbRow }) {
    return (
        <div className="space-y-4 text-sm">
            <div className="grid gap-4 lg:grid-cols-3">
                <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">Original transaction</p>
                    <div className="mt-1 space-y-0.5">
                        <div>
                            Date: <span className="font-mono tabular-nums">{formatDate(r.date_transaction)}</span>
                        </div>
                        <div className="break-all">
                            Trans ID: <span className="font-mono">{r.trans_id}</span>
                        </div>
                        <div className="break-all">
                            ARN: <span className="font-mono">{r.acquirer_reference_number}</span>
                        </div>
                    </div>
                </div>
                <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">Case</p>
                    <div className="mt-1 space-y-0.5">
                        <div>
                            Type: <span>{r.dispute_type}</span>
                        </div>
                        <div>
                            Reversal: <span>{r.is_reversal}</span>
                        </div>
                        <div>
                            Resolution to: <span>{r.resolution_to ?? '—'}</span>
                        </div>
                    </div>
                </div>
                <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">Location</p>
                    <div className="mt-1 space-y-0.5">
                        <div>{r.location_name ?? '—'}</div>
                        <div className="font-mono text-xs">{r.mid}</div>
                    </div>
                </div>
            </div>

            {Array.isArray(r.history) && r.history.length > 0 && (
                <div>
                    <p className="mb-1.5 text-xs text-muted-foreground">Status history</p>
                    <ol className="space-y-2">
                        {(r.history as Array<Record<string, unknown>>).map((h, i) => (
                            <li
                                key={(h.id as number | undefined) ?? i}
                                className="flex flex-wrap items-center gap-2"
                            >
                                <Badge variant="outline">{String(h.status ?? '')}</Badge>
                                <span className="tabular-nums text-muted-foreground">
                                    {formatDate(h.dateLoaded as string | undefined)}
                                </span>
                                <span className="font-mono text-xs text-muted-foreground">
                                    case {String(h.caseNumber ?? '')}
                                </span>
                                <span className="ml-auto tabular-nums">
                                    {formatCurrency(Number(h.merchAmount) || 0)}
                                </span>
                            </li>
                        ))}
                    </ol>
                </div>
            )}
        </div>
    )
}

export function DisputesSection({ merchantId }: { merchantId: string }) {
    const [locationId, setLocationId] = useState<string>('all')
    const [range, setRange] = useState<DateRange | undefined>(defaultRange())
    const [maxRowsInput, setMaxRowsInput] = useState<string>('')
    const [expanded, setExpanded] = useState<Set<number>>(new Set())

    const dateFrom = toIsoDate(range?.from)
    const dateTo = toIsoDate(range?.to)

    const { data: midsResult } = useMerchantLocationMids(merchantId)
    const locations = useMemo(() => {
        const rows = midsResult?.success ? midsResult.data : []
        return rows.filter((r) => !!r.luqra_mid).map((r) => ({ id: r.id, name: r.name }))
    }, [midsResult])

    const { data, isLoading, isFetching, refetch } = useCachedLuqraChargebacks(merchantId, {
        locationId: locationId === 'all' ? null : locationId,
        dateFrom: dateFrom || null,
        dateTo: dateTo || null,
    })

    const sync = useSyncLuqra(merchantId)

    const fetchError = data && !data.success ? data.error : null
    const result = data?.success ? data.data : null
    const rows = useMemo(() => result?.rows ?? [], [result])
    const totals = result?.totals
    const { pageRows, pagination, setPage } = useClientPagination(rows, 10)

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
        const totalCb = Object.values(res.perMid).reduce(
            (s, m) => s + m.chargebacksIngested + m.chargebacksUpdated,
            0
        )
        const totalLinked = Object.values(res.perMid).reduce(
            (s, m) => s + (m.chargebacksReconciled ?? 0),
            0
        )
        toast.success(`Synced ${totalCb} chargeback rows · ${totalLinked} linked to orders`)
    }

    // Unknown is not zero (§4.9): row-derived figures read "—" until a result lands.
    const cells: KpiCell[] = [
        {
            icon: Scale,
            label: 'Cases (cached)',
            value: totals ? totals.cbCount.toLocaleString() : '—',
            meta: 'In selected date range',
        },
        {
            icon: ShieldAlert,
            label: 'Amount disputed',
            value: totals ? formatCurrency(totals.cbAmount) : '—',
            meta: 'Sum of merchAmount',
        },
        {
            icon: AlertTriangle,
            label: 'Open',
            value: result
                ? rows
                      .filter((r) =>
                          ['notified', 'under_review', 'pending', 'incoming', 'new case'].some((kw) =>
                              (r.current_status ?? '').toLowerCase().includes(kw)
                          )
                      )
                      .length.toLocaleString()
                : '—',
            meta: 'Active per current_status',
        },
        {
            icon: ShieldCheck,
            label: 'Lost cases',
            value: result
                ? rows
                      .filter((r) => (r.current_status ?? '').toLowerCase().includes('lost'))
                      .length.toLocaleString()
                : '—',
            meta: 'Resolved against merchant',
        },
        {
            icon: Link2Off,
            label: 'Unmatched',
            value: result
                ? rows.filter((r) => !r.reconciled_payment_id).length.toLocaleString()
                : '—',
            meta: 'No order_payment match',
        },
    ]

    const toggleExpanded = (id: number) => {
        setExpanded((prev) => {
            const next = new Set(prev)
            if (next.has(id)) next.delete(id)
            else next.add(id)
            return next
        })
    }

    return (
        <Panel>
            <PanelSection
                label="Disputes"
                caption="Chargebacks cached locally from Luqra. Sync to pull the latest for the selected date range."
                action={
                    <div className="flex flex-wrap gap-2">
                        <Button
                            variant="outline"
                            className="h-9 rounded-full px-4 text-[0.8125rem] font-medium shadow-sm"
                            onClick={() => void refetch()}
                            disabled={isFetching}
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
                }
            >
                <div className="space-y-6">
                    <KpiStrip cells={cells} loading={isLoading} />

                    <div className="flex flex-wrap items-end gap-3">
                        <Field label="Location">
                            <Select value={locationId} onValueChange={setLocationId} disabled={!locations.length}>
                                <SelectTrigger className="h-9 w-full min-w-0 text-[0.8125rem] sm:w-56">
                                    <SelectValue placeholder={locations.length ? undefined : 'No MIDs assigned'} />
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
                    </div>

                    {locations.length === 0 ? (
                        <EmptySection
                            icon={ShieldCheck}
                            title="No MIDs assigned yet"
                            body="Assign a Luqra MID to at least one location to pull live disputes."
                        />
                    ) : fetchError ? (
                        <div className="rounded-2xl bg-muted/30 px-4 py-10 text-center">
                            <p className="text-sm font-medium">We hit a snag loading disputes</p>
                            <p className="mt-1 text-sm text-muted-foreground">
                                {fetchError === 'luqra_not_configured'
                                    ? 'Luqra is not configured. Set LUQRA_API_URL and LUQRA_API_KEY in .env.'
                                    : `Luqra request failed: ${fetchError}`}
                            </p>
                            <Button variant="outline" size="sm" className="mt-3" onClick={() => void refetch()}>
                                Retry
                            </Button>
                        </div>
                    ) : (
                        <div>
                            <Table variant="data" containerClassName="hidden xl:block" className="min-w-[900px]">
                                <TableHeader>
                                    <TableRow>
                                        <TableHead className="w-8" />
                                        <TableHead>Case #</TableHead>
                                        <TableHead>Loaded</TableHead>
                                        <TableHead>Reason</TableHead>
                                        <TableHead>Card</TableHead>
                                        <TableHead className="text-right">Amount</TableHead>
                                        <TableHead>Auth</TableHead>
                                        <TableHead>Order</TableHead>
                                        <TableHead>Status</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {isLoading ? (
                                        Array.from({ length: 4 }).map((_, idx) => (
                                            <TableRow key={`disp-loading-${idx}`}>
                                                {Array.from({ length: 9 }).map((__, cellIdx) => (
                                                    <TableCell key={`disp-loading-${idx}-${cellIdx}`}>
                                                        <Skeleton className="h-4 w-full" />
                                                    </TableCell>
                                                ))}
                                            </TableRow>
                                        ))
                                    ) : rows.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={9} className="h-24 text-center text-muted-foreground">
                                                {EMPTY_TEXT}
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        pageRows.map((r) => {
                                            const isOpen = expanded.has(r.id)
                                            return (
                                                <Fragment key={r.id}>
                                                    <TableRow
                                                        className="cursor-pointer"
                                                        onClick={() => toggleExpanded(r.id)}
                                                        aria-expanded={isOpen}
                                                    >
                                                        <TableCell>
                                                            {isOpen ? (
                                                                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                                                            ) : (
                                                                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                                                            )}
                                                        </TableCell>
                                                        <TableCell className="font-mono text-xs">{r.case_number}</TableCell>
                                                        <TableCell className="tabular-nums">{formatDate(r.date_loaded)}</TableCell>
                                                        <TableCell className="max-w-[280px] truncate" title={r.reason_description ?? ''}>
                                                            <span className="font-mono text-xs text-muted-foreground">
                                                                {r.reason_code}
                                                            </span>
                                                            <span className="ml-1.5">{r.reason_description}</span>
                                                        </TableCell>
                                                        <TableCell className="font-mono text-xs">
                                                            {r.cardholder_account_number}
                                                        </TableCell>
                                                        <TableCell className="text-right tabular-nums">
                                                            {formatCurrency(Number(r.merch_amount) || 0)}
                                                        </TableCell>
                                                        <TableCell className="font-mono text-xs">{r.auth_code}</TableCell>
                                                        <TableCell onClick={(e) => e.stopPropagation()}>
                                                            {r.reconciled_order_id ? (
                                                                <Link
                                                                    href={`/manage/transactions?orderId=${r.reconciled_order_id}`}
                                                                    className="inline-flex items-center gap-1 font-mono text-xs text-foreground underline-offset-4 hover:underline"
                                                                >
                                                                    <Link2 className="h-3 w-3 text-muted-foreground" />
                                                                    #{r.reconciled_order_number ?? r.reconciled_order_id.slice(0, 8)}
                                                                </Link>
                                                            ) : (
                                                                <Badge
                                                                    variant="secondary"
                                                                    className="w-fit gap-1 rounded-full border-0 px-2.5 text-xs font-medium text-muted-foreground"
                                                                >
                                                                    <Link2Off className="h-3 w-3" />
                                                                    Unmatched
                                                                </Badge>
                                                            )}
                                                        </TableCell>
                                                        <TableCell>
                                                            <Badge
                                                                variant="secondary"
                                                                className="w-fit rounded-full border-0 px-2.5 text-xs font-medium"
                                                            >
                                                                {r.current_status ?? '—'}
                                                            </Badge>
                                                        </TableCell>
                                                    </TableRow>
                                                    {isOpen && (
                                                        <TableRow className="hover:bg-card/70">
                                                            <TableCell colSpan={9} className="px-5 py-4">
                                                                <DisputeDetail r={r} />
                                                            </TableCell>
                                                        </TableRow>
                                                    )}
                                                </Fragment>
                                            )
                                        })
                                    )}
                                </TableBody>
                            </Table>

                            <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 xl:hidden">
                                {isLoading ? (
                                    Array.from({ length: 4 }).map((_, idx) => (
                                        <div key={`disp-card-loading-${idx}`} className="space-y-3 rounded-2xl border-0 bg-muted/45 p-4">
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
                                    pageRows.map((r) => {
                                        const isOpen = expanded.has(r.id)
                                        return (
                                            <div
                                                key={r.id}
                                                className={`min-w-0 rounded-2xl border-0 bg-muted/45 p-4${isOpen ? ' sm:col-span-2' : ''}`}
                                            >
                                                <button
                                                    type="button"
                                                    onClick={() => toggleExpanded(r.id)}
                                                    aria-expanded={isOpen}
                                                    className="w-full min-w-0 text-left"
                                                >
                                                    <div className="flex items-start justify-between gap-3">
                                                        <div className="min-w-0">
                                                            <p className="truncate font-mono text-sm font-medium">{r.case_number}</p>
                                                            <p className="text-xs text-muted-foreground tabular-nums">
                                                                Loaded {formatDate(r.date_loaded)}
                                                            </p>
                                                        </div>
                                                        <div className="flex shrink-0 items-start gap-2">
                                                            <div className="text-right">
                                                                <p className="font-medium tabular-nums">
                                                                    {formatCurrency(Number(r.merch_amount) || 0)}
                                                                </p>
                                                                <p className="text-sm text-muted-foreground">{r.current_status ?? '—'}</p>
                                                            </div>
                                                            <ChevronDown
                                                                className={`mt-1 h-4 w-4 text-muted-foreground transition-transform${isOpen ? ' rotate-180' : ''}`}
                                                            />
                                                        </div>
                                                    </div>
                                                    <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                                                        <CardField label="Reason" value={`${r.reason_code ?? ''} ${r.reason_description ?? ''}`.trim() || '—'} />
                                                        <CardField label="Card" value={r.cardholder_account_number ?? '—'} />
                                                        <CardField label="Auth" value={r.auth_code ?? '—'} />
                                                        <CardField
                                                            label="Order"
                                                            value={
                                                                r.reconciled_order_id
                                                                    ? `#${r.reconciled_order_number ?? r.reconciled_order_id.slice(0, 8)}`
                                                                    : 'Unmatched'
                                                            }
                                                        />
                                                    </div>
                                                </button>
                                                {isOpen && (
                                                    <div className="mt-4 space-y-3">
                                                        {r.reconciled_order_id && (
                                                            <Link
                                                                href={`/manage/transactions?orderId=${r.reconciled_order_id}`}
                                                                className="inline-flex items-center gap-1 text-sm font-medium underline-offset-4 hover:underline"
                                                            >
                                                                <Link2 className="h-3.5 w-3.5 text-muted-foreground" />
                                                                Open order
                                                            </Link>
                                                        )}
                                                        <DisputeDetail r={r} />
                                                    </div>
                                                )}
                                            </div>
                                        )
                                    })
                                )}
                            </div>

                            <PaginationBar pagination={pagination} onPageChange={setPage} itemLabel="disputes" />
                        </div>
                    )}
                </div>
            </PanelSection>
        </Panel>
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
