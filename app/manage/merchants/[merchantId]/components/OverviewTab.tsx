'use client'

import { useMemo } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
    DollarSign,
    ShoppingCart,
    Target,
    Activity,
    Clock,
    CreditCard,
    ArrowUpRight,
    ArrowDownRight,
    Loader2,
    Store,
    MapPin,
    User,
    Mail,
    Phone,
    TrendingUp,
    TrendingDown,
} from 'lucide-react'
import { MerchantDetails } from '@/types/merchant'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { formatPhoneForDisplay } from '@/lib/phone'
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart'
import { Area, AreaChart, Pie, PieChart, Cell, XAxis, YAxis, CartesianGrid } from 'recharts'
import {
    useAdminOrderAnalytics,
    useAdminFinancialKPIs,
    useAdminSalesByDate,
    useAdminRecentOrders,
    useAdminTransactionSummary
} from '@/lib/queries/use-admin-merchant'
import { format } from 'date-fns'

interface OverviewTabProps {
    merchantInfo: MerchantDetails
}

const chartConfig = {
    sales: {
        label: 'Sales',
        color: 'hsl(var(--chart-1))',
    },
    orders: {
        label: 'Orders',
        color: 'hsl(var(--chart-2))',
    },
    revenue: {
        label: 'Revenue',
        color: 'hsl(var(--chart-3))',
    },
}

export function OverviewTab({ merchantInfo }: OverviewTabProps) {
    const merchantId = merchantInfo.id

    // Business summary sourced from the canonical merchants columns (single source
    // of truth) — full details + editing live on the Business Info tab.
    const ownerName = [merchantInfo?.owner_first_name, merchantInfo?.owner_last_name]
        .filter(Boolean)
        .join(' ')
    const ownerPhone = merchantInfo?.owner_phone
        ? (formatPhoneForDisplay(merchantInfo.owner_phone) || merchantInfo.owner_phone)
        : 'Not provided'
    const locationSummary = [merchantInfo?.business_city, merchantInfo?.business_state]
        .filter(Boolean)
        .join(', ')

    // Fetch Analytics Data (Defaulting to last 30 days via hook defaults)
    const { data: orderAnalytics, isLoading: analyticsLoading } = useAdminOrderAnalytics(merchantId)
    const { data: financialKPIs, isLoading: kpisLoading } = useAdminFinancialKPIs(merchantId)
    const { data: salesByDate, isLoading: salesLoading } = useAdminSalesByDate(merchantId)
    const { data: recentOrders, isLoading: ordersLoading } = useAdminRecentOrders(merchantId)
    // "Today's Snapshot" tiles need an actual today range — the default hook
    // window is the last 30 days, which previously made these tiles show 30-day
    // figures under a "today" label.
    const { todayStart, todayEnd } = useMemo(() => {
        const start = new Date()
        start.setHours(0, 0, 0, 0)
        const end = new Date()
        end.setHours(23, 59, 59, 999)
        return { todayStart: start, todayEnd: end }
    }, [])
    const { data: todaySummary, isLoading: todayLoading } = useAdminTransactionSummary(
        merchantId,
        todayStart,
        todayEnd
    )

    const isLoading = analyticsLoading || kpisLoading || salesLoading || ordersLoading || todayLoading

    // Derivatives
    const totalRevenue = financialKPIs?.summary?.net_sales ?? orderAnalytics?.totalRevenue ?? 0
    const totalOrders = orderAnalytics?.totalOrders ?? 0
    const avgOrderValue = orderAnalytics?.avgOrderValue ?? 0
    const growth = orderAnalytics?.growthPercentage ?? 0

    // Sales Trend Data
    const salesTrendData = useMemo(() => {
        if (!salesByDate) return []
        return salesByDate.map(item => ({
            date: format(new Date(item.date), 'MMM d'),
            sales: item.sales,
            orders: item.orders
        }))
    }, [salesByDate])

    // Order Types for Pie Chart (Revenue by Category proxy)
    const orderTypeData = useMemo(() => {
        if (!orderAnalytics?.orderTypeBreakdown) return []
        const colors = ['hsl(var(--chart-1))', '#0C4FD1', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))', 'hsl(var(--chart-4))']
        return Object.entries(orderAnalytics.orderTypeBreakdown)
            .map(([type, value], index) => ({
                name: type === 'qr_dine_in' ? 'QR Table' : type.replace(/_/g, ' '),
                value,
                color: colors[index % colors.length]
            }))
            .filter(i => i.value > 0)
    }, [orderAnalytics])

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-96">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
        )
    }

    return (
        <div className="space-y-4">
            {/* Main KPIs */}
            <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium min-w-0 mr-2">Net Sales (30d)</CardTitle>
                        <DollarSign className="h-4 w-4 text-muted-foreground shrink-0" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">${totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                        {growth !== 0 && (
                            <p className="text-xs text-muted-foreground flex items-center gap-1 flex-wrap">
                                {growth > 0 ? <ArrowUpRight className="h-3 w-3 text-green-600" /> : <ArrowDownRight className="h-3 w-3 text-red-600" />}
                                <span className={growth > 0 ? "text-green-600" : "text-red-600"}>{growth > 0 ? '+' : ''}{growth.toFixed(1)}%</span> from previous
                            </p>
                        )}
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium min-w-0 mr-2">Total Orders (30d)</CardTitle>
                        <ShoppingCart className="h-4 w-4 text-muted-foreground shrink-0" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{totalOrders.toLocaleString()}</div>
                        <p className="text-xs text-muted-foreground">Captured orders</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium min-w-0 mr-2">Avg. Order Value</CardTitle>
                        <Target className="h-4 w-4 text-muted-foreground shrink-0" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">${avgOrderValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                         <p className="text-xs text-muted-foreground">Per transaction</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium min-w-0 mr-2">Refunds (30d)</CardTitle>
                        <TrendingDown className="h-4 w-4 text-muted-foreground shrink-0" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-red-600">${(financialKPIs?.summary?.refunds_total || 0).toLocaleString()}</div>
                        <p className="text-xs text-muted-foreground">Total refunded</p>
                    </CardContent>
                </Card>
            </div>

            {/* Additional KPIs - Today's Snapshot */}
            <div className="grid gap-4 grid-cols-2 lg:grid-cols-3">
                 <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium min-w-0 mr-2">Revenue Today</CardTitle>
                        <Activity className="h-4 w-4 text-muted-foreground shrink-0" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">${(todaySummary?.netSales || 0).toLocaleString()}</div>
                         <p className="text-xs text-muted-foreground">Net sales for today</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium min-w-0 mr-2">Tips Collected</CardTitle>
                        <TrendingUp className="h-4 w-4 text-muted-foreground shrink-0" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">${(todaySummary?.totalTips || 0).toLocaleString()}</div>
                        <p className="text-xs text-muted-foreground">Tips for today</p>
                    </CardContent>
                </Card>
                <Card>
                     <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium min-w-0 mr-2">Tax Collected</CardTitle>
                        <DollarSign className="h-4 w-4 text-muted-foreground shrink-0" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">${(todaySummary?.totalTax || 0).toLocaleString()}</div>
                        <p className="text-xs text-muted-foreground">Tax for today</p>
                    </CardContent>
                </Card>
            </div>

            {/* Charts Section */}
            <div className="grid gap-4 md:grid-cols-2">
                {/* Sales Trend Chart */}
                <Card>
                    <CardHeader>
                        <CardTitle>Sales Trend (30 Days)</CardTitle>
                        <CardDescription>Daily sales performance</CardDescription>
                    </CardHeader>
                    <CardContent>
                        {salesTrendData.length > 0 ? (
                            <ChartContainer config={chartConfig} className="h-75 w-full">
                                <AreaChart data={salesTrendData}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                    <XAxis dataKey="date" tickLine={false} axisLine={false} tickMargin={8} minTickGap={32} />
                                    <YAxis tickLine={false} axisLine={false} tickFormatter={(val) => `$${val}`} />
                                    <ChartTooltip content={<ChartTooltipContent />} />
                                    <Area
                                        type="monotone"
                                        dataKey="sales"
                                        stroke="var(--primary)"
                                        fill="var(--primary)"
                                        fillOpacity={0.2}
                                    />
                                </AreaChart>
                            </ChartContainer>
                        ) : (
                            <div className="flex items-center justify-center h-75 text-muted-foreground">No data available</div>
                        )}
                    </CardContent>
                </Card>

                {/* Order Types */}
                <Card>
                    <CardHeader>
                        <CardTitle>Order Sources</CardTitle>
                        <CardDescription>Distribution by order type</CardDescription>
                    </CardHeader>
                    <CardContent>
                        {orderTypeData.length > 0 ? (
                             <ChartContainer config={chartConfig} className="h-75 w-full">
                                <PieChart>
                                    <Pie
                                        data={orderTypeData}
                                        cx="50%"
                                        cy="50%"
                                        innerRadius={60}
                                        outerRadius={80}
                                        paddingAngle={5}
                                        dataKey="value"
                                    >
                                        {orderTypeData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={entry.color} />
                                        ))}
                                    </Pie>
                                    <ChartTooltip content={<ChartTooltipContent />} />
                                </PieChart>
                            </ChartContainer>
                        ) : (
                             <div className="flex items-center justify-center h-75 text-muted-foreground">No data available</div>
                        )}
                        <div className="flex flex-wrap justify-center gap-4 mt-4">
                            {orderTypeData.map((type) => (
                                <div key={type.name} className="flex items-center gap-2">
                                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: type.color }} />
                                    <span className="text-sm capitalize">{type.name} ({type.value})</span>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Bottom Section: Business Info and Recent Activity */}
            <div className="grid gap-4 md:grid-cols-2">
                {/* Business Information — compact summary; full details + editing on the Business Info tab */}
                <Card>
                    <CardHeader>
                        <div className="flex items-start justify-between gap-2">
                            <div>
                                <CardTitle className="text-lg">Business Information</CardTitle>
                                <CardDescription>Merchant business details and contact</CardDescription>
                            </div>
                            <Button variant="ghost" size="sm" asChild className="shrink-0">
                                <Link href={`/manage/merchants/${merchantId}?tab=business-info`}>
                                    Manage
                                    <ArrowUpRight className="h-4 w-4 ml-1" />
                                </Link>
                            </Button>
                        </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="flex items-center gap-3">
                            <Store className="h-4 w-4 text-muted-foreground" />
                            <div className="min-w-0">
                                <div className="font-medium">Business</div>
                                <div className="text-sm text-muted-foreground truncate">
                                    {merchantInfo?.business_legal_name || merchantInfo?.dba_name || merchantInfo?.name || 'Not provided'}
                                    {merchantInfo?.business_type ? ` · ${merchantInfo.business_type}` : ''}
                                </div>
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            <User className="h-4 w-4 text-muted-foreground" />
                            <div className="min-w-0">
                                <div className="font-medium">Owner</div>
                                <div className="text-sm text-muted-foreground">{ownerName || 'Not provided'}</div>
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            <Mail className="h-4 w-4 text-muted-foreground" />
                            <div className="min-w-0">
                                <div className="font-medium">Email</div>
                                <div className="text-sm text-muted-foreground break-all">{merchantInfo?.owner_email || 'Not provided'}</div>
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            <Phone className="h-4 w-4 text-muted-foreground" />
                            <div className="min-w-0">
                                <div className="font-medium">Phone</div>
                                <div className="text-sm text-muted-foreground">{ownerPhone}</div>
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            <MapPin className="h-4 w-4 text-muted-foreground" />
                            <div className="min-w-0">
                                <div className="font-medium">Location</div>
                                <div className="text-sm text-muted-foreground">{locationSummary || 'Not provided'}</div>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Recent Activity */}
                <Card>
                    <CardHeader>
                        <CardTitle className="text-lg">Recent Orders</CardTitle>
                        <CardDescription>Latest transactions</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-4">
                            {recentOrders && recentOrders.length > 0 ? recentOrders.map((order: any) => (
                                <div key={order.id} className="flex items-center justify-between border-b pb-3 last:border-0 last:pb-0">
                                    <div className="flex items-center gap-3">
                                        <div className="h-8 w-8 rounded-full flex items-center justify-center bg-blue-100 text-blue-600">
                                            <ShoppingCart className="h-4 w-4" />
                                        </div>
                                        <div>
                                            <div className="font-medium text-sm">Order #{order.order_number}</div>
                                            <div className="text-xs text-muted-foreground flex items-center gap-1">
                                                <Clock className="h-3 w-3" />
                                                {format(new Date(order.created_at), 'MMM d, h:mm a')}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="font-medium">${Number(order.total_amount).toFixed(2)}</div>
                                </div>
                            )) : (
                                <p className="text-muted-foreground text-sm">No recent orders found.</p>
                            )}
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    )
}
