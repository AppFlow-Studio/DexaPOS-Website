'use client'

import { useState, useMemo } from 'react'
import { Panel } from '@/components/dashboard/shell/Panel'
import { PanelSection } from '@/components/dashboard/shell/PanelSection'
import { StatRow, StatTile, InsetTile } from '@/components/dashboard/shell/StatTile'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useIsMobile } from '@/hooks/use-mobile'
import { cn } from '@/lib/utils'
import { useClientPagination } from '@/lib/hooks/useClientPagination'
import { PaginationBar } from '@/components/dashboard/PaginationBar'
import {
    ResponsiveContainer,
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip as RechartsTooltip,
    Cell,
} from 'recharts'
import {
    Tablet,
    Ghost,
    AlertTriangle,
    ShieldCheck,
    ChevronRight,
    ExternalLink,
    Monitor,
    TrendingDown,
    BarChart3,
    DollarSign,
} from 'lucide-react'
import { useTerminalUtilization } from '@/lib/queries/use-platform-analytics'
import type { MerchantTerminalUtilization, UtilizationTier } from '@/app/manage/actions/hq-platform/analytics'
import Link from 'next/link'
import { valueAxisWidthMobile } from '@/app/manage/components/analytics-primitives'

// ============================================================================
// Constants
// ============================================================================

/**
 * Tier is carried by its label alone. The per-tier text colour, row tint and
 * bar fill are gone: a tinted row plus a coloured figure plus a coloured badge
 * stated the same tier three times, and a table where most rows are tinted
 * reads as a colour field rather than as an exception worth noticing.
 */
const TIER_CONFIG: Record<UtilizationTier, {
    label: string
    variant: 'default' | 'secondary' | 'destructive'
}> = {
    healthy: {
        label: 'Healthy',
        variant: 'default',
    },
    underutilized: {
        label: 'Underutilized',
        variant: 'secondary',
    },
    critical: {
        label: 'Critical',
        variant: 'destructive',
    },
}

type SortKey = 'utilizationRate' | 'totalStations' | 'zombieStations' | 'merchantName'

/**
 * The merchant list has no column headers to click, so sorting is one picker.
 * Each option fixes its own direction — the useful one for that measure.
 */
const SORT_OPTIONS: Record<string, { label: string; key: SortKey; dir: 'asc' | 'desc' }> = {
    utilization: { label: 'Lowest utilization', key: 'utilizationRate', dir: 'asc' },
    inactive: { label: 'Most inactive', key: 'zombieStations', dir: 'desc' },
    stations: { label: 'Most stations', key: 'totalStations', dir: 'desc' },
    name: { label: 'Name A–Z', key: 'merchantName', dir: 'asc' },
}
type SortOption = keyof typeof SORT_OPTIONS

// ============================================================================
// Merchant list pieces
// ============================================================================

type Station = MerchantTerminalUtilization['stations'][number]

const STATION_TYPE_LABELS: Record<string, string> = {
    kds: 'KDS',
    self_service: 'Self-service',
}

/** `register` → "Register", `self_service` → "Self-service", `kds` → "KDS". */
function stationTypeLabel(type: string): string {
    if (STATION_TYPE_LABELS[type]) return STATION_TYPE_LABELS[type]
    const words = type.replace(/_/g, ' ')
    return words.charAt(0).toUpperCase() + words.slice(1)
}

function fmtLastTxn(s: Station): string {
    if (!s.lastTransactionAt) return 'Never'
    return s.daysSinceLastTxn === 0 ? 'Today' : `${s.daysSinceLastTxn}d ago`
}

/**
 * Status in words. Reclaimable folds in here rather than taking a column: it
 * is exactly the inactive (no txn in 30+ days) condition, so a separate column
 * only ever repeated this one.
 */
function StationStatus({ station }: { station: Station }) {
    // KDS screens show tickets and never ring up orders, so they get no
    // usage verdict — and are not counted in the merchant's utilization.
    if (!station.takesOrders) return <>Kitchen display</>
    if (station.isZombie) {
        return (
            <span title="No transaction in 30+ days">
                <span className="font-medium text-foreground">Inactive</span> · reclaimable
            </span>
        )
    }
    if (station.activeDays === 0) return <>Idle</>
    if (station.avgOrdersPerActiveDay < 1) return <>Low</>
    return <>Active</>
}

/**
 * One merchant's stations. Five columns, not eight: Active Days and Avg/Day
 * restated Orders, and the table sits indented under the merchant name so it
 * reads as that row's detail rather than a second report. Location appears
 * only when the merchant has more than one.
 */
function StationDetailTable({ stations }: { stations: Station[] }) {
    const showLocation = new Set(stations.map(s => s.locationId)).size > 1
    return (
        <Table variant="data" className="min-w-[560px]">
            <TableHeader className="[&_tr]:border-0">
                <TableRow>
                    <TableHead>Station</TableHead>
                    {showLocation && <TableHead>Location</TableHead>}
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Orders</TableHead>
                    <TableHead className="text-right">Last Txn</TableHead>
                    <TableHead>Status</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {stations.map((s) => (
                    <TableRow key={s.stationId}>
                        <TableCell className="font-medium"><span className="block truncate">{s.stationName}</span></TableCell>
                        {showLocation && (
                            <TableCell className="text-sm text-muted-foreground">{s.locationName ?? '—'}</TableCell>
                        )}
                        <TableCell className="text-sm text-muted-foreground">{stationTypeLabel(s.stationType)}</TableCell>
                        <TableCell className="text-right tabular-nums">{s.totalOrders.toLocaleString()}</TableCell>
                        <TableCell className="text-right text-sm text-muted-foreground">{fmtLastTxn(s)}</TableCell>
                        <TableCell className="text-sm text-muted-foreground"><StationStatus station={s} /></TableCell>
                    </TableRow>
                ))}
            </TableBody>
        </Table>
    )
}

/**
 * One station as a card, for phones: name and status on top, then the desktop
 * table's columns as labelled values — each carries its own label, so nothing
 * depends on a header. Same shape as Fleet Health's device cards.
 */
function StationCard({ station: s, showLocation }: { station: Station; showLocation: boolean }) {
    const info: Array<{ label: string; value: string; wide?: boolean }> = [
        { label: 'Type', value: stationTypeLabel(s.stationType) },
        // Orders and last transaction mean nothing for a screen that never
        // rings one up.
        ...(s.takesOrders
            ? [
                { label: 'Orders', value: s.totalOrders.toLocaleString() },
                { label: 'Last txn', value: fmtLastTxn(s) },
            ]
            : []),
        ...(showLocation ? [{ label: 'Location', value: s.locationName ?? '—', wide: true }] : []),
    ]

    return (
        <div className="rounded-2xl bg-muted/30 p-3">
            <div className="flex items-start justify-between gap-3">
                <p className="min-w-0 text-sm font-medium">{s.stationName}</p>
                <span className="shrink-0 text-xs text-muted-foreground"><StationStatus station={s} /></span>
            </div>
            {/* Label above value, three to a row: side-by-side label/value pairs
                in two columns staggered the values and left gaps. Location is
                the long one, so it takes the full width. */}
            <dl className="mt-3 grid grid-cols-3 gap-x-3 gap-y-2.5">
                {info.map(i => (
                    <div key={i.label} className={cn('min-w-0', i.wide && 'col-span-3')}>
                        <dt className="text-[11px] text-muted-foreground">{i.label}</dt>
                        <dd className="truncate text-sm font-medium tabular-nums">{i.value}</dd>
                    </div>
                ))}
            </dl>
        </div>
    )
}

/**
 * One merchant as a single line — name, then its numbers right beside it —
 * that expands into its stations. Same pattern as Fleet Health's All devices:
 * no column header to read across, no fill on the row, so the station table is
 * the only surface. Starts collapsed.
 *
 * @param nameHint Shown after the name when another merchant in the list has
 *   the same name (their locations), so the two rows can be told apart.
 */
function MerchantUtilizationRow({
    merchant: m,
    nameHint,
    isMobile,
}: {
    merchant: MerchantTerminalUtilization
    nameHint: string | null
    isMobile: boolean
}) {
    const [expanded, setExpanded] = useState(false)
    const detailId = `terminal-stations-${m.merchantId}`

    return (
        <div>
            <div className="flex items-center gap-1 rounded-xl transition-colors hover:bg-muted/40">
                <button
                    type="button"
                    onClick={() => setExpanded(e => !e)}
                    aria-expanded={expanded}
                    aria-controls={expanded ? detailId : undefined}
                    // Every row shares one grid (chevron · name · rate · detail), so
                    // the rates line up and read straight down the list — the
                    // header-less look without the ragged starts. A phone shows
                    // the name alone, and the button hugs it so the merchant link
                    // sits right beside the name rather than at the far edge.
                    className={cn(
                        'grid min-w-0 items-center gap-x-3 rounded-xl px-2 py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        isMobile ? 'grid-cols-[1rem_minmax(0,1fr)]' : 'flex-1 grid-cols-[1rem_minmax(0,16rem)_3.5rem_minmax(0,1fr)]'
                    )}
                >
                    <ChevronRight className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform', expanded && 'rotate-90')} />
                    <span
                        className="min-w-0 truncate text-sm font-semibold"
                        title={nameHint ? `${m.merchantName} · ${nameHint}` : m.merchantName}
                    >
                        {m.merchantName}
                        {/* A phone shows the name alone. */}
                        {nameHint && !isMobile && <span className="font-normal text-muted-foreground"> · {nameHint}</span>}
                    </span>
                    {!isMobile && (
                    <>
                        {/* The rate leads: it is the number being compared. */}
                        <span className="text-right text-sm font-semibold tabular-nums">{m.utilizationRate}%</span>
                        {/* Tier is the rate put into a bracket, so it reads as text
                            beside it. No tier colour — see TIER_CONFIG. */}
                        <span className="min-w-0 truncate text-xs tabular-nums text-muted-foreground">
                            {TIER_CONFIG[m.tier].label} · {m.activeStations} of {m.totalStations} stations active
                            {m.zombieStations > 0 && (
                                <>
                                    {' · '}
                                    <span className="font-medium text-foreground" title="No transaction in 30+ days">
                                        {m.zombieStations} inactive
                                    </span>
                                </>
                            )}
                        </span>
                    </>
                    )}
                </button>
                <Link
                    href={`/manage/merchants/${m.merchantId}`}
                    aria-label={`Open ${m.merchantName}`}
                    title="Open merchant"
                    className={cn(
                        'flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        !isMobile && 'mr-1'
                    )}
                >
                    <ExternalLink className="h-3.5 w-3.5" />
                </Link>
            </div>

            {expanded && (
                isMobile ? (
                    <div id={detailId} className="space-y-2 pb-2 pt-1">
                        {m.stations.map(s => (
                            <StationCard
                                key={s.stationId}
                                station={s}
                                showLocation={new Set(m.stations.map(st => st.locationId)).size > 1}
                            />
                        ))}
                    </div>
                ) : (
                    <div id={detailId} className="pb-2 pl-8 pt-1">
                        <StationDetailTable stations={m.stations} />
                    </div>
                )
            )}
        </div>
    )
}

/**
 * For merchants whose name appears more than once in the list, their location
 * names — the only thing on screen that tells the rows apart.
 */
function duplicateNameHints(merchants: MerchantTerminalUtilization[]): Map<string, string> {
    const byName = new Map<string, number>()
    merchants.forEach(m => byName.set(m.merchantName, (byName.get(m.merchantName) ?? 0) + 1))
    const hints = new Map<string, string>()
    merchants.forEach(m => {
        if ((byName.get(m.merchantName) ?? 0) < 2) return
        const names = [...new Set(m.stations.map(s => s.locationName).filter((n): n is string => !!n))]
        if (names.length === 0) return
        hints.set(m.merchantId, names.length > 2 ? `${names.slice(0, 2).join(', ')} +${names.length - 2}` : names.join(', '))
    })
    return hints
}

// ============================================================================
// Zombie Insight Banner
// ============================================================================

function ZombieInsightBanner({
    merchants,
    totalZombieStations,
    estimatedWastedHardwareValue,
    hardwareCostPerUnit,
}: {
    merchants: MerchantTerminalUtilization[]
    totalZombieStations: number
    estimatedWastedHardwareValue: number
    hardwareCostPerUnit: number
}) {
    const merchantsWithZombies = merchants
        .filter(m => m.zombieStations > 0)
        .sort((a, b) => b.zombieStations - a.zombieStations)

    if (merchantsWithZombies.length === 0) return null

    const MAX_ROWS = 4
    const shown = merchantsWithZombies.slice(0, MAX_ROWS)
    const hiddenCount = merchantsWithZombies.length - shown.length

    const fmtDollars = (n: number) =>
        n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(1)}M` :
        n >= 1_000    ? `$${(n / 1_000).toFixed(1)}k` :
        `$${n.toLocaleString()}`

    return (
        <Panel>
            <PanelSection
                icon={Ghost}
                label={`${merchantsWithZombies.length} merchant${merchantsWithZombies.length !== 1 ? 's have' : ' has'} ${totalZombieStations} inactive tablet${totalZombieStations !== 1 ? 's' : ''}`}
                caption="No transaction in 30+ days"
            >
                {/* The headline cost on the left, and on the right every
                    merchant behind the title's count (worst first) — the old
                    single "worst offender" line left most of the row empty and
                    named only one of the N merchants the title promises. */}
                <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-stretch sm:gap-6">
                    {/* Short label: the tile's label is single-line, and the
                        long form truncated at a fixed `w-64`. "Estimated"
                        moves into the meta line. */}
                    <InsetTile
                        className="shrink-0 sm:w-56"
                        icon={<DollarSign />}
                        label="Wasted hardware value"
                        value={fmtDollars(estimatedWastedHardwareValue)}
                        meta={`Estimated at ~${fmtDollars(hardwareCostPerUnit)}/unit`}
                    />

                    <ul className="min-w-0 flex-1 space-y-1">
                        {shown.map((m) => {
                            const idlePct = m.totalStations > 0 ? (m.zombieStations / m.totalStations) * 100 : 0
                            return (
                                <li key={m.merchantId}>
                                    <Link
                                        href={`/manage/merchants/${m.merchantId}`}
                                        className="group flex min-w-0 items-center gap-3 rounded-xl px-3 py-2 transition-colors hover:bg-muted/60"
                                    >
                                        <div className="min-w-0 flex-1">
                                            <div className="flex min-w-0 items-baseline justify-between gap-3">
                                                <span className="truncate text-sm font-medium text-foreground">
                                                    {m.merchantName}
                                                </span>
                                                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                                                    <span className="font-semibold text-foreground">{m.zombieStations}</span>
                                                    {' '}idle of {m.totalStations}
                                                </span>
                                            </div>
                                            {/* Idle share of the merchant's fleet. */}
                                            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
                                                <div
                                                    className="h-full rounded-full bg-amber-500/80"
                                                    style={{ width: `${idlePct}%` }}
                                                />
                                            </div>
                                        </div>
                                        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/50 transition-colors group-hover:text-foreground" />
                                    </Link>
                                </li>
                            )
                        })}
                        {hiddenCount > 0 && (
                            <li className="px-3 pt-1 text-xs text-muted-foreground">
                                +{hiddenCount} more merchant{hiddenCount !== 1 ? 's' : ''} with idle tablets
                            </li>
                        )}
                    </ul>
                </div>
            </PanelSection>
        </Panel>
    )
}

// ============================================================================
// Utilization Distribution — rendered by the page beside the stability chart
// ============================================================================

/**
 * Merchants per utilization bracket. Lives outside the main component because
 * the page lays it out next to "Stability by app version"; `days` comes from
 * the page so it still follows Terminal Utilization's range picker. Shares the
 * main component's query, so it costs no extra fetch.
 */
export function UtilizationDistribution({ days }: { days: number }) {
    const isMobile = useIsMobile()
    const { data, isLoading } = useTerminalUtilization(days)
    // Read into a local so the memo's dependency is exactly what it uses.
    const merchants = data?.merchants

    const chartData = useMemo(() => {
        if (!merchants) return []
        const buckets = [
            { range: '0-10%', min: 0, max: 10, count: 0, color: '#ef4444' },
            { range: '10-25%', min: 10, max: 25, count: 0, color: '#f97316' },
            { range: '25-50%', min: 25, max: 50, count: 0, color: '#eab308' },
            { range: '50-75%', min: 50, max: 75, count: 0, color: '#84cc16' },
            { range: '75-100%', min: 75, max: 100.1, count: 0, color: '#22c55e' },
        ]
        merchants.forEach(m => {
            const bucket = buckets.find(b => m.utilizationRate >= b.min && m.utilizationRate < b.max)
            if (bucket) bucket.count += 1
        })
        return buckets
    }, [merchants])

    if (isLoading) return <Skeleton className="h-75 w-full rounded-3xl" />

    return (
        <Panel className="min-w-0">
            <PanelSection
                label="Utilization distribution"
                caption={`Merchants per utilization bracket, last ${days} days`}
            >
                {chartData.length > 0 ? (
                    <ResponsiveContainer width="100%" height={280}>
                        <BarChart data={chartData} barCategoryGap="20%" margin={{ bottom: 20 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} />
                            <XAxis
                                dataKey="range"
                                tick={{ fontSize: 10, angle: -35, textAnchor: 'end' }}
                                tickLine={false}
                                axisLine={false}
                                interval={0}
                                height={48}
                            />
                            <YAxis
                                allowDecimals={false}
                                tick={{ fontSize: 11 }}
                                tickLine={false}
                                axisLine={false}
                                width={isMobile ? valueAxisWidthMobile(3) : undefined}
                            />
                            <RechartsTooltip
                                content={({ active, payload }) => {
                                    if (active && payload && payload.length) {
                                        const d = payload[0].payload
                                        return (
                                            <div className="bg-background border rounded-lg p-3 shadow-sm text-xs">
                                                <p className="font-medium">{d.range} Utilization</p>
                                                <p className="text-muted-foreground mt-1">
                                                    {d.count} merchant{d.count !== 1 ? 's' : ''}
                                                </p>
                                            </div>
                                        )
                                    }
                                    return null
                                }}
                            />
                            <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                                {chartData.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={entry.color} />
                                ))}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                ) : (
                    <div className="h-65 flex items-center justify-center text-muted-foreground text-sm">
                        No data available
                    </div>
                )}
            </PanelSection>
        </Panel>
    )
}

// ============================================================================
// Main Component
// ============================================================================

/** `days` is owned by the page so {@link UtilizationDistribution} can follow it. */
export default function TerminalUtilizationHeatmap({
    days,
    onDaysChange,
}: {
    days: number
    onDaysChange: (days: number) => void
}) {
    const [sortOption, setSortOption] = useState<SortOption>('utilization')
    const [filterTier, setFilterTier] = useState<'all' | UtilizationTier>('all')
    const isMobile = useIsMobile()

    const { data, isLoading } = useTerminalUtilization(days)
    // Read into a local so the memos' dependency is exactly what they use.
    const merchants = data?.merchants

    const filteredAndSorted = useMemo(() => {
        if (!merchants) return []
        const { key, dir } = SORT_OPTIONS[sortOption]
        const list = filterTier === 'all'
            ? [...merchants]
            : merchants.filter(m => m.tier === filterTier)

        return list.sort((a, b) => {
            const aVal = a[key]
            const bVal = b[key]
            if (typeof aVal === 'string' && typeof bVal === 'string') {
                return dir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal)
            }
            return dir === 'asc' ? Number(aVal) - Number(bVal) : Number(bVal) - Number(aVal)
        })
    }, [merchants, sortOption, filterTier])

    const nameHints = useMemo(() => duplicateNameHints(merchants ?? []), [merchants])
    const { pageRows, pagination, setPage } = useClientPagination(filteredAndSorted)

    return (
        <>
            {/* ================================================================ */}
            {/* TICKET-004: Terminal Utilization Heatmap                         */}
            {/* ================================================================ */}

            {/* Section Header */}
            <div className="flex flex-wrap items-center gap-3 justify-between">
                <div className="flex flex-wrap items-center gap-2 min-w-0">
                    {!isLoading && data && (
                        <span
                            className={`flex shrink-0 items-center gap-1 text-sm ${
                                data.summary.overallUtilizationRate >= 75 ? 'text-muted-foreground' : 'font-medium'
                            }`}
                        >
                            {data.summary.overallUtilizationRate >= 75
                                ? <ShieldCheck className="h-3.5 w-3.5" />
                                : <AlertTriangle className="h-3.5 w-3.5" />}
                            {data.summary.overallUtilizationRate}% Fleet Utilized
                        </span>
                    )}
                </div>
                <Select value={String(days)} onValueChange={(v) => onDaysChange(Number(v))}>
                    <SelectTrigger className="w-32.5 shrink-0">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="7">Last 7 Days</SelectItem>
                        <SelectItem value="30">Last 30 Days</SelectItem>
                        <SelectItem value="90">Last 90 Days</SelectItem>
                    </SelectContent>
                </Select>
            </div>

            {/* Loading State */}
            {isLoading && (
                <>
                    <Skeleton className="h-40 w-full rounded-3xl" />
                    <Skeleton className="h-75 w-full rounded-3xl" />
                </>
            )}

            {/* Loaded State */}
            {!isLoading && data && (
                <>
                    <Panel>
                        <PanelSection label="Terminal utilization" icon={Monitor}>
                            <StatRow columns={4}>
                                <StatTile
                                    label="Order Stations"
                                    icon={<Monitor />}
                                    value={data.summary.totalStations}
                                    meta={`${data.summary.totalActiveStations} active · kitchen displays not counted`}
                                />
                                <StatTile
                                    label="Active Utilization Rate"
                                    icon={<BarChart3 />}
                                    value={`${data.summary.overallUtilizationRate}%`}
                                    meta={`${data.summary.totalActiveStations} of ${data.summary.totalStations} tablets active`}
                                />
                                <StatTile
                                    label="Inactive Tablets"
                                    icon={<Ghost />}
                                    value={data.summary.totalZombieStations}
                                    meta={
                                        data.summary.estimatedWastedHardwareValue > 0
                                            ? `~$${data.summary.estimatedWastedHardwareValue.toLocaleString()} wasted hardware`
                                            : 'No transactions in 30+ days'
                                    }
                                />
                                <StatTile
                                    label="Underutilized Merchants"
                                    icon={<TrendingDown />}
                                    value={data.summary.underutilizedMerchantCount}
                                    meta={`<50% utilization · ${data.summary.totalReclaimableStations} reclaimable tablets`}
                                />
                            </StatRow>
                        </PanelSection>
                    </Panel>

                    {/* Inactive-tablet banner */}
                    {data.merchants.some(m => m.zombieStations > 0) && (
                        <ZombieInsightBanner
                            merchants={data.merchants}
                            totalZombieStations={data.summary.totalZombieStations}
                            estimatedWastedHardwareValue={data.summary.estimatedWastedHardwareValue}
                            hardwareCostPerUnit={data.summary.hardwareCostPerUnit}
                        />
                    )}

                    {/* Merchant list — its own row. One line per merchant, pages at
                        10; no height cap, so nothing scrolls inside the page. */}
                    <Panel>
                        <PanelSection
                            label="Merchant terminal report"
                            caption={
                                filterTier === 'all'
                                    ? `All ${data.summary.totalMerchants} merchants`
                                    : `${filteredAndSorted.length} ${filterTier} merchants`
                            }
                            action={
                                <div className="flex flex-wrap items-center gap-2">
                                    <Select value={sortOption} onValueChange={(v) => setSortOption(v as SortOption)}>
                                        <SelectTrigger
                                            aria-label="Sort merchants"
                                            className="h-9 w-44 shrink-0 rounded-full border-0 bg-muted/60 px-3 shadow-none"
                                        >
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {Object.entries(SORT_OPTIONS).map(([value, o]) => (
                                                <SelectItem key={value} value={value}>{o.label}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    <Select value={filterTier} onValueChange={(v) => setFilterTier(v as typeof filterTier)}>
                                        <SelectTrigger
                                            aria-label="Filter by tier"
                                            className="h-9 w-40 shrink-0 rounded-full border-0 bg-muted/60 px-3 shadow-none"
                                        >
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="all">All Tiers</SelectItem>
                                            <SelectItem value="critical">Critical (&lt;25%)</SelectItem>
                                            <SelectItem value="underutilized">Underutilized (&lt;50%)</SelectItem>
                                            <SelectItem value="healthy">Healthy (≥50%)</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            }
                        >
                            {filteredAndSorted.length === 0 ? (
                                <div className="flex flex-col items-center gap-2 py-8 text-center text-muted-foreground">
                                    <ShieldCheck className="h-8 w-8 opacity-30" />
                                    <p className="text-sm font-medium">No merchants in this tier</p>
                                </div>
                            ) : (
                                <div className="space-y-1">
                                    {pageRows.map(m => (
                                        <MerchantUtilizationRow
                                            key={m.merchantId}
                                            merchant={m}
                                            nameHint={nameHints.get(m.merchantId) ?? null}
                                            isMobile={isMobile}
                                        />
                                    ))}
                                </div>
                            )}
                            <PaginationBar
                                className="border-t-0 pt-0"
                                pagination={pagination}
                                onPageChange={setPage}
                                itemLabel="merchants"
                            />
                        </PanelSection>
                    </Panel>

                    {/* Empty State */}
                    {data.summary.totalStations === 0 && (
                        <Panel>
                            <PanelSection label="No stations found">
                                <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
                                    <Tablet className="h-8 w-8 text-muted-foreground opacity-50" />
                                    <p className="max-w-md text-sm text-muted-foreground max-md:hidden">
                                        No active stations detected. Terminal utilization data will appear once merchants register their devices.
                                    </p>
                                </div>
                            </PanelSection>
                        </Panel>
                    )}

                    {/* All-Healthy State */}
                    {data.summary.totalStations > 0 && data.summary.underutilizedMerchantCount === 0 && data.summary.totalZombieStations === 0 && (
                        <Panel>
                            <PanelSection icon={ShieldCheck} label="Fleet fully utilized">
                                <p className="text-sm text-muted-foreground max-md:hidden">
                                    All {data.summary.totalStations} terminals across {data.summary.totalMerchants} merchants are actively processing transactions.
                                    No inactive tablets or underutilized merchants detected.
                                </p>
                            </PanelSection>
                        </Panel>
                    )}
                </>
            )}
        </>
    )
}
