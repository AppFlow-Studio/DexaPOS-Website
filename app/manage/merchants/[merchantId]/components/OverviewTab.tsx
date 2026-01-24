'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Skeleton } from '@/components/ui/skeleton'
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table'
import {
    DollarSign,
    ShoppingCart,
    Target,
    Users,
    Store,
    MapPin,
    User,
    Mail,
    Phone,
    Activity,
    Clock,
    CreditCard,
    Building2,
    CheckCircle,
    XCircle,
    TrendingUp,
    Award,
} from 'lucide-react'
import { MerchantInfoModel } from '@/types/db-modles'
import type { MerchantDetails, LocationSummary } from '@/types/merchant'
import { useToggleLocation } from '@/lib/queries/use-merchants'
import { PermissionGate } from '@/components/admin/PermissionGate'
import { formatDistanceToNow } from 'date-fns'
import { useState } from 'react'
import { toast } from 'sonner'

// Chart imports
import { Area, AreaChart, CartesianGrid, XAxis, YAxis, Pie, PieChart, Cell, Bar, BarChart } from 'recharts'
import {
    ChartContainer,
    ChartTooltip,
    ChartTooltipContent,
} from '@/components/ui/chart'

// Admin merchant hooks
import {
    useAdminSalesByDate,
    useAdminBestSellingItems,
    useAdminOrderAnalytics,
    useAdminPaymentMethodsBreakdown,
} from '@/lib/queries/use-admin-merchant'

interface OverviewTabProps {
    merchantInfo: MerchantInfoModel
    merchantDetails?: MerchantDetails | null
    isLoadingDetails?: boolean
}

const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    }).format(amount)
}

export function OverviewTab({ merchantInfo, merchantDetails, isLoadingDetails }: OverviewTabProps) {
    // Real metrics from merchantDetails, fallback to 0 if not available
    const ordersToday = merchantDetails?.orders_today ?? 0
    const revenueToday = merchantDetails?.revenue_today ?? 0
    const totalLocations = merchantDetails?.total_locations ?? 0
    const activeLocations = merchantDetails?.active_locations ?? 0
    const activeStaff = merchantDetails?.active_staff_count ?? 0
    const lastOrderAt = merchantDetails?.last_order_at
    const derivedStatus = merchantDetails?.derived_status ?? 'onboarding'
    const locations = merchantDetails?.locations ?? []

    // Get merchant UUID for fetching analytics
    const merchantId = merchantDetails?.id ?? ''

    // Fetch chart data
    const { data: salesByDate, isLoading: isLoadingSales } = useAdminSalesByDate(merchantId)
    const { data: bestSellers, isLoading: isLoadingBestSellers } = useAdminBestSellingItems(merchantId)
    const { data: orderAnalytics, isLoading: isLoadingAnalytics } = useAdminOrderAnalytics(merchantId)
    const { data: paymentBreakdown, isLoading: isLoadingPayments } = useAdminPaymentMethodsBreakdown(merchantId)

    return (
        <>
            {/* Real-Time KPIs */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Orders Today</CardTitle>
                        <ShoppingCart className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        {isLoadingDetails ? (
                            <Skeleton className="h-8 w-16" />
                        ) : (
                            <>
                                <div className="text-2xl font-bold">{ordersToday}</div>
                                <p className="text-xs text-muted-foreground">
                                    Across all locations
                                </p>
                            </>
                        )}
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Revenue Today</CardTitle>
                        <DollarSign className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        {isLoadingDetails ? (
                            <Skeleton className="h-8 w-24" />
                        ) : (
                            <>
                                <div className="text-2xl font-bold">{formatCurrency(revenueToday)}</div>
                                <p className="text-xs text-muted-foreground">
                                    Completed orders only
                                </p>
                            </>
                        )}
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Locations</CardTitle>
                        <MapPin className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        {isLoadingDetails ? (
                            <Skeleton className="h-8 w-16" />
                        ) : (
                            <>
                                <div className="text-2xl font-bold">{activeLocations} / {totalLocations}</div>
                                <p className="text-xs text-muted-foreground">
                                    Active / Total
                                </p>
                            </>
                        )}
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Active Staff</CardTitle>
                        <Users className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        {isLoadingDetails ? (
                            <Skeleton className="h-8 w-16" />
                        ) : (
                            <>
                                <div className="text-2xl font-bold">{activeStaff}</div>
                                <p className="text-xs text-muted-foreground">
                                    Staff members
                                </p>
                            </>
                        )}
                    </CardContent>
                </Card>
            </div>

            {/* Status and Last Activity */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mt-4">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Status</CardTitle>
                        <Activity className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        {isLoadingDetails ? (
                            <Skeleton className="h-8 w-20" />
                        ) : (
                            <>
                                <Badge className={
                                    derivedStatus === 'active' ? 'bg-green-100 text-green-700 dark:bg-green-950/50 dark:text-green-400' :
                                    derivedStatus === 'inactive' ? 'bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-400' :
                                    'bg-yellow-100 text-yellow-700 dark:bg-yellow-950/50 dark:text-yellow-400'
                                }>
                                    {derivedStatus}
                                </Badge>
                                <p className="text-xs text-muted-foreground mt-1">
                                    Based on activity
                                </p>
                            </>
                        )}
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Last Order</CardTitle>
                        <Clock className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        {isLoadingDetails ? (
                            <Skeleton className="h-8 w-24" />
                        ) : (
                            <>
                                <div className="text-lg font-semibold">
                                    {lastOrderAt
                                        ? formatDistanceToNow(new Date(lastOrderAt), { addSuffix: true })
                                        : 'No orders yet'}
                                </div>
                                <p className="text-xs text-muted-foreground">
                                    Most recent order
                                </p>
                            </>
                        )}
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Avg. Order Value</CardTitle>
                        <Target className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        {isLoadingDetails ? (
                            <Skeleton className="h-8 w-20" />
                        ) : (
                            <>
                                <div className="text-2xl font-bold">
                                    {ordersToday > 0 ? formatCurrency(revenueToday / ordersToday) : '$0'}
                                </div>
                                <p className="text-xs text-muted-foreground">
                                    Today
                                </p>
                            </>
                        )}
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Member Since</CardTitle>
                        <CreditCard className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-lg font-semibold">
                            {merchantInfo?.created_at
                                ? new Date(merchantInfo.created_at).toLocaleDateString()
                                : 'N/A'}
                        </div>
                        <p className="text-xs text-muted-foreground">
                            Account created
                        </p>
                    </CardContent>
                </Card>
            </div>

            {/* Charts Section */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 mt-6">
                {/* Revenue Trend Chart */}
                <Card className="col-span-2">
                    <CardHeader>
                        <CardTitle className="text-lg">Revenue Trend</CardTitle>
                        <CardDescription>Daily revenue for the last 30 days</CardDescription>
                    </CardHeader>
                    <CardContent>
                        {isLoadingSales || !merchantId ? (
                            <div className="h-[250px] flex items-center justify-center">
                                <Skeleton className="h-[200px] w-full" />
                            </div>
                        ) : !salesByDate || salesByDate.length === 0 ? (
                            <div className="h-[250px] flex items-center justify-center text-muted-foreground">
                                No sales data available
                            </div>
                        ) : (
                            <RevenueChart data={salesByDate} />
                        )}
                    </CardContent>
                </Card>

                {/* Order Type Breakdown */}
                <Card>
                    <CardHeader>
                        <CardTitle className="text-lg">Order Sources</CardTitle>
                        <CardDescription>Distribution by order type</CardDescription>
                    </CardHeader>
                    <CardContent>
                        {isLoadingAnalytics || !merchantId ? (
                            <div className="h-[250px] flex items-center justify-center">
                                <Skeleton className="h-[200px] w-[200px] rounded-full" />
                            </div>
                        ) : !orderAnalytics?.orderTypeBreakdown ? (
                            <div className="h-[250px] flex items-center justify-center text-muted-foreground">
                                No order data available
                            </div>
                        ) : (
                            <OrderTypePieChart data={orderAnalytics.orderTypeBreakdown} />
                        )}
                    </CardContent>
                </Card>
            </div>

            {/* Best Sellers and Payment Methods Row */}
            <div className="grid gap-4 md:grid-cols-2 mt-4">
                {/* Best Selling Items */}
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-lg flex items-center gap-2">
                            <TrendingUp className="h-4 w-4 text-primary" />
                            Best Sellers
                        </CardTitle>
                        <CardDescription>Top selling items (last 30 days)</CardDescription>
                    </CardHeader>
                    <CardContent>
                        {isLoadingBestSellers || !merchantId ? (
                            <div className="space-y-3">
                                {[1, 2, 3, 4, 5].map((i) => (
                                    <div key={i} className="flex items-center gap-3">
                                        <Skeleton className="h-6 w-6 rounded-full" />
                                        <Skeleton className="h-4 w-32 flex-1" />
                                        <Skeleton className="h-4 w-16" />
                                    </div>
                                ))}
                            </div>
                        ) : !bestSellers || bestSellers.length === 0 ? (
                            <div className="py-8 text-center text-muted-foreground">
                                No sales data available
                            </div>
                        ) : (
                            <BestSellersTable items={bestSellers.slice(0, 5)} />
                        )}
                    </CardContent>
                </Card>

                {/* Payment Methods Breakdown */}
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-lg flex items-center gap-2">
                            <CreditCard className="h-4 w-4 text-primary" />
                            Payment Methods
                        </CardTitle>
                        <CardDescription>Revenue by payment method (last 30 days)</CardDescription>
                    </CardHeader>
                    <CardContent>
                        {isLoadingPayments || !merchantId ? (
                            <div className="space-y-3">
                                {[1, 2, 3].map((i) => (
                                    <div key={i} className="flex items-center gap-3">
                                        <Skeleton className="h-4 w-full" />
                                    </div>
                                ))}
                            </div>
                        ) : !paymentBreakdown || paymentBreakdown.length === 0 ? (
                            <div className="py-8 text-center text-muted-foreground">
                                No payment data available
                            </div>
                        ) : (
                            <PaymentMethodsChart data={paymentBreakdown} />
                        )}
                    </CardContent>
                </Card>
            </div>

            {/* Locations Section */}
            <Card className="mt-6">
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <div>
                            <CardTitle>Locations</CardTitle>
                            <CardDescription>Manage merchant locations and their status</CardDescription>
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    {isLoadingDetails ? (
                        <div className="space-y-3">
                            {[...Array(3)].map((_, i) => (
                                <Skeleton key={i} className="h-12 w-full" />
                            ))}
                        </div>
                    ) : locations.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground">
                            <Building2 className="h-10 w-10 mx-auto mb-2 opacity-50" />
                            <p>No locations configured yet</p>
                        </div>
                    ) : (
                        <LocationsTable
                            locations={locations}
                            merchantId={merchantDetails?.id ?? ''}
                        />
                    )}
                </CardContent>
            </Card>

            {/* Business Information and Activity Summary */}
            <div className="grid gap-4 md:grid-cols-2 mt-6">
                <Card>
                    <CardHeader>
                        <CardTitle className="text-lg">Business Information</CardTitle>
                        <CardDescription>Merchant business details and contact information</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="flex items-center gap-3">
                            <Store className="h-4 w-4 text-muted-foreground" />
                            <div>
                                <div className="font-medium">Business Type</div>
                                <div className="text-sm text-muted-foreground">
                                    {(merchantInfo?.public_metadata as any)?.merchant_type || merchantInfo?.type || 'Not specified'}
                                </div>
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            <MapPin className="h-4 w-4 text-muted-foreground" />
                            <div>
                                <div className="font-medium">Address</div>
                                <div className="text-sm text-muted-foreground">{merchantInfo?.public_metadata?.business_address || 'Not specified'}</div>
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            <User className="h-4 w-4 text-muted-foreground" />
                            <div>
                                <div className="font-medium">Owner</div>
                                <div className="text-sm text-muted-foreground">{merchantInfo?.public_metadata?.owner_name || 'Not specified'}</div>
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            <Mail className="h-4 w-4 text-muted-foreground" />
                            <div>
                                <div className="font-medium">Email</div>
                                <div className="text-sm text-muted-foreground">{merchantInfo?.public_metadata?.owner_email || 'Not specified'}</div>
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            <Phone className="h-4 w-4 text-muted-foreground" />
                            <div>
                                <div className="font-medium">Phone</div>
                                <div className="text-sm text-muted-foreground">{merchantInfo?.public_metadata?.owner_phone || 'Not specified'}</div>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Quick Stats Summary */}
                <Card>
                    <CardHeader>
                        <CardTitle className="text-lg">Activity Summary</CardTitle>
                        <CardDescription>Overview of merchant activity</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-4">
                            <div className="flex items-center justify-between border-b pb-3">
                                <div className="flex items-center gap-3">
                                    <div className="h-8 w-8 rounded-full bg-green-100 text-green-600 flex items-center justify-center">
                                        <CheckCircle className="h-4 w-4" />
                                    </div>
                                    <div>
                                        <div className="font-medium text-sm">Active Locations</div>
                                        <div className="text-xs text-muted-foreground">Currently operational</div>
                                    </div>
                                </div>
                                <div className="text-lg font-semibold">{activeLocations}</div>
                            </div>
                            <div className="flex items-center justify-between border-b pb-3">
                                <div className="flex items-center gap-3">
                                    <div className="h-8 w-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center">
                                        <Users className="h-4 w-4" />
                                    </div>
                                    <div>
                                        <div className="font-medium text-sm">Staff Members</div>
                                        <div className="text-xs text-muted-foreground">Active accounts</div>
                                    </div>
                                </div>
                                <div className="text-lg font-semibold">{activeStaff}</div>
                            </div>
                            <div className="flex items-center justify-between border-b pb-3">
                                <div className="flex items-center gap-3">
                                    <div className="h-8 w-8 rounded-full bg-purple-100 text-purple-600 flex items-center justify-center">
                                        <ShoppingCart className="h-4 w-4" />
                                    </div>
                                    <div>
                                        <div className="font-medium text-sm">Orders Today</div>
                                        <div className="text-xs text-muted-foreground">All locations</div>
                                    </div>
                                </div>
                                <div className="text-lg font-semibold">{ordersToday}</div>
                            </div>
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="h-8 w-8 rounded-full bg-yellow-100 text-yellow-600 flex items-center justify-center">
                                        <DollarSign className="h-4 w-4" />
                                    </div>
                                    <div>
                                        <div className="font-medium text-sm">Revenue Today</div>
                                        <div className="text-xs text-muted-foreground">Completed orders</div>
                                    </div>
                                </div>
                                <div className="text-lg font-semibold">{formatCurrency(revenueToday)}</div>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>

        </>
    )
}

// ============================================================================
// LOCATIONS TABLE COMPONENT
// ============================================================================

function LocationsTable({
    locations,
    merchantId,
}: {
    locations: LocationSummary[]
    merchantId: string
}) {
    const toggleLocationMutation = useToggleLocation()
    const [togglingId, setTogglingId] = useState<string | null>(null)

    const handleToggle = async (locationId: string, currentStatus: boolean) => {
        setTogglingId(locationId)
        try {
            const result = await toggleLocationMutation.mutateAsync({
                merchantId,
                locationId,
                isActive: !currentStatus,
            })
            if (result.success) {
                toast.success(`Location ${!currentStatus ? 'activated' : 'deactivated'} successfully`)
            } else {
                toast.error(result.error || 'Failed to update location status')
            }
        } catch (error) {
            toast.error('Failed to update location status')
        } finally {
            setTogglingId(null)
        }
    }

    return (
        <Table>
            <TableHeader>
                <TableRow>
                    <TableHead>Location</TableHead>
                    <TableHead>Address</TableHead>
                    <TableHead className="text-center">Orders Today</TableHead>
                    <TableHead className="text-right">Revenue Today</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                    <TableHead className="text-center">Active</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {locations.map((location) => (
                    <TableRow key={location.id}>
                        <TableCell className="font-medium">{location.name}</TableCell>
                        <TableCell className="text-muted-foreground">
                            {[location.address_line1, location.city, location.state]
                                .filter(Boolean)
                                .join(', ') || 'No address'}
                        </TableCell>
                        <TableCell className="text-center">{location.orders_today}</TableCell>
                        <TableCell className="text-right">{formatCurrency(location.revenue_today)}</TableCell>
                        <TableCell className="text-center">
                            {location.is_accepting_orders ? (
                                <Badge className="bg-green-100 text-green-700 dark:bg-green-950/50 dark:text-green-400">
                                    Accepting Orders
                                </Badge>
                            ) : (
                                <Badge variant="secondary">Not Accepting</Badge>
                            )}
                        </TableCell>
                        <TableCell className="text-center">
                            <PermissionGate permission="hq.merchant.update" fallback={
                                location.is_active ? (
                                    <CheckCircle className="h-5 w-5 text-green-600 mx-auto" />
                                ) : (
                                    <XCircle className="h-5 w-5 text-red-500 mx-auto" />
                                )
                            }>
                                <Switch
                                    checked={location.is_active}
                                    disabled={togglingId === location.id}
                                    onCheckedChange={() => handleToggle(location.id, location.is_active)}
                                />
                            </PermissionGate>
                        </TableCell>
                    </TableRow>
                ))}
            </TableBody>
        </Table>
    )
}

// ============================================================================
// CHART COMPONENTS
// ============================================================================

const revenueChartConfig = {
    sales: {
        label: 'Revenue',
        color: 'hsl(var(--primary))',
    },
    orders: {
        label: 'Orders',
        color: 'hsl(var(--secondary))',
    },
}

function RevenueChart({ data }: { data: { date: string; sales: number; orders: number }[] }) {
    return (
        <ChartContainer config={revenueChartConfig} className="h-[250px] w-full">
            <AreaChart data={data} margin={{ left: 12, right: 12 }}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis
                    dataKey="date"
                    tickLine={false}
                    axisLine={false}
                    tickMargin={8}
                    tickFormatter={(value) => {
                        const date = new Date(value)
                        return date.toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                        })
                    }}
                />
                <YAxis
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(value) => `$${value >= 1000 ? `${(value / 1000).toFixed(1)}k` : value}`}
                />
                <ChartTooltip
                    cursor={false}
                    content={<ChartTooltipContent />}
                />
                <defs>
                    <linearGradient id="fillRevenue" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--primary)" stopOpacity={0.8} />
                        <stop offset="95%" stopColor="var(--primary)" stopOpacity={0.1} />
                    </linearGradient>
                </defs>
                <Area
                    dataKey="sales"
                    type="monotone"
                    fill="url(#fillRevenue)"
                    fillOpacity={0.4}
                    stroke="var(--primary)"
                    strokeWidth={2}
                />
            </AreaChart>
        </ChartContainer>
    )
}

const orderTypeConfig = {
    dine_in: { label: 'Dine In', color: 'hsl(var(--chart-1))' },
    takeout: { label: 'Takeout', color: 'hsl(var(--chart-2))' },
    delivery: { label: 'Delivery', color: 'hsl(var(--chart-3))' },
    online: { label: 'Online', color: 'hsl(var(--chart-4))' },
    catering: { label: 'Catering', color: 'hsl(var(--chart-5))' },
}

const ORDER_TYPE_COLORS = [
    'hsl(var(--chart-1))',
    'hsl(var(--chart-2))',
    'hsl(var(--chart-3))',
    'hsl(var(--chart-4))',
    'hsl(var(--chart-5))',
]

function OrderTypePieChart({ data }: { data: Record<string, number> }) {
    const chartData = Object.entries(data)
        .map(([key, value], index) => ({
            type: key,
            orders: value,
            fill: ORDER_TYPE_COLORS[index % ORDER_TYPE_COLORS.length],
        }))
        .filter((item) => item.orders > 0)

    if (chartData.length === 0) {
        return (
            <div className="h-[250px] flex items-center justify-center text-muted-foreground">
                No order data available
            </div>
        )
    }

    return (
        <ChartContainer config={orderTypeConfig} className="h-[250px] w-full">
            <PieChart>
                <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel />} />
                <Pie
                    data={chartData}
                    dataKey="orders"
                    nameKey="type"
                    innerRadius={50}
                    strokeWidth={3}
                >
                    {chartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.fill} />
                    ))}
                </Pie>
            </PieChart>
        </ChartContainer>
    )
}

function getRankBadge(rank: number) {
    switch (rank) {
        case 1:
            return (
                <div className="flex items-center justify-center w-6 h-6 rounded-full bg-amber-500/20 text-amber-600">
                    <Award className="h-3.5 w-3.5" />
                </div>
            )
        case 2:
            return (
                <div className="flex items-center justify-center w-6 h-6 rounded-full bg-gray-400/20 text-gray-500 text-xs font-bold">
                    2
                </div>
            )
        case 3:
            return (
                <div className="flex items-center justify-center w-6 h-6 rounded-full bg-amber-700/20 text-amber-700 text-xs font-bold">
                    3
                </div>
            )
        default:
            return (
                <div className="flex items-center justify-center w-6 h-6 rounded-full bg-muted text-muted-foreground text-xs font-medium">
                    {rank}
                </div>
            )
    }
}

function BestSellersTable({ items }: { items: { item_name: string; quantity: number; revenue: number }[] }) {
    return (
        <div className="space-y-1">
            <div className="flex items-center justify-between py-2 border-b border-muted/30 mb-2">
                <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
                    Item
                </span>
                <div className="flex gap-6">
                    <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide w-12 text-right">
                        Qty
                    </span>
                    <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide w-16 text-right">
                        Revenue
                    </span>
                </div>
            </div>
            {items.map((item, index) => (
                <div
                    key={item.item_name}
                    className={`flex items-center justify-between py-2.5 px-2 -mx-2 rounded-lg transition-colors ${
                        index === 0 ? 'bg-amber-500/5' : ''
                    } hover:bg-muted/30`}
                >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                        {getRankBadge(index + 1)}
                        <span className={`text-sm truncate ${index === 0 ? 'font-semibold' : 'font-medium'}`}>
                            {item.item_name}
                        </span>
                    </div>
                    <div className="flex items-center gap-6">
                        <span className="text-sm text-muted-foreground w-12 text-right tabular-nums">
                            {item.quantity}
                        </span>
                        <span className={`text-sm font-mono w-16 text-right tabular-nums ${index === 0 ? 'font-bold text-primary' : ''}`}>
                            {formatCurrency(item.revenue)}
                        </span>
                    </div>
                </div>
            ))}
            <div className="flex items-center justify-between py-3 mt-2 border-t-2 border-foreground/10">
                <span className="text-sm font-bold">Total ({items.length} items)</span>
                <div className="flex items-center gap-6">
                    <span className="text-sm font-bold w-12 text-right tabular-nums">
                        {items.reduce((sum, item) => sum + item.quantity, 0)}
                    </span>
                    <span className="text-sm font-mono font-bold w-16 text-right tabular-nums">
                        {formatCurrency(items.reduce((sum, item) => sum + item.revenue, 0))}
                    </span>
                </div>
            </div>
        </div>
    )
}

const paymentMethodConfig = {
    cash: { label: 'Cash', color: 'hsl(var(--chart-1))' },
    card: { label: 'Card', color: 'hsl(var(--chart-2))' },
    credit_card: { label: 'Credit Card', color: 'hsl(var(--chart-2))' },
    other: { label: 'Other', color: 'hsl(var(--chart-3))' },
}

function PaymentMethodsChart({ data }: { data: { method: string; amount: number; count: number; percentage: number }[] }) {
    const total = data.reduce((sum, item) => sum + item.amount, 0)

    return (
        <div className="space-y-4">
            {data.map((item) => {
                const label = item.method === 'credit_card' ? 'Card' : item.method.charAt(0).toUpperCase() + item.method.slice(1)
                return (
                    <div key={item.method} className="space-y-2">
                        <div className="flex items-center justify-between text-sm">
                            <span className="font-medium">{label}</span>
                            <span className="text-muted-foreground">
                                {formatCurrency(item.amount)} ({item.percentage.toFixed(1)}%)
                            </span>
                        </div>
                        <div className="h-2 rounded-full bg-muted overflow-hidden">
                            <div
                                className="h-full rounded-full bg-primary transition-all duration-500"
                                style={{ width: `${item.percentage}%` }}
                            />
                        </div>
                        <div className="flex justify-between text-xs text-muted-foreground">
                            <span>{item.count} transactions</span>
                        </div>
                    </div>
                )
            })}
            <div className="pt-3 border-t">
                <div className="flex justify-between text-sm font-semibold">
                    <span>Total</span>
                    <span>{formatCurrency(total)}</span>
                </div>
            </div>
        </div>
    )
}