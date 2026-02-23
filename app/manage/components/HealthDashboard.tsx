'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Search, RefreshCw, AlertTriangle, CheckCircle2, Activity } from 'lucide-react'
import { useMerchantHealthGrid } from '@/lib/queries/use-merchants'
import { useDebounce } from '@/lib/hooks/useDebounce'
import { useAdminAuth } from '@/lib/hooks/useAdminAuth'
import { useAdminMerchantAccess } from '@/app/manage/hooks/useAdminMerchantAccess'
import { useAuth } from '@clerk/nextjs'
import { formatDistanceToNow } from 'date-fns'
import type { MerchantHealthSummary } from '@/types/merchant'

export function HealthDashboard() {
    const router = useRouter()
    const { userId } = useAuth()
    const { isSuperAdmin, isLoading: authLoading } = useAdminAuth()
    const [search, setSearch] = useState('')
    const [healthFilter, setHealthFilter] = useState<'all' | 'needs-attention' | 'critical'>('all')
    const [healthSort, setHealthSort] = useState<'score' | 'revenue' | 'orders' | 'activity' | 'name'>('score')

    const debouncedSearch = useDebounce(search, 300)

    // Fetch accessible merchant IDs for non-super-admins
    const { data: merchantAccess, isLoading: accessLoading } = useAdminMerchantAccess(userId || '')

    const accessibleMerchantIds = isSuperAdmin
        ? undefined
        : merchantAccess?.map(access => access.merchantId)

    const { data: healthData, isLoading: healthLoading, refetch } = useMerchantHealthGrid(
        accessibleMerchantIds
    )

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
                        <Activity className="h-6 w-6" />
                        Health Monitor
                    </h2>
                    <p className="text-muted-foreground">
                        Monitor merchant performance and operational health across your platform
                    </p>
                </div>
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => refetch()}
                    disabled={healthLoading}
                >
                    <RefreshCw className={`h-4 w-4 mr-2 ${healthLoading ? 'animate-spin' : ''}`} />
                    Refresh
                </Button>
            </div>

            {/* Legend */}
            <Card className="bg-muted/30 border-dashed">
                <CardContent className="p-4">
                    <div className="flex flex-col gap-3">
                        <h4 className="text-sm font-semibold text-foreground">Health Score Legend</h4>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="flex items-center gap-3">
                                <div className="shrink-0 w-10 h-10 rounded-full flex items-center justify-center font-bold bg-green-100 dark:bg-green-900/40 text-green-600 dark:text-green-400 text-sm">
                                    80+
                                </div>
                                <div className="text-sm">
                                    <p className="font-medium text-foreground">Healthy</p>
                                    <p className="text-xs text-muted-foreground">All systems running smoothly</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-3">
                                <div className="shrink-0 w-10 h-10 rounded-full flex items-center justify-center font-bold bg-yellow-100 dark:bg-yellow-900/40 text-yellow-600 dark:text-yellow-400 text-sm">
                                    60-79
                                </div>
                                <div className="text-sm">
                                    <p className="font-medium text-foreground">Needs Attention</p>
                                    <p className="text-xs text-muted-foreground">Some issues detected</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-3">
                                <div className="shrink-0 w-10 h-10 rounded-full flex items-center justify-center font-bold bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400 text-sm">
                                    &lt;60
                                </div>
                                <div className="text-sm">
                                    <p className="font-medium text-foreground">Critical</p>
                                    <p className="text-xs text-muted-foreground">Urgent action required</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Health Factors */}
            <Card className="bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800">
                <CardContent className="p-4">
                    <div className="flex flex-col gap-3">
                        <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
                            <span className="text-lg">ℹ️</span> Health Score Factors
                        </h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                            <div className="flex gap-2">
                                <span className="text-muted-foreground">•</span>
                                <div>
                                    <p className="font-medium text-foreground">Device Connectivity</p>
                                    <p className="text-xs text-muted-foreground">POS systems offline or stale heartbeat</p>
                                </div>
                            </div>
                            <div className="flex gap-2">
                                <span className="text-muted-foreground">•</span>
                                <div>
                                    <p className="font-medium text-foreground">Transaction Success Rate</p>
                                    <p className="text-xs text-muted-foreground">Failed or declined payment processing</p>
                                </div>
                            </div>
                            <div className="flex gap-2">
                                <span className="text-muted-foreground">•</span>
                                <div>
                                    <p className="font-medium text-foreground">Activity Level</p>
                                    <p className="text-xs text-muted-foreground">Low order volume or extended inactivity</p>
                                </div>
                            </div>
                            <div className="flex gap-2">
                                <span className="text-muted-foreground">•</span>
                                <div>
                                    <p className="font-medium text-foreground">System Health</p>
                                    <p className="text-xs text-muted-foreground">Battery issues, app version outdated, or errors</p>
                                </div>
                            </div>
                            <div className="flex gap-2">
                                <span className="text-muted-foreground">•</span>
                                <div>
                                    <p className="font-medium text-foreground">Staff Management</p>
                                    <p className="text-xs text-muted-foreground">Insufficient staff or high turnover</p>
                                </div>
                            </div>
                            <div className="flex gap-2">
                                <span className="text-muted-foreground">•</span>
                                <div>
                                    <p className="font-medium text-foreground">Location Coverage</p>
                                    <p className="text-xs text-muted-foreground">Inactive or underperforming locations</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Filters */}
            <Card>
                <CardContent className="p-4">
                    <div className="flex flex-col md:flex-row gap-4 items-start md:items-center">
                        {/* Search */}
                        <div className="relative flex-1 min-w-[200px] max-w-sm">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Search merchants..."
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                className="pl-10"
                            />
                        </div>

                        {/* Health Filter */}
                        <Select value={healthFilter} onValueChange={(value) => setHealthFilter(value as typeof healthFilter)}>
                            <SelectTrigger className="w-40">
                                <SelectValue placeholder="Health Filter" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Merchants</SelectItem>
                                <SelectItem value="needs-attention">Needs Attention (&lt;80)</SelectItem>
                                <SelectItem value="critical">Critical (&lt;60)</SelectItem>
                            </SelectContent>
                        </Select>

                        {/* Sort By */}
                        <Select value={healthSort} onValueChange={(value) => setHealthSort(value as typeof healthSort)}>
                            <SelectTrigger className="w-40">
                                <SelectValue placeholder="Sort by" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="score">Health Score</SelectItem>
                                <SelectItem value="revenue">Revenue</SelectItem>
                                <SelectItem value="orders">Orders</SelectItem>
                                <SelectItem value="activity">Last Activity</SelectItem>
                                <SelectItem value="name">Alphabetical</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </CardContent>
            </Card>

            {/* Content */}
            {authLoading || (!isSuperAdmin && accessLoading) ? (
                <HealthGridSkeleton />
            ) : healthLoading ? (
                <HealthGridSkeleton />
            ) : healthData && healthData.length > 0 ? (
                <HealthGrid
                    merchants={healthData}
                    filter={healthFilter}
                    sortBy={healthSort}
                    search={debouncedSearch}
                    onMerchantClick={(clerkOrgId) => router.push(`/manage/merchants/${clerkOrgId}`)}
                />
            ) : (
                <div className="text-center py-12">
                    <p className="text-muted-foreground">No merchants found.</p>
                </div>
            )}
        </div>
    )
}

function HealthGridSkeleton() {
    return (
        <div className="flex flex-col gap-3">
            {[...Array(5)].map((_, i) => (
                <Card key={i}>
                    <CardContent className="p-5">
                        <div className="flex items-center justify-between">
                            <div className="flex items-start gap-4 flex-1">
                                <Skeleton className="w-14 h-14 rounded-full" />
                                <div className="flex-1">
                                    <Skeleton className="h-5 w-40 mb-2" />
                                    <Skeleton className="h-4 w-32 mb-3" />
                                    <div className="flex gap-2">
                                        <Skeleton className="h-4 w-24" />
                                        <Skeleton className="h-4 w-24" />
                                    </div>
                                </div>
                            </div>
                            <div className="text-right">
                                <Skeleton className="h-4 w-32 mb-2" />
                                <Skeleton className="h-4 w-32 mb-2" />
                                <Skeleton className="h-4 w-32" />
                            </div>
                        </div>
                    </CardContent>
                </Card>
            ))}
        </div>
    )
}

interface HealthGridProps {
    merchants: MerchantHealthSummary[]
    filter: 'all' | 'needs-attention' | 'critical'
    sortBy: 'score' | 'revenue' | 'orders' | 'activity' | 'name'
    search: string
    onMerchantClick: (clerkOrgId: string) => void
}

function HealthGrid({
    merchants,
    filter,
    sortBy,
    search,
    onMerchantClick,
}: HealthGridProps) {
    // Apply search filter
    let filtered = merchants.filter((m) =>
        m.name.toLowerCase().includes(search.toLowerCase())
    )

    // Apply health filter
    filtered = filtered.filter((m) => {
        if (filter === 'critical') return m.healthScore < 60
        if (filter === 'needs-attention') return m.healthScore < 80
        return true
    })

    // Apply sort
    filtered = [...filtered].sort((a, b) => {
        switch (sortBy) {
            case 'score':
                return a.healthScore - b.healthScore
            case 'revenue':
                return b.revenue_today - a.revenue_today
            case 'orders':
                return b.orders_today - a.orders_today
            case 'activity':
                if (!a.last_order_at && !b.last_order_at) return 0
                if (!a.last_order_at) return 1
                if (!b.last_order_at) return -1
                return (
                    new Date(b.last_order_at).getTime() -
                    new Date(a.last_order_at).getTime()
                )
            case 'name':
                return a.name.localeCompare(b.name)
            default:
                return 0
        }
    })

    if (filtered.length === 0) {
        return (
            <div className="text-center py-12">
                <p className="text-muted-foreground">No merchants match the selected filters.</p>
            </div>
        )
    }

    return (
        <div className="flex flex-col gap-3">
            {filtered.map((merchant) => (
                <HealthRow
                    key={merchant.id}
                    merchant={merchant}
                    onClick={() => onMerchantClick(merchant.clerk_org_id)}
                />
            ))}
        </div>
    )
}

const healthColors = {
    green: {
        bg: 'bg-green-50 dark:bg-green-950/20',
        text: 'text-green-600 dark:text-green-400',
        border: 'border-green-200 dark:border-green-800',
        scoreBg: 'bg-green-100 dark:bg-green-900/40',
    },
    yellow: {
        bg: 'bg-yellow-50 dark:bg-yellow-950/20',
        text: 'text-yellow-600 dark:text-yellow-400',
        border: 'border-yellow-200 dark:border-yellow-800',
        scoreBg: 'bg-yellow-100 dark:bg-yellow-900/40',
    },
    red: {
        bg: 'bg-red-50 dark:bg-red-950/20',
        text: 'text-red-600 dark:text-red-400',
        border: 'border-red-200 dark:border-red-800',
        scoreBg: 'bg-red-100 dark:bg-red-900/40',
    },
}

function HealthRow({
    merchant,
    onClick,
}: {
    merchant: MerchantHealthSummary
    onClick: () => void
}) {
    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD',
            minimumFractionDigits: 0,
        }).format(amount)
    }

    const colors = healthColors[merchant.healthTier]

    // Calculate health score percentage for visual bar
    const healthPercentage = Math.min(100, (merchant.healthScore / 100) * 100)

    // Determine the health tier visual
    const getTierEmoji = (tier: string) => {
        switch (tier) {
            case 'green':
                return '✓'
            case 'yellow':
                return '⚠'
            case 'red':
                return '!'
            default:
                return '○'
        }
    }

    return (
        <Card
            className={`cursor-pointer transition-all hover:shadow-lg hover:-translate-y-0.5 border ${colors.border}`}
            onClick={onClick}
        >
            <CardContent className={`p-5 ${colors.bg}`}>
                <div className="flex flex-col gap-4">
                    {/* Top Row: Score, Name, Alerts */}
                    <div className="flex items-start gap-4">
                        {/* Health Score Circle with Tier Indicator */}
                        <div className="shrink-0 relative">
                            <div
                                className={`w-16 h-16 rounded-full flex items-center justify-center font-bold text-2xl ${colors.scoreBg} ${colors.text} shadow-md`}
                            >
                                {merchant.healthScore}
                            </div>
                            {/* Tier Badge */}
                            <div className={`absolute -bottom-1 -right-1 w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold ${
                                merchant.healthTier === 'green' ? 'bg-green-500' :
                                merchant.healthTier === 'yellow' ? 'bg-yellow-500' :
                                'bg-red-500'
                            }`}>
                                {getTierEmoji(merchant.healthTier)}
                            </div>
                        </div>

                        {/* Merchant Info */}
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                                <h3 className="font-semibold text-foreground truncate">
                                    {merchant.name}
                                </h3>
                                {merchant.healthTier === 'green' && (
                                    <span className="inline-block px-2 py-1 rounded-full text-xs font-medium bg-green-200 dark:bg-green-900/50 text-green-700 dark:text-green-300 shrink-0">
                                        Optimal
                                    </span>
                                )}
                                {merchant.healthTier === 'yellow' && (
                                    <span className="inline-block px-2 py-1 rounded-full text-xs font-medium bg-yellow-200 dark:bg-yellow-900/50 text-yellow-700 dark:text-yellow-300 shrink-0">
                                        Monitor
                                    </span>
                                )}
                                {merchant.healthTier === 'red' && (
                                    <span className="inline-block px-2 py-1 rounded-full text-xs font-medium bg-red-200 dark:bg-red-900/50 text-red-700 dark:text-red-300 shrink-0">
                                        Critical
                                    </span>
                                )}
                            </div>

                            {merchant.type && (
                                <p className="text-sm text-muted-foreground capitalize mb-2">
                                    {merchant.type}
                                </p>
                            )}

                            {/* Health Score Bar */}
                            <div className="mb-3">
                                <div className="h-2 rounded-full bg-muted overflow-hidden">
                                    <div
                                        className={`h-full rounded-full transition-all duration-300 ${
                                            merchant.healthTier === 'green' ? 'bg-green-500' :
                                            merchant.healthTier === 'yellow' ? 'bg-yellow-500' :
                                            'bg-red-500'
                                        }`}
                                        style={{ width: `${healthPercentage}%` }}
                                    />
                                </div>
                            </div>

                            {/* Alerts or All Systems Go */}
                            {merchant.alerts.length > 0 ? (
                                <div className="flex flex-col gap-1">
                                    {merchant.alerts.slice(0, 2).map((alert, idx) => (
                                        <div key={idx} className="flex items-center gap-2 text-sm">
                                            <AlertTriangle className={`h-4 w-4 shrink-0 ${colors.text}`} />
                                            <span className="text-muted-foreground">{alert}</span>
                                        </div>
                                    ))}
                                    {merchant.alerts.length > 2 && (
                                        <p className="text-xs text-muted-foreground ml-6">
                                            +{merchant.alerts.length - 2} more issue{merchant.alerts.length - 2 !== 1 ? 's' : ''}
                                        </p>
                                    )}
                                </div>
                            ) : (
                                <div className="flex items-center gap-2 text-sm text-green-700 dark:text-green-400 font-medium">
                                    <CheckCircle2 className="h-4 w-4 shrink-0" />
                                    <span>All systems optimal</span>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Bottom Row: Stats Grid */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-2 border-t border-current border-opacity-10">
                        {/* Locations */}
                        <div className="text-sm">
                            <p className="text-muted-foreground text-xs mb-0.5">Locations</p>
                            <p className="font-semibold text-foreground">
                                {merchant.total_locations}
                                <span className="text-muted-foreground font-normal ml-1">
                                    {merchant.active_staff_count > 0 && `(${Math.round((merchant.total_locations / (merchant.total_locations || 1)) * 100)}%)`}
                                </span>
                            </p>
                        </div>

                        {/* Stations */}
                        <div className="text-sm">
                            <p className="text-muted-foreground text-xs mb-0.5">Devices</p>
                            <p className="font-semibold text-foreground">{merchant.totalStations}</p>
                        </div>

                        {/* Revenue */}
                        <div className="text-sm">
                            <p className="text-muted-foreground text-xs mb-0.5">Revenue Today</p>
                            <p className="font-semibold text-foreground">
                                {formatCurrency(merchant.revenue_today)}
                            </p>
                        </div>

                        {/* Orders & Last Activity */}
                        <div className="text-sm">
                            <p className="text-muted-foreground text-xs mb-0.5">Orders Today</p>
                            <p className="font-semibold text-foreground mb-1">
                                {merchant.orders_today}
                            </p>
                            <p className="text-xs text-muted-foreground">
                                {merchant.last_order_at
                                    ? formatDistanceToNow(new Date(merchant.last_order_at), {
                                        addSuffix: true,
                                    })
                                    : 'No orders'}
                            </p>
                        </div>
                    </div>
                </div>
            </CardContent>
        </Card>
    )
}
