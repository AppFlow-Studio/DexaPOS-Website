'use client'

import { useMemo } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useOrderAnalytics, useOrderStats } from '@/app/dashboard/hooks/useOrderAnalytics'
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart'
import { LineChart, Line, XAxis, YAxis, CartesianGrid } from 'recharts'
import { TrendingUp, DollarSign, ShoppingCart } from 'lucide-react'

interface AnalyticsTabProps {
    merchantId?: string
    locationId?: string | null
}

export function AnalyticsTab({ merchantId, locationId }: AnalyticsTabProps) {
    // Date ranges for analytics
    const today = useMemo(() => new Date(), [])
    const last30Days = useMemo(() => {
        const date = new Date()
        date.setDate(date.getDate() - 30)
        date.setHours(0, 0, 0, 0)
        return date
    }, [])

    const last60Days = useMemo(() => {
        const date = new Date()
        date.setDate(date.getDate() - 60)
        date.setHours(0, 0, 0, 0)
        return date
    }, [])

    // Fetch analytics data
    const { data: analytics30Days, isLoading: analyticsLoading } = useOrderAnalytics(last30Days, today)
    const { data: analytics60Days } = useOrderAnalytics(last60Days, today)
    const { data: stats30Days } = useOrderStats(last30Days, today)

    // Calculate growth
    const growth = useMemo(() => {
        if (!analytics30Days || !analytics60Days) return 0

        const currentPeriod = analytics30Days.salesByDate.reduce((sum, item) => sum + item.sales, 0)
        const previousPeriodStart = new Date(last60Days)
        const previousPeriodEnd = last30Days
        const previousPeriod = analytics60Days.salesByDate
            .filter(item => {
                const itemDate = new Date(item.date)
                return itemDate >= previousPeriodStart && itemDate < previousPeriodEnd
            })
            .reduce((sum, item) => sum + item.sales, 0)

        if (previousPeriod === 0) return currentPeriod > 0 ? 100 : 0
        return ((currentPeriod - previousPeriod) / previousPeriod) * 100
    }, [analytics30Days, analytics60Days, last30Days, last60Days])

    // Prepare chart data
    const salesChartData = useMemo(() => {
        if (!analytics30Days?.salesByDate) return []
        return analytics30Days.salesByDate.map(item => ({
            date: new Date(item.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
            sales: item.sales,
        }))
    }, [analytics30Days])

    const chartConfig = {
        sales: {
            label: 'Sales',
            color: 'var(--chart-1)',
        },
    } satisfies ChartConfig

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD',
        }).format(amount)
    }

    const totalSales = analytics30Days?.salesByDate?.reduce((sum, item) => sum + item.sales, 0) || 0
    const totalOrders = stats30Days?.totalOrders || 0
    const avgOrderValue = totalOrders > 0 ? totalSales / totalOrders : 0

    return (
        <div className="space-y-6">
            {/* KPI Cards */}
            <div className="grid gap-4 md:grid-cols-3">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Sales Performance</CardTitle>
                        <DollarSign className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        {analyticsLoading ? (
                            <Skeleton className="h-8 w-24" />
                        ) : (
                            <>
                                <div className="text-2xl font-bold">{formatCurrency(totalSales)}</div>
                                <p className="text-xs text-muted-foreground mt-1">
                                    Last 30 days
                                </p>
                                <div className="flex items-center gap-1 mt-2">
                                    <TrendingUp className="h-3 w-3 text-green-600" />
                                    <span className={growth > 0 ? "text-green-600" : "text-red-600"} style={{ fontSize: '0.75rem' }}>
                                        {growth > 0 ? '+' : ''}{growth.toFixed(1)}%
                                    </span>
                                    <span className="text-xs text-muted-foreground">vs previous period</span>
                                </div>
                            </>
                        )}
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Orders</CardTitle>
                        <ShoppingCart className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        {analyticsLoading ? (
                            <Skeleton className="h-8 w-16" />
                        ) : (
                            <>
                                <div className="text-2xl font-bold">{totalOrders}</div>
                                <p className="text-xs text-muted-foreground mt-1">
                                    Last 30 days
                                </p>
                            </>
                        )}
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Avg. Order Value</CardTitle>
                        <TrendingUp className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        {analyticsLoading ? (
                            <Skeleton className="h-8 w-20" />
                        ) : (
                            <>
                                <div className="text-2xl font-bold">{formatCurrency(avgOrderValue)}</div>
                                <p className="text-xs text-muted-foreground mt-1">
                                    Per order
                                </p>
                            </>
                        )}
                    </CardContent>
                </Card>
            </div>

            {/* Sales Trend Chart */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-lg">Sales Trend</CardTitle>
                    <CardDescription>Daily sales performance over the last 30 days</CardDescription>
                </CardHeader>
                <CardContent>
                    {analyticsLoading ? (
                        <Skeleton className="h-[300px] w-full" />
                    ) : salesChartData.length > 0 ? (
                        <div className="h-[300px]">
                            <ChartContainer config={chartConfig}>
                                <LineChart
                                    accessibilityLayer
                                    data={salesChartData}
                                    margin={{
                                        left: 12,
                                        right: 12,
                                        top: 12,
                                        bottom: 12,
                                    }}
                                >
                                    <CartesianGrid vertical={false} strokeDasharray="3 3" />
                                    <XAxis
                                        dataKey="date"
                                        tickLine={false}
                                        axisLine={false}
                                        tickMargin={8}
                                        tick={{ fontSize: 12 }}
                                        angle={-45}
                                        textAnchor="end"
                                        height={60}
                                    />
                                    <YAxis
                                        tickLine={false}
                                        axisLine={false}
                                        tickMargin={8}
                                        tick={{ fontSize: 12 }}
                                        tickFormatter={(value) => `$${value.toFixed(0)}`}
                                    />
                                    <ChartTooltip
                                        cursor={false}
                                        content={<ChartTooltipContent hideLabel />}
                                    />
                                    <Line
                                        dataKey="sales"
                                        type="natural"
                                        stroke="var(--color-sales)"
                                        strokeWidth={2}
                                        dot={false}
                                    />
                                </LineChart>
                            </ChartContainer>
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center py-12 text-center">
                            <p className="text-sm text-muted-foreground">No sales data available</p>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    )
}
