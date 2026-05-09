'use client'

import { Fragment, useMemo, useState } from 'react'
import type { DateRange } from 'react-day-picker'
import { ChevronDown, ChevronRight, Download, RefreshCcwDot, ShieldAlert, ShieldCheck, AlertTriangle, Scale } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Empty } from '@/components/ui/empty'
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
import {
    useCachedLuqraChargebacks,
    useMerchantLocationMids,
    useSyncLuqra,
} from '@/lib/queries/use-luqra'
import { SectionHead } from './SectionHead'
import { KpiStrip, type KpiCell } from './KpiStrip'

function formatCurrency(amount: number): string {
    return amount.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
}

function formatPercent(ratio: number): string {
    return `${(ratio * 100).toFixed(2)}%`
}

function formatDate(iso?: string | null) {
    if (!iso) return '—'
    return new Date(iso).toLocaleDateString()
}

function statusTone(status: string): string {
    const s = status.toLowerCase()
    if (s.includes('won')) return 'border-emerald-200 bg-emerald-100 text-emerald-800'
    if (s.includes('lost') || s.includes('chargeback')) return 'border-red-200 bg-red-100 text-red-800'
    if (s.includes('pending') || s.includes('new case') || s.includes('notified'))
        return 'border-amber-200 bg-amber-100 text-amber-800'
    if (s.includes('reversal')) return 'border-blue-200 bg-blue-100 text-blue-800'
    return 'border-zinc-300 bg-zinc-100 text-zinc-700'
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
    const rows = result?.rows ?? []
    const totals = result?.totals

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
        toast.success(`Synced ${totalCb} chargeback rows`)
    }

    const cells: KpiCell[] = [
        {
            icon: Scale,
            label: 'Cases (cached)',
            value: totals ? totals.cbCount.toLocaleString() : '—',
            meta: 'In selected date range',
            tone: totals && totals.cbCount > 0 ? 'warn' : 'good',
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
            value: rows
                .filter((r) =>
                    ['notified', 'under_review', 'pending', 'incoming', 'new case'].some((kw) =>
                        (r.current_status ?? '').toLowerCase().includes(kw)
                    )
                )
                .length.toLocaleString(),
            meta: 'Active per current_status',
        },
        {
            icon: ShieldCheck,
            label: 'Lost cases',
            value: rows
                .filter((r) => (r.current_status ?? '').toLowerCase().includes('lost'))
                .length.toLocaleString(),
            meta: 'Resolved against merchant',
        },
    ]
    void formatPercent

    const toggleExpanded = (id: number) => {
        setExpanded((prev) => {
            const next = new Set(prev)
            if (next.has(id)) next.delete(id)
            else next.add(id)
            return next
        })
    }

    return (
        <div className="space-y-5">
            <SectionHead
                title="Disputes"
                sub="Chargebacks cached locally from Luqra. Sync to pull the latest for the selected date range."
                actions={
                    <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={() => void refetch()} disabled={isFetching}>
                            <RefreshCcwDot className="h-3.5 w-3.5" />
                            Refresh
                        </Button>
                        <Button size="sm" onClick={handleSync} disabled={sync.isPending}>
                            <Download className="h-3.5 w-3.5" />
                            {sync.isPending ? 'Syncing…' : 'Sync from Luqra'}
                        </Button>
                    </div>
                }
            />

            <KpiStrip cells={cells} loading={isLoading} />

            <div className="flex flex-wrap items-end gap-3">
                <div className="space-y-1">
                    <span className="text-[10.5px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                        Location
                    </span>
                    <Select value={locationId} onValueChange={setLocationId} disabled={!locations.length}>
                        <SelectTrigger className="h-9 w-56">
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
                </div>
                <div className="space-y-1">
                    <span className="text-[10.5px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                        Date range
                    </span>
                    <DateRangePicker date={range} setDate={setRange} />
                </div>
                <div className="space-y-1">
                    <span className="text-[10.5px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                        Max rows
                    </span>
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
                </div>
            </div>

            {fetchError && (
                <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-[12.5px] text-amber-800">
                    {fetchError === 'luqra_not_configured'
                        ? 'Luqra is not configured. Set LUQRA_API_URL and LUQRA_API_KEY in .env.'
                        : `Luqra request failed: ${fetchError}`}
                </div>
            )}

            {locations.length === 0 ? (
                <Empty
                    icon={ShieldCheck}
                    title="No MIDs assigned yet"
                    description="Assign a Luqra MID to at least one location to pull live disputes."
                />
            ) : (
                <Table containerClassName="overflow-auto rounded-md border">
                    <TableHeader className="sticky top-0 z-20 bg-card">
                        <TableRow>
                            <TableHead className="w-8" />
                            <TableHead>Case #</TableHead>
                            <TableHead>Loaded</TableHead>
                            <TableHead>Reason</TableHead>
                            <TableHead>Card</TableHead>
                            <TableHead className="text-right">Amount</TableHead>
                            <TableHead>Auth</TableHead>
                            <TableHead>Status</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {isLoading ? (
                            Array.from({ length: 4 }).map((_, idx) => (
                                <TableRow key={`disp-loading-${idx}`}>
                                    {Array.from({ length: 8 }).map((__, cellIdx) => (
                                        <TableCell key={`disp-loading-${idx}-${cellIdx}`}>
                                            <Skeleton className="h-4 w-full" />
                                        </TableCell>
                                    ))}
                                </TableRow>
                            ))
                        ) : rows.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={8} className="py-12 text-center text-muted-foreground">
                                    No active disputes for this filter.
                                </TableCell>
                            </TableRow>
                        ) : (
                            rows.map((r) => {
                                const isOpen = expanded.has(r.id)
                                return (
                                    <Fragment key={r.id}>
                                        <TableRow
                                            className="cursor-pointer hover:bg-muted/30"
                                            onClick={() => toggleExpanded(r.id)}
                                        >
                                            <TableCell>
                                                {isOpen ? (
                                                    <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                                                ) : (
                                                    <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                                                )}
                                            </TableCell>
                                            <TableCell className="font-mono text-[11.5px]">{r.case_number}</TableCell>
                                            <TableCell className="text-[12px]">{formatDate(r.date_loaded)}</TableCell>
                                            <TableCell className="max-w-[280px] truncate text-[12px]" title={r.reason_description ?? ''}>
                                                <span className="font-mono text-[11px] text-muted-foreground">
                                                    {r.reason_code}
                                                </span>
                                                <span className="ml-1.5">{r.reason_description}</span>
                                            </TableCell>
                                            <TableCell className="font-mono text-[11.5px]">
                                                {r.cardholder_account_number}
                                            </TableCell>
                                            <TableCell className="text-right font-mono tabular-nums">
                                                {formatCurrency(Number(r.merch_amount) || 0)}
                                            </TableCell>
                                            <TableCell className="font-mono text-[11.5px]">{r.auth_code}</TableCell>
                                            <TableCell>
                                                <Badge className={statusTone(r.current_status ?? '')}>{r.current_status ?? '—'}</Badge>
                                            </TableCell>
                                        </TableRow>
                                        {isOpen && (
                                            <TableRow className="bg-muted/10">
                                                <TableCell colSpan={8} className="py-3">
                                                    <div className="space-y-3 px-2">
                                                        <div className="grid gap-4 lg:grid-cols-3 text-[12px]">
                                                            <div>
                                                                <div className="text-[10.5px] uppercase tracking-[0.08em] text-muted-foreground">
                                                                    Original transaction
                                                                </div>
                                                                <div className="mt-1 space-y-0.5">
                                                                    <div>
                                                                        Date:{' '}
                                                                        <span className="font-mono">
                                                                            {formatDate(r.date_transaction)}
                                                                        </span>
                                                                    </div>
                                                                    <div>
                                                                        Trans ID:{' '}
                                                                        <span className="font-mono">{r.trans_id}</span>
                                                                    </div>
                                                                    <div>
                                                                        ARN:{' '}
                                                                        <span className="font-mono">
                                                                            {r.acquirer_reference_number}
                                                                        </span>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                            <div>
                                                                <div className="text-[10.5px] uppercase tracking-[0.08em] text-muted-foreground">
                                                                    Case
                                                                </div>
                                                                <div className="mt-1 space-y-0.5">
                                                                    <div>
                                                                        Type: <span>{r.dispute_type}</span>
                                                                    </div>
                                                                    <div>
                                                                        Reversal: <span>{r.is_reversal}</span>
                                                                    </div>
                                                                    <div>
                                                                        Resolution to:{' '}
                                                                        <span>{r.resolution_to ?? '—'}</span>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                            <div>
                                                                <div className="text-[10.5px] uppercase tracking-[0.08em] text-muted-foreground">
                                                                    Location
                                                                </div>
                                                                <div className="mt-1 space-y-0.5">
                                                                    <div>{r.location_name ?? '—'}</div>
                                                                    <div className="font-mono text-[11px]">{r.mid}</div>
                                                                </div>
                                                            </div>
                                                        </div>

                                                        {Array.isArray(r.history) && r.history.length > 0 && (
                                                            <div>
                                                                <div className="mb-1.5 text-[10.5px] uppercase tracking-[0.08em] text-muted-foreground">
                                                                    Status history
                                                                </div>
                                                                <ol className="relative space-y-2 border-l pl-4">
                                                                    {(r.history as Array<Record<string, unknown>>).map((h, i) => (
                                                                        <li key={(h.id as number | undefined) ?? i} className="text-[12px]">
                                                                            <div className="absolute -left-1 mt-1.5 h-2 w-2 rounded-full bg-foreground" />
                                                                            <div className="flex flex-wrap items-center gap-2">
                                                                                <Badge className={statusTone(String(h.status ?? ''))}>
                                                                                    {String(h.status ?? '')}
                                                                                </Badge>
                                                                                <span className="text-muted-foreground">
                                                                                    {formatDate(h.dateLoaded as string | undefined)}
                                                                                </span>
                                                                                <span className="font-mono text-[11px] text-muted-foreground">
                                                                                    case {String(h.caseNumber ?? '')}
                                                                                </span>
                                                                                <span className="ml-auto font-mono tabular-nums">
                                                                                    {formatCurrency(
                                                                                        Number(h.merchAmount) || 0
                                                                                    )}
                                                                                </span>
                                                                            </div>
                                                                        </li>
                                                                    ))}
                                                                </ol>
                                                            </div>
                                                        )}
                                                    </div>
                                                </TableCell>
                                            </TableRow>
                                        )}
                                    </Fragment>
                                )
                            })
                        )}
                    </TableBody>
                </Table>
            )}
        </div>
    )
}
