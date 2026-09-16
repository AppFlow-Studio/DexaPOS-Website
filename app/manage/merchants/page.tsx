'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@clerk/nextjs'
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
    MessageSquare,
} from 'lucide-react'
import {
    PageHeader,
    PageShell,
    Panel,
    StatRow,
    StatTile,
} from '@/components/dashboard/shell'
import { useMerchants, useMerchantStats } from '@/lib/queries/use-merchants'
import { useDebounce } from '@/lib/hooks/useDebounce'
import { MerchantCard } from '@/components/admin/MerchantCard'
import { useAdminAuth } from '@/lib/hooks/useAdminAuth'
import { useAdminMerchantAccess } from '@/app/manage/hooks/useAdminMerchantAccess'
import { PermissionGate } from '@/components/admin/PermissionGate'
import type { MerchantFilters } from '@/types/merchant'
import { DEFAULT_MERCHANT_FILTERS } from '@/types/merchant'
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
import Link from 'next/link'
import Image from 'next/image'
export default function MerchantsPage() {
    const router = useRouter()
    const { userId } = useAuth()
    const { canCreateMerchants, role, isLoading: authLoading } = useAdminAuth()
    const [page, setPage] = useState(1)
    const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
    const [filters, setFilters] = useState<MerchantFilters>(DEFAULT_MERCHANT_FILTERS)

    // Anyone who is not super admin is scoped to their assigned merchants.
    const isManagerScoped = !!role?.role_code && role.role_code !== 'hq.super_admin'
    const scopedAdminUserId = isManagerScoped ? (userId || '') : ''

    // Fetch accessible merchant IDs for non-super-admins
    const { data: merchantAccess, isLoading: accessLoading } = useAdminMerchantAccess(scopedAdminUserId)

    // Debounce search to avoid too many requests
    const debouncedSearch = useDebounce(filters.search, 300)
    const activeFilters = { ...filters, search: debouncedSearch }

    // Determine which merchant IDs to fetch.
    // Only HQ managers are scoped via admin_merchant_access.
    // Platform/super admins use server-side role checks and can fetch all.
    const accessibleMerchantIds =
        isManagerScoped ? merchantAccess?.map((access) => access.merchantId) : undefined

    // Fetch data with role-based filtering
    const { data, isLoading, isFetching, refetch } = useMerchants(
        activeFilters,
        page,
        accessibleMerchantIds
    )
    const { data: stats, isLoading: statsLoading } = useMerchantStats()

    const pageSize = 20
    const totalPages = data ? Math.ceil(data.total / pageSize) : 0

    const handleFilterChange = (key: keyof MerchantFilters, value: string) => {
        setFilters((prev) => ({ ...prev, [key]: value }))
        setPage(1) // Reset to first page on filter change
    }

    const showNoAccess =
        isManagerScoped && (!merchantAccess || merchantAccess.length === 0)

    return (
        /* `as="div"`: app/manage/layout.tsx already owns this surface's <main>. */
        <PageShell as="div" className="overflow-x-hidden">
            <PageHeader
                title="Merchants"
                subtitle="Manage and monitor your merchant accounts"
                actions={
                    <PermissionGate permission="hq.merchant.create">
                        <Button asChild className="h-9 px-4">
                            <Link href="/manage/merchants/new">Create Merchant</Link>
                        </Button>
                    </PermissionGate>
                }
            />

            {/* Headline figures: one panel with hairline-separated tiles, not
                four bordered boxes. Numerals stay neutral (D-03) — an inactive
                count is not an alarm, so the old red/green/amber is dropped. */}
            <Panel>
                <div className="px-4 py-6 sm:px-6">
                    <StatRow columns={4}>
                        <StatTile
                            label="Total Merchants"
                            value={stats?.total ?? 0}
                            icon={<Building2 />}
                            isLoading={statsLoading}
                        />
                        <StatTile
                            label="Active"
                            value={stats?.active ?? 0}
                            icon={<TrendingUp />}
                            isLoading={statsLoading}
                        />
                        <StatTile
                            label="Inactive"
                            value={stats?.inactive ?? 0}
                            icon={<TrendingDown />}
                            isLoading={statsLoading}
                        />
                        <StatTile
                            label="Onboarding"
                            value={stats?.onboarding ?? 0}
                            icon={<Clock />}
                            isLoading={statsLoading}
                        />
                    </StatRow>
                </div>
            </Panel>

            {/* Toolbar — §5.2. Deliberately not wrapped in a Panel: the table
                below brings its own tinted well, and wrapping both would nest a
                box inside a box. */}
            <div className="flex flex-col gap-4 lg:flex-row lg:flex-wrap lg:items-center lg:justify-between">
                <div className="flex min-w-0 flex-wrap items-center gap-3">
                    {/* Search */}
                    <div className="relative min-w-[200px] max-w-sm flex-1">
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/50" />
                        <Input
                            placeholder="Search merchants..."
                            value={filters.search}
                            onChange={(e) => handleFilterChange('search', e.target.value)}
                            className="h-9 w-full border-0 bg-muted/60 pl-9 text-[0.8125rem] shadow-none focus-visible:bg-background"
                        />
                    </div>

                    {/* Status Filter */}
                    <Select
                        value={filters.status}
                        onValueChange={(value) => handleFilterChange('status', value)}
                    >
                        <SelectTrigger className="h-9 w-36 border-0 bg-muted/60 px-3 text-[0.8125rem] shadow-none">
                            <SelectValue placeholder="Status" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All Status</SelectItem>
                            <SelectItem value="created">Created</SelectItem>
                            <SelectItem value="onboarding">Onboarding</SelectItem>
                            <SelectItem value="active">Active</SelectItem>
                            <SelectItem value="suspended">Suspended</SelectItem>
                            <SelectItem value="cancelled">Cancelled</SelectItem>
                            <SelectItem value="inactive">Inactive</SelectItem>
                        </SelectContent>
                    </Select>

                    {/* Sort By */}
                    <Select
                        value={filters.sortBy}
                        onValueChange={(value) => handleFilterChange('sortBy', value)}
                    >
                        <SelectTrigger className="h-9 w-40 border-0 bg-muted/60 px-3 text-[0.8125rem] shadow-none">
                            <SelectValue placeholder="Sort by" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="name">Name</SelectItem>
                            <SelectItem value="status">Status</SelectItem>
                            <SelectItem value="created_at">Date Created</SelectItem>
                            <SelectItem value="orders_today">Orders Today</SelectItem>
                            <SelectItem value="revenue_today">Revenue Today</SelectItem>
                        </SelectContent>
                    </Select>

                    {/* Sort Order */}
                    <Select
                        value={filters.sortOrder}
                        onValueChange={(value) => handleFilterChange('sortOrder', value)}
                    >
                        <SelectTrigger className="h-9 w-32 border-0 bg-muted/60 px-3 text-[0.8125rem] shadow-none">
                            <SelectValue placeholder="Order" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="asc">Ascending</SelectItem>
                            <SelectItem value="desc">Descending</SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                <div className="flex items-center gap-2">
                    {/* View Mode Toggle — a segmented pill on the same muted
                        material as the filters, rather than a bordered group. */}
                    <div className="flex items-center gap-0.5 rounded-full bg-muted/70 p-1">
                        <Button
                            variant="ghost"
                            size="icon"
                            aria-label="Grid view"
                            aria-pressed={viewMode === 'grid'}
                            onClick={() => setViewMode('grid')}
                            className={
                                viewMode === 'grid'
                                    ? 'h-7 w-7 bg-background text-foreground shadow-sm ring-1 ring-border'
                                    : 'h-7 w-7 text-muted-foreground'
                            }
                        >
                            <LayoutGrid className="h-4 w-4" />
                        </Button>
                        <Button
                            variant="ghost"
                            size="icon"
                            aria-label="List view"
                            aria-pressed={viewMode === 'list'}
                            onClick={() => setViewMode('list')}
                            className={
                                viewMode === 'list'
                                    ? 'h-7 w-7 bg-background text-foreground shadow-sm ring-1 ring-border'
                                    : 'h-7 w-7 text-muted-foreground'
                            }
                        >
                            <List className="h-4 w-4" />
                        </Button>
                    </div>

                    {/* Refresh */}
                    <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Refresh merchants"
                        onClick={() => refetch()}
                        disabled={isFetching}
                        className="size-8 shrink-0 border-0 bg-muted/60 text-muted-foreground shadow-none hover:bg-muted hover:text-foreground"
                    >
                        <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
                    </Button>
                </div>
            </div>

            <div className="min-w-0">
                {/* Row count line (§5.2) */}
                <div className="mb-4 text-xs text-muted-foreground sm:text-sm">
                    {data?.total ?? 0} merchants found
                    {isFetching && ' · Loading...'}
                </div>

                {/* Content */}
                {isLoading || authLoading || (isManagerScoped && accessLoading) ? (
                    <MerchantGridSkeleton />
                ) : data?.merchants.length === 0 ? (
                    <div className="rounded-2xl bg-muted/30 px-4 py-12 text-center">
                        {showNoAccess ? (
                            <div className="flex flex-col items-center gap-3">
                                <ShieldAlert className="h-12 w-12 text-muted-foreground" />
                                <div>
                                    <p className="text-lg font-medium">No Merchant Access</p>
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
                    <div className="grid min-w-0 grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
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

                {/* Pagination (D-08) — no rule above it (§5.5); hidden at one page. */}
                {totalPages > 1 && (
                    <div className="mt-6 flex items-center justify-between gap-3">
                        <p className="text-sm tabular-nums text-muted-foreground">
                            Page {page} of {totalPages}
                        </p>
                        <div className="flex gap-2">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setPage((p) => Math.max(1, p - 1))}
                                disabled={page === 1}
                            >
                                <ChevronLeft className="mr-1 h-4 w-4" />
                                Previous
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                                disabled={page === totalPages}
                            >
                                Next
                                <ChevronRight className="ml-1 h-4 w-4" />
                            </Button>
                        </div>
                    </div>
                )}
            </div>
        </PageShell>
    )
}

// ============================================================================
// HELPER COMPONENTS
// ============================================================================

/**
 * Mirrors the converted `MerchantCard` shell (§5.4): same `rounded-2xl
 * bg-muted/45 p-4` surface and no footer rule, so the skeleton has the card's
 * shape and the page does not shift when data lands.
 */
function MerchantGridSkeleton() {
    return (
        <div className="grid min-w-0 grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[...Array(6)].map((_, i) => (
                <div
                    key={i}
                    className="min-w-0 overflow-hidden rounded-2xl border-0 bg-muted/45 p-4"
                >
                    <div className="mb-4 flex items-start justify-between gap-2">
                        <div className="flex min-w-0 items-center gap-3">
                            <Skeleton className="h-10 w-10 shrink-0 rounded-lg" />
                            <div className="min-w-0">
                                <Skeleton className="mb-1 h-5 w-32 max-w-[60%]" />
                                <Skeleton className="h-4 w-20 max-w-[40%]" />
                            </div>
                        </div>
                        <Skeleton className="h-6 w-16 shrink-0 rounded-full" />
                    </div>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                        {[...Array(4)].map((_, j) => (
                            <div key={j} className="flex items-center gap-2">
                                <Skeleton className="h-4 w-4 shrink-0" />
                                <div className="min-w-0">
                                    <Skeleton className="mb-1 h-3 w-16 max-w-full" />
                                    <Skeleton className="h-4 w-12 max-w-full" />
                                </div>
                            </div>
                        ))}
                    </div>
                    <div className="mt-4">
                        <Skeleton className="h-3 w-32 max-w-[50%]" />
                    </div>
                </div>
            ))}
        </div>
    )
}

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

    return (
        <div className="min-w-0">
            {/* §5.3: two trees off one dataset — the data table from `xl`, a card
                grid below it. Never a horizontally scrolling table on a phone. */}
            <Table
                variant="data"
                containerClassName="hidden xl:block"
                className="min-w-[900px]"
            >
                <TableHeader className="[&_tr]:border-0">
                    <TableRow>
                        <TableHead>Merchant</TableHead>
                        <TableHead>Owner</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Locations</TableHead>
                        <TableHead className="text-right">Staff</TableHead>
                        <TableHead className="text-right">Orders Today</TableHead>
                        <TableHead className="text-right">Revenue Today</TableHead>
                        <TableHead className="text-right">Notes</TableHead>
                        <TableHead>Created</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {merchants.map((merchant) => {
                        const merchantStatus = merchant.onboarding_status || merchant.derived_status
                        return (
                            <TableRow
                                key={merchant.id}
                                className="cursor-pointer"
                                onClick={() => onMerchantClick(merchant.clerk_org_id)}
                            >
                                <TableCell>
                                    <div className="flex items-center gap-2">
                                        {merchant.logo_url && <Image src={merchant.logo_url} alt={merchant.name} width={40} height={40} className="rounded-md object-cover" />}
                                        <div className="flex flex-col">
                                            <div className="font-semibold">{merchant.name}</div>
                                            {merchant.type && (
                                                <div className="text-sm capitalize text-muted-foreground">
                                                    {merchant.type}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </TableCell>
                                <TableCell>
                                    <div className="flex flex-col">
                                        <span className="font-medium">
                                            {`${merchant.owner_first_name || ''} ${merchant.owner_last_name || ''}`.trim() || '-'}
                                        </span>
                                        {merchant.owner_email && (
                                            <span className="text-xs text-muted-foreground">{merchant.owner_email}</span>
                                        )}
                                    </div>
                                </TableCell>
                                <TableCell>
                                    {/* One neutral pill for every state (§5.2). */}
                                    <Badge
                                        variant="secondary"
                                        className="w-fit rounded-full border-0 px-2.5 text-xs font-medium capitalize"
                                    >
                                        {merchantStatus.replace('_', ' ')}
                                    </Badge>
                                </TableCell>
                                <TableCell className="text-right tabular-nums">
                                    {merchant.active_locations} / {merchant.total_locations}
                                </TableCell>
                                <TableCell className="text-right tabular-nums">
                                    {merchant.active_staff_count}
                                </TableCell>
                                <TableCell className="text-right tabular-nums">
                                    {merchant.orders_today}
                                </TableCell>
                                <TableCell className="text-right tabular-nums">
                                    {formatCurrency(merchant.revenue_today)}
                                </TableCell>
                                <TableCell className="text-right tabular-nums">
                                    {(merchant.notes_count || 0) > 0 ? (
                                        <span className="inline-flex items-center gap-1">
                                            <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
                                            {merchant.notes_count}
                                        </span>
                                    ) : (
                                        <span className="text-muted-foreground">0</span>
                                    )}
                                </TableCell>
                                <TableCell className="text-muted-foreground">
                                    {new Date(merchant.created_at).toLocaleDateString()}
                                </TableCell>
                            </TableRow>
                        )
                    })}
                </TableBody>
            </Table>

            <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 xl:hidden">
                {merchants.map((merchant) => {
                    const merchantStatus = merchant.onboarding_status || merchant.derived_status
                    const ownerName = `${merchant.owner_first_name || ''} ${merchant.owner_last_name || ''}`.trim()
                    return (
                        <div
                            key={merchant.id}
                            className="min-w-0 cursor-pointer rounded-2xl border-0 bg-muted/45 p-4 transition-colors hover:bg-muted"
                            onClick={() => onMerchantClick(merchant.clerk_org_id)}
                        >
                            <div className="flex items-start justify-between gap-2">
                                <div className="flex min-w-0 items-center gap-2">
                                    {merchant.logo_url && (
                                        <Image
                                            src={merchant.logo_url}
                                            alt={merchant.name}
                                            width={32}
                                            height={32}
                                            className="shrink-0 rounded-md object-cover"
                                        />
                                    )}
                                    <div className="min-w-0">
                                        <p className="truncate font-semibold">{merchant.name}</p>
                                        <p className="truncate text-xs text-muted-foreground">
                                            {ownerName || merchant.owner_email || '—'}
                                        </p>
                                    </div>
                                </div>
                                <Badge
                                    variant="secondary"
                                    className="w-fit shrink-0 rounded-full border-0 px-2.5 text-xs font-medium capitalize"
                                >
                                    {merchantStatus.replace('_', ' ')}
                                </Badge>
                            </div>

                            <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                                <Field label="Locations" value={`${merchant.active_locations} / ${merchant.total_locations}`} />
                                <Field label="Staff" value={merchant.active_staff_count} />
                                <Field label="Orders Today" value={merchant.orders_today} />
                                <Field label="Revenue Today" value={formatCurrency(merchant.revenue_today)} />
                            </div>

                            <p className="mt-3 text-xs text-muted-foreground">
                                Created {new Date(merchant.created_at).toLocaleDateString()}
                            </p>
                        </div>
                    )
                })}
            </div>
        </div>
    )
}

/** A label/value pair inside a mobile record card. */
function Field({ label, value }: { label: string; value: string | number }) {
    return (
        <div className="min-w-0">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="truncate font-medium tabular-nums">{value}</p>
        </div>
    )
}
