'use client'

import { useMemo, useState, useEffect } from 'react'
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

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
  ChartConfig,
} from '@/components/ui/chart'

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

  const [autoRefresh, setAutoRefresh] = useState(false)
  const [activeTab, setActiveTab] = useState('sales')
  const [leaderboardMetric, setLeaderboardMetric] = useState<'total_sales' | 'avg_check_size' | 'total_tips' | 'avg_tip_pct' | 'tables_turned' | 'avg_table_turn_minutes'>('total_sales')
  const [showSettings, setShowSettings] = useState(false)
  // Default interval: 1 minute (60000 ms)
  const [refreshInterval, setRefreshInterval] = useState<number>(60000)

  const handleDateRangeChange = (from: Date | null, to: Date | null) => {
    if (from && to) {
      setDateFrom(from)
      setDateTo(to)
    }
  }

  /* ---------------- Auto-Refresh Logic ---------------- */

  useEffect(() => {
    if (!autoRefresh) return

    const interval = setInterval(() => {
      setDateTo(new Date())
    }, refreshInterval)

    return () => clearInterval(interval)
  }, [autoRefresh, refreshInterval])

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

  const chartData = useMemo(() => {
    if (!analytics?.salesByDate) return []

    return analytics.salesByDate.map((item) => ({
      date: new Date(item.date).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
      }),
      sales: item.sales,
      orders: item.orders,
    }))
  }, [analytics?.salesByDate])

  const orderTypeData = useMemo(() => {
    if (!analytics?.orderTypeBreakdown) return []

    const b = analytics.orderTypeBreakdown
    return [
      { name: 'Dine In', value: b.dine_in },
      { name: 'QR Table', value: b.qr_dine_in },
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
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              Analytics
            </h1>

            {isAllLocations ? (
              <Badge variant="outline" className="gap-1 dark:border-slate-600 dark:text-slate-300">
                <Globe className="h-3 w-3" />
                All Locations
              </Badge>
            ) : (
              <Badge variant="outline" className="gap-1 dark:border-slate-600 dark:text-slate-300">
                <MapPin className="h-3 w-3" />
                {selectedLocation?.name}
              </Badge>
            )}
          </div>

          <p className="text-muted-foreground dark:text-slate-400">
            View detailed analytics and insights for your orders
          </p>
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
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
              checked={autoRefresh}
              onCheckedChange={setAutoRefresh}
              className="data-[state=checked]:bg-[#0A5C9E] dark:data-[state=checked]:bg-[#0A7AB8]"
            />
            <Label className="dark:text-slate-300">Auto-refresh</Label>
          </div>

          <Button
            variant="outline"
            size="icon"
            onClick={() => setShowSettings(true)}
            className="dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <Settings className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Settings Dialog */}
      <Dialog open={showSettings} onOpenChange={setShowSettings}>
        <DialogContent className="sm:max-w-[400px] dark:bg-slate-900 dark:border-slate-700">
          <DialogHeader>
            <DialogTitle className="dark:text-white">Auto-Refresh Settings</DialogTitle>
            <DialogDescription className="dark:text-slate-400">
              Choose how often the data should refresh when auto-refresh is on.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-3">
              <Label className="text-base font-semibold dark:text-slate-300">Refresh Interval</Label>

              {[
                { value: 30000, label: '30 seconds' },
                { value: 60000, label: '1 minute' },
                { value: 300000, label: '5 minutes' },
                { value: 600000, label: '10 minutes' },
              ].map(({ value, label }) => (
                <div key={value} className="flex items-center space-x-2">
                  <input
                    type="radio"
                    id={`interval-${value}`}
                    name="refresh-interval"
                    value={value}
                    checked={refreshInterval === value}
                    onChange={() => setRefreshInterval(value)}
                    className="h-4 w-4 accent-[#0A5C9E] dark:accent-[#0A7AB8]"
                  />
                  <Label
                    htmlFor={`interval-${value}`}
                    className="font-normal cursor-pointer dark:text-slate-300"
                  >
                    {label}
                  </Label>
                </div>
              ))}
            </div>

            <div className="pt-4 border-t dark:border-slate-700">
              <p className="text-sm text-muted-foreground dark:text-slate-400">
                {autoRefresh
                  ? `Auto-refresh is ON (every ${refreshInterval / 1000}s)`
                  : 'Auto-refresh is OFF'}
              </p>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="overflow-x-auto">
        <TabsList className="flex-nowrap w-max h-auto gap-2 bg-transparent border-b-2 border-slate-200 dark:border-slate-700 rounded-none p-0 pb-2">
          <TabsTrigger
            value="sales"
            className="border-0 border-b-4 border-transparent transition-colors duration-200 data-[state=active]:border-[#0A5C9E] dark:data-[state=active]:border-[#0A7AB8] data-[state=active]:shadow-none data-[state=active]:bg-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white rounded-none"
          >
            Sales & Revenue
          </TabsTrigger>
          <TabsTrigger
            value="kitchen"
            className="border-0 border-b-4 border-transparent transition-colors duration-200 data-[state=active]:border-[#0A5C9E] dark:data-[state=active]:border-[#0A7AB8] data-[state=active]:shadow-none data-[state=active]:bg-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white rounded-none"
          >
            Kitchen
          </TabsTrigger>
          <TabsTrigger
            value="tables"
            className="border-0 border-b-4 border-transparent transition-colors duration-200 data-[state=active]:border-[#0A5C9E] dark:data-[state=active]:border-[#0A7AB8] data-[state=active]:shadow-none data-[state=active]:bg-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white rounded-none"
          >
            Tables
          </TabsTrigger>
          <TabsTrigger
            value="staff"
            className="border-0 border-b-4 border-transparent transition-colors duration-200 data-[state=active]:border-[#0A5C9E] dark:data-[state=active]:border-[#0A7AB8] data-[state=active]:shadow-none data-[state=active]:bg-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white rounded-none"
          >
            Staff
          </TabsTrigger>
          <TabsTrigger
            value="orders"
            className="border-0 border-b-4 border-transparent transition-colors duration-200 data-[state=active]:border-[#0A5C9E] dark:data-[state=active]:border-[#0A7AB8] data-[state=active]:shadow-none data-[state=active]:bg-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white rounded-none"
          >
            Order Flow
          </TabsTrigger>
        </TabsList>
        </div>

        {/* SALES TAB */}
        <TabsContent value="sales" className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {/* Total Sales */}
            <Card className="dark:bg-slate-900 dark:border-slate-700">
              <CardHeader className="flex justify-between pb-2">
                <CardTitle className="text-sm dark:text-slate-300">Total Sales</CardTitle>
                <DollarSign className="h-4 w-4 text-muted-foreground dark:text-slate-500" />
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <Skeleton className="h-8 w-24 dark:bg-slate-800" />
                ) : (
                  <div className="text-2xl font-bold dark:text-white">
                    {formatCurrency(totalSales)}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Total Orders */}
            <Card className="dark:bg-slate-900 dark:border-slate-700">
              <CardHeader className="flex justify-between pb-2">
                <CardTitle className="text-sm dark:text-slate-300">Total Orders</CardTitle>
                <ShoppingBag className="h-4 w-4 text-muted-foreground dark:text-slate-500" />
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <Skeleton className="h-8 w-16 dark:bg-slate-800" />
                ) : (
                  <div className="text-2xl font-bold dark:text-white">
                    {analytics?.totalOrders ?? 0}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* AOV */}
            <Card className="dark:bg-slate-900 dark:border-slate-700">
              <CardHeader className="flex justify-between pb-2">
                <CardTitle className="text-sm dark:text-slate-300">Average Order Value</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground dark:text-slate-500" />
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <Skeleton className="h-8 w-24 dark:bg-slate-800" />
                ) : (
                  <div className="text-2xl font-bold dark:text-white">
                    {formatCurrency(analytics?.avgOrderValue ?? 0)}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <RevenueBreakdownCard data={revenueBreakdown} isLoading={isLoadingRevenue} />
          <DualPricingCard data={dualPricing} isLoading={isLoadingDualPricing} />
          <DiscountImpactCard data={discountImpact} isLoading={isLoadingDiscount} />
        </TabsContent>

        {/* KITCHEN TAB */}
        <TabsContent value="kitchen" className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <AvgTicketTimeCard data={kitchenPerformance ?? undefined} isLoading={isLoadingKitchen} />
            <RushTrackingCard data={kitchenPerformance?.rush_stats} isLoading={isLoadingKitchen} />
            <AutoBumpRateCard data={kitchenPerformance?.auto_bump_stats} isLoading={isLoadingKitchen} />
          </div>

          <StationPerformanceCard stations={kitchenPerformance?.by_station} isLoading={isLoadingKitchen} />
          <KitchenSpeedHeatmap data={kitchenPerformance?.by_hour_and_day} isLoading={isLoadingKitchen} />
        </TabsContent>

        {/* TABLES TAB */}
        <TabsContent value="tables" className="space-y-6">
          <AvgTableTurnTime data={tablePerformance} isLoading={isLoadingTable} />
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-2">
            <CoversTracker data={tablePerformance} isLoading={isLoadingTable} />
            <RevenueSeatHour data={tablePerformance?.hourly_revpash} isLoading={isLoadingTable} />
          </div>
          <ServiceTimelineBreakdown phases={tablePerformance?.service_phases} isLoading={isLoadingTable} />
          <div className="grid gap-4 md:grid-cols-3">
            <div className="md:col-span-2">
              <TableUtilization tables={tablePerformance?.table_utilization} isLoading={isLoadingTable} />
            </div>
            <SectionHeatmap sections={tablePerformance?.section_stats} isLoading={isLoadingTable} />
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
          <TipsAnalysisCard data={staffPerformance} isLoading={isLoadingStaff} />
          <StaffOrderActivityCard data={staffPerformance} isLoading={isLoadingStaff} />
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
