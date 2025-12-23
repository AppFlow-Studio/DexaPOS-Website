'use client'

import { useMemo, useState } from 'react'
import { useIsAllLocations, useSelectedLocation } from '@/stores/location-store'
import { useOrderAnalytics } from '../../hooks/useOrderAnalytics'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import {
    DollarSign,
    ShoppingBag,
    TrendingUp,
    MapPin,
    Globe,
    Maximize2,
    RefreshCw,
    Settings,
} from 'lucide-react'
import { DateRangePicker, DatePreset } from '@/components/dashboard/orders/DateRangePicker'
import { ChartContainer, ChartTooltip, ChartTooltipContent, ChartLegend, ChartLegendContent, type ChartConfig } from '@/components/ui/chart'
import { LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid } from 'recharts'
import { Empty } from '@/components/ui/empty'

// Chart configuration
const chartConfig = {
    sales: {
        label: 'Sales',
        color: 'var(--chart-1)',
    },
    orders: {
        label: 'Orders',
        color: 'var(--chart-2)',
    },
    previous: {
        label: 'Previous Period',
        color: 'hsl(var(--muted-foreground))',
    },
    aov: {
        label: 'Average Order Value',
        color: 'var(--chart-1)',
    },
} satisfies ChartConfig

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8']

export default function AnalyticsPage() {
    const selectedLocation = useSelectedLocation()
    const isAllLocations = useIsAllLocations()

    // Date range state
    const [preset, setPreset] = useState<DatePreset>('last_7_days')
    const [dateFrom, setDateFrom] = useState<Date>(() => {
        const date = new Date()
        date.setDate(date.getDate() - 7)
        return date
    })
    const [dateTo, setDateTo] = useState<Date>(new Date())
    const [comparePrevious, setComparePrevious] = useState(false)
    const [autoRefresh, setAutoRefresh] = useState(false)

    const handleDateRangeChange = (from: Date | null, to: Date | null) => {
        if (from && to) {
            setDateFrom(from)
            setDateTo(to)
        }
    }

    const { data: analytics, isLoading } = useOrderAnalytics(dateFrom, dateTo)

    // Calculate previous period dates for comparison
    const previousPeriodData = useMemo(() => {
        if (!analytics?.salesByDate || !comparePrevious) return []

        const periodDays = Math.ceil((dateTo.getTime() - dateFrom.getTime()) / (1000 * 60 * 60 * 24))
        const previousDateFrom = new Date(dateFrom)
        previousDateFrom.setDate(previousDateFrom.getDate() - periodDays)
        const previousDateTo = new Date(dateFrom)

        // Create a map of previous period sales by date
        const previousMap = new Map<string, number>()
        analytics.salesByDate.forEach((item, index) => {
            const prevIndex = index - periodDays
            if (prevIndex >= 0 && prevIndex < analytics.salesByDate.length) {
                previousMap.set(item.date, analytics.salesByDate[prevIndex]?.sales || 0)
            }
        })

        return Array.from(previousMap.entries()).map(([date, sales]) => ({
            date,
            sales,
            orders: 0, // We don't have previous period orders in the current data structure
        }))
    }, [analytics?.salesByDate, comparePrevious, dateFrom, dateTo])

    // Prepare chart data with comparison
    const chartData = useMemo(() => {
        if (!analytics?.salesByDate) return []

        return analytics.salesByDate.map((item) => {
            const previousItem = previousPeriodData.find(p => p.date === item.date)
            return {
                date: new Date(item.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
                sales: item.sales,
                orders: item.orders,
                previousSales: previousItem?.sales || 0,
            }
        })
    }, [analytics?.salesByDate, previousPeriodData])

    // Order type breakdown for pie chart
    const orderTypeData = useMemo(() => {
        if (!analytics?.orderTypeBreakdown) return []

        const breakdown = analytics.orderTypeBreakdown
        return [
            { name: 'Dine In', value: breakdown.dine_in },
            { name: 'Takeout', value: breakdown.takeout },
            { name: 'Delivery', value: breakdown.delivery },
            { name: 'Online', value: breakdown.online },
            { name: 'Catering', value: breakdown.catering },
        ].filter(item => item.value > 0)
    }, [analytics?.orderTypeBreakdown])

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD',
        }).format(amount)
    }

    return (
        <main className="space-y-6 animate-in fade-in duration-500">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="space-y-1">
                    <div className="flex items-center gap-2">
                        <h1 className="text-2xl font-bold tracking-tight">Analytics</h1>
                        {isAllLocations ? (
                            <Badge variant="outline" className="gap-1">
                                <Globe className="h-3 w-3" />
                                All Locations
                            </Badge>
                        ) : (
                            <Badge variant="outline" className="gap-1">
                                <MapPin className="h-3 w-3" />
                                {selectedLocation?.name}
                            </Badge>
                        )}
                    </div>
                    <p className="text-muted-foreground">
                        View detailed analytics and insights for your orders
                    </p>
                </div>
            </div>

            {/* Controls */}
            <div className="flex items-center justify-between gap-4">
                <DateRangePicker
                    dateFrom={dateFrom}
                    dateTo={dateTo}
                    onDateRangeChange={handleDateRangeChange}
                    preset={preset}
                    onPresetChange={setPreset}
                />

                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                        <Switch
                            id="compare"
                            checked={comparePrevious}
                            onCheckedChange={setComparePrevious}
                        />
                        <Label htmlFor="compare" className="text-sm">
                            Compare: Previous period
                        </Label>
                    </div>

                    <div className="flex items-center gap-2">
                        <Switch
                            id="auto-refresh"
                            checked={autoRefresh}
                            onCheckedChange={setAutoRefresh}
                        />
                        <Label htmlFor="auto-refresh" className="text-sm">
                            Auto-refresh
                        </Label>
                    </div>

                    <Button variant="outline" size="icon">
                        <Settings className="h-4 w-4" />
                    </Button>
                </div>
            </div>

            {/* KPI Cards Grid */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {/* Total Sales */}
                <Card className="transition-all hover:shadow-md h-full">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total sales</CardTitle>
                        <DollarSign className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent className="h-full">
                        {isLoading ? (
                            <Skeleton className="h-8 w-20" />
                        ) : (
                            <div className="text-2xl font-bold">
                                {formatCurrency(
                                    analytics?.salesByDate?.reduce((sum, item) => sum + item.sales, 0) || 0
                                )}
                            </div>
                        )}
                        {!isLoading && analytics?.salesByDate && chartData.length > 0 && (
                            <div className="mt-4">
                                <ChartContainer config={chartConfig}>
                                    <LineChart
                                        accessibilityLayer
                                        data={chartData}
                                        margin={{
                                            left: 0,
                                            right: 0,
                                            top: 0,
                                            bottom: 0,
                                        }}
                                    >
                                        <CartesianGrid vertical={false} strokeDasharray="3 3" />
                                        <XAxis
                                            dataKey="date"
                                            tickLine={false}
                                            axisLine={false}
                                            tickMargin={4}
                                            tick={{ fontSize: 11 }}
                                        />
                                        <YAxis
                                            tickLine={false}
                                            axisLine={false}
                                            tickMargin={4}
                                            tick={{ fontSize: 11 }}
                                            tickFormatter={(value) => `$${value.toFixed(0)}`}
                                            width={40}
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
                                        {comparePrevious && (
                                            <Line
                                                dataKey="previousSales"
                                                type="natural"
                                                stroke="hsl(var(--muted-foreground))"
                                                strokeWidth={2}
                                                strokeDasharray="5 5"
                                                dot={false}
                                            />
                                        )}
                                    </LineChart>
                                </ChartContainer>
                            </div>
                        )}
                        {comparePrevious && (
                            <div className="mt-2 flex items-center gap-2 text-xs">
                                <div className="h-2 w-2 rounded-full bg-[var(--color-sales)]" />
                                <span className="text-muted-foreground">
                                    {dateFrom.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - {dateTo.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                </span>
                                <div className="h-2 w-2 rounded-full border border-dashed border-muted-foreground" />
                                <span className="text-muted-foreground">Previous period</span>
                            </div>
                        )}
                        {!comparePrevious && (
                            <p className="text-xs text-muted-foreground mt-2 flex items-center gap-2 flex-row">
                                <div className="h-1 w-4 rounded-full bg-[var(--chart-1)]" />

                                {dateFrom.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - {dateTo.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                            </p>
                        )}
                    </CardContent>
                </Card>

                {/* Sales by Channel */}
                <Card className="transition-all hover:shadow-md">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Sales by channel</CardTitle>
                        <ShoppingBag className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        {isLoading ? (
                            <Skeleton className="h-8 w-20" />
                        ) : orderTypeData.length === 0 ? (
                            <div className="text-2xl font-bold text-center py-8">
                                {formatCurrency(0)}
                            </div>
                        ) : (
                            <>
                                <div className="text-2xl font-bold mb-2 text-center">
                                    {orderTypeData[0]?.name || 'N/A'} {formatCurrency(
                                        orderTypeData.reduce((sum, item) => sum + item.value, 0) *
                                        (analytics?.avgOrderValue || 0)
                                    )}
                                </div>
                                <div className="h-[100px]">
                                    <ChartContainer config={chartConfig}>
                                        <PieChart>
                                            <Pie
                                                data={orderTypeData}
                                                cx="50%"
                                                cy="50%"
                                                labelLine={false}
                                                label={false}
                                                outerRadius={35}
                                                fill="#8884d8"
                                                dataKey="value"
                                            >
                                                {orderTypeData.map((entry, index) => (
                                                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                                ))}
                                            </Pie>
                                            <ChartTooltip
                                                cursor={false}
                                                content={<ChartTooltipContent hideLabel />}
                                            />
                                        </PieChart>
                                    </ChartContainer>
                                </div>
                                <div className="mt-2 space-y-1">
                                    {orderTypeData.map((item, index) => (
                                        <div key={index} className="flex items-center justify-between text-xs">
                                            <div className="flex items-center gap-2">
                                                <div
                                                    className="h-2 w-2 rounded-full"
                                                    style={{ backgroundColor: COLORS[index % COLORS.length] }}
                                                />
                                                <span className="text-muted-foreground">{item.name}</span>
                                            </div>
                                            <span className="font-medium">
                                                {((item.value / orderTypeData.reduce((sum, i) => sum + i.value, 0)) * 100).toFixed(0)}%
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </>
                        )}
                    </CardContent>
                </Card>

                {/* Total Orders */}
                <Card className="transition-all hover:shadow-md">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total orders</CardTitle>
                        <ShoppingBag className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        {isLoading ? (
                            <Skeleton className="h-8 w-16" />
                        ) : (
                            <div className="text-2xl font-bold">{analytics?.totalOrders || 0}</div>
                        )}
                        {!isLoading && analytics?.salesByDate && chartData.length > 0 && (
                            <div className="mt-4">
                                <ChartContainer config={chartConfig}>
                                    <LineChart
                                        accessibilityLayer
                                        data={chartData}
                                        margin={{
                                            left: 0,
                                            right: 0,
                                            top: 0,
                                            bottom: 0,
                                        }}
                                    >
                                        <CartesianGrid vertical={false} strokeDasharray="3 3" />
                                        <XAxis
                                            dataKey="date"
                                            tickLine={false}
                                            axisLine={false}
                                            tickMargin={4}
                                            tick={{ fontSize: 11 }}
                                        />
                                        <YAxis
                                            tickLine={false}
                                            axisLine={false}
                                            tickMargin={4}
                                            tick={{ fontSize: 11 }}
                                            width={30}
                                        />
                                        <ChartTooltip
                                            cursor={false}
                                            content={<ChartTooltipContent hideLabel />}
                                        />
                                        <Line
                                            dataKey="orders"
                                            type="natural"
                                            stroke="var(--color-orders)"
                                            strokeWidth={2}
                                            dot={false}
                                        />
                                    </LineChart>
                                </ChartContainer>
                            </div>
                        )}
                        <p className="text-xs text-muted-foreground mt-2 flex items-center gap-2 flex-row">
                            <div className="h-1 w-4 rounded-full bg-[var(--chart-1)]" />

                            {dateFrom.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - {dateTo.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </p>
                    </CardContent>
                </Card>

                {/* Average Order Value */}
                <Card className="transition-all hover:shadow-md">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Average order value</CardTitle>
                        <TrendingUp className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        {isLoading ? (
                            <Skeleton className="h-8 w-20" />
                        ) : (
                            <div className="text-2xl font-bold">
                                {formatCurrency(analytics?.avgOrderValue || 0)}
                            </div>
                        )}
                        {!isLoading && analytics?.salesByDate && chartData.length > 0 && (
                            <div className="mt-4">
                                <ChartContainer config={chartConfig}>
                                    <LineChart
                                        accessibilityLayer
                                        data={chartData.map(item => ({
                                            ...item,
                                            aov: item.orders > 0 ? item.sales / item.orders : 0,
                                        }))}
                                        margin={{
                                            left: 0,
                                            right: 0,
                                            top: 0,
                                            bottom: 0,
                                        }}
                                    >
                                        <CartesianGrid vertical={false} strokeDasharray="3 3" />
                                        <XAxis
                                            dataKey="date"
                                            tickLine={false}
                                            axisLine={false}
                                            tickMargin={4}
                                            tick={{ fontSize: 11 }}
                                        />
                                        <YAxis
                                            tickLine={false}
                                            axisLine={false}
                                            tickMargin={4}
                                            tick={{ fontSize: 11 }}
                                            tickFormatter={(value) => `$${value.toFixed(0)}`}
                                            width={40}
                                        />
                                        <ChartTooltip
                                            cursor={false}
                                            content={<ChartTooltipContent hideLabel />}
                                        />
                                        <Line
                                            dataKey="aov"
                                            type="natural"
                                            stroke="var(--color-aov)"
                                            strokeWidth={2}
                                            dot={false}
                                        />
                                    </LineChart>
                                </ChartContainer>
                            </div>
                        )}
                        <p className="text-xs text-muted-foreground mt-2">
                            <div className="flex items-center gap-2 flex-row">
                                <div className="h-1 w-4 rounded-full bg-[var(--chart-1)]" />
                                {dateFrom.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - {dateTo.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                            </div>
                        </p>
                    </CardContent>
                </Card>

                {/* Sales Today */}
                <Card className="transition-all hover:shadow-md">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Sales Today</CardTitle>
                        <DollarSign className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        {isLoading ? (
                            <Skeleton className="h-8 w-20" />
                        ) : (
                            <div className="text-2xl font-bold">
                                {formatCurrency(analytics?.salesToday || 0)}
                            </div>
                        )}
                        <p className="text-xs text-muted-foreground mt-2">Today</p>
                    </CardContent>
                </Card>

                {/* Sales This Week */}
                <Card className="transition-all hover:shadow-md">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Sales This Week</CardTitle>
                        <TrendingUp className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        {isLoading ? (
                            <Skeleton className="h-8 w-20" />
                        ) : (
                            <div className="text-2xl font-bold">
                                {formatCurrency(analytics?.salesThisWeek || 0)}
                            </div>
                        )}
                        <p className="text-xs text-muted-foreground mt-2">Last 7 days</p>
                    </CardContent>
                </Card>
            </div>

            {/* Best Selling Items */}
            {analytics?.bestSellingItems && analytics.bestSellingItems.length > 0 && (
                <Card>
                    <CardHeader>
                        <CardTitle>Best Selling Items</CardTitle>
                        <CardDescription>Top items by revenue in the selected period</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-2">
                            {analytics.bestSellingItems.slice(0, 10).map((item, index) => (
                                <div key={index} className="flex items-center justify-between p-2 rounded-lg border">
                                    <div className="flex items-center gap-2">
                                        <Badge variant="outline">{index + 1}</Badge>
                                        <span className="font-medium">{item.item_name}</span>
                                    </div>
                                    <div className="flex items-center gap-4">
                                        <span className="text-sm text-muted-foreground">
                                            {item.quantity} sold
                                        </span>
                                        <span className="font-semibold">
                                            {formatCurrency(item.revenue)}
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            )}
        </main>
    )
}

