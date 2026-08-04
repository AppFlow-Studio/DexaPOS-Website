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
  MapPin,
  Globe,
  Settings,
  ArrowLeft,
} from 'lucide-react'
import Link from 'next/link'

import {
  DateRangePicker,
  DatePreset,
} from '@/components/dashboard/orders/DateRangePicker'

import {
  ChartConfig,
} from '@/components/ui/chart'

import {
  AnalyticsPanel,
  AnalyticsRow,
  AnalyticsSection,
  StatRow,
  StatTile,
} from '@/components/dashboard/orders/analytics/AnalyticsPrimitives'
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
import { useReportingQueryRange } from '@/app/dashboard/hooks/useReportingDateRange'
import { fillDailySalesSeries } from '@/lib/reporting/date-range'

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

const TABS = [
  { value: 'sales', label: 'Sales & Revenue' },
  { value: 'kitchen', label: 'Kitchen' },
  { value: 'tables', label: 'Tables' },
  { value: 'staff', label: 'Staff' },
  { value: 'orders', label: 'Order Flow' },
] as const

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
  const queryDateRange = useReportingQueryRange({ from: dateFrom, to: dateTo })

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

  const { data: analytics, isLoading } = useOrderAnalytics(queryDateRange.from, queryDateRange.to)
  const { data: revenueBreakdown, isLoading: isLoadingRevenue } =
    useRevenueBreakdown(queryDateRange.from, queryDateRange.to)
  const { data: dualPricing, isLoading: isLoadingDualPricing } =
    useDualPricingComparison(queryDateRange.from, queryDateRange.to)
  const { data: discountImpact, isLoading: isLoadingDiscount } =
    useDiscountImpact(queryDateRange.from, queryDateRange.to)
  const { data: kitchenPerformance, isLoading: isLoadingKitchen } =
    useKitchenPerformance(queryDateRange.from, queryDateRange.to)
  const { data: tablePerformance, isLoading: isLoadingTable } =
    useTablePerformance(queryDateRange.from, queryDateRange.to)
  const { data: staffPerformance, isLoading: isLoadingStaff } =
    useStaffPerformance(queryDateRange.from, queryDateRange.to)
  const { data: orderFlow, isLoading: isLoadingOrderFlow } =
    useOrderFlow(queryDateRange.from, queryDateRange.to)

  /* ---------------- Derived Data ---------------- */

  const totalSales = useMemo(() => {
    return (
      analytics?.salesByDate?.reduce((sum, d) => sum + d.sales, 0) ?? 0
    )
  }, [analytics?.salesByDate])

  const chartData = useMemo(() => {
    if (!analytics?.salesByDate) return []

    return fillDailySalesSeries(analytics.salesByDate, {
      from: dateFrom,
      to: dateTo,
    }).map((item) => ({
      date: new Date(item.date).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
      }),
      sales: item.sales,
      orders: item.orders,
    }))
  }, [analytics?.salesByDate, dateFrom, dateTo])

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
    <main className="space-y-6">
      {/*
        The analytics tabs used to stack standalone bordered+shadowed Cards.
        They now read as hairline-separated sections inside one rounded
        container per tab, matching the dashboard Overview. Several cards don't
        accept a className, so their chrome is stripped here via the data-slot
        the shared Card emits — scoped to `.analytics-flat`, leaving the shared
        Card untouched for every other surface that uses it.
      */}
      <style>{`
        .analytics-flat [data-slot="card"] {
          border: 0 !important;
          box-shadow: none !important;
          background: transparent !important;
          border-radius: 0 !important;
          font-variant-numeric: tabular-nums;
          padding-top: 2rem !important;
          padding-bottom: 2rem !important;
          gap: 1.25rem;
        }
        .analytics-flat [data-slot="card-header"],
        .analytics-flat [data-slot="card-content"],
        .analytics-flat [data-slot="card-footer"] {
          padding-left: 0 !important;
          padding-right: 0 !important;
        }
        .analytics-flat [data-slot="card-header"] {
          padding-bottom: 0 !important;
        }

        /* --- Controls -----------------------------------------------------
           Every control on the page reads as the same pill: section-header
           buttons and selects, table pagination, search fields. Icon-only
           buttons are excluded from the horizontal padding so they stay
           square-ish circles rather than stretching into ovals. */
        .analytics-flat button,
        .analytics-flat [data-slot="select-trigger"],
        .analytics-flat input,
        .analytics-flat [data-slot="input"] {
          border-radius: 9999px;
        }
        /* ".size-9" is the icon-size variant: leave those alone so they stay
           circles instead of stretching into ovals. */
        .analytics-flat button:not([data-slot="select-trigger"]):not(.size-9) {
          padding-left: 1rem;
          padding-right: 1rem;
        }
        .analytics-flat [data-slot="card-header"] button,
        .analytics-flat button[data-slot="select-trigger"] {
          font-size: 0.8125rem;
        }

        /* --- Data tables -------------------------------------------------
           The shared DataTable wraps itself in "rounded-md border". Inside a
           flat section that outer frame reads as yet another box, so drop it
           and let the header rule + row hairlines carry the structure. The
           component is shared with the reports pages, hence overriding here
           rather than changing it. */
        .analytics-flat .rounded-md.border:has(table) {
          border: 0 !important;
          border-radius: 0 !important;
        }
        /* Row hairlines match the rest of the page's dividers. */
        .analytics-flat table tr {
          border-color: color-mix(in srgb, var(--border) 60%, transparent);
        }
        .analytics-flat table tbody tr:last-child {
          border-bottom: 0;
        }
        .analytics-flat table th {
          font-weight: 500;
          color: var(--muted-foreground);
        }
        /* Cells align to the section's left edge like every other row here. */
        .analytics-flat table th:first-child,
        .analytics-flat table td:first-child {
          padding-left: 0;
        }
        .analytics-flat table th:last-child,
        .analytics-flat table td:last-child {
          padding-right: 0;
        }


        /* --- Figures read black ------------------------------------------
           Values were tinted blue/red/amber by their own utilities, which made
           the numbers compete with the section headings. Reset table cells and
           stat figures to the default foreground.

           Scoped to direct text nodes (not "td *") so icons keep their colour.
           The Kitchen speed heatmap needs no exemption: it is built from divs,
           not a table, so these rules never reach it — its cell colours, which
           ARE the data, stay intact. */
        .analytics-flat table td,
        .analytics-flat table td > span:not([class*="text-muted"]),
        .analytics-flat table td > div:not([class*="text-muted"]) {
          color: var(--foreground);
        }

        /* --- Date range popover ------------------------------------------
           The popover renders in a portal, so it carries its own hook class
           (see contentClassName on the picker below) rather than being
           reached by descent from this page. "overflow: hidden" is required:
           the preset rail has square corners of its own and would otherwise
           poke through the rounded edge. */
        .analytics-date-popover {
          border-radius: 1rem;
          /* Clips the preset rail's square corners. The panel is capped to the
             height available below the trigger and scrolls on its inner
             columns, so nothing is cut off here. */
          overflow: hidden;
        }
        /* Month/year selects and the Cancel/Apply footer. The preset buttons
           are excluded: they own their own radius, which differs by breakpoint
           (pill-shaped chips when stacked on a phone, a square-cornered list on
           a wide screen). */
        .analytics-date-popover button:not(.rounded-full):not([class*="rounded-none"]),
        .analytics-date-popover select {
          border-radius: 0.625rem;
        }
        /* Day cells stay pill-shaped so a selected range reads as one bar. */
        .analytics-date-popover table button {
          border-radius: 9999px;
        }
      `}</style>

      {/* Back to Orders */}
      <Button
        variant="ghost"
        size="sm"
        className="-ml-2 h-8 gap-1.5 rounded-full text-muted-foreground"
        asChild
      >
        <Link href="/dashboard/orders">
          <ArrowLeft className="h-4 w-4" />
          Back to Orders
        </Link>
      </Button>

      {/* Header */}
      <div className="animate-in fade-in duration-500">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-[1.75rem] font-semibold tracking-[-0.02em]">
            Analytics
          </h1>

          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            {isAllLocations ? (
              <>
                <Globe className="h-4 w-4" />
                All Locations
              </>
            ) : (
              <>
                <MapPin className="h-4 w-4" />
                {selectedLocation?.name}
              </>
            )}
          </p>
        </div>

        <p className="mt-1 text-sm text-muted-foreground">
          View detailed analytics and insights for your orders
        </p>
      </div>

      {/* Settings Dialog */}
      <Dialog open={showSettings} onOpenChange={setShowSettings}>
        <DialogContent className="rounded-2xl sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Auto-Refresh Settings</DialogTitle>
            <DialogDescription>
              Choose how often the data should refresh when auto-refresh is on.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-3">
              <Label className="text-sm font-medium">Refresh Interval</Label>

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
                    className="h-4 w-4 accent-[#0C4FD1] dark:accent-[#6CA0FF]"
                  />
                  <Label
                    htmlFor={`interval-${value}`}
                    className="cursor-pointer font-normal"
                  >
                    {label}
                  </Label>
                </div>
              ))}
            </div>

            <div className="border-t border-border/60 pt-4">
              <p className="text-sm text-muted-foreground">
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
        {/* Segmented pill tab bar — same affordance as the Overview range
            picker, so switching views reads the same as switching periods. */}
        <div className="w-full min-w-0 overflow-x-auto pb-1">
          <TabsList className="inline-flex h-auto w-max flex-nowrap gap-0.5 rounded-full bg-muted/70 p-1">
            {TABS.map(({ value, label }) => (
              <TabsTrigger
                key={value}
                value={value}
                className="shrink-0 whitespace-nowrap rounded-full px-4 py-2 text-[0.8125rem] font-medium text-muted-foreground transition-colors hover:text-foreground data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm data-[state=active]:ring-1 data-[state=active]:ring-border"
              >
                {label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        {/* Controls — one row governing every section below, the way the
            Overview range bar governs its container. */}
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <DateRangePicker
            dateFrom={dateFrom}
            dateTo={dateTo}
            onDateRangeChange={handleDateRangeChange}
            preset={preset}
            onPresetChange={setPreset}
            triggerClassName="h-9 rounded-full px-4 text-[0.8125rem] font-medium shadow-sm"
            contentClassName="analytics-date-popover"
          />

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Switch
                id="auto-refresh"
                checked={autoRefresh}
                onCheckedChange={setAutoRefresh}
                className="data-[state=checked]:bg-[#0C4FD1] dark:data-[state=checked]:bg-[#6CA0FF]"
              />
              <Label
                htmlFor="auto-refresh"
                className="text-[0.8125rem] font-medium text-muted-foreground"
              >
                Auto-refresh
              </Label>
            </div>

            <Button
              variant="outline"
              size="icon"
              onClick={() => setShowSettings(true)}
              className="h-9 w-9 rounded-full shadow-sm"
              aria-label="Auto-refresh settings"
            >
              <Settings className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* SALES TAB */}
        <TabsContent value="sales" className="space-y-6">
          <AnalyticsPanel>
            {/* Headline KPIs open the panel — one group of figures separated by
                hairlines rather than three separate boxes. */}
            <AnalyticsSection
              icon={DollarSign}
              label="Sales summary"
              divider={false}
            >
              <StatRow columns={3}>
                <StatTile
                  label="Total Sales"
                  value={formatCurrency(totalSales)}
                  isLoading={isLoading}
                  accent="brand"
                />
                <StatTile
                  label="Total Orders"
                  value={analytics?.totalOrders ?? 0}
                  isLoading={isLoading}
                />
                <StatTile
                  label="Average Order Value"
                  value={formatCurrency(analytics?.avgOrderValue ?? 0)}
                  isLoading={isLoading}
                />
              </StatRow>
            </AnalyticsSection>

            <AnalyticsRow>
              <RevenueBreakdownCard data={revenueBreakdown} isLoading={isLoadingRevenue} />
            </AnalyticsRow>
            <AnalyticsRow>
              <DualPricingCard data={dualPricing} isLoading={isLoadingDualPricing} />
            </AnalyticsRow>
            <AnalyticsRow>
              <DiscountImpactCard data={discountImpact} isLoading={isLoadingDiscount} />
            </AnalyticsRow>
          </AnalyticsPanel>
        </TabsContent>

        {/* KITCHEN TAB */}
        <TabsContent value="kitchen">
          <AnalyticsPanel>
            <AnalyticsRow first>
              <AvgTicketTimeCard data={kitchenPerformance ?? undefined} isLoading={isLoadingKitchen} />
            </AnalyticsRow>
            <AnalyticsRow>
              <RushTrackingCard data={kitchenPerformance?.rush_stats} isLoading={isLoadingKitchen} />
            </AnalyticsRow>
            <AnalyticsRow>
              <AutoBumpRateCard data={kitchenPerformance?.auto_bump_stats} isLoading={isLoadingKitchen} />
            </AnalyticsRow>
            <AnalyticsRow>
              <StationPerformanceCard stations={kitchenPerformance?.by_station} isLoading={isLoadingKitchen} />
            </AnalyticsRow>
            <AnalyticsRow>
              <KitchenSpeedHeatmap data={kitchenPerformance?.by_hour_and_day} isLoading={isLoadingKitchen} />
            </AnalyticsRow>
          </AnalyticsPanel>
        </TabsContent>

        {/* TABLES TAB */}
        <TabsContent value="tables">
          <AnalyticsPanel>
            <AnalyticsRow first>
              <AvgTableTurnTime data={tablePerformance} isLoading={isLoadingTable} />
            </AnalyticsRow>
            <AnalyticsRow>
              <CoversTracker data={tablePerformance} isLoading={isLoadingTable} />
            </AnalyticsRow>
            <AnalyticsRow>
              <RevenueSeatHour data={tablePerformance?.hourly_revpash} isLoading={isLoadingTable} />
            </AnalyticsRow>
            <AnalyticsRow>
              <ServiceTimelineBreakdown phases={tablePerformance?.service_phases} isLoading={isLoadingTable} />
            </AnalyticsRow>
            <AnalyticsRow>
              <TableUtilization tables={tablePerformance?.table_utilization} isLoading={isLoadingTable} />
            </AnalyticsRow>
            <AnalyticsRow>
              <SectionHeatmap sections={tablePerformance?.section_stats} isLoading={isLoadingTable} />
            </AnalyticsRow>
          </AnalyticsPanel>
        </TabsContent>

        {/* STAFF TAB */}
        <TabsContent value="staff">
          <AnalyticsPanel>
            <AnalyticsRow first>
              <ServerLeaderboardCard
                data={staffPerformance}
                isLoading={isLoadingStaff}
                metric={leaderboardMetric}
                onMetricChange={setLeaderboardMetric}
              />
            </AnalyticsRow>
            <AnalyticsRow>
              <TipsAnalysisCard data={staffPerformance} isLoading={isLoadingStaff} />
            </AnalyticsRow>
            <AnalyticsRow>
              <StaffOrderActivityCard data={staffPerformance} isLoading={isLoadingStaff} />
            </AnalyticsRow>
          </AnalyticsPanel>
        </TabsContent>

        {/* ORDER FLOW TAB */}
        <TabsContent value="orders">
          <AnalyticsPanel>
            <AnalyticsRow first>
              <OrderStatusFunnel data={orderFlow} isLoading={isLoadingOrderFlow} />
            </AnalyticsRow>
            <AnalyticsRow>
              <OrderTypeBreakdown data={orderFlow} isLoading={isLoadingOrderFlow} />
            </AnalyticsRow>
            <AnalyticsRow>
              <AvgCompletionTime data={orderFlow} isLoading={isLoadingOrderFlow} />
            </AnalyticsRow>
            <AnalyticsRow>
              <VoidRefundAnalysis data={orderFlow} isLoading={isLoadingOrderFlow} />
            </AnalyticsRow>
          </AnalyticsPanel>
        </TabsContent>
      </Tabs>
    </main>
  )
}
