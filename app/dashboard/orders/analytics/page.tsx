'use client'

import { useMemo, useState } from 'react'
import { useIsAllLocations, useSelectedLocation } from '@/stores/location-store'
import {
  useOrderAnalytics,
  useRevenueBreakdown,
  useDualPricingComparison,
  useDiscountImpact,
  useKitchenPerformance,
  useTablePerformance,
  useStaffPerformance,
  useOrderFlow,
} from '../../hooks/useOrderAnalytics'

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'

import {
  DollarSign,
  ShoppingBag,
  TrendingUp,
  MapPin,
  Globe,
  Settings,
} from 'lucide-react'

import {
  DateRangePicker,
  DatePreset,
} from '@/components/dashboard/orders/DateRangePicker'

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'

import {
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
} from 'recharts'

import { Empty } from '@/components/ui/empty'

import { RevenueBreakdownCard } from '@/components/dashboard/orders/analytics/RevenueBreakdownCard'
import { DualPricingCard } from '@/components/dashboard/orders/analytics/DualPricingCard'
import { DiscountImpactCard } from '@/components/dashboard/orders/analytics/DiscountImpactCard'
import { AvgTicketTimeCard } from '@/components/dashboard/orders/analytics/AvgTicketTimeCard'
import { StationPerformanceCard } from '@/components/dashboard/orders/analytics/StationPerformanceCard'
import { KitchenSpeedHeatmap } from '@/components/dashboard/orders/analytics/KitchenSpeedHeatmap'
import { RushTrackingCard } from '@/components/dashboard/orders/analytics/RushTrackingCard'
import { AutoBumpRateCard } from '@/components/dashboard/orders/analytics/AutoBumpRateCard'
import { AvgTableTurnTime } from '@/components/dashboard/orders/analytics/AvgTableTurnTime'
import { ServiceTimelineBreakdown } from '@/components/dashboard/orders/analytics/ServiceTimelineBreakdown'
import { RevenueSeatHour } from '@/components/dashboard/orders/analytics/RevenueSeatHour'
import { TableUtilization } from '@/components/dashboard/orders/analytics/TableUtilization'
import { CoversTracker } from '@/components/dashboard/orders/analytics/CoversTracker'
import { SectionHeatmap } from '@/components/dashboard/orders/analytics/SectionHeatmap'
import { ServerLeaderboardCard } from '@/components/dashboard/orders/analytics/ServerLeaderboardCard'
import { TipsAnalysisCard } from '@/components/dashboard/orders/analytics/TipsAnalysisCard'
import { StaffOrderActivityCard } from '@/components/dashboard/orders/analytics/StaffOrderActivityCard'
import { OrderStatusFunnel } from '@/components/dashboard/orders/analytics/OrderStatusFunnel'
import { VoidRefundAnalysis } from '@/components/dashboard/orders/analytics/VoidRefundAnalysis'
import { OrderTypeBreakdown } from '@/components/dashboard/orders/analytics/OrderTypeBreakdown'
import { AvgCompletionTime } from '@/components/dashboard/orders/analytics/AvgCompletionTime'

/* ----------------------- Constants ----------------------- */

const chartConfig = {
  sales: { label: 'Sales', color: 'var(--chart-1)' },
  orders: { label: 'Orders', color: 'var(--chart-2)' },
  previous: { label: 'Previous Period', color: 'hsl(var(--muted-foreground))' },
  aov: { label: 'Average Order Value', color: 'var(--chart-1)' },
} satisfies ChartConfig

const PIE_COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8']

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
})

/* ----------------------- Component ----------------------- */

export default function AnalyticsPage() {
  const selectedLocation = useSelectedLocation()
  const isAllLocations = useIsAllLocations()

  /* ---------------- Date State ---------------- */

  const [preset, setPreset] = useState<DatePreset>('last_7_days')
  const [dateFrom, setDateFrom] = useState<Date>(() => {
    const d = new Date()
    d.setDate(d.getDate() - 7)
    return d
  })
  const [dateTo, setDateTo] = useState<Date>(new Date())

  const [comparePrevious, setComparePrevious] = useState(false)
  const [autoRefresh, setAutoRefresh] = useState(false)
  const [activeTab, setActiveTab] = useState('sales')
  const [leaderboardMetric, setLeaderboardMetric] = useState<'total_sales' | 'avg_check_size' | 'total_tips' | 'avg_tip_pct' | 'tables_turned' | 'avg_table_turn_minutes'>('total_sales')

  const handleDateRangeChange = (from: Date | null, to: Date | null) => {
    if (from && to) {
      setDateFrom(from)
      setDateTo(to)
    }
  }

  /* ---------------- Data Hooks ---------------- */

  const { data: analytics, isLoading } = useOrderAnalytics(dateFrom, dateTo)
  const { data: revenueBreakdown, isLoading: isLoadingRevenue } =
    useRevenueBreakdown(dateFrom, dateTo)
  const { data: dualPricing, isLoading: isLoadingDualPricing } =
    useDualPricingComparison(dateFrom, dateTo)
  const { data: discountImpact, isLoading: isLoadingDiscount } =
    useDiscountImpact(dateFrom, dateTo)
  const { data: kitchenPerformance, isLoading: isLoadingKitchen } =
    useKitchenPerformance(dateFrom, dateTo)
  const { data: tablePerformance, isLoading: isLoadingTable } =
    useTablePerformance(dateFrom, dateTo)
  const { data: staffPerformance, isLoading: isLoadingStaff } =
    useStaffPerformance(dateFrom, dateTo)
  const { data: orderFlow, isLoading: isLoadingOrderFlow } =
    useOrderFlow(dateFrom, dateTo)

  /* ---------------- Derived Data ---------------- */

  const totalSales = useMemo(() => {
    return (
      analytics?.salesByDate?.reduce((sum, d) => sum + d.sales, 0) ?? 0
    )
  }, [analytics?.salesByDate])

  const previousSalesMap = useMemo(() => {
    if (!comparePrevious || !analytics?.salesByDate) return new Map()

    const map = new Map<string, number>()
    analytics.salesByDate.forEach((item, index) => {
      const prevIndex = index - analytics.salesByDate.length
      map.set(
        item.date,
        prevIndex >= 0
          ? analytics.salesByDate[prevIndex]?.sales ?? 0
          : 0
      )
    })
    return map
  }, [analytics?.salesByDate, comparePrevious])

  const chartData = useMemo(() => {
    if (!analytics?.salesByDate) return []

    return analytics.salesByDate.map((item) => ({
      date: new Date(item.date).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
      }),
      sales: item.sales,
      orders: item.orders,
      previousSales: previousSalesMap.get(item.date) ?? 0,
    }))
  }, [analytics?.salesByDate, previousSalesMap])

  const orderTypeData = useMemo(() => {
    if (!analytics?.orderTypeBreakdown) return []

    const b = analytics.orderTypeBreakdown
    return [
      { name: 'Dine In', value: b.dine_in },
      { name: 'Takeout', value: b.takeout },
      { name: 'Delivery', value: b.delivery },
      { name: 'Online', value: b.online },
      { name: 'Catering', value: b.catering },
    ].filter((i) => i.value > 0)
  }, [analytics?.orderTypeBreakdown])

  const totalOrderTypes = useMemo(
    () => orderTypeData.reduce((s, i) => s + i.value, 0),
    [orderTypeData]
  )

  const formatCurrency = (n: number) =>
    currencyFormatter.format(n)

  /* ---------------- Render ---------------- */

  return (
    <main className="space-y-6 animate-in fade-in duration-500 ">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight">
              Analytics
            </h1>

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
              checked={comparePrevious}
              onCheckedChange={setComparePrevious}
            />
            <Label>Compare: Previous period</Label>
          </div>

          <div className="flex items-center gap-2">
            <Switch
              checked={autoRefresh}
              onCheckedChange={setAutoRefresh}
            />
            <Label>Auto-refresh</Label>
          </div>

          <Button variant="outline" size="icon">
            <Settings className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="sales">Sales & Revenue</TabsTrigger>
          <TabsTrigger value="kitchen">Kitchen</TabsTrigger>
          <TabsTrigger value="tables">
            Tables
          </TabsTrigger>
          <TabsTrigger value="staff">
            Staff
          </TabsTrigger>
          <TabsTrigger value="orders">
            Order Flow
          </TabsTrigger>
        </TabsList>

        {/* SALES TAB */}
        <TabsContent value="sales" className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {/* Total Sales */}
            <Card>
              <CardHeader className="flex justify-between pb-2">
                <CardTitle className="text-sm">
                  Total Sales
                </CardTitle>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </CardHeader>

              <CardContent>
                {isLoading ? (
                  <Skeleton className="h-8 w-24" />
                ) : (
                  <div className="text-2xl font-bold">
                    {formatCurrency(totalSales)}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Total Orders */}
            <Card>
              <CardHeader className="flex justify-between pb-2">
                <CardTitle className="text-sm">
                  Total Orders
                </CardTitle>
                <ShoppingBag className="h-4 w-4 text-muted-foreground" />
              </CardHeader>

              <CardContent>
                {isLoading ? (
                  <Skeleton className="h-8 w-16" />
                ) : (
                  <div className="text-2xl font-bold">
                    {analytics?.totalOrders ?? 0}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* AOV */}
            <Card>
              <CardHeader className="flex justify-between pb-2">
                <CardTitle className="text-sm">
                  Average Order Value
                </CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>

              <CardContent>
                {isLoading ? (
                  <Skeleton className="h-8 w-24" />
                ) : (
                  <div className="text-2xl font-bold">
                    {formatCurrency(
                      analytics?.avgOrderValue ?? 0
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <RevenueBreakdownCard
            data={revenueBreakdown}
            isLoading={isLoadingRevenue}
          />

          <DualPricingCard
            data={dualPricing}
            isLoading={isLoadingDualPricing}
          />

          <DiscountImpactCard
            data={discountImpact}
            isLoading={isLoadingDiscount}
          />
        </TabsContent>

        {/* KITCHEN TAB */}
        <TabsContent value="kitchen" className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <AvgTicketTimeCard
              data={kitchenPerformance}
              isLoading={isLoadingKitchen}
            />
            <RushTrackingCard
              data={kitchenPerformance?.rush_stats}
              isLoading={isLoadingKitchen}
            />
            <AutoBumpRateCard
              data={kitchenPerformance?.auto_bump_stats}
              isLoading={isLoadingKitchen}
            />
          </div>

          <StationPerformanceCard
            stations={kitchenPerformance?.by_station}
            isLoading={isLoadingKitchen}
          />

          <KitchenSpeedHeatmap
            data={kitchenPerformance?.by_hour_and_day}
            isLoading={isLoadingKitchen}
          />
        </TabsContent>

        {/* TABLES TAB */}
        <TabsContent value="tables" className="space-y-6 ">
           <AvgTableTurnTime
              data={tablePerformance}
              isLoading={isLoadingTable}
            />
          {/* Row 1 — 3 col */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-2 ">
           
            <CoversTracker
              data={tablePerformance}
              isLoading={isLoadingTable}
            />
            <RevenueSeatHour
              data={tablePerformance?.hourly_revpash}
              isLoading={isLoadingTable}
            />
          </div>

          {/* Row 2 — full width */}
          <ServiceTimelineBreakdown
            phases={tablePerformance?.service_phases}
            isLoading={isLoadingTable}
          />

          {/* Row 3 — 2/3 + 1/3 */}
          <div className="grid gap-4 md:grid-cols-3">
            <div className="md:col-span-2">
              <TableUtilization
                tables={tablePerformance?.table_utilization}
                isLoading={isLoadingTable}
              />
            </div>
            <SectionHeatmap
              sections={tablePerformance?.section_stats}
              isLoading={isLoadingTable}
            />
          </div>
        </TabsContent>

        {/* STAFF TAB */}
        <TabsContent value="staff" className="space-y-6">
          <ServerLeaderboardCard
            data={staffPerformance}
            isLoading={isLoadingStaff}
            metric={leaderboardMetric}
            onMetricChange={setLeaderboardMetric}
          />
          <TipsAnalysisCard
            data={staffPerformance}
            isLoading={isLoadingStaff}
          />
          <StaffOrderActivityCard
            data={staffPerformance}
            isLoading={isLoadingStaff}
          />
        </TabsContent>

        {/* ORDER FLOW TAB */}
        <TabsContent value="orders" className="space-y-6">
          <OrderStatusFunnel data={orderFlow} isLoading={isLoadingOrderFlow} />
          <div className="grid gap-4 md:grid-cols-2">
            <OrderTypeBreakdown data={orderFlow} isLoading={isLoadingOrderFlow} />
            <AvgCompletionTime data={orderFlow} isLoading={isLoadingOrderFlow} />
          </div>
          <VoidRefundAnalysis data={orderFlow} isLoading={isLoadingOrderFlow} />
        </TabsContent>
      </Tabs>
    </main>
  )
}
