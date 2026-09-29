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
import { ChartContainer, ChartTooltip } from '@/components/ui/chart'
import { Area, AreaChart, Pie, PieChart, Cell, XAxis, YAxis, CartesianGrid } from 'recharts'
import { CHART_GRID, CHART_TICK, ChartEmpty, isEmptySeries } from '@/components/dashboard/shell'
import { AnalyticsTooltip, SERIES } from '@/app/manage/components/analytics-primitives'
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
        color: 'var(--brand)',
    },
    orders: {
        label: 'Orders',
        color: 'var(--chart-2)',
    },
    revenue: {
        label: 'Revenue',
        color: 'var(--chart-3)',
    },
}

const CHART_HEIGHT = 300

// Unknown is not zero (§4.9): a figure whose query returned nothing renders `—`.
function formatCurrency(value: number | null | undefined, decimals = false) {
    if (value == null) return '—'
    return `$${value.toLocaleString(undefined, decimals ? { minimumFractionDigits: 2, maximumFractionDigits: 2 } : undefined)}`
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
    const totalRevenue = financialKPIs?.summary?.net_sales ?? orderAnalytics?.totalRevenue ?? null
    const totalOrders = orderAnalytics?.totalOrders ?? null
    const avgOrderValue = orderAnalytics?.avgOrderValue ?? null
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
        // The HQ categorical palette (§6.1). Filter BEFORE indexing: colouring
        // first and filtering after lets an empty order type consume a colour,
        // so two visible slices could land on the same one.
        return Object.entries(orderAnalytics.orderTypeBreakdown)
            .filter(([, value]) => Number(value) > 0)
            .map(([type, value], index) => ({
                name: type === 'qr_dine_in' ? 'QR Table' : type.replace(/_/g, ' '),
                value,
                color: SERIES[index % SERIES.length]
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

                    <PanelSection label="Today">
                        <StatRow columns={3} className="mt-6">
                            {Array.from({ length: 3 }).map((_, i) => (
                                <StatTile key={i} isLoading label={<Skeleton className="h-3.5 w-24" />} value={null} />
                            ))}
                        </StatRow>
                    </PanelSection>
                </Panel>

                <PanelGrid columns={2} className="items-start">
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
                            value={formatCurrency(totalRevenue, true)}
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
                            value={totalOrders == null ? '—' : totalOrders.toLocaleString()}
                            meta="Captured orders"
                        />
                        <StatTile
                            label="Avg. Order Value"
                            icon={<Target />}
                            value={formatCurrency(avgOrderValue, true)}
                            meta="Per transaction"
                        />
                        <StatTile
                            label="Refunds"
                            icon={<TrendingDown />}
                            value={formatCurrency(financialKPIs ? financialKPIs.summary?.refunds_total || 0 : null)}
                            meta="Total refunded"
                        />
                    </StatRow>
                </PanelSection>

                {/* Additional KPIs - Today's Snapshot */}
                <PanelSection label="Today">
                    <StatRow columns={3} className="mt-6">
                        <StatTile
                            label="Revenue Today"
                            icon={<Activity />}
                            value={formatCurrency(todaySummary ? todaySummary.netSales || 0 : null)}
                            meta="Net sales for today"
                        />
                        <StatTile
                            label="Tips Collected"
                            icon={<TrendingUp />}
                            value={formatCurrency(todaySummary ? todaySummary.totalTips || 0 : null)}
                            meta="Tips for today"
                        />
                        <StatTile
                            label="Tax Collected"
                            icon={<DollarSign />}
                            value={formatCurrency(todaySummary ? todaySummary.totalTax || 0 : null)}
                            meta="Tax for today"
                        />
                    </StatRow>
                </PanelSection>
            </Panel>

            {/* Charts Section */}
            <PanelGrid columns={2} className="items-start">
                {/* Sales Trend Chart */}
                <Panel>
                    <PanelSection label="Sales Trend (30 Days)" caption="Daily sales performance">
                        {isEmptySeries(salesTrendData, (row) => Number(row.sales)) ? (
                            <ChartEmpty
                                height={CHART_HEIGHT}
                                title="No sales in the last 30 days"
                                hint="Daily sales will appear here once this merchant takes orders."
                            />
                        ) : (
                            <ChartContainer config={chartConfig} className="h-75 w-full">
                                <AreaChart data={salesTrendData}>
                                    <CartesianGrid {...CHART_GRID} vertical={false} />
                                    <XAxis dataKey="date" tick={CHART_TICK} tickLine={false} axisLine={false} tickMargin={8} minTickGap={32} />
                                    <YAxis tick={CHART_TICK} tickLine={false} axisLine={false} tickFormatter={(val) => `$${val}`} />
                                    <ChartTooltip
                                        content={
                                            <AnalyticsTooltip
                                                formatter={(v: number) =>
                                                    `$${Number(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                                                }
                                            />
                                        }
                                    />
                                    <Area
                                        type="monotone"
                                        dataKey="sales"
                                        name="Sales"
                                        stroke="var(--brand)"
                                        fill="var(--brand)"
                                        fillOpacity={0.2}
                                    />
                                </AreaChart>
                            </ChartContainer>
                        )}
                    </PanelSection>
                </Panel>

                {/* Order Types */}
                <Panel>
                    <PanelSection label="Order Sources" caption="Distribution by order type">
                        {orderTypeData.length === 0 ? (
                            <ChartEmpty
                                height={CHART_HEIGHT}
                                title="No orders in the last 30 days"
                                hint="Order sources will appear here once this merchant takes orders."
                            />
                        ) : (
                            <>
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
                                        <ChartTooltip content={<AnalyticsTooltip />} />
                                    </PieChart>
                                </ChartContainer>
                                <div className="mt-4 flex flex-wrap justify-center gap-4">
                                    {orderTypeData.map((type) => (
                                        <div key={type.name} className="flex items-center gap-2">
                                            <div className="h-3 w-3 rounded-full" style={{ backgroundColor: type.color }} />
                                            <span className="text-xs capitalize text-muted-foreground tabular-nums">
                                                {type.name} ({type.value})
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </>
                        )}
                    </PanelSection>
                </Panel>
            </PanelGrid>

            {/* Bottom Section: Business Info and Recent Activity */}
            <PanelGrid columns={2} className="items-start">
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
                                <div key={order.id} className="flex items-center justify-between gap-3">
                                    <div className="flex min-w-0 items-center gap-3">
                                        <div className="hidden h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground sm:flex">
                                            <ShoppingCart className="h-4 w-4" />
                                        </div>
                                        <div className="min-w-0">
                                            <div className="text-sm font-medium tabular-nums">#{order.order_number}</div>
                                            <div className="flex items-center gap-1 text-xs text-muted-foreground tabular-nums">
                                                <Clock className="h-3 w-3" />
                                                {format(new Date(order.created_at), 'MMM d, h:mm a')}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="shrink-0 text-right font-medium tabular-nums">${Number(order.total_amount).toFixed(2)}</div>
                                </div>
                            )) : (
                                <p className="text-sm text-muted-foreground">No orders yet — this merchant&apos;s latest orders will appear here.</p>
                            )}
                        </div>
                    </PanelSection>
                </Panel>
            </PanelGrid>
        </div>
    )
}
