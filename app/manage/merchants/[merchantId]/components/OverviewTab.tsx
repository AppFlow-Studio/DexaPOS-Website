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

    // Fetch Analytics Data (Defaulting to last 30 days via hook defaults)
    const { data: orderAnalytics, isLoading: analyticsLoading } = useAdminOrderAnalytics(merchantId)
    const { data: financialKPIs, isLoading: kpisLoading } = useAdminFinancialKPIs(merchantId)
    const { data: salesByDate, isLoading: salesLoading } = useAdminSalesByDate(merchantId)
    const { data: recentOrders, isLoading: ordersLoading } = useAdminRecentOrders(merchantId)
    const { data: transactionSummary, isLoading: summaryLoading } = useAdminTransactionSummary(merchantId)

    const isLoading = analyticsLoading || kpisLoading || salesLoading || ordersLoading || summaryLoading

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
        const colors = ['hsl(var(--chart-1))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))', 'hsl(var(--chart-4))']
        return Object.entries(orderAnalytics.orderTypeBreakdown)
            .map(([type, value], index) => ({
                name: type.replace('_', ' '),
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
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Net Sales (30d)</CardTitle>
                        <DollarSign className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">${totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                        {growth !== 0 && (
                            <p className="text-xs text-muted-foreground flex items-center gap-1">
                                {growth > 0 ? <ArrowUpRight className="h-3 w-3 text-green-600" /> : <ArrowDownRight className="h-3 w-3 text-red-600" />}
                                <span className={growth > 0 ? "text-green-600" : "text-red-600"}>{growth > 0 ? '+' : ''}{growth.toFixed(1)}%</span> from previous
                            </p>
                        )}
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Orders (30d)</CardTitle>
                        <ShoppingCart className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{totalOrders.toLocaleString()}</div>
                        <p className="text-xs text-muted-foreground">Captured orders</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Avg. Order Value</CardTitle>
                        <Target className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">${avgOrderValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                         <p className="text-xs text-muted-foreground">Per transaction</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Refunds (30d)</CardTitle>
                        <TrendingDown className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-red-600">${(financialKPIs?.summary?.refunds_total || 0).toLocaleString()}</div>
                        <p className="text-xs text-muted-foreground">Total refunded</p>
                    </CardContent>
                </Card>
            </div>

            {/* Additional KPIs - Today's Snapshot */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                 <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Revenue Today</CardTitle>
                        <Activity className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">${(transactionSummary?.netSales || 0).toLocaleString()}</div>
                         <p className="text-xs text-muted-foreground">Net sales for today</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Tips Collected</CardTitle>
                        <TrendingUp className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">${(transactionSummary?.totalTips || 0).toLocaleString()}</div>
                        <p className="text-xs text-muted-foreground">Tips for today</p>
                    </CardContent>
                </Card>
                <Card>
                     <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Tax Collected</CardTitle>
                        <DollarSign className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">${(transactionSummary?.totalTax || 0).toLocaleString()}</div>
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
                            <ChartContainer config={chartConfig} className="h-[300px] w-full">
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
                            <div className="flex items-center justify-center h-[300px] text-muted-foreground">No data available</div>
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
                             <ChartContainer config={chartConfig} className="h-[300px] w-full">
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
                             <div className="flex items-center justify-center h-[300px] text-muted-foreground">No data available</div>
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
                {/* Business Information */}
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
                                    {(merchantInfo?.public_metadata as any)?.merchant_type || 'Not specified'}
                                </div>
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            <MapPin className="h-4 w-4 text-muted-foreground" />
                            <div>
                                <div className="font-medium">Address</div>
                                <div className="text-sm text-muted-foreground">{(merchantInfo?.public_metadata?.business_address as string) || 'Not specified'}</div>
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            <User className="h-4 w-4 text-muted-foreground" />
                            <div>
                                <div className="font-medium">Owner</div>
                                <div className="text-sm text-muted-foreground">{(merchantInfo?.public_metadata?.owner_name as string) || 'Not specified'}</div>
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            <Mail className="h-4 w-4 text-muted-foreground" />
                            <div>
                                <div className="font-medium">Email</div>
                                <div className="text-sm text-muted-foreground">{(merchantInfo?.public_metadata?.owner_email as string) || 'Not specified'}</div>
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            <Phone className="h-4 w-4 text-muted-foreground" />
                            <div>
                                <div className="font-medium">Phone</div>
                                <div className="text-sm text-muted-foreground">{(merchantInfo?.public_metadata?.owner_phone as string) || 'Not specified'}</div>
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