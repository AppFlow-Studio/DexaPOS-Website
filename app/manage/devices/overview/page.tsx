'use client'

import Link from 'next/link'
import {
  AlertTriangle,
  Boxes,
  HardDrive,
  Link2,
  Truck,
  Warehouse,
} from 'lucide-react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import { useAdminDeviceOverview } from '@/app/manage/hooks/useDeviceRegistry'
import { DeviceRegistryPageHeader } from '@/app/manage/devices/components/DeviceRegistryPageHeader'
import { OverviewBodySkeleton } from '@/app/manage/devices/components/skeletons'
import {
  AnalyticsPanel,
  AnalyticsTooltip,
  CATEGORY_AXIS_WIDTH,
  CategoryTick,
  ColumnTick,
  valueAxisWidthMobile,
} from '@/app/manage/components/analytics-primitives'
import {
  CHART_CURSOR_FILL,
  CHART_GRID,
  CHART_TICK,
  ChartEmpty,
  PageShell,
  Panel,
  StatRow,
  StatTile,
  isEmptySeries,
} from '@/components/dashboard/shell'
import { Button } from '@/components/ui/button'
import { useIsMobile } from '@/hooks/use-mobile'
import {
  formatDeviceCategory,
  formatDeviceStatus,
} from '@/lib/device-registry/presentation'
import type { DeviceCategory, DeviceLifecycleStatus } from '@/types/device-registry'

const BAR_CHART_HEIGHT = 300
const TREND_CHART_HEIGHT = 260

function formatCount(value: number) {
  return value.toLocaleString('en-US')
}

function unitsLabel(value: number) {
  return `${formatCount(value)} ${value === 1 ? 'unit' : 'units'}`
}

export default function DeviceRegistryOverviewPage() {
  const overviewQuery = useAdminDeviceOverview()
  const overview = overviewQuery.data
  const isMobile = useIsMobile()

  // Single-series charts: every bar is the same measure, so one colour
  // (`var(--brand)`, §6.1). A hue per status or per category encoded nothing.
  const statusChartData = (overview?.statusBreakdown ?? [])
    .filter((item) => item.value > 0)
    .map((item) => ({
      label: formatDeviceStatus(item.key as DeviceLifecycleStatus),
      value: item.value,
    }))

  const categoryChartData = (overview?.categoryBreakdown ?? [])
    .filter((item) => item.value > 0)
    .map((item) => ({
      label: formatDeviceCategory(item.key as DeviceCategory),
      value: item.value,
    }))

  const merchantChartData = (overview?.merchantBreakdown ?? []).map((item) => ({
    label: item.merchantName,
    value: item.value,
  }))

  const registrationTrend = overview?.registrationTrend ?? []
  const trendMax = Math.max(0, ...registrationTrend.map((row) => row.value))

  return (
    <PageShell as="div">
      <DeviceRegistryPageHeader
        title="Fleet overview"
        description="HQ summary of current fleet posture, warranty exposure, ownership distribution, and recent intake."
        backHref="/manage/devices"
        backLabel="Back to inventory"
        showSectionNav={false}
      />

      {overviewQuery.isLoading ? (
        <>
          <p role="status" className="sr-only">Loading the fleet overview</p>
          <OverviewBodySkeleton />
        </>
      ) : overviewQuery.isError || !overview ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-2xl bg-muted/30 px-4 py-20 text-center">
          <p className="text-sm font-medium">We hit a snag loading the fleet overview</p>
          <p className="max-w-md text-xs text-muted-foreground">
            {overviewQuery.error?.message ?? 'The device overview could not be loaded.'}
          </p>
          <Button variant="outline" size="sm" onClick={() => void overviewQuery.refetch()}>
            Retry
          </Button>
        </div>
      ) : (
        <>
          <Panel padded>
            <StatRow columns={3}>
              <StatTile
                label="Total fleet"
                icon={<Boxes />}
                value={formatCount(overview.kpis.total)}
                meta="All inventory rows currently tracked"
              />
              <StatTile
                label="Deployed"
                icon={<HardDrive />}
                value={formatCount(overview.kpis.deployed)}
                meta="Active units tied to merchant operations"
              />
              <StatTile
                label="Warehouse"
                icon={<Warehouse />}
                value={formatCount(overview.kpis.warehouse)}
                meta="Available stock in DEXA inventory"
              />
              <StatTile
                label="Transit / provisioning"
                icon={<Truck />}
                value={formatCount(overview.kpis.inTransit)}
                meta="Allocated, shipping, or provisioning"
              />
              <StatTile
                label="Needs attention"
                icon={<AlertTriangle />}
                value={formatCount(overview.kpis.needsAttention)}
                meta="Repair, loss, or RMA"
              />
              <StatTile
                label="Unlinked units"
                icon={<Link2 />}
                value={formatCount(overview.kpis.unlinked)}
                meta="No station, terminal, or printer link yet"
              />
            </StatRow>
          </Panel>

          {overview.kpis.total === 0 ? (
            <Panel>
              <div className="flex min-h-40 flex-col items-center justify-center gap-2 px-4 py-12 text-center">
                <p className="text-sm font-medium">No devices in the registry yet</p>
                <p className="max-w-md text-xs text-muted-foreground">
                  Charts and the warranty watchlist will fill in once hardware is added to inventory.
                </p>
                <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
                  <Button asChild variant="outline" size="sm">
                    <Link href="/manage/devices">Open inventory</Link>
                  </Button>
                  <Button asChild variant="outline" size="sm">
                    <Link href="/manage/device-catalog">Open catalog</Link>
                  </Button>
                </div>
              </div>
            </Panel>
          ) : (
            <>
              <div className="grid min-w-0 items-start gap-6 md:grid-cols-2">
                <AnalyticsPanel title="Status breakdown" caption="Current lifecycle distribution across the fleet.">
                  {isEmptySeries(statusChartData, (row) => row.value) ? (
                    <ChartEmpty
                      height={BAR_CHART_HEIGHT}
                      title="No lifecycle data yet"
                      hint="Statuses will appear here once units are tracked."
                    />
                  ) : (
                    <BreakdownBarChart data={statusChartData} name="Devices" isMobile={isMobile} />
                  )}
                </AnalyticsPanel>

                <AnalyticsPanel title="Category mix" caption="Fleet volume by hardware class.">
                  {isEmptySeries(categoryChartData, (row) => row.value) ? (
                    <ChartEmpty
                      height={BAR_CHART_HEIGHT}
                      title="No hardware classes yet"
                      hint="Categories will appear here once units are tracked."
                    />
                  ) : (
                    <BreakdownBarChart data={categoryChartData} name="Devices" isMobile={isMobile} />
                  )}
                </AnalyticsPanel>
              </div>

              <div className="grid min-w-0 items-start gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
                <AnalyticsPanel
                  title="Recent registry intake"
                  caption="Physical units added to the registry over the last six months."
                >
                  {isEmptySeries(registrationTrend, (row) => row.value) ? (
                    <ChartEmpty
                      height={TREND_CHART_HEIGHT}
                      title="No units registered in the last six months"
                      hint="New inventory will appear here as it is added."
                    />
                  ) : (
                    <ResponsiveContainer width="100%" height={TREND_CHART_HEIGHT}>
                      <AreaChart data={registrationTrend} margin={{ top: 4, right: 24, left: 0, bottom: 0 }}>
                        <CartesianGrid {...CHART_GRID} vertical={false} />
                        <XAxis dataKey="month" tick={CHART_TICK} tickLine={false} axisLine={false} />
                        <YAxis
                          allowDecimals={false}
                          tick={CHART_TICK}
                          tickLine={false}
                          axisLine={false}
                          width={isMobile ? valueAxisWidthMobile(String(trendMax).length) : 40}
                        />
                        <Tooltip content={<AnalyticsTooltip formatter={unitsLabel} />} />
                        <Area
                          type="monotone"
                          dataKey="value"
                          name="Registered"
                          stroke="var(--brand)"
                          fill="var(--brand)"
                          fillOpacity={0.12}
                          strokeWidth={2}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  )}
                </AnalyticsPanel>

                <AnalyticsPanel title="Warranty watchlist" caption="Units whose warranty ends within each window.">
                  <StatRow columns={2} className="grid-cols-2 gap-x-4">
                    <StatTile label="Within 30 days" value={formatCount(overview.kpis.warranty30)} />
                    <StatTile label="Within 60 days" value={formatCount(overview.kpis.warranty60)} />
                    <StatTile label="Within 90 days" value={formatCount(overview.kpis.warranty90)} />
                    <StatTile label="Expired" value={formatCount(overview.kpis.expiredWarranty)} />
                  </StatRow>
                </AnalyticsPanel>
              </div>

              <AnalyticsPanel title="Merchant distribution" caption="Top merchants by assigned device count.">
                {isEmptySeries(merchantChartData, (row) => row.value) ? (
                  <ChartEmpty
                    height={BAR_CHART_HEIGHT}
                    title="No devices assigned to merchants yet"
                    hint="Merchants will appear here once units are allocated."
                  />
                ) : (
                  <BreakdownBarChart
                    data={merchantChartData}
                    name="Assigned"
                    isMobile={isMobile}
                    desktopHeight={Math.max(BAR_CHART_HEIGHT, merchantChartData.length * 40)}
                  />
                )}
              </AnalyticsPanel>
            </>
          )}
        </>
      )}
    </PageShell>
  )
}

/**
 * One single-series breakdown, in `var(--brand)` (§6.1). From `md` up the bars
 * run horizontally with the names in a wrapping gutter. On phones they stand
 * as columns, the names wrapped beneath each one, so the chart uses the full
 * width instead of giving a third of it to the label gutter.
 */
function BreakdownBarChart({
  data,
  name,
  isMobile,
  desktopHeight = BAR_CHART_HEIGHT,
}: {
  data: Array<{ label: string; value: number }>
  name: string
  isMobile: boolean
  desktopHeight?: number
}) {
  const tooltip = (
    <Tooltip cursor={{ fill: CHART_CURSOR_FILL }} content={<AnalyticsTooltip formatter={unitsLabel} />} />
  )

  if (isMobile) {
    const max = Math.max(0, ...data.map((row) => row.value))
    return (
      <ResponsiveContainer width="100%" height={BAR_CHART_HEIGHT}>
        <BarChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
          <CartesianGrid {...CHART_GRID} vertical={false} />
          <XAxis
            dataKey="label"
            type="category"
            interval={0}
            tickLine={false}
            axisLine={false}
            height={36}
            tick={<ColumnTick />}
          />
          <YAxis
            type="number"
            allowDecimals={false}
            tick={CHART_TICK}
            tickLine={false}
            axisLine={false}
            width={valueAxisWidthMobile(String(max).length)}
          />
          {tooltip}
          <Bar dataKey="value" name={name} fill="var(--brand)" radius={[6, 6, 0, 0]} maxBarSize={48} />
        </BarChart>
      </ResponsiveContainer>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={desktopHeight}>
      <BarChart data={data} layout="vertical" margin={{ left: 0, right: 24 }}>
        <CartesianGrid {...CHART_GRID} horizontal={false} />
        <XAxis type="number" allowDecimals={false} tick={CHART_TICK} tickLine={false} axisLine={false} />
        <YAxis
          dataKey="label"
          type="category"
          width={CATEGORY_AXIS_WIDTH.desktop}
          tickLine={false}
          axisLine={false}
          interval={0}
          tick={<CategoryTick width={CATEGORY_AXIS_WIDTH.desktop} />}
        />
        {tooltip}
        <Bar dataKey="value" name={name} fill="var(--brand)" radius={[0, 6, 6, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}
