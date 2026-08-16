'use client'

import type { ReactNode } from 'react'
import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useQuery } from '@tanstack/react-query'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
    ArrowLeft, CreditCard, Wifi, WifiOff, Clock, AlertTriangle, CheckCircle2,
    XCircle, Loader2, RefreshCw, Activity, Layers, FolderOpen, KeyRound, Cpu,
    Hash, Store, Server, Banknote, PauseCircle,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { formatDistanceToNow, format } from 'date-fns'
import { getPaymentDeviceDetail } from '@/app/manage/actions/admin-merchant/payment-device-detail'
import type {
    DeviceBatch, DevicePayment, DeviceUnsettledSummary, DeviceIdentity,
} from '@/app/manage/actions/admin-merchant/payment-device-detail'

const fmtUsd = (n: number | null | undefined) =>
    n == null ? '—' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)

const timeAgo = (iso: string | null | undefined) => {
    if (!iso) return '—'
    try { return formatDistanceToNow(new Date(iso), { addSuffix: true }) } catch { return '—' }
}
const dateTime = (iso: string | null | undefined) => {
    if (!iso) return '—'
    try { return format(new Date(iso), 'MMM d, HH:mm:ss') } catch { return '—' }
}
const dateTimeAmPm = (iso: string | null | undefined) => {
    if (!iso) return '—'
    try { return format(new Date(iso), 'MMM d, yyyy h:mm a') } catch { return '—' }
}
const dateOnly = (iso: string | null | undefined) => {
    if (!iso) return '—'
    try { return format(new Date(iso), 'MMM d, yyyy') } catch { return '—' }
}
const batchLabel = (b: DeviceBatch) => {
    const num = b.batch_number || b.batch_id
    return b.acquirer ? `${b.acquirer}-${num}` : num
}

function ConnectionBadge({ state }: { state: string }) {
    if (state === 'online') return <Badge className="bg-green-600 hover:bg-green-600"><Wifi className="h-3 w-3 mr-1" />Online</Badge>
    if (state === 'stale') return <Badge className="bg-amber-500 hover:bg-amber-500"><Clock className="h-3 w-3 mr-1" />Stale</Badge>
    if (state === 'offline') return <Badge variant="secondary"><WifiOff className="h-3 w-3 mr-1" />Offline</Badge>
    return <Badge variant="outline"><Clock className="h-3 w-3 mr-1" />Unknown</Badge>
}

function statusBadge(status: string) {
    const s = status?.toLowerCase()
    // Matches the /settlements palette: open=amber, closed=blue, submitted=purple,
    // settled=emerald, funded=green.
    if (s === 'funded')
        return <Badge variant="outline" className="border-green-300 bg-green-100 text-green-800">funded</Badge>
    if (s === 'settled')
        return <Badge variant="outline" className="border-emerald-300 bg-emerald-100 text-emerald-800">settled</Badge>
    if (s === 'submitted')
        return <Badge variant="outline" className="border-purple-300 bg-purple-100 text-purple-800">submitted</Badge>
    if (s === 'closed')
        return <Badge variant="outline" className="border-blue-300 bg-blue-100 text-blue-800">closed</Badge>
    if (s === 'open')
        return <Badge variant="outline" className="border-amber-300 bg-amber-100 text-amber-800">open</Badge>
    if (s === 'needs_review')
        return <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-800">needs review</Badge>
    if (s === 'failed' || s === 'partial_failure' || s === 'terminal_unavailable')
        return <Badge variant="outline" className="border-red-300 bg-red-50 text-red-700">{status}</Badge>
    if (s === 'pending' || s === 'settling')
        return <Badge variant="outline" className="border-blue-300 bg-blue-50 text-blue-700">{status}</Badge>
    return <Badge variant="outline">{status}</Badge>
}

function originBadge(origin: string | null) {
    if (origin === 'valor_webhook') return <Badge variant="outline" className="border-blue-300 bg-blue-50 text-blue-700">Auto · Webhook</Badge>
    if (origin === 'pos_auto') return <Badge variant="outline" className="border-blue-300 bg-blue-50 text-blue-700">Auto</Badge>
    if (origin === 'hq_manual') return <Badge variant="outline" className="border-slate-300 bg-slate-50 text-slate-600">Manual · HQ</Badge>
    if (origin === 'pos_manual') return <Badge variant="outline" className="border-slate-300 bg-slate-50 text-slate-600">Manual</Badge>
    return <span className="text-muted-foreground">—</span>
}

function eventOutcomeBadge(outcome: string) {
    switch (outcome) {
        case 'processed': return <Badge className="bg-green-600 hover:bg-green-600">processed</Badge>
        case 'needs_review': return <Badge className="bg-amber-500 hover:bg-amber-500">needs review</Badge>
        case 'dead_letter': return <Badge variant="outline" className="border-red-300 bg-red-50 text-red-700">dead-letter</Badge>
        case 'invalid_signature': return <Badge variant="outline" className="border-red-300 bg-red-50 text-red-700">invalid sig</Badge>
        case 'error': return <Badge variant="outline" className="border-red-300 bg-red-50 text-red-700">error</Badge>
        case 'ignored': return <Badge variant="secondary">ignored</Badge>
        case 'validation': return <Badge variant="outline">validation</Badge>
        default: return <Badge variant="outline">{outcome}</Badge>
    }
}

function attemptOutcomeBadge(outcome: string) {
    switch (outcome) {
        case 'success': return <Badge className="bg-green-600 hover:bg-green-600">success</Badge>
        case 'failed': return <Badge variant="outline" className="border-red-300 bg-red-50 text-red-700">failed</Badge>
        case 'timeout': return <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-800">timeout</Badge>
        case 'blocked': return <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-800">blocked</Badge>
        case 'started': return <Badge variant="secondary">started</Badge>
        default: return <Badge variant="outline">{outcome}</Badge>
    }
}

// Real brand artwork per terminal type (dropped into public/)
const BRAND_LOGO: Record<string, string> = {
    valor: '/valorlogo.jpg',
    castles: '/castles.jpg',
    dejavoo: '/dejavoo.png',
}

type BrandTheme = {
    label: string
    heroGradient: string
    glow: string
    modelChip: string
}

function brandTheme(type: string): BrandTheme {
    switch (type) {
        case 'valor':
            return {
                label: 'Valor',
                heroGradient: 'from-slate-900 via-slate-900 to-blue-950',
                glow: 'bg-blue-500/30',
                modelChip: 'border-blue-400/30 bg-blue-500/10 text-blue-100',
            }
        case 'castles':
            return {
                label: 'Castles',
                heroGradient: 'from-slate-900 via-slate-900 to-red-950',
                glow: 'bg-red-500/30',
                modelChip: 'border-red-400/30 bg-red-500/10 text-red-100',
            }
        case 'dejavoo':
            return {
                label: 'Dejavoo',
                heroGradient: 'from-slate-900 via-slate-900 to-purple-950',
                glow: 'bg-purple-500/30',
                modelChip: 'border-purple-400/30 bg-purple-500/10 text-purple-100',
            }
        default:
            return {
                label: type,
                heroGradient: 'from-slate-900 via-slate-900 to-slate-800',
                glow: 'bg-slate-500/30',
                modelChip: 'border-slate-400/30 bg-slate-500/10 text-slate-100',
            }
    }
}

// Stylized payment terminal showing the real brand logo on its "screen"
function TerminalShowcase({
    logo, label, model, theme,
}: { logo?: string; label: string; model?: string | null; theme: BrandTheme }) {
    return (
        <div className="relative mx-auto w-44 shrink-0 sm:mx-0">
            <div className={`pointer-events-none absolute inset-3 rounded-full ${theme.glow} blur-2xl`} />
            <div className="relative rounded-[2rem] bg-gradient-to-b from-slate-600/90 to-slate-950 p-3 shadow-2xl ring-1 ring-white/10">
                <div className="rounded-[1.5rem] bg-slate-950/40 p-2">
                    {/* screen */}
                    <div className="relative aspect-square w-full overflow-hidden rounded-2xl bg-white shadow-inner">
                        {logo ? (
                            <Image src={logo} alt={`${label} terminal`} fill sizes="176px" className="object-contain p-3" />
                        ) : (
                            <div className="flex h-full w-full items-center justify-center">
                                <CreditCard className="h-16 w-16 text-slate-300" />
                            </div>
                        )}
                    </div>
                    {/* keypad hint */}
                    <div className="mx-auto mt-3 grid w-4/5 grid-cols-3 gap-1.5 pb-1">
                        {Array.from({ length: 6 }).map((_, i) => (
                            <div key={i} className="h-1.5 rounded-full bg-white/15" />
                        ))}
                    </div>
                </div>
            </div>
            {model && (
                <div className="mt-3 flex justify-center">
                    <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-widest ${theme.modelChip}`}>
                        {model}
                    </span>
                </div>
            )}
        </div>
    )
}

function HeroStat({
    icon: Icon, label, value, warn, mono,
}: { icon: LucideIcon; label: string; value: string; warn?: boolean; mono?: boolean }) {
    return (
        <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 backdrop-blur-sm">
            <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                <Icon className="h-3 w-3" />{label}
            </p>
            <p className={`mt-1 truncate text-sm font-semibold ${warn ? 'text-amber-300' : 'text-white'} ${mono ? 'font-mono' : ''}`} title={value}>
                {value}
            </p>
        </div>
    )
}

function DetailTile({
    icon: Icon, label, children,
}: { icon: LucideIcon; label: string; children: ReactNode }) {
    return (
        <div className="flex items-start gap-3 rounded-xl border bg-white p-3.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
                <Icon className="h-4 w-4" />
            </div>
            <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
                <div className="mt-0.5 text-sm font-semibold text-slate-900">{children}</div>
            </div>
        </div>
    )
}

// Prominent callout for the money/state that silently vanishes when a terminal
// is deactivated or swapped — captured-but-unsettled payments + review-needed batches.
function AttentionBanner({ device, unsettled }: { device: DeviceIdentity; unsettled: DeviceUnsettledSummary }) {
    const inactive = !device.is_active
    const hasUnsettled = unsettled.count > 0
    const needsReview = unsettled.needs_review_batches > 0
    if (!inactive && !hasUnsettled && !needsReview) return null

    const critical = inactive && hasUnsettled
    const tone = critical ? 'border-red-200 bg-red-50' : 'border-amber-200 bg-amber-50'
    const iconTone = critical ? 'text-red-600' : 'text-amber-600'

    return (
        <div className={`mb-6 rounded-2xl border p-4 sm:p-5 ${tone}`}>
            <div className="flex items-start gap-3">
                <AlertTriangle className={`mt-0.5 h-5 w-5 shrink-0 ${iconTone}`} />
                <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-semibold text-slate-900">
                        {critical
                            ? 'Deactivated terminal is still holding unsettled money'
                            : inactive
                                ? 'This terminal is deactivated'
                                : 'Unsettled activity on this terminal'}
                    </h3>
                    <p className="mt-0.5 text-sm text-slate-600">
                        {inactive
                            ? 'It no longer appears in the “Unique Terminals” panel or auto-settle, but its captured payments still need to be settled or reconciled.'
                            : 'Captured payments are waiting to be settled into a closed batch.'}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                        {inactive && (
                            <span className="inline-flex items-center gap-1.5 rounded-full border border-red-200 bg-white px-3 py-1 text-xs font-medium text-red-700">
                                <PauseCircle className="h-3.5 w-3.5" /> Deactivated
                            </span>
                        )}
                        {hasUnsettled && (
                            <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-300 bg-white px-3 py-1 text-xs font-semibold text-amber-800">
                                <Banknote className="h-3.5 w-3.5" /> {fmtUsd(unsettled.total)} unsettled · {unsettled.count} payment{unsettled.count === 1 ? '' : 's'}
                            </span>
                        )}
                        {unsettled.oldest_captured_at && (
                            <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-600">
                                <Clock className="h-3.5 w-3.5" /> oldest {timeAgo(unsettled.oldest_captured_at)}
                            </span>
                        )}
                        {needsReview && (
                            <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-300 bg-white px-3 py-1 text-xs font-medium text-amber-800">
                                <AlertTriangle className="h-3.5 w-3.5" /> {unsettled.needs_review_batches} batch{unsettled.needs_review_batches === 1 ? '' : 'es'} need review
                            </span>
                        )}
                        {unsettled.open_batches > 0 && (
                            <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-600">
                                <FolderOpen className="h-3.5 w-3.5" /> {unsettled.open_batches} open batch{unsettled.open_batches === 1 ? '' : 'es'}
                            </span>
                        )}
                    </div>
                    {unsettled.truncated && (
                        <p className="mt-2 text-[11px] text-slate-500">Showing the latest 100 payments; older unsettled items may exist.</p>
                    )}
                </div>
            </div>
        </div>
    )
}

function BatchKpi({ label, value, tone }: { label: string; value: ReactNode; tone?: 'good' | 'warn' }) {
    const valueTone = tone === 'warn' ? 'text-amber-700' : tone === 'good' ? 'text-emerald-700' : 'text-slate-900'
    return (
        <div className="rounded-xl border bg-white p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
            <p className={`mt-1 text-lg font-bold ${valueTone}`}>{value}</p>
        </div>
    )
}

function BatchStat({ label, children, sub }: { label: string; children: ReactNode; sub?: ReactNode }) {
    return (
        <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
            <div className="mt-0.5 text-sm font-semibold text-slate-900">{children}</div>
            {sub != null && <div className="text-[11px] text-muted-foreground">{sub}</div>}
        </div>
    )
}

function cardCell(p: DevicePayment) {
    if (!p.card_type && !p.card_last_four) return <span className="text-muted-foreground">—</span>
    return (
        <span className="inline-flex items-center gap-1.5 text-sm">
            <CreditCard className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="capitalize">{p.card_type || 'card'}</span>
            {p.card_last_four && <span className="font-mono text-muted-foreground">•{p.card_last_four}</span>}
        </span>
    )
}

function settledCell(p: DevicePayment) {
    return p.is_settled
        ? <span className="inline-flex items-center gap-1 text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" />settled</span>
        : <span className="inline-flex items-center gap-1 text-amber-700"><XCircle className="h-3.5 w-3.5" />unsettled</span>
}

// Settlements-grade batch table: sticky-header list (matches the /settlements
// Batch Reconciliation table) with a click-to-select linked-payments panel.
function BatchesTab({ batches, payments }: { batches: DeviceBatch[]; payments: DevicePayment[] }) {
    const [selectedId, setSelectedId] = useState<string | null>(null)

    // Same association rule as the action / the /settlements RPC: prefer an
    // explicit settlement_batch_id, else fall back to matching host batch_number.
    const batchIdSet = new Set(batches.map((b) => b.id))
    const latestByNumber = new Map<string, string>()
    for (const b of batches) {
        if (b.batch_number && !latestByNumber.has(b.batch_number)) latestByNumber.set(b.batch_number, b.id)
    }
    const resolveBatchId = (p: DevicePayment): string | null => {
        if (p.settlement_batch_id && batchIdSet.has(p.settlement_batch_id)) return p.settlement_batch_id
        if (p.batch_number && latestByNumber.has(p.batch_number)) return latestByNumber.get(p.batch_number) ?? null
        return null
    }

    const selected = batches.find((b) => b.id === selectedId) || null
    const linked = selected ? payments.filter((p) => resolveBatchId(p) === selected.id) : []
    const selectedFees = selected
        ? (selected.interchange_fees ?? 0) + (selected.assessment_fees ?? 0) + (selected.processor_fees ?? 0)
        : 0

    const gross = batches.reduce((s, b) => s + (b.gross_amount ?? 0), 0)
    const net = batches.reduce((s, b) => s + (b.net_deposit ?? 0), 0)
    const discrepancies = batches.filter((b) => b.has_discrepancy).length

    if (batches.length === 0) {
        return <div className="rounded-lg border bg-white py-10 text-center text-sm text-muted-foreground">No batches for this terminal</div>
    }

    return (
        <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <BatchKpi label="Batches" value={batches.length} />
                <BatchKpi label="Gross processed" value={fmtUsd(gross)} />
                <BatchKpi label="Net deposit" value={fmtUsd(net)} tone="good" />
                <BatchKpi label="Discrepancies" value={discrepancies} tone={discrepancies > 0 ? 'warn' : undefined} />
            </div>

            <Table containerClassName="max-h-[46vh] overflow-auto rounded-lg border bg-white">
                <TableHeader className="sticky top-0 z-20 bg-card">
                    <TableRow>
                        <TableHead>Batch</TableHead>
                        <TableHead>Business date</TableHead>
                        <TableHead>Opened</TableHead>
                        <TableHead>Closed</TableHead>
                        <TableHead className="text-right">Txns</TableHead>
                        <TableHead className="text-right">Gross</TableHead>
                        <TableHead className="text-right">Tip</TableHead>
                        <TableHead className="text-right">Refund</TableHead>
                        <TableHead className="text-right">Net deposit</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Discrepancy</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {batches.map((b) => (
                        <TableRow
                            key={b.id}
                            className={`cursor-pointer ${selectedId === b.id ? 'bg-muted/40' : ''}`}
                            onClick={() => setSelectedId((cur) => (cur === b.id ? null : b.id))}
                        >
                            <TableCell className="font-mono text-xs">{batchLabel(b)}</TableCell>
                            <TableCell className="whitespace-nowrap text-sm">{dateOnly(b.business_date)}</TableCell>
                            <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{dateTimeAmPm(b.opened_at)}</TableCell>
                            <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{dateTimeAmPm(b.closed_at)}</TableCell>
                            <TableCell className="text-right font-mono">{(b.transaction_count ?? 0).toLocaleString()}</TableCell>
                            <TableCell className="text-right font-mono">{fmtUsd(b.gross_amount)}</TableCell>
                            <TableCell className="text-right font-mono">{fmtUsd(b.tip_amount)}</TableCell>
                            <TableCell className="text-right font-mono">{fmtUsd(b.refund_amount)}</TableCell>
                            <TableCell className="text-right font-mono">{fmtUsd(b.net_deposit)}</TableCell>
                            <TableCell>
                                <div className="flex flex-wrap items-center gap-1.5">
                                    {statusBadge(b.status)}
                                    {originBadge(b.origin)}
                                </div>
                            </TableCell>
                            <TableCell className="text-right">
                                {b.has_discrepancy ? (
                                    <Badge variant="outline" className="border-red-300 bg-red-100 text-red-800">
                                        <AlertTriangle className="mr-1 h-3 w-3" />{fmtUsd(b.discrepancy_amount)}
                                    </Badge>
                                ) : b.discrepancy_amount != null ? (
                                    <Badge variant="outline" className="border-green-300 bg-green-100 text-green-800">Matched</Badge>
                                ) : (
                                    <span className="text-xs text-muted-foreground">—</span>
                                )}
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>

            {selected && (
                <div className="space-y-3 rounded-lg border p-3">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                        <span className="font-medium">Selected batch:</span>
                        <Badge variant="outline" className="font-mono text-xs">{batchLabel(selected)}</Badge>
                        {statusBadge(selected.status)}
                        {originBadge(selected.origin)}
                        <span className="ml-2 text-muted-foreground">Linked payments:</span>
                        <span className="font-medium">{linked.length.toLocaleString()}</span>
                        <span className="text-muted-foreground">Linked amount:</span>
                        <span className="font-medium">{fmtUsd(selected.linked_payment_amount)}</span>
                        <span className="text-muted-foreground">Batch gross:</span>
                        <span className="font-medium">{fmtUsd(selected.gross_amount)}</span>
                    </div>

                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                        <BatchStat label="Transactions" sub={`${selected.sales_count ?? 0} sales · ${selected.refund_count ?? 0} refunds · ${selected.void_count ?? 0} voids`}>
                            {selected.transaction_count ?? 0}
                        </BatchStat>
                        <BatchStat label="Tips">{fmtUsd(selected.tip_amount)}</BatchStat>
                        <BatchStat label="Fees" sub={selectedFees > 0 ? `IC ${fmtUsd(selected.interchange_fees)} · AS ${fmtUsd(selected.assessment_fees)} · PR ${fmtUsd(selected.processor_fees)}` : undefined}>
                            {selectedFees > 0 ? fmtUsd(selectedFees) : '—'}
                        </BatchStat>
                        <BatchStat label="Net deposit">{fmtUsd(selected.net_deposit)}</BatchStat>
                    </div>

                    <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
                        <span>Opened: <span className="text-slate-700">{dateTimeAmPm(selected.opened_at)}</span></span>
                        <span>Closed: <span className="text-slate-700">{dateTimeAmPm(selected.closed_at)}</span></span>
                        <span>Settled: <span className="text-slate-700">{dateOnly(selected.settlement_date)}</span></span>
                        <span>Funded: <span className="text-slate-700">{dateOnly(selected.funded_date)}</span></span>
                        {selected.last_attempt_at && <span>Last attempt: <span className="text-slate-700">{dateTimeAmPm(selected.last_attempt_at)}</span></span>}
                    </div>

                    {selected.has_discrepancy && (
                        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                            Batch gross {fmtUsd(selected.gross_amount)} vs {fmtUsd(selected.linked_payment_amount)} across {linked.length} linked payment{linked.length === 1 ? '' : 's'} on this terminal — {fmtUsd(selected.discrepancy_amount)} unaccounted.
                        </div>
                    )}
                    {selected.failure_reason && (
                        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">{selected.failure_reason}</div>
                    )}

                    <Table containerClassName="max-h-[32vh] overflow-auto rounded-md border bg-white">
                        <TableHeader className="sticky top-0 z-20 bg-card">
                            <TableRow>
                                <TableHead>Card</TableHead>
                                <TableHead>Method</TableHead>
                                <TableHead className="text-right">Amount</TableHead>
                                <TableHead className="text-right">Tip</TableHead>
                                <TableHead className="text-right">Total</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead>Settled</TableHead>
                                <TableHead>Captured</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {linked.length === 0 ? (
                                <TableRow><TableCell colSpan={8} className="py-6 text-center text-muted-foreground">No payments linked to this batch.</TableCell></TableRow>
                            ) : linked.map((p) => (
                                <TableRow key={p.id}>
                                    <TableCell>{cardCell(p)}</TableCell>
                                    <TableCell className="text-sm text-muted-foreground">{p.payment_method || '—'}</TableCell>
                                    <TableCell className="text-right font-mono">{fmtUsd(p.amount)}</TableCell>
                                    <TableCell className="text-right font-mono text-muted-foreground">{fmtUsd(p.tip_amount)}</TableCell>
                                    <TableCell className="text-right font-mono font-medium">{fmtUsd(p.total_amount ?? p.amount)}</TableCell>
                                    <TableCell className="text-sm">{p.status}</TableCell>
                                    <TableCell>{settledCell(p)}</TableCell>
                                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{dateTimeAmPm(p.captured_at ?? p.initiated_at)}</TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>
            )}
        </div>
    )
}

export function PaymentDeviceDetailView({ merchantId, serial }: { merchantId: string; serial: string }) {
    const { data: result, isLoading, isFetching, refetch } = useQuery({
        queryKey: ['admin', 'payment-device-detail', merchantId, serial],
        queryFn: () => getPaymentDeviceDetail(merchantId, serial),
        enabled: !!merchantId && !!serial,
        staleTime: 30_000,
        refetchInterval: 60_000,
    })

    if (isLoading) {
        return <div className="flex items-center justify-center py-24"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
    }

    if (!result?.success || !result.data) {
        return (
            <div className="mx-auto max-w-3xl px-6 py-16 text-center">
                <CreditCard className="mx-auto h-10 w-10 text-muted-foreground" />
                <h2 className="mt-4 text-lg font-semibold">Device not found</h2>
                <p className="mt-1 text-sm text-muted-foreground">{result?.error || `No terminal with serial ${serial} for this merchant.`}</p>
                <Link href={`/manage/merchants/${merchantId}?tab=devices`} className="mt-4 inline-flex items-center gap-1.5 text-sm text-blue-600 hover:underline">
                    <ArrowLeft className="h-4 w-4" /> Back to devices
                </Link>
            </div>
        )
    }

    const { device: d, siblings, unsettled, batches, payments, attempts, webhookEvents, audit } = result.data
    const isValor = d.terminal_type === 'valor'
    const theme = brandTheme(d.terminal_type)
    const logo = BRAND_LOGO[d.terminal_type]

    return (
        <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
            {/* Header */}
            <div className="mb-4 flex items-center justify-between gap-3">
                <Link href={`/manage/merchants/${merchantId}?tab=devices`} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
                    <ArrowLeft className="h-4 w-4" /> Devices
                </Link>
                <button onClick={() => refetch()} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
                    <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} /> Refresh
                </button>
            </div>

            {/* Hero */}
            <div className={`relative mb-6 overflow-hidden rounded-3xl bg-gradient-to-br ${theme.heroGradient} p-6 ring-1 ring-white/10 sm:p-8`}>
                <div className={`pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full ${theme.glow} blur-3xl`} />
                <div className={`pointer-events-none absolute -bottom-24 left-1/4 h-64 w-64 rounded-full ${theme.glow} blur-3xl`} />

                <div className="relative flex flex-col items-center gap-6 sm:flex-row sm:items-center sm:gap-8">
                    <TerminalShowcase logo={logo} label={theme.label} model={d.terminal_model} theme={theme} />

                    <div className="min-w-0 flex-1 text-center sm:text-left">
                        <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-start">
                            <Badge variant="outline" className="border-white/20 bg-white/10 text-white">{theme.label}</Badge>
                            <ConnectionBadge state={d.connection_state} />
                            {!d.is_active && <Badge variant="destructive">Inactive</Badge>}
                            {d.auto_settle && (
                                <Badge className="border border-white/20 bg-white/10 text-white hover:bg-white/10">
                                    <Clock className="mr-1 h-3 w-3" />Auto-settle {(d.settle_time || '').slice(0, 5) || 'on'}
                                </Badge>
                            )}
                        </div>
                        <h1 className="mt-3 text-2xl font-bold tracking-tight text-white sm:text-3xl">{d.terminal_name}</h1>
                        <div className="mt-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 text-sm text-slate-300 sm:justify-start">
                            <span className="inline-flex items-center gap-1.5 font-mono">
                                <Hash className="h-3.5 w-3.5 opacity-60" />{d.serial_number || 'No serial'}
                            </span>
                            {d.location_name && (
                                <span className="inline-flex items-center gap-1.5">
                                    <Store className="h-3.5 w-3.5 opacity-60" />{d.location_name}
                                </span>
                            )}
                            {d.station_name && (
                                <span className="inline-flex items-center gap-1.5">
                                    <Server className="h-3.5 w-3.5 opacity-60" />{d.station_name}
                                </span>
                            )}
                        </div>
                        {siblings > 0 && (
                            <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 px-3 py-1 text-xs font-medium text-amber-200 ring-1 ring-amber-400/30">
                                <AlertTriangle className="h-3.5 w-3.5" /> {siblings} other terminal{siblings > 1 ? 's' : ''} share this serial at this merchant.
                            </p>
                        )}

                        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                            <HeroStat icon={Activity} label="Last txn" value={timeAgo(d.last_transaction_at)} />
                            <HeroStat icon={Layers} label="Last batch" value={timeAgo(d.last_batch_at)} />
                            <HeroStat icon={FolderOpen} label="Open batches" value={String(d.open_batch_count ?? 0)} />
                            <HeroStat icon={AlertTriangle} label="Fails" value={String(d.consecutive_failures ?? 0)} warn={(d.consecutive_failures ?? 0) > 0} />
                        </div>
                    </div>
                </div>
            </div>

            {/* Details */}
            <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                <DetailTile icon={Clock} label="Auto-Settle">
                    {d.auto_settle
                        ? <span className="text-blue-600">{(d.settle_time || '').slice(0, 5) || 'On'}</span>
                        : <span className="text-muted-foreground">Off</span>}
                </DetailTile>
                <DetailTile icon={Wifi} label="Last connection test">{timeAgo(d.last_connection_test_at)}</DetailTile>
                <DetailTile icon={Cpu} label="Model">{d.terminal_model || '—'}</DetailTile>
                {isValor && (
                    <DetailTile icon={KeyRound} label="Valor EPI">
                        <span className="font-mono">{d.valor_epi || <span className="text-amber-600">not set</span>}</span>
                    </DetailTile>
                )}
            </div>

            {/* Unsettled / deactivated attention banner */}
            <AttentionBanner device={d} unsettled={unsettled} />

            <Tabs defaultValue="batches">
                <TabsList className="flex-wrap bg-slate-100">
                    <TabsTrigger value="batches">Batches ({batches.length})</TabsTrigger>
                    <TabsTrigger value="payments">Payments ({payments.length})</TabsTrigger>
                    <TabsTrigger value="attempts">Attempts ({attempts.length})</TabsTrigger>
                    {isValor && <TabsTrigger value="webhook">Webhook log ({webhookEvents.length})</TabsTrigger>}
                    <TabsTrigger value="activity">Activity ({audit.length})</TabsTrigger>
                </TabsList>

                {/* BATCHES */}
                <TabsContent value="batches" className="mt-4">
                    <BatchesTab batches={batches} payments={payments} />
                </TabsContent>

                {/* PAYMENTS */}
                <TabsContent value="payments" className="mt-4">
                    {unsettled.count > 0 && (
                        <div className="mb-3 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                            <Banknote className="h-4 w-4" />
                            <span><span className="font-semibold">{fmtUsd(unsettled.total)}</span> across {unsettled.count} captured payment{unsettled.count === 1 ? '' : 's'} not yet settled.</span>
                        </div>
                    )}
                    <div className="overflow-x-auto rounded-lg border bg-white">
                        <Table>
                            <TableHeader><TableRow>
                                <TableHead>Card</TableHead><TableHead>Method</TableHead>
                                <TableHead className="text-right">Amount</TableHead><TableHead className="text-right">Tip</TableHead>
                                <TableHead className="text-right">Total</TableHead>
                                <TableHead>Status</TableHead><TableHead>Settled</TableHead><TableHead>Batch #</TableHead>
                                <TableHead>Captured</TableHead>
                            </TableRow></TableHeader>
                            <TableBody>
                                {payments.length === 0 ? (
                                    <TableRow><TableCell colSpan={9} className="py-8 text-center text-muted-foreground">No payments</TableCell></TableRow>
                                ) : payments.map((p) => (
                                    <TableRow key={p.id}>
                                        <TableCell>{cardCell(p)}</TableCell>
                                        <TableCell className="text-sm text-muted-foreground">{p.payment_method || '—'}</TableCell>
                                        <TableCell className="text-right">{fmtUsd(p.amount)}</TableCell>
                                        <TableCell className="text-right text-muted-foreground">{fmtUsd(p.tip_amount)}</TableCell>
                                        <TableCell className="text-right font-medium">{fmtUsd(p.total_amount ?? p.amount)}</TableCell>
                                        <TableCell><span className="text-sm">{p.status}</span></TableCell>
                                        <TableCell>{settledCell(p)}</TableCell>
                                        <TableCell><span className="font-mono text-xs">{p.batch_number || '—'}</span></TableCell>
                                        <TableCell className="text-sm text-muted-foreground">{timeAgo(p.captured_at ?? p.initiated_at)}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                </TabsContent>

                {/* ATTEMPTS */}
                <TabsContent value="attempts" className="mt-4">
                    <div className="overflow-x-auto rounded-lg border bg-white">
                        <Table>
                            <TableHeader><TableRow>
                                <TableHead>When</TableHead><TableHead>Phase</TableHead><TableHead>Outcome</TableHead>
                                <TableHead>Origin</TableHead><TableHead>Detail</TableHead>
                            </TableRow></TableHeader>
                            <TableBody>
                                {attempts.length === 0 ? (
                                    <TableRow><TableCell colSpan={5} className="py-8 text-center text-muted-foreground">No settlement attempts logged (the POS tablet logs these per phase)</TableCell></TableRow>
                                ) : attempts.map((a) => (
                                    <TableRow key={a.id}>
                                        <TableCell className="text-sm text-muted-foreground" title={a.created_at}>{dateTime(a.created_at)}</TableCell>
                                        <TableCell><Badge variant="outline">{a.phase}</Badge></TableCell>
                                        <TableCell>{attemptOutcomeBadge(a.outcome)}</TableCell>
                                        <TableCell>{originBadge(a.origin)}</TableCell>
                                        <TableCell className="max-w-[280px] truncate text-sm text-muted-foreground" title={a.detail || ''}>{a.detail || '—'}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                </TabsContent>

                {/* WEBHOOK LOG (visualizer) */}
                {isValor && (
                    <TabsContent value="webhook" className="mt-4">
                        <div className="overflow-x-auto rounded-lg border bg-white">
                            <Table>
                                <TableHeader><TableRow>
                                    <TableHead>Received</TableHead><TableHead>Outcome</TableHead><TableHead>Sig</TableHead>
                                    <TableHead className="text-right">HTTP</TableHead><TableHead>Batch #</TableHead>
                                    <TableHead className="text-right">Latency</TableHead><TableHead>Payload</TableHead>
                                </TableRow></TableHeader>
                                <TableBody>
                                    {webhookEvents.length === 0 ? (
                                        <TableRow><TableCell colSpan={7} className="py-8 text-center text-muted-foreground">No webhook events yet</TableCell></TableRow>
                                    ) : webhookEvents.map((e) => (
                                        <TableRow key={e.id}>
                                            <TableCell className="text-sm text-muted-foreground" title={e.received_at}>{dateTime(e.received_at)}</TableCell>
                                            <TableCell>{eventOutcomeBadge(e.outcome)}{e.detail && <p className="mt-0.5 max-w-[200px] truncate text-[11px] text-muted-foreground" title={e.detail}>{e.detail}</p>}</TableCell>
                                            <TableCell>{e.verified
                                                ? <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                                                : <AlertTriangle className="h-4 w-4 text-amber-600" />}</TableCell>
                                            <TableCell className="text-right"><span className={e.http_status && e.http_status >= 400 ? 'text-red-600' : ''}>{e.http_status ?? '—'}</span></TableCell>
                                            <TableCell><span className="font-mono text-xs">{e.batch_no || '—'}</span></TableCell>
                                            <TableCell className="text-right text-muted-foreground">{e.latency_ms != null ? `${e.latency_ms}ms` : '—'}</TableCell>
                                            <TableCell>
                                                {e.raw_payload
                                                    ? <details><summary className="cursor-pointer text-xs text-blue-600">view</summary>
                                                        <pre className="mt-1 max-h-56 max-w-md overflow-auto rounded bg-slate-50 p-2 text-[11px] leading-tight">{JSON.stringify(e.raw_payload, null, 2)}</pre>
                                                      </details>
                                                    : <span className="text-muted-foreground">—</span>}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    </TabsContent>
                )}

                {/* ACTIVITY / AUDIT */}
                <TabsContent value="activity" className="mt-4">
                    <div className="overflow-x-auto rounded-lg border bg-white">
                        <Table>
                            <TableHeader><TableRow>
                                <TableHead>When</TableHead><TableHead>Action</TableHead><TableHead>Severity</TableHead>
                                <TableHead>Actor</TableHead><TableHead>Detail</TableHead>
                            </TableRow></TableHeader>
                            <TableBody>
                                {audit.length === 0 ? (
                                    <TableRow><TableCell colSpan={5} className="py-8 text-center text-muted-foreground">No activity</TableCell></TableRow>
                                ) : audit.map((a) => (
                                    <TableRow key={a.id}>
                                        <TableCell className="text-sm text-muted-foreground" title={a.created_at}>{dateTime(a.created_at)}</TableCell>
                                        <TableCell><span className="text-sm font-medium">{a.action}</span></TableCell>
                                        <TableCell>{a.severity === 'warning'
                                            ? <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-800">warning</Badge>
                                            : <Badge variant="outline">{a.severity || 'info'}</Badge>}</TableCell>
                                        <TableCell className="text-sm text-muted-foreground">{a.actor_role || '—'}</TableCell>
                                        <TableCell className="max-w-[300px] truncate text-sm text-muted-foreground" title={typeof a.metadata?.reason === 'string' ? a.metadata.reason : ''}>
                                            {typeof a.metadata?.reason === 'string' ? a.metadata.reason : (a.action_category || '—')}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                </TabsContent>
            </Tabs>
        </div>
    )
}
