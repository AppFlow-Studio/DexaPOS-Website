'use client'

import { useState, useMemo } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import {
    ChartContainer,
    ChartTooltip,
    ChartTooltipContent,
    type ChartConfig,
} from '@/components/ui/chart'
import {
    Area,
    AreaChart,
    Bar,
    BarChart,
    CartesianGrid,
    Cell,
    Pie,
    PieChart,
    XAxis,
    YAxis,
} from 'recharts'
import {
    TrendingUp,
    TrendingDown,
    DollarSign,
    ShoppingCart,
    CreditCard,
    Receipt,
    Percent,
    Calendar,
} from 'lucide-react'

// Admin hooks
import {
    useAdminOrderAnalytics,
    useAdminFinancialKPIs,
    useAdminSalesByDate,
    useAdminPaymentMethodsBreakdown,
    useAdminTransactionSummary,
} from '@/lib/queries/use-admin-merchant'

// Types
import type { MerchantDetails } from '@/types/merchant'

// ============================================================================
// DATE RANGE OPTIONS
// ============================================================================

type DateRangeOption = '7d' | '30d' | '90d' | 'custom'

function getDateRange(option: DateRangeOption): { from: Date; to: Date } {
    const to = new Date()
    const from = new Date()

    switch (option) {
        case '7d':
            from.setDate(from.getDate() - 7)
            break
        case '30d':
            from.setDate(from.getDate() - 30)
            break
        case '90d':
            from.setDate(from.getDate() - 90)
            break
        default:
            from.setDate(from.getDate() - 30)
    }

    from.setHours(0, 0, 0, 0)
    return { from, to }
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

interface AnalyticsTabProps {
    merchantDetails?: MerchantDetails | null
}

export function AnalyticsTab({ merchantDetails }: AnalyticsTabProps) {
    const [dateRange, setDateRange] = useState<DateRangeOption>('30d')
    const [locationId, setLocationId] = useState<string | null>(null)

    // Get merchant UUID and locations from merchantDetails
    const merchantId = merchantDetails?.id ?? ''
    const locations = merchantDetails?.locations ?? []

    // Date range
    const { from: dateFrom, to: dateTo } = useMemo(() => getDateRange(dateRange), [dateRange])

    // Fetch analytics data
    const { data: orderAnalytics, isLoading: analyticsLoading } = useAdminOrderAnalytics(
        merchantId,
        dateFrom,
        dateTo,
        locationId
    )

    const { data: financialKPIs, isLoading: kpisLoading } = useAdminFinancialKPIs(
        merchantId,
        dateFrom,
        dateTo,
        locationId
    )

    const { data: salesByDate, isLoading: salesLoading } = useAdminSalesByDate(
        merchantId,
        dateFrom,
        dateTo,
        locationId
    )

    const { data: paymentMethods, isLoading: paymentsLoading } = useAdminPaymentMethodsBreakdown(
        merchantId,
        dateFrom,
        dateTo,
        locationId
    )

    const { data: transactionSummary, isLoading: summaryLoading } = useAdminTransactionSummary(
        merchantId,
        dateFrom,
        dateTo,
        locationId
    )

    // Format helpers
    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD',
            minimumFractionDigits: 0,
            maximumFractionDigits: 0,
        }).format(amount)
    }

    const formatPercent = (value: number) => {
        return `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`
    }

    // Chart configs
    const salesChartConfig = {
        sales: { label: 'Revenue', color: 'var(--primary)' },
        orders: { label: 'Orders', color: 'var(--secondar))' },
    } satisfies ChartConfig

    const paymentChartConfig = {
        cash: { label: 'Cash', color: 'var(--chart-1)' },
        card: { label: 'Card', color: 'var(--chart-2)' },
        credit_card: { label: 'Credit Card', color: 'var(--chart-2)' },
        other: { label: 'Other', color: 'var(--chart-3)' },
    } satisfies ChartConfig

    const orderTypeConfig = {
        dine_in: { label: 'Dine In', color: 'var(--chart-1)' },
        takeout: { label: 'Takeout', color: 'var(--chart-2)' },
        delivery: { label: 'Delivery', color: 'var(--chart-3)' },
        online: { label: 'Online', color: 'var(--chart-4)' },
        catering: { label: 'Catering', color: 'var(--chart-5)' },
    } satisfies ChartConfig

    // Calculate totals
    const totalRevenue = transactionSummary?.totalRevenue || orderAnalytics?.totalRevenue || 0
    const totalOrders = orderAnalytics?.totalOrders || transactionSummary?.transactionCount || 0
    const avgOrderValue = orderAnalytics?.avgOrderValue || (totalOrders > 0 ? totalRevenue / totalOrders : 0)
    const growth = orderAnalytics?.growthPercentage || 0

    // Order type breakdown for pie chart
    const orderTypeData = useMemo(() => {
        if (!orderAnalytics?.orderTypeBreakdown) return []
        const colors = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)', 'var(--chart-5)']
        return Object.entries(orderAnalytics.orderTypeBreakdown)
            .map(([type, count], index) => ({
                type: type.replace('_', ' '),
                count,
                fill: colors[index % colors.length],
            }))
            .filter(item => item.count > 0)
    }, [orderAnalytics])

    // Payment methods for bar chart
    const paymentData = useMemo(() => {
        if (!paymentMethods) return []
        return paymentMethods.map(pm => ({
            method: pm.method === 'credit_card' ? 'Card' : pm.method.charAt(0).toUpperCase() + pm.method.slice(1),
            amount: pm.amount,
            count: pm.count,
        }))
    }, [paymentMethods])

    const isLoading = !merchantId || analyticsLoading

    return (
        <div className="space-y-6">
            {/* Filters */}
            <div className="flex flex-wrap gap-4 items-center justify-between">
                <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium">Date Range:</span>
                </div>
                <div className="flex flex-wrap gap-3">
                    {/* Date Range Selector */}
                    <div className="flex border rounded-lg">
                        {(['7d', '30d', '90d'] as const).map(range => (
                            <Button
                                key={range}
                                variant={dateRange === range ? 'secondary' : 'ghost'}
                                size="sm"
                                onClick={() => setDateRange(range)}
                                className="px-3"
                            >
                                {range === '7d' ? '7 Days' : range === '30d' ? '30 Days' : '90 Days'}
                            </Button>
                        ))}
                    </div>

                    {/* Location Filter */}
                    {locations.length > 0 && (
                        <Select
                            value={locationId || 'all'}
                            onValueChange={(value) => setLocationId(value === 'all' ? null : value)}
                        >
                            <SelectTrigger className="w-[180px]">
                                <SelectValue placeholder="All Locations" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Locations</SelectItem>
                                {locations.map((loc) => (
                                    <SelectItem key={loc.id} value={loc.id}>
                                        {loc.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    )}
                </div>
            </div>

            {/* KPI Cards Row 1 */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <KPICard
                    title="Total Revenue"
                    value={formatCurrency(totalRevenue)}
                    subtitle={`${dateRange === '7d' ? 'Last 7 days' : dateRange === '30d' ? 'Last 30 days' : 'Last 90 days'}`}
                    icon={<DollarSign className="h-4 w-4" />}
                    trend={growth}
                    isLoading={isLoading}
                />
                <KPICard
                    title="Total Orders"
                    value={totalOrders.toLocaleString()}
                    subtitle="Completed orders"
                    icon={<ShoppingCart className="h-4 w-4" />}
                    isLoading={isLoading}
                />
                <KPICard
                    title="Avg. Order Value"
                    value={formatCurrency(avgOrderValue)}
                    subtitle="Per order"
                    icon={<Receipt className="h-4 w-4" />}
                    isLoading={isLoading}
                />
                <KPICard
                    title="Tips Collected"
                    value={formatCurrency(transactionSummary?.totalTips || orderAnalytics?.tips || 0)}
                    subtitle="Total tips"
                    icon={<Percent className="h-4 w-4" />}
                    isLoading={summaryLoading || isLoading}
                />
            </div>

            {/* KPI Cards Row 2 - Financial Breakdown */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <KPICard
                    title="Net Sales"
                    value={formatCurrency(transactionSummary?.netSales || financialKPIs?.summary?.net_sales || 0)}
                    subtitle="After refunds"
                    icon={<DollarSign className="h-4 w-4" />}
                    variant="success"
                    isLoading={summaryLoading || kpisLoading}
                />
                <KPICard
                    title="Total Refunds"
                    value={formatCurrency(transactionSummary?.totalRefunds || financialKPIs?.summary?.refunds_total || 0)}
                    subtitle="Refunded orders"
                    icon={<TrendingDown className="h-4 w-4" />}
                    variant="destructive"
                    isLoading={summaryLoading || kpisLoading}
                />
                <KPICard
                    title="Cash Payments"
                    value={formatCurrency(transactionSummary?.cashTotal || 0)}
                    subtitle="Cash revenue"
                    icon={<CreditCard className="h-4 w-4" />}
                    isLoading={summaryLoading}
                />
                <KPICard
                    title="Card Payments"
                    value={formatCurrency(transactionSummary?.cardTotal || 0)}
                    subtitle="Card revenue"
                    icon={<CreditCard className="h-4 w-4" />}
                    isLoading={summaryLoading}
                />
            </div>

            {/* Charts Row */}
            <div className="grid gap-4 lg:grid-cols-3">
                {/* Revenue Trend Chart */}
                <Card className="lg:col-span-2">
                    <CardHeader>
                        <CardTitle className="text-lg">Revenue Trend</CardTitle>
                        <CardDescription>Daily revenue over selected period</CardDescription>
                    </CardHeader>
                    <CardContent>
                        {salesLoading || !merchantId ? (
                            <Skeleton className="h-[300px] w-full" />
                        ) : !salesByDate || salesByDate.length === 0 ? (
                            <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                                No sales data available for selected period
                            </div>
                        ) : (
                            <ChartContainer config={salesChartConfig} className="h-[300px] w-full">
                                <AreaChart data={salesByDate} margin={{ left: 12, right: 12 }}>
                                    <CartesianGrid vertical={false} strokeDasharray="3 3" />
                                    <XAxis
                                        dataKey="date"
                                        tickLine={false}
                                        axisLine={false}
                                        tickMargin={8}
                                        tickFormatter={(value) => {
                                            const date = new Date(value)
                                            return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                                        }}
                                    />
                                    <YAxis
                                        tickLine={false}
                                        axisLine={false}
                                        tickFormatter={(value) => `$${value >= 1000 ? `${(value / 1000).toFixed(1)}k` : value}`}
                                    />
                                    <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
                                    <defs>
                                        <linearGradient id="fillRevenueAnalytics" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="var(--primary)" stopOpacity={0.8} />
                                            <stop offset="95%" stopColor="var(--primary)" stopOpacity={0.1} />
                                        </linearGradient>
                                    </defs>
                                    <Area
                                        dataKey="sales"
                                        type="monotone"
                                        fill="url(#fillRevenueAnalytics)"
                                        fillOpacity={0.4}
                                        stroke="var(--primary)"
                                        strokeWidth={2}
                                    />
                                </AreaChart>
                            </ChartContainer>
                        )}
                    </CardContent>
                </Card>

                {/* Order Type Breakdown */}
                <Card>
                    <CardHeader>
                        <CardTitle className="text-lg">Order Types</CardTitle>
                        <CardDescription>Distribution by order source</CardDescription>
                    </CardHeader>
                    <CardContent>
                        {isLoading ? (
                            <div className="h-[300px] flex items-center justify-center">
                                <Skeleton className="h-[200px] w-[200px] rounded-full" />
                            </div>
                        ) : orderTypeData.length === 0 ? (
                            <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                                No order data available
                            </div>
                        ) : (
                            <div className="h-[300px]">
                                <ChartContainer config={orderTypeConfig} className="h-full w-full">
                                    <PieChart>
                                        <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel />} />
                                        <Pie
                                            data={orderTypeData}
                                            dataKey="count"
                                            nameKey="type"
                                            innerRadius={50}
                                            strokeWidth={3}
                                            stroke='var(--primary)'
                                        >
                                            {orderTypeData.map((entry, index) => (
                                                <Cell key={`cell-${index}`} fill={entry.fill} />
                                            ))}
                                        </Pie>
                                    </PieChart>
                                </ChartContainer>
                                {/* Legend */}
                                <div className="flex flex-wrap justify-center gap-4 mt-4">
                                    {orderTypeData.map((item, index) => (
                                        <div key={index} className="flex items-center gap-2">
                                            <div
                                                className="w-3 h-3 rounded-full"
                                                style={{ backgroundColor: item.fill }}
                                            />
                                            <span className="text-sm capitalize">{item.type}: {item.count}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>

            {/* Payment Methods Chart */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-lg">Payment Methods</CardTitle>
                    <CardDescription>Revenue breakdown by payment type</CardDescription>
                </CardHeader>
                <CardContent>
                    {paymentsLoading || !merchantId ? (
                        <Skeleton className="h-[200px] w-full" />
                    ) : paymentData.length === 0 ? (
                        <div className="h-[200px] flex items-center justify-center text-muted-foreground">
                            No payment data available
                        </div>
                    ) : (
                        <ChartContainer config={paymentChartConfig} className="h-[200px] w-full">
                            <BarChart data={paymentData} layout="vertical" margin={{ left: 80, right: 30 }}>
                                <CartesianGrid horizontal={false} strokeDasharray="3 3" />
                                <XAxis
                                    type="number"
                                    tickLine={false}
                                    axisLine={false}
                                    tickFormatter={(value) => formatCurrency(value)}
                                />
                                <YAxis
                                    type="category"
                                    dataKey="method"
                                    tickLine={false}
                                    axisLine={false}
                                />
                                <ChartTooltip
                                    cursor={false}
                                    content={({ active, payload }) => {
                                        if (!active || !payload?.length) return null
                                        const data = payload[0].payload
                                        return (
                                            <div className="rounded-lg border bg-background p-2 shadow-sm">
                                                <div className="font-medium">{data.method}</div>
                                                <div className="text-sm text-muted-foreground">
                                                    {formatCurrency(data.amount)} ({data.count} transactions)
                                                </div>
                                            </div>
                                        )
                                    }}
                                />
                                <Bar dataKey="amount" fill="var(--primary)" radius={4} />
                            </BarChart>
                        </ChartContainer>
                    )}
                </CardContent>
            </Card>
        </div>
    )
}

// ============================================================================
// KPI CARD COMPONENT
// ============================================================================

interface KPICardProps {
    title: string
    value: string
    subtitle: string
    icon: React.ReactNode
    trend?: number
    variant?: 'default' | 'success' | 'destructive'
    isLoading?: boolean
}

function KPICard({ title, value, subtitle, icon, trend, variant = 'default', isLoading }: KPICardProps) {
    return (
        <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">{title}</CardTitle>
                <div className={`text-muted-foreground ${
                    variant === 'success' ? 'text-green-600' :
                    variant === 'destructive' ? 'text-red-600' :
                    ''
                }`}>
                    {icon}
                </div>
            </CardHeader>
            <CardContent>
                {isLoading ? (
                    <Skeleton className="h-8 w-24" />
                ) : (
                    <>
                        <div className={`text-2xl font-bold ${
                            variant === 'success' ? 'text-green-600' :
                            variant === 'destructive' ? 'text-red-600' :
                            ''
                        }`}>
                            {value}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
                        {trend !== undefined && (
                            <div className="flex items-center gap-1 mt-2">
                                {trend >= 0 ? (
                                    <TrendingUp className="h-3 w-3 text-green-600" />
                                ) : (
                                    <TrendingDown className="h-3 w-3 text-red-600" />
                                )}
                                <span className={`text-xs ${trend >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                    {trend >= 0 ? '+' : ''}{trend.toFixed(1)}%
                                </span>
                                <span className="text-xs text-muted-foreground">vs prev. period</span>
                            </div>
                        )}
                    </>
                )}
            </CardContent>
        </Card>
    )
}
