'use client'

import { useMemo } from 'react'
import { Panel, PanelGrid } from '@/components/dashboard/shell/Panel'
import { PanelSection } from '@/components/dashboard/shell/PanelSection'
import { StatRow, StatTile } from '@/components/dashboard/shell/StatTile'
import { Skeleton } from '@/components/ui/skeleton'
import {
    DollarSign,
    ShoppingCart,
    Target,
    Activity,
    Clock,
    CreditCard,
    ArrowUpRight,
    ArrowDownRight,
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
        // Purple and yellow, alternating. Written as literal `oklch()` because
        // the `--chart-*` tokens are already `oklch(...)` — wrapping one in
        // `hsl()` yields invalid CSS and Recharts falls back to black (C2).
        const colors = ['oklch(0.5854 0.2041 293.5)', 'oklch(0.7900 0.1580 85.0)']
        // Filter BEFORE indexing: colouring first and filtering after lets an
        // empty order type consume a colour, so two visible slices could land
        // on the same one (`0` and `2` both map to purple).
        return Object.entries(orderAnalytics.orderTypeBreakdown)
            .filter(([, value]) => Number(value) > 0)
            .map(([type, value], index) => ({
                name: type === 'qr_dine_in' ? 'QR Table' : type.replace(/_/g, ' '),
                value,
                color: colors[index % colors.length]
            }))
    }, [orderAnalytics])

    // Mirrors the loaded layout below — two stat sections (4 then 3 tiles) over
    // a two-up chart row — so the tab does not reflow when data arrives. A
    // centred spinner promised none of that shape and shifted the whole page.
    if (isLoading) {
        return (
            <div className="space-y-6">
                <Panel>
                    <PanelSection label="Last 30 days">
                        <StatRow columns={4} className="mt-6">
                            {Array.from({ length: 4 }).map((_, i) => (
                                <StatTile key={i} isLoading label={<Skeleton className="h-3.5 w-24" />} value={null} />
                            ))}
                        </StatRow>
                    </PanelSection>

                    <PanelSection label="Today" divider>
                        <StatRow columns={3} className="mt-6">
                            {Array.from({ length: 3 }).map((_, i) => (
                                <StatTile key={i} isLoading label={<Skeleton className="h-3.5 w-24" />} value={null} />
                            ))}
                        </StatRow>
                    </PanelSection>
                </Panel>

                <PanelGrid columns={2}>
                    {Array.from({ length: 2 }).map((_, i) => (
                        <Panel key={i}>
                            <PanelSection label={<Skeleton className="h-4 w-40" />}>
                                <Skeleton className="mt-4 h-75 w-full" />
                            </PanelSection>
                        </Panel>
                    ))}
                </PanelGrid>
            </div>
        )
    }

    return (
        <div className="space-y-6">
            {/* Main KPIs */}
            <Panel>
                <PanelSection label="Last 30 days">
                    <StatRow columns={4} className="mt-6">
                        <StatTile
                            label="Net Sales"
                            icon={<DollarSign />}
                            value={`$${totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                            meta={
                                growth !== 0 ? (
                                    <span className="flex flex-wrap items-center gap-1">
                                        {growth > 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                                        {growth > 0 ? '+' : ''}{growth.toFixed(1)}% from previous
                                    </span>
                                ) : undefined
                            }
                        />
                        <StatTile
                            label="Total Orders"
                            icon={<ShoppingCart />}
                            value={totalOrders.toLocaleString()}
                            meta="Captured orders"
                        />
                        <StatTile
                            label="Avg. Order Value"
                            icon={<Target />}
                            value={`$${avgOrderValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                            meta="Per transaction"
                        />
                        <StatTile
                            label="Refunds"
                            icon={<TrendingDown />}
                            value={`$${(financialKPIs?.summary?.refunds_total || 0).toLocaleString()}`}
                            meta="Total refunded"
                        />
                    </StatRow>
                </PanelSection>

                {/* Additional KPIs - Today's Snapshot */}
                <PanelSection label="Today" divider>
                    <StatRow columns={3} className="mt-6">
                        <StatTile
                            label="Revenue Today"
                            icon={<Activity />}
                            value={`$${(todaySummary?.netSales || 0).toLocaleString()}`}
                            meta="Net sales for today"
                        />
                        <StatTile
                            label="Tips Collected"
                            icon={<TrendingUp />}
                            value={`$${(todaySummary?.totalTips || 0).toLocaleString()}`}
                            meta="Tips for today"
                        />
                        <StatTile
                            label="Tax Collected"
                            icon={<DollarSign />}
                            value={`$${(todaySummary?.totalTax || 0).toLocaleString()}`}
                            meta="Tax for today"
                        />
                    </StatRow>
                </PanelSection>
            </Panel>

            {/* Charts Section */}
            <PanelGrid columns={2}>
                {/* Sales Trend Chart */}
                <Panel>
                    <PanelSection label="Sales Trend (30 Days)" caption="Daily sales performance">
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
                    </PanelSection>
                </Panel>

                {/* Order Types */}
                <Panel>
                    <PanelSection label="Order Sources" caption="Distribution by order type">
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
                    </PanelSection>
                </Panel>
            </PanelGrid>

            {/* Bottom Section: Business Info and Recent Activity */}
            <PanelGrid columns={2}>
                {/* Business Information — compact summary; full details + editing on the Business Info tab */}
                <Panel>
                    <PanelSection
                        label="Business Information"
                        caption="Merchant business details and contact"
                        action={
                            <Button variant="ghost" size="sm" asChild>
                                <Link href={`/manage/merchants/${merchantId}?tab=business-info`}>
                                    Manage
                                    <ArrowUpRight className="h-4 w-4 ml-1" />
                                </Link>
                            </Button>
                        }
                    >
                        <div className="mt-4 space-y-4">
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
                        </div>
                    </PanelSection>
                </Panel>

                {/* Recent Activity */}
                <Panel>
                    <PanelSection label="Recent Orders" caption="Latest transactions">
                        <div className="mt-4 space-y-4">
                            {recentOrders && recentOrders.length > 0 ? recentOrders.map((order: any) => (
                                <div key={order.id} className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="h-8 w-8 rounded-full flex items-center justify-center bg-muted text-muted-foreground">
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
                    </PanelSection>
                </Panel>
            </PanelGrid>
        </div>
    )
}
