'use client'

import { useState, useMemo, Fragment } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
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

const TIER_CONFIG: Record<UtilizationTier, {
    label: string
    variant: 'default' | 'secondary' | 'destructive'
    colorClass: string
    bgClass: string
    barColor: string
}> = {
    healthy: {
        label: 'Healthy',
        variant: 'default',
        colorClass: 'text-green-600',
        bgClass: 'bg-green-50 border-green-200',
        barColor: '#22c55e',
    },
    underutilized: {
        label: 'Underutilized',
        variant: 'secondary',
        colorClass: 'text-yellow-600',
        bgClass: 'bg-yellow-50 border-yellow-200',
        barColor: '#eab308',
    },
    critical: {
        label: 'Critical',
        variant: 'destructive',
        colorClass: 'text-red-600',
        bgClass: 'bg-red-50 border-red-200',
        barColor: '#ef4444',
    },
}

type SortKey = 'utilizationRate' | 'totalStations' | 'zombieStations' | 'merchantName'

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
        <Card className="border-red-200 bg-linear-to-r from-red-50 to-orange-50">
            <CardContent className="py-5">
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                    <div className="p-2.5 rounded-lg bg-red-100 shrink-0">
                        <Ghost className="h-6 w-6 text-red-700" />
                    </div>

                    {/* Left — fleet-wide summary */}
                    <div className="flex-1 min-w-0">
                        <p className="font-semibold text-red-900">
                            {merchantsWithZombies.length} merchant{merchantsWithZombies.length !== 1 ? 's have' : ' has'}{' '}
                            {totalZombieStations} zombie tablet{totalZombieStations !== 1 ? 's' : ''} — no transaction in 30+ days
                        </p>
                        <p className="text-sm text-red-800 mt-0.5">
                            Worst offender:{' '}
                            <span className="font-bold">{worstMerchant.merchantName}</span>{' '}
                            ({worstMerchant.zombieStations} zombie{worstMerchant.zombieStations !== 1 ? 's' : ''} · paying for{' '}
                            {worstMerchant.totalStations} but only using {worstMerchant.activeStations}).
                        </p>
                    </div>

                    {/* Right — wasted value callout */}
                    <div className="flex items-center gap-3 shrink-0 rounded-lg bg-white border border-red-200 px-4 py-3">
                        <DollarSign className="h-5 w-5 text-red-600" />
                        <div>
                            <p className="text-xs text-muted-foreground leading-tight">Estimated wasted hardware value</p>
                            <p className="text-2xl font-bold text-red-600 leading-tight">{fmtDollars(estimatedWastedHardwareValue)}</p>
                            <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">
                                Based on ~{fmtDollars(hardwareCostPerUnit)}/unit assumption
                            </p>
                        </div>
                    </div>

                    <Link href={`/manage/merchants/${worstMerchant.merchantId}`}>
                        <Button variant="outline" size="sm" className="border-red-300 text-red-800 hover:bg-red-100 shrink-0">
                            <ExternalLink className="h-3 w-3 mr-1" />
                            View Merchant
                        </Button>
                    </Link>
                </div>
            </CardContent>
        </Card>
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
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <Tablet className="h-5 w-5 text-primary" />
                    <div>
                        <h2 className="text-lg font-semibold">Terminal Utilization</h2>
                        <p className="text-sm text-muted-foreground">
                            Identify underused tablets — reclaim hardware or adjust billing
                        </p>
                    </div>
                    {!isLoading && data && (
                        data.summary.overallUtilizationRate >= 75 ? (
                            <Badge variant="default" className="flex items-center gap-1 ml-2 bg-green-600">
                                <ShieldCheck className="h-3 w-3" />
                                {data.summary.overallUtilizationRate}% Fleet Utilized
                            </Badge>
                        ) : data.summary.overallUtilizationRate >= 50 ? (
                            <Badge variant="secondary" className="flex items-center gap-1 ml-2">
                                <AlertTriangle className="h-3 w-3" />
                                {data.summary.overallUtilizationRate}% Fleet Utilized
                            </Badge>
                        ) : (
                            <Badge variant="destructive" className="flex items-center gap-1 ml-2">
                                <AlertTriangle className="h-3 w-3" />
                                {data.summary.overallUtilizationRate}% Fleet Utilized
                            </Badge>
                        )
                    )}
                </div>
                <Select value={String(days)} onValueChange={(v) => setDays(Number(v))}>
                    <SelectTrigger className="w-32.5">
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
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                        {Array.from({ length: 4 }).map((_, i) => (
                            <Card key={i}>
                                <CardHeader className="pb-2">
                                    <Skeleton className="h-4 w-28" />
                                </CardHeader>
                                <CardContent>
                                    <Skeleton className="h-8 w-20" />
                                    <Skeleton className="h-3 w-32 mt-2" />
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                    <Card>
                        <CardContent className="pt-6">
                            <div className="space-y-3">
                                {Array.from({ length: 5 }).map((_, i) => (
                                    <Skeleton key={i} className="h-16 w-full" />
                                ))}
                            </div>
                        </CardContent>
                    </Card>
                </>
            )}

            {/* Loaded State */}
            {!isLoading && data && (
                <>
                    {/* KPI Summary Cards */}
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium text-muted-foreground">Total Stations</CardTitle>
                                <Monitor className="h-4 w-4 text-muted-foreground" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold">{data.summary.totalStations}</div>
                                <p className="text-xs text-muted-foreground mt-1">
                                    {data.summary.totalActiveStations} active across {data.summary.totalMerchants} merchants
                                </p>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium text-muted-foreground">Active Utilization Rate</CardTitle>
                                <BarChart3 className="h-4 w-4 text-muted-foreground" />
                            </CardHeader>
                            <CardContent>
                                <div className={`text-2xl font-bold ${
                                    data.summary.overallUtilizationRate >= 75
                                        ? 'text-green-600'
                                        : data.summary.overallUtilizationRate >= 50
                                            ? 'text-yellow-600'
                                            : 'text-red-600'
                                }`}>
                                    {data.summary.overallUtilizationRate}%
                                </div>
                                <p className="text-xs text-muted-foreground mt-1">
                                    {data.summary.totalActiveStations} of {data.summary.totalStations} tablets active
                                </p>
                            </CardContent>
                        </Card>
                        <Card className={data.summary.totalZombieStations > 0 ? 'border-red-200' : undefined}>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium text-muted-foreground">Zombie Tablets</CardTitle>
                                <Ghost className={`h-4 w-4 ${data.summary.totalZombieStations > 0 ? 'text-red-500' : 'text-muted-foreground'}`} />
                            </CardHeader>
                            <CardContent>
                                <div className={`text-2xl font-bold ${data.summary.totalZombieStations > 0 ? 'text-red-600' : 'text-green-600'}`}>
                                    {data.summary.totalZombieStations}
                                </div>
                                {data.summary.estimatedWastedHardwareValue > 0 ? (
                                    <p className="text-xs text-red-600 font-medium mt-1">
                                        ~${data.summary.estimatedWastedHardwareValue.toLocaleString()} wasted hardware
                                    </p>
                                ) : (
                                    <p className="text-xs text-muted-foreground mt-1">No transactions in 30+ days</p>
                                )}
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium text-muted-foreground">Underutilized Merchants</CardTitle>
                                <TrendingDown className="h-4 w-4 text-muted-foreground" />
                            </CardHeader>
                            <CardContent>
                                <div className={`text-2xl font-bold ${data.summary.underutilizedMerchantCount > 0 ? 'text-yellow-600' : 'text-green-600'}`}>
                                    {data.summary.underutilizedMerchantCount}
                                </div>
                                <p className="text-xs text-muted-foreground mt-1">
                                    &lt;50% utilization · {data.summary.totalReclaimableStations} reclaimable tablets
                                </p>
                            </CardContent>
                        </Card>
                    </div>

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
                        <Card className="lg:col-span-3">
                            <CardHeader>
                                <CardTitle className="text-sm font-medium">Utilization Distribution</CardTitle>
                                <CardDescription>Number of merchants per utilization bracket</CardDescription>
                            </CardHeader>
                            <CardContent>
                                {chartData.length > 0 ? (
                                    <ResponsiveContainer width="100%" height={260}>
                                        <BarChart data={chartData} barCategoryGap="20%">
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                            <XAxis
                                                dataKey="range"
                                                tick={{ fontSize: 11 }}
                                                tickLine={false}
                                                axisLine={false}
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
                            </CardContent>
                        </Card>

                        {/* Merchant Table */}
                        <Card className="lg:col-span-4">
                            <CardHeader>
                                <div className="flex items-center justify-between">
                                    <div>
                                        <CardTitle className="text-sm font-medium">Merchant Terminal Report</CardTitle>
                                        <CardDescription>
                                            {filterTier === 'all'
                                                ? `All ${data.summary.totalMerchants} merchants`
                                                : `${filteredAndSorted.length} ${filterTier} merchants`}
                                        </CardDescription>
                                    </div>
                                    <Select value={filterTier} onValueChange={(v) => setFilterTier(v as typeof filterTier)}>
                                        <SelectTrigger className="w-37.5">
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
                            </CardHeader>
                            <CardContent>
                                <div className="max-h-112.5 overflow-auto">
                                    <Table>
                                        <TableHeader>
                                            <TableRow className="bg-muted/50">
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
                                                <TableHead
                                                    className="text-center cursor-pointer select-none hover:text-foreground"
                                                    onClick={() => handleSort('totalStations')}
                                                >
                                                    <span className="flex items-center justify-center gap-1">
                                                        Stations
                                                        <ArrowUpDown className="h-3 w-3" />
                                                    </span>
                                                </TableHead>
                                                <TableHead
                                                    className="text-center cursor-pointer select-none hover:text-foreground"
                                                    onClick={() => handleSort('utilizationRate')}
                                                >
                                                    <span className="flex items-center justify-center gap-1">
                                                        Util. Rate
                                                        <ArrowUpDown className="h-3 w-3" />
                                                    </span>
                                                </TableHead>
                                                <TableHead
                                                    className="text-center cursor-pointer select-none hover:text-foreground"
                                                    onClick={() => handleSort('zombieStations')}
                                                >
                                                    <span className="flex items-center justify-center gap-1">
                                                        Zombies
                                                        <ArrowUpDown className="h-3 w-3" />
                                                    </span>
                                                </TableHead>
                                                <TableHead className="text-center">Tier</TableHead>
                                                <TableHead className="text-center">Heatmap</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {filteredAndSorted.length === 0 ? (
                                                <TableRow>
                                                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
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
                                                            className={`cursor-pointer hover:bg-muted/50 ${tierCfg.bgClass}`}
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
                                                            <TableCell className="text-center">
                                                                <span className="font-medium text-sm">
                                                                    {m.activeStations}/{m.totalStations}
                                                                </span>
                                                            </TableCell>
                                                            <TableCell className="text-center">
                                                                <span className={`font-bold text-sm ${tierCfg.colorClass}`}>
                                                                    {m.utilizationRate}%
                                                                </span>
                                                            </TableCell>
                                                            <TableCell className="text-center">
                                                                {m.zombieStations > 0 ? (
                                                                    <Badge variant="destructive" className="text-xs">
                                                                        <Ghost className="h-3 w-3 mr-1" />
                                                                        {m.zombieStations}
                                                                    </Badge>
                                                                ) : (
                                                                    <span className="text-xs text-muted-foreground">—</span>
                                                                )}
                                                            </TableCell>
                                                            <TableCell className="text-center">
                                                                <Badge variant={tierCfg.variant} className="text-xs">
                                                                    {tierCfg.label}
                                                                </Badge>
                                                            </TableCell>
                                                            <TableCell>
                                                                <StationHeatmapGrid merchant={m} />
                                                            </TableCell>
                                                        </TableRow>

                                                        {/* Expanded Drill-down Row */}
                                                        {isExpanded && (
                                                            <TableRow className="bg-muted/30">
                                                                <TableCell colSpan={7} className="p-4">
                                                                    <div className="space-y-3">
                                                                        <div className="flex items-center justify-between">
                                                                            <h4 className="text-sm font-semibold">Station Detail — {m.merchantName}</h4>
                                                                            {m.reclaimableStations > 0 && (
                                                                                <Badge variant="outline" className="text-xs text-amber-700 border-amber-300">
                                                                                    <Recycle className="h-3 w-3 mr-1" />
                                                                                    {m.reclaimableStations} reclaimable
                                                                                </Badge>
                                                                            )}
                                                                        </div>
                                                                        <Table>
                                                                            <TableHeader>
                                                                                <TableRow className="text-xs">
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
                                                                                    <TableRow key={s.stationId} className={s.isZombie ? 'bg-red-50/50' : ''}>
                                                                                        <TableCell className="text-sm font-medium">{s.stationName}</TableCell>
                                                                                        <TableCell className="text-xs text-muted-foreground">{s.stationType}</TableCell>
                                                                                        <TableCell className="text-right text-sm">{s.totalOrders.toLocaleString()}</TableCell>
                                                                                        <TableCell className="text-right text-sm">{s.activeDays}</TableCell>
                                                                                        <TableCell className="text-right text-sm">{s.avgOrdersPerActiveDay}</TableCell>
                                                                                        <TableCell className="text-right text-xs text-muted-foreground">
                                                                                            {s.lastTransactionAt ? (
                                                                                                s.daysSinceLastTxn === 0 ? 'Today' : `${s.daysSinceLastTxn}d ago`
                                                                                            ) : (
                                                                                                <span className="text-red-500">Never</span>
                                                                                            )}
                                                                                        </TableCell>
                                                                                        <TableCell className="text-center">
                                                                                            {s.isZombie ? (
                                                                                                <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
                                                                                                    <Ghost className="h-3 w-3 mr-0.5" />
                                                                                                    Zombie
                                                                                                </Badge>
                                                                                            ) : s.activeDays === 0 ? (
                                                                                                <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Idle</Badge>
                                                                                            ) : s.avgOrdersPerActiveDay < 1 ? (
                                                                                                <Badge variant="secondary" className="text-[10px] px-1.5 py-0 text-yellow-700">Low</Badge>
                                                                                            ) : (
                                                                                                <Badge variant="default" className="text-[10px] px-1.5 py-0 bg-green-600">Active</Badge>
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
                            </CardContent>
                        </Card>
                    </div>

                    {/* Empty State */}
                    {data.summary.totalStations === 0 && (
                        <Card className="border-dashed">
                            <CardContent className="py-12">
                                <div className="flex flex-col items-center justify-center text-center gap-3">
                                    <div className="p-3 rounded-full bg-muted">
                                        <Tablet className="h-8 w-8 text-muted-foreground opacity-50" />
                                    </div>
                                    <div>
                                        <h3 className="text-lg font-semibold">No Stations Found</h3>
                                        <p className="text-sm text-muted-foreground mt-1">
                                            No active stations detected. Terminal utilization data will appear once merchants register their devices.
                                        </p>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    )}

                    {/* All-Healthy State */}
                    {data.summary.totalStations > 0 && data.summary.underutilizedMerchantCount === 0 && data.summary.totalZombieStations === 0 && (
                        <Card className="border-green-200 bg-linear-to-r from-green-50 to-emerald-50">
                            <CardContent className="py-8">
                                <div className="flex flex-col items-center justify-center text-center gap-3">
                                    <div className="p-3 rounded-full bg-green-100">
                                        <ShieldCheck className="h-8 w-8 text-green-600" />
                                    </div>
                                    <div>
                                        <h3 className="text-lg font-semibold text-green-900">Fleet Fully Utilized</h3>
                                        <p className="text-sm text-green-700 mt-1">
                                            All {data.summary.totalStations} terminals across {data.summary.totalMerchants} merchants are actively processing transactions.
                                            No zombie tablets or underutilized merchants detected.
                                        </p>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    )}
                </>
            )}
        </>
    )
}
