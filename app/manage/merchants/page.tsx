'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@clerk/nextjs'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
import {
    Building2,
    Search,
    ChevronLeft,
    ChevronRight,
    RefreshCw,
    TrendingUp,
    TrendingDown,
    Clock,
    LayoutGrid,
    List,
    ShieldAlert,
    Activity,
    AlertTriangle,
    CheckCircle2,
} from 'lucide-react'
import { useMerchants, useMerchantStats, useMerchantHealthGrid } from '@/lib/queries/use-merchants'
import { useDebounce } from '@/lib/hooks/useDebounce'
import { MerchantCard } from '@/components/admin/MerchantCard'
import { useAdminAuth } from '@/lib/hooks/useAdminAuth'
import { useAdminMerchantAccess } from '@/app/manage/hooks/useAdminMerchantAccess'
import { PermissionGate } from '@/components/admin/PermissionGate'
import type { MerchantFilters } from '@/types/merchant'
import { DEFAULT_MERCHANT_FILTERS } from '@/types/merchant'
import Link from 'next/link'
import Image from 'next/image'
export default function MerchantsPage() {
    const router = useRouter()
    const { userId } = useAuth()
    const { canCreateMerchants, isSuperAdmin, isLoading: authLoading } = useAdminAuth()
    const [page, setPage] = useState(1)
    const [viewMode, setViewMode] = useState<'grid' | 'list' | 'health'>('grid')
    const [filters, setFilters] = useState<MerchantFilters>(DEFAULT_MERCHANT_FILTERS)
    const [healthFilter, setHealthFilter] = useState<'all' | 'needs-attention' | 'critical'>('all')
    const [healthSort, setHealthSort] = useState<'score' | 'revenue' | 'orders' | 'activity' | 'name'>('score')

    // Fetch accessible merchant IDs for non-super-admins
    const { data: merchantAccess, isLoading: accessLoading } = useAdminMerchantAccess(userId || '')

    // Debounce search to avoid too many requests
    const debouncedSearch = useDebounce(filters.search, 300)
    const activeFilters = { ...filters, search: debouncedSearch }

    // Determine which merchant IDs to fetch
    // Super admin: undefined (fetch all)
    // Others: only their accessible merchant IDs
    const accessibleMerchantIds = isSuperAdmin 
        ? undefined 
        : merchantAccess?.map(access => access.merchantId)

    // Fetch data with role-based filtering
    const { data, isLoading, isFetching, refetch } = useMerchants(
        activeFilters,
        page,
        accessibleMerchantIds
    )
    const { data: stats, isLoading: statsLoading } = useMerchantStats()
    const { data: healthData, isLoading: healthLoading, refetch: refetchHealth } = useMerchantHealthGrid(
        accessibleMerchantIds
    )

    const pageSize = 20
    const totalPages = data ? Math.ceil(data.total / pageSize) : 0

    const handleFilterChange = (key: keyof MerchantFilters, value: string) => {
        setFilters((prev) => ({ ...prev, [key]: value }))
        setPage(1) // Reset to first page on filter change
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Merchants</h1>
                    <p className="text-muted-foreground">
                        Manage and monitor your merchant accounts
                    </p>
                </div>
                <PermissionGate permission="hq.merchant.create">
                    <Link href="/manage/create-merchant">
                        <Button>Create Merchant</Button>
                    </Link>
                </PermissionGate>
            </div>

            {/* Stats Cards */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <StatsCard
                    title="Total Merchants"
                    value={stats?.total ?? 0}
                    icon={<Building2 className="h-4 w-4 text-muted-foreground" />}
                    isLoading={statsLoading}
                />
                <StatsCard
                    title="Active"
                    value={stats?.active ?? 0}
                    icon={<TrendingUp className="h-4 w-4 text-green-600" />}
                    isLoading={statsLoading}
                    className="text-green-600"
                />
                <StatsCard
                    title="Inactive"
                    value={stats?.inactive ?? 0}
                    icon={<TrendingDown className="h-4 w-4 text-red-600" />}
                    isLoading={statsLoading}
                    className="text-red-600"
                />
                <StatsCard
                    title="Onboarding"
                    value={stats?.onboarding ?? 0}
                    icon={<Clock className="h-4 w-4 text-yellow-600" />}
                    isLoading={statsLoading}
                    className="text-yellow-600"
                />
            </div>

            {/* Filters */}
            <Card>
                <CardHeader className="pb-4">
                    <div className="flex flex-wrap gap-4 items-center justify-between">
                        <div className="flex flex-wrap gap-4 items-center">
                            {/* Search */}
                            <div className="relative flex-1 min-w-[200px] max-w-sm">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                <Input
                                    placeholder="Search merchants..."
                                    value={filters.search}
                                    onChange={(e) => handleFilterChange('search', e.target.value)}
                                    className="pl-10"
                                />
                            </div>

                            {/* Health Filter (only shown in health view) */}
                            {viewMode === 'health' && (
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
                            )}

                            {/* Status Filter (only shown in grid/list view) */}
                            {viewMode !== 'health' && (
                                <Select
                                    value={filters.status}
                                    onValueChange={(value) => handleFilterChange('status', value)}
                                >
                                    <SelectTrigger className="w-36">
                                        <SelectValue placeholder="Status" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">All Status</SelectItem>
                                        <SelectItem value="active">Active</SelectItem>
                                        <SelectItem value="inactive">Inactive</SelectItem>
                                        <SelectItem value="onboarding">Onboarding</SelectItem>
                                    </SelectContent>
                                </Select>
                            )}

                            {/* Sort By */}
                            {viewMode === 'health' ? (
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
                            ) : (
                                <Select
                                    value={filters.sortBy}
                                    onValueChange={(value) => handleFilterChange('sortBy', value)}
                                >
                                    <SelectTrigger className="w-40">
                                        <SelectValue placeholder="Sort by" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="name">Name</SelectItem>
                                        <SelectItem value="created_at">Date Created</SelectItem>
                                        <SelectItem value="orders_today">Orders Today</SelectItem>
                                        <SelectItem value="revenue_today">Revenue Today</SelectItem>
                                    </SelectContent>
                                </Select>
                            )}

                            {/* Sort Order (only shown for non-health views) */}
                            {viewMode !== 'health' && (
                                <Select
                                    value={filters.sortOrder}
                                    onValueChange={(value) => handleFilterChange('sortOrder', value)}
                                >
                                    <SelectTrigger className="w-32">
                                        <SelectValue placeholder="Order" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="asc">Ascending</SelectItem>
                                        <SelectItem value="desc">Descending</SelectItem>
                                    </SelectContent>
                                </Select>
                            )}
                        </div>

                        <div className="flex items-center gap-2">
                            {/* View Mode Toggle */}
                            <div className="flex border rounded-lg">
                                <Button
                                    variant={viewMode === 'grid' ? 'secondary' : 'ghost'}
                                    size="icon"
                                    onClick={() => setViewMode('grid')}
                                >
                                    <LayoutGrid className="h-4 w-4" />
                                </Button>
                                <Button
                                    variant={viewMode === 'list' ? 'secondary' : 'ghost'}
                                    size="icon"
                                    onClick={() => setViewMode('list')}
                                >
                                    <List className="h-4 w-4" />
                                </Button>
                                <Button
                                    variant={viewMode === 'health' ? 'secondary' : 'ghost'}
                                    size="icon"
                                    onClick={() => setViewMode('health')}
                                    title="Health Grid"
                                >
                                    <Activity className="h-4 w-4" />
                                </Button>
                            </div>

                            {/* Refresh */}
                            <Button
                                variant="outline"
                                size="icon"
                                onClick={() => {
                                    refetch()
                                    refetchHealth()
                                }}
                                disabled={isFetching || healthLoading}
                            >
                                <RefreshCw className={`h-4 w-4 ${isFetching || healthLoading ? 'animate-spin' : ''}`} />
                            </Button>
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    {/* Results count */}
                    <div className="text-sm text-muted-foreground mb-4">
                        {data?.total ?? 0} merchants found
                        {isFetching && ' · Loading...'}
                    </div>

                    {/* Content */}
                    {isLoading || authLoading || (!isSuperAdmin && accessLoading) ? (
                        <MerchantGridSkeleton />
                    ) : viewMode === 'health' ? healthLoading ? (
                        <MerchantHealthGridSkeleton />
                    ) : healthData && healthData.length > 0 ? (
                        <MerchantHealthGrid
                            merchants={healthData}
                            filter={healthFilter}
                            sortBy={healthSort}
                            onMerchantClick={(clerkOrgId) => router.push(`/manage/merchants/${clerkOrgId}`)}
                        />
                    ) : (
                        <div className="text-center py-12">
                            <p className="text-muted-foreground">No merchants found.</p>
                        </div>
                    ) : data?.merchants.length === 0 ? (
                        <div className="text-center py-12">
                            {!isSuperAdmin && (!merchantAccess || merchantAccess.length === 0) ? (
                                <div className="flex flex-col items-center gap-3">
                                    <ShieldAlert className="h-12 w-12 text-muted-foreground" />
                                    <div>
                                        <p className="font-medium text-lg">No Merchant Access</p>
                                        <p className="text-muted-foreground">
                                            You don&apos;t have access to any merchants yet. Contact a Super Admin to request access.
                                        </p>
                                    </div>
                                </div>
                            ) : (
                                <p className="text-muted-foreground">
                                    No merchants found matching your filters.
                                </p>
                            )}
                        </div>
                    ) : viewMode === 'grid' ? (
                        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                            {data?.merchants.map((merchant) => (
                                <MerchantCard
                                    key={merchant.id}
                                    merchant={merchant}
                                    onClick={() => router.push(`/manage/merchants/${merchant.clerk_org_id}`)}
                                />
                            ))}
                        </div>
                    ) : (
                        <MerchantListView
                            merchants={data?.merchants || []}
                            onMerchantClick={(clerkOrgId) => router.push(`/manage/merchants/${clerkOrgId}`)}
                        />
                    )}

                    {/* Pagination */}
                    {totalPages > 1 && (
                        <div className="flex items-center justify-between pt-6 border-t mt-6">
                            <p className="text-sm text-muted-foreground">
                                Page {page} of {totalPages}
                            </p>
                            <div className="flex gap-2">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                                    disabled={page === 1}
                                >
                                    <ChevronLeft className="h-4 w-4 mr-1" />
                                    Previous
                                </Button>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                                    disabled={page === totalPages}
                                >
                                    Next
                                    <ChevronRight className="h-4 w-4 ml-1" />
                                </Button>
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    )
}

// ============================================================================
// HELPER COMPONENTS
// ============================================================================

function StatsCard({
    title,
    value,
    icon,
    isLoading,
    className,
}: {
    title: string
    value: number
    icon: React.ReactNode
    isLoading?: boolean
    className?: string
}) {
    return (
        <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">{title}</CardTitle>
                {icon}
            </CardHeader>
            <CardContent>
                {isLoading ? (
                    <Skeleton className="h-8 w-16" />
                ) : (
                    <div className={`text-2xl font-bold ${className || ''}`}>{value}</div>
                )}
            </CardContent>
        </Card>
    )
}

function MerchantGridSkeleton() {
    return (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[...Array(6)].map((_, i) => (
                <Card key={i}>
                    <CardContent className="p-5">
                        <div className="flex items-start justify-between mb-4">
                            <div className="flex items-center gap-3">
                                <Skeleton className="w-10 h-10 rounded-lg" />
                                <div>
                                    <Skeleton className="h-5 w-32 mb-1" />
                                    <Skeleton className="h-4 w-20" />
                                </div>
                            </div>
                            <Skeleton className="h-6 w-16" />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            {[...Array(4)].map((_, j) => (
                                <div key={j} className="flex items-center gap-2">
                                    <Skeleton className="h-4 w-4" />
                                    <div>
                                        <Skeleton className="h-3 w-16 mb-1" />
                                        <Skeleton className="h-4 w-12" />
                                    </div>
                                </div>
                            ))}
                        </div>
                        <div className="mt-4 pt-3 border-t">
                            <Skeleton className="h-3 w-32" />
                        </div>
                    </CardContent>
                </Card>
            ))}
        </div>
    )
}

import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import type { MerchantSummary } from '@/types/merchant'

function MerchantListView({
    merchants,
    onMerchantClick,
}: {
    merchants: MerchantSummary[]
    onMerchantClick: (clerkOrgId: string) => void
}) {
    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD',
            minimumFractionDigits: 0,
        }).format(amount)
    }

    const statusColors: Record<string, string> = {
        active: 'bg-green-100 text-green-700 dark:bg-green-950/50 dark:text-green-400',
        inactive: 'bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-400',
        onboarding: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-950/50 dark:text-yellow-400',
    }

    return (
        <Table>
            <TableHeader>
                <TableRow>
                    <TableHead>Merchant</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Locations</TableHead>
                    <TableHead className="text-right">Staff</TableHead>
                    <TableHead className="text-right">Orders Today</TableHead>
                    <TableHead className="text-right">Revenue Today</TableHead>
                    <TableHead>Created</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {merchants.map((merchant) => (
                    <TableRow
                        key={merchant.id}
                        className="cursor-pointer"
                        onClick={() => onMerchantClick(merchant.clerk_org_id)}
                    >
                        <TableCell>
                            <div className="flex items-center gap-2">
                                <Image src={merchant.logo_url || ''} alt={merchant.name} width={40} height={40} className="rounded-md object-cover " />
                                <div className='flex flex-col'>
                                    <div className="font-semibold">{merchant.name}</div>
                                    {merchant.type && (
                                        <div className="text-sm text-muted-foreground capitalize">
                                            {merchant.type}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </TableCell>
                        <TableCell>
                            <Badge className={statusColors[merchant.derived_status]}>
                                {merchant.derived_status}
                            </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                            {merchant.active_locations} / {merchant.total_locations}
                        </TableCell>
                        <TableCell className="text-right">
                            {merchant.active_staff_count}
                        </TableCell>
                        <TableCell className="text-right">
                            {merchant.orders_today}
                        </TableCell>
                        <TableCell className="text-right">
                            {formatCurrency(merchant.revenue_today)}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                            {new Date(merchant.created_at).toLocaleDateString()}
                        </TableCell>
                    </TableRow>
                ))}
            </TableBody>
        </Table>
    )
}

// ============================================================================
// MERCHANT HEALTH GRID COMPONENTS
// ============================================================================

import type { MerchantHealthSummary } from '@/types/merchant'
import { formatDistanceToNow } from 'date-fns'

function MerchantHealthGridSkeleton() {
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

interface MerchantHealthGridProps {
    merchants: MerchantHealthSummary[]
    filter: 'all' | 'needs-attention' | 'critical'
    sortBy: 'score' | 'revenue' | 'orders' | 'activity' | 'name'
    onMerchantClick: (clerkOrgId: string) => void
}

function MerchantHealthGrid({
    merchants,
    filter,
    sortBy,
    onMerchantClick,
}: MerchantHealthGridProps) {
    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD',
            minimumFractionDigits: 0,
        }).format(amount)
    }

    // Apply filter
    let filtered = merchants.filter((m) => {
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
                <p className="text-muted-foreground">No merchants match the selected filter.</p>
            </div>
        )
    }

    return (
        <div className="flex flex-col gap-3">
            {filtered.map((merchant) => (
                <MerchantHealthRow
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

function MerchantHealthRow({
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

    return (
        <Card
            className={`cursor-pointer transition-shadow hover:shadow-md border ${colors.border}`}
            onClick={onClick}
        >
            <CardContent className={`p-5 ${colors.bg}`}>
                <div className="flex items-center justify-between gap-6">
                    {/* Left Column: Score, Name, Alerts */}
                    <div className="flex items-start gap-4 flex-1 min-w-0">
                        {/* Health Score Circle */}
                        <div
                            className={`flex-shrink-0 w-14 h-14 rounded-full flex items-center justify-center font-bold text-lg ${colors.scoreBg} ${colors.text}`}
                        >
                            {merchant.healthScore}
                        </div>

                        {/* Merchant Info */}
                        <div className="flex-1 min-w-0">
                            <h3 className="font-semibold text-foreground truncate">
                                {merchant.name}
                            </h3>
                            {merchant.type && (
                                <p className="text-sm text-muted-foreground capitalize truncate">
                                    {merchant.type}
                                </p>
                            )}

                            {/* Alerts or All Systems Go */}
                            <div className="mt-2">
                                {merchant.alerts.length > 0 ? (
                                    <div className="flex flex-col gap-1">
                                        {merchant.alerts.map((alert, idx) => (
                                            <div key={idx} className="flex items-center gap-2 text-sm">
                                                <AlertTriangle className={`h-4 w-4 flex-shrink-0 ${colors.text}`} />
                                                <span className="text-muted-foreground truncate">{alert}</span>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                        <CheckCircle2 className="h-4 w-4 flex-shrink-0 text-green-600 dark:text-green-400" />
                                        <span>All systems go</span>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Right Column: Stats */}
                    <div className="text-right flex-shrink-0 text-sm">
                        <p className="text-muted-foreground mb-2">
                            {merchant.total_locations} location{merchant.total_locations !== 1 ? 's' : ''} · {merchant.active_staff_count} staff · {merchant.totalStations} station{merchant.totalStations !== 1 ? 's' : ''}
                        </p>
                        <p className="font-semibold text-foreground mb-1">
                            {formatCurrency(merchant.revenue_today)}
                        </p>
                        <p className="text-muted-foreground mb-1">
                            {merchant.orders_today} order{merchant.orders_today !== 1 ? 's' : ''} today
                        </p>
                        <p className="text-xs text-muted-foreground">
                            {merchant.last_order_at
                                ? `Last order ${formatDistanceToNow(new Date(merchant.last_order_at), {
                                    addSuffix: true,
                                })}`
                                : 'No orders yet'}
                        </p>
                    </div>
                </div>
            </CardContent>
        </Card>
    )
}
