'use client'

import { useState, useMemo, Fragment } from 'react'
import { Panel } from '@/components/dashboard/shell/Panel'
import { PanelSection } from '@/components/dashboard/shell/PanelSection'
import { StatRow, StatTile, InsetTile } from '@/components/dashboard/shell/StatTile'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
    MobileColumnsButton,
    initialHiddenColumns,
    type ReportColumn,
} from '@/components/dashboard/reports/MobileColumnsButton'
import { useIsMobile } from '@/hooks/use-mobile'
import { cn } from '@/lib/utils'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
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
    ChevronDown,
    ChevronRight,
    ArrowUpDown,
    ExternalLink,
    Recycle,
    Monitor,
    TrendingDown,
    BarChart3,
    DollarSign,
} from 'lucide-react'
import { useTerminalUtilization } from '@/lib/queries/use-platform-analytics'
import type { MerchantTerminalUtilization, UtilizationTier } from '@/app/manage/actions/hq-platform/analytics'
import Link from 'next/link'

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
 * Mobile column meta for the merchant terminal report.
 *
 * Heatmap is hidden by default on mobile: it is a wrapping grid of 24px squares,
 * one per station, so it cannot narrow — it only overflows. It stays one tap
 * away, and is always present on desktop. Util. Rate is the default sort key and
 * the measure the panel exists for, so it is the number kept beside the name.
 */
const MERCHANT_TERMINAL_COLUMNS: ReportColumn[] = [
    { id: 'merchant', label: 'Merchant', locked: true },
    { id: 'stations', label: 'Stations', defaultHidden: true },
    { id: 'utilRate', label: 'Util. Rate' },
    { id: 'zombies', label: 'Zombies', defaultHidden: true },
    { id: 'tier', label: 'Tier', defaultHidden: true },
    { id: 'heatmap', label: 'Heatmap', defaultHidden: true },
]

// ============================================================================
// Heatmap Cell — visual grid of stations per merchant
// ============================================================================

function StationHeatmapGrid({ merchant }: { merchant: MerchantTerminalUtilization }) {
    return (
        <TooltipProvider delayDuration={200}>
            <div className="flex flex-wrap gap-1">
                {merchant.stations.map((station) => {
                    let bg = 'bg-green-500'
                    let label = `Active — ${station.totalOrders} orders, ${station.activeDays} active days`

                    if (station.isZombie) {
                        bg = 'bg-red-500'
                        label = station.lastTransactionAt
                            ? `Zombie — no txn in ${station.daysSinceLastTxn}d`
                            : 'Zombie — never processed a txn'
                    } else if (station.activeDays === 0) {
                        bg = 'bg-gray-300'
                        label = 'No activity in period'
                    } else if (station.avgOrdersPerActiveDay < 1) {
                        bg = 'bg-yellow-400'
                        label = `Low usage — ${station.avgOrdersPerActiveDay} avg orders/day`
                    }

                    return (
                        <Tooltip key={station.stationId}>
                            <TooltipTrigger asChild>
                                <div
                                    className={`h-6 w-6 rounded-sm ${bg} cursor-default transition-transform hover:scale-125`}
                                    aria-label={`${station.stationName}: ${label}`}
                                />
                            </TooltipTrigger>
                            <TooltipContent side="top" className="text-xs max-w-55">
                                <p className="font-semibold">{station.stationName}</p>
                                <p className="text-muted-foreground">{station.stationType}</p>
                                <p className="mt-1">{label}</p>
                                {station.totalOrders > 0 && (
                                    <p className="mt-0.5 text-muted-foreground">
                                        {station.avgOrdersPerActiveDay} avg orders/active day
                                    </p>
                                )}
                            </TooltipContent>
                        </Tooltip>
                    )
                })}
            </div>
        </TooltipProvider>
    )
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
    const merchantsWithZombies = merchants.filter(m => m.zombieStations > 0)
    const worstMerchant = [...merchantsWithZombies].sort((a, b) => b.zombieStations - a.zombieStations)[0]

    if (!worstMerchant) return null

    const fmtDollars = (n: number) =>
        n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(1)}M` :
        n >= 1_000    ? `$${(n / 1_000).toFixed(1)}k` :
        `$${n.toLocaleString()}`

    return (
        <Panel>
            <PanelSection
                icon={Ghost}
                label={`${merchantsWithZombies.length} merchant${merchantsWithZombies.length !== 1 ? 's have' : ' has'} ${totalZombieStations} zombie tablet${totalZombieStations !== 1 ? 's' : ''}`}
                caption="No transaction in 30+ days"
                action={
                    <Link href={`/manage/merchants/${worstMerchant.merchantId}`}>
                        <Button variant="outline" size="sm" className="shrink-0 rounded-full">
                            <ExternalLink className="mr-1 h-3 w-3" />
                            View Merchant
                        </Button>
                    </Link>
                }
            >
                <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-center">
                    <p className="min-w-0 flex-1 text-sm text-muted-foreground">
                        Worst offender:{' '}
                        <span className="font-semibold text-foreground">{worstMerchant.merchantName}</span>{' '}
                        ({worstMerchant.zombieStations} zombie{worstMerchant.zombieStations !== 1 ? 's' : ''} · paying for{' '}
                        {worstMerchant.totalStations} but only using {worstMerchant.activeStations}).
                    </p>

                    <InsetTile
                        className="shrink-0 sm:w-64"
                        icon={<DollarSign />}
                        label="Estimated wasted hardware value"
                        value={fmtDollars(estimatedWastedHardwareValue)}
                        meta={`Based on ~${fmtDollars(hardwareCostPerUnit)}/unit assumption`}
                    />
                </div>
            </PanelSection>
        </Panel>
    )
}

// ============================================================================
// Main Component
// ============================================================================

export default function TerminalUtilizationHeatmap() {
    const [days, setDays] = useState<number>(30)
    const [sortKey, setSortKey] = useState<SortKey>('utilizationRate')
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
    const [expandedMerchant, setExpandedMerchant] = useState<string | null>(null)
    const [filterTier, setFilterTier] = useState<'all' | UtilizationTier>('all')
    const isMobile = useIsMobile()
    const [hiddenCols, setHiddenCols] = useState<Set<string>>(() =>
        initialHiddenColumns(MERCHANT_TERMINAL_COLUMNS)
    )
    const showCol = (id: string) => !isMobile || !hiddenCols.has(id)
    // +1 for the chevron column, which has no meta entry but occupies a cell.
    // The empty state and the expanded drill-down row both span the full width.
    const visibleColCount = MERCHANT_TERMINAL_COLUMNS.filter(c => showCol(c.id)).length + 1

    const { data, isLoading } = useTerminalUtilization(days)

    const handleSort = (key: SortKey) => {
        if (sortKey === key) {
            setSortDir(prev => (prev === 'desc' ? 'asc' : 'desc'))
        } else {
            setSortKey(key)
            setSortDir(key === 'merchantName' ? 'asc' : 'asc')
        }
    }

    const filteredAndSorted = useMemo(() => {
        if (!data?.merchants) return []
        let list = [...data.merchants]

        if (filterTier !== 'all') {
            list = list.filter(m => m.tier === filterTier)
        }

        return list.sort((a, b) => {
            let aVal: number | string = a[sortKey]
            let bVal: number | string = b[sortKey]
            if (typeof aVal === 'string' && typeof bVal === 'string') {
                return sortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal)
            }
            return sortDir === 'asc' ? Number(aVal) - Number(bVal) : Number(bVal) - Number(aVal)
        })
    }, [data?.merchants, sortKey, sortDir, filterTier])

    // Build chart data for the utilization distribution bar chart
    const chartData = useMemo(() => {
        if (!data?.merchants) return []
        const buckets = [
            { range: '0-10%', min: 0, max: 10, count: 0, color: '#ef4444' },
            { range: '10-25%', min: 10, max: 25, count: 0, color: '#f97316' },
            { range: '25-50%', min: 25, max: 50, count: 0, color: '#eab308' },
            { range: '50-75%', min: 50, max: 75, count: 0, color: '#84cc16' },
            { range: '75-100%', min: 75, max: 100.1, count: 0, color: '#22c55e' },
        ]
        data.merchants.forEach(m => {
            const bucket = buckets.find(b => m.utilizationRate >= b.min && m.utilizationRate < b.max)
            if (bucket) bucket.count += 1
        })
        return buckets
    }, [data?.merchants])

    return (
        <>
            {/* ================================================================ */}
            {/* TICKET-004: Terminal Utilization Heatmap                         */}
            {/* ================================================================ */}

            {/* Section Header */}
            <div className="flex flex-wrap items-center gap-3 justify-between">
                <div className="flex flex-wrap items-center gap-2 min-w-0">
                    <Tablet className="h-5 w-5 text-primary shrink-0" />
                    <div className="min-w-0">
                        <h2 className="text-lg font-semibold">Terminal Utilization</h2>
                        <p className="text-sm text-muted-foreground">
                            Identify underused tablets — reclaim hardware or adjust billing
                        </p>
                    </div>
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
                <Select value={String(days)} onValueChange={(v) => setDays(Number(v))}>
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
                                    label="Total Stations"
                                    icon={<Monitor />}
                                    value={data.summary.totalStations}
                                    meta={`${data.summary.totalActiveStations} active across ${data.summary.totalMerchants} merchants`}
                                />
                                <StatTile
                                    label="Active Utilization Rate"
                                    icon={<BarChart3 />}
                                    value={`${data.summary.overallUtilizationRate}%`}
                                    meta={`${data.summary.totalActiveStations} of ${data.summary.totalStations} tablets active`}
                                />
                                <StatTile
                                    label="Zombie Tablets"
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

                    {/* Zombie Insight Banner */}
                    {data.merchants.some(m => m.zombieStations > 0) && (
                        <ZombieInsightBanner
                            merchants={data.merchants}
                            totalZombieStations={data.summary.totalZombieStations}
                            estimatedWastedHardwareValue={data.summary.estimatedWastedHardwareValue}
                            hardwareCostPerUnit={data.summary.hardwareCostPerUnit}
                        />
                    )}

                    {/* Utilization Distribution Chart + Merchant Table */}
                    <div className="grid gap-4 lg:grid-cols-7">
                        {/* Distribution Chart */}
                        <Panel className="lg:col-span-3">
                            <PanelSection
                                label="Utilization distribution"
                                caption="Number of merchants per utilization bracket"
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

                        {/* Merchant Table */}
                        <Panel className="lg:col-span-4">
                            <PanelSection
                                label="Merchant terminal report"
                                caption={
                                    filterTier === 'all'
                                        ? `All ${data.summary.totalMerchants} merchants`
                                        : `${filteredAndSorted.length} ${filterTier} merchants`
                                }
                                action={
                                    <div className="flex items-center gap-2">
                                        <MobileColumnsButton
                                            columns={MERCHANT_TERMINAL_COLUMNS}
                                            hidden={hiddenCols}
                                            onChange={setHiddenCols}
                                        />
                                        <Select value={filterTier} onValueChange={(v) => setFilterTier(v as typeof filterTier)}>
                                            <SelectTrigger className="h-9 w-40 shrink-0 rounded-full border-0 bg-muted/60 px-3 shadow-none">
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
                                <div className="max-h-112.5 overflow-auto">
                                    {/* Min-width lifted on mobile so hidden columns actually
                                        narrow the table instead of scrolling sideways. */}
                                    <Table variant="data" className={cn(!isMobile && 'min-w-[860px]')}>
                                        <TableHeader className="[&_tr]:border-0">
                                            <TableRow>
                                                <TableHead className="w-6"></TableHead>
                                                <TableHead
                                                    className="cursor-pointer select-none hover:text-foreground"
                                                    onClick={() => handleSort('merchantName')}
                                                >
                                                    <span className="flex items-center gap-1">
                                                        Merchant
                                                        <ArrowUpDown className="h-3 w-3" />
                                                    </span>
                                                </TableHead>
                                                {showCol('stations') && (
                                                    <TableHead
                                                        className="text-center cursor-pointer select-none hover:text-foreground"
                                                        onClick={() => handleSort('totalStations')}
                                                    >
                                                        <span className="flex items-center justify-center gap-1">
                                                            Stations
                                                            <ArrowUpDown className="h-3 w-3" />
                                                        </span>
                                                    </TableHead>
                                                )}
                                                {showCol('utilRate') && (
                                                    <TableHead
                                                        className="text-center cursor-pointer select-none hover:text-foreground"
                                                        onClick={() => handleSort('utilizationRate')}
                                                    >
                                                        <span className="flex items-center justify-center gap-1">
                                                            Util. Rate
                                                            <ArrowUpDown className="h-3 w-3" />
                                                        </span>
                                                    </TableHead>
                                                )}
                                                {showCol('zombies') && (
                                                    <TableHead
                                                        className="text-center cursor-pointer select-none hover:text-foreground"
                                                        onClick={() => handleSort('zombieStations')}
                                                    >
                                                        <span className="flex items-center justify-center gap-1">
                                                            Zombies
                                                            <ArrowUpDown className="h-3 w-3" />
                                                        </span>
                                                    </TableHead>
                                                )}
                                                {showCol('tier') && <TableHead className="text-center">Tier</TableHead>}
                                                {showCol('heatmap') && <TableHead className="text-center">Heatmap</TableHead>}
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {filteredAndSorted.length === 0 ? (
                                                <TableRow>
                                                    <TableCell colSpan={visibleColCount} className="text-center py-8 text-muted-foreground">
                                                        <div className="flex flex-col items-center gap-2">
                                                            <ShieldCheck className="h-8 w-8 opacity-30" />
                                                            <p className="text-sm font-medium">No merchants in this tier</p>
                                                        </div>
                                                    </TableCell>
                                                </TableRow>
                                            ) : filteredAndSorted.map((m) => {
                                                const tierCfg = TIER_CONFIG[m.tier]
                                                const isExpanded = expandedMerchant === m.merchantId
                                                return (
                                                    <Fragment key={m.merchantId}>
                                                        <TableRow
                                                            className="cursor-pointer hover:bg-muted/50"
                                                            onClick={() => setExpandedMerchant(isExpanded ? null : m.merchantId)}
                                                        >
                                                            <TableCell className="w-6 pr-0">
                                                                {isExpanded
                                                                    ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
                                                                    : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                                                            </TableCell>
                                                            <TableCell>
                                                                <Link
                                                                    href={`/manage/merchants/${m.merchantId}`}
                                                                    className="hover:underline font-medium text-sm flex items-center gap-1"
                                                                    onClick={(e) => e.stopPropagation()}
                                                                >
                                                                    {m.merchantName}
                                                                    <ExternalLink className="h-3 w-3 opacity-40" />
                                                                </Link>
                                                                <p className="text-xs text-muted-foreground">
                                                                    {m.totalOrders.toLocaleString()} total orders
                                                                </p>
                                                            </TableCell>
                                                            {showCol('stations') && (
                                                                <TableCell className="text-center">
                                                                    <span className="font-medium text-sm">
                                                                        {m.activeStations}/{m.totalStations}
                                                                    </span>
                                                                </TableCell>
                                                            )}
                                                            {showCol('utilRate') && (
                                                                <TableCell className="text-center">
                                                                    <span className="text-sm font-semibold tabular-nums">
                                                                        {m.utilizationRate}%
                                                                    </span>
                                                                </TableCell>
                                                            )}
                                                            {showCol('zombies') && (
                                                                <TableCell className="text-center">
                                                                    {m.zombieStations > 0 ? (
                                                                        <span className="inline-flex items-center gap-1 text-sm font-medium tabular-nums">
                                                                            <Ghost className="h-3 w-3" />
                                                                            {m.zombieStations}
                                                                        </span>
                                                                    ) : (
                                                                        <span className="text-muted-foreground">—</span>
                                                                    )}
                                                                </TableCell>
                                                            )}
                                                            {showCol('tier') && (
                                                                <TableCell className="text-center text-sm text-muted-foreground">
                                                                    {tierCfg.label}
                                                                </TableCell>
                                                            )}
                                                            {showCol('heatmap') && (
                                                                <TableCell>
                                                                    <StationHeatmapGrid merchant={m} />
                                                                </TableCell>
                                                            )}
                                                        </TableRow>

                                                        {/* Expanded Drill-down Row */}
                                                        {isExpanded && (
                                                            <TableRow className="bg-muted/30">
                                                                <TableCell colSpan={visibleColCount} className="p-4">
                                                                    <div className="space-y-3">
                                                                        <div className="flex items-center justify-between">
                                                                            <h4 className="text-sm font-semibold">Station Detail — {m.merchantName}</h4>
                                                                            {m.reclaimableStations > 0 && (
                                                                                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                                                                                    <Recycle className="h-3 w-3" />
                                                                                    {m.reclaimableStations} reclaimable
                                                                                </span>
                                                                            )}
                                                                        </div>
                                                                        <Table variant="data" className="min-w-[680px]">
                                                                            <TableHeader className="[&_tr]:border-0">
                                                                                <TableRow>
                                                                                    <TableHead>Station</TableHead>
                                                                                    <TableHead>Type</TableHead>
                                                                                    <TableHead className="text-right">Orders</TableHead>
                                                                                    <TableHead className="text-right">Active Days</TableHead>
                                                                                    <TableHead className="text-right">Avg/Day</TableHead>
                                                                                    <TableHead className="text-right">Last Txn</TableHead>
                                                                                    <TableHead className="text-center">Status</TableHead>
                                                                                </TableRow>
                                                                            </TableHeader>
                                                                            <TableBody>
                                                                                {m.stations.map((s) => (
                                                                                    <TableRow key={s.stationId}>
                                                                                        <TableCell className="font-medium">{s.stationName}</TableCell>
                                                                                        <TableCell className="text-xs text-muted-foreground">{s.stationType}</TableCell>
                                                                                        <TableCell className="text-right tabular-nums">{s.totalOrders.toLocaleString()}</TableCell>
                                                                                        <TableCell className="text-right tabular-nums">{s.activeDays}</TableCell>
                                                                                        <TableCell className="text-right tabular-nums">{s.avgOrdersPerActiveDay}</TableCell>
                                                                                        <TableCell className="whitespace-nowrap text-right text-xs text-muted-foreground">
                                                                                            {s.lastTransactionAt ? (
                                                                                                s.daysSinceLastTxn === 0 ? 'Today' : `${s.daysSinceLastTxn}d ago`
                                                                                            ) : (
                                                                                                <span>Never</span>
                                                                                            )}
                                                                                        </TableCell>
                                                                                        <TableCell className="text-center text-sm text-muted-foreground">
                                                                                            {s.isZombie ? (
                                                                                                <span className="inline-flex items-center gap-1 font-medium">
                                                                                                    <Ghost className="h-3 w-3" />
                                                                                                    Zombie
                                                                                                </span>
                                                                                            ) : s.activeDays === 0 ? (
                                                                                                'Idle'
                                                                                            ) : s.avgOrdersPerActiveDay < 1 ? (
                                                                                                'Low'
                                                                                            ) : (
                                                                                                'Active'
                                                                                            )}
                                                                                        </TableCell>
                                                                                    </TableRow>
                                                                                ))}
                                                                            </TableBody>
                                                                        </Table>
                                                                    </div>
                                                                </TableCell>
                                                            </TableRow>
                                                        )}
                                                    </Fragment>
                                                )
                                            })}
                                        </TableBody>
                                    </Table>
                                </div>
                            </PanelSection>
                        </Panel>
                    </div>

                    {/* Empty State */}
                    {data.summary.totalStations === 0 && (
                        <Panel>
                            <PanelSection label="No stations found">
                                <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
                                    <Tablet className="h-8 w-8 text-muted-foreground opacity-50" />
                                    <p className="max-w-md text-sm text-muted-foreground">
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
                                <p className="text-sm text-muted-foreground">
                                    All {data.summary.totalStations} terminals across {data.summary.totalMerchants} merchants are actively processing transactions.
                                    No zombie tablets or underutilized merchants detected.
                                </p>
                            </PanelSection>
                        </Panel>
                    )}
                </>
            )}
        </>
    )
}
