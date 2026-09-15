'use client'

import Link from 'next/link'
import {
  AlertTriangle,
  Boxes,
  HardDrive,
  Link2,
  ShieldAlert,
  Truck,
  Warehouse,
} from 'lucide-react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  XAxis,
  YAxis,
} from 'recharts'

import { useAdminDeviceOverview } from '@/app/manage/hooks/useDeviceRegistry'
import { DeviceRegistryMetricCard } from '@/app/manage/devices/components/DeviceRegistryMetricCard'
import { DeviceRegistryPageHeader } from '@/app/manage/devices/components/DeviceRegistryPageHeader'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart'
import { Empty } from '@/components/ui/empty'
import { Skeleton } from '@/components/ui/skeleton'
import {
  formatDeviceCategory,
  formatDeviceStatus,
} from '@/lib/device-registry/presentation'
import type { DeviceCategory, DeviceLifecycleStatus } from '@/types/device-registry'

const STATUS_COLORS: Record<string, string> = {
  in_warehouse: '#3B82F6',
  allocated: '#8B5CF6',
  shipped: '#6366F1',
  provisioning: '#14B8A6',
  deployed: '#22C55E',
  in_repair: '#F59E0B',
  decommissioned: '#6B7280',
  lost: '#EF4444',
  rma: '#F97316',
}

const CATEGORY_COLORS = ['#0F766E', '#2563EB', '#7C3AED', '#EA580C', '#0891B2', '#BE185D', '#4F46E5']

function buildStatusChartConfig(data: Array<{ key: string; label: string }>) {
  return Object.fromEntries(
    data.map((item) => [
      item.key,
      {
        label: formatDeviceStatus(item.key as DeviceLifecycleStatus),
        color: STATUS_COLORS[item.key] ?? '#64748B',
      },
    ])
  )
}

function buildCategoryChartConfig(data: Array<{ key: string; label: string }>) {
  return Object.fromEntries(
    data.map((item, index) => [
      item.key,
      {
        label: formatDeviceCategory(item.key as DeviceCategory),
        color: CATEGORY_COLORS[index % CATEGORY_COLORS.length],
      },
    ])
  )
}

export default function DeviceRegistryOverviewPage() {
  const overviewQuery = useAdminDeviceOverview()
  const overview = overviewQuery.data

  const statusChartData =
    overview?.statusBreakdown.map((item) => ({
      ...item,
      name: item.key,
      label: formatDeviceStatus(item.key as DeviceLifecycleStatus),
      fill: STATUS_COLORS[item.key] ?? '#64748B',
    })) ?? []

  const categoryChartData =
    overview?.categoryBreakdown.map((item, index) => ({
      ...item,
      name: item.key,
      label: formatDeviceCategory(item.key as DeviceCategory),
      fill: CATEGORY_COLORS[index % CATEGORY_COLORS.length],
    })) ?? []

  const merchantChartData =
    overview?.merchantBreakdown.map((item, index) => ({
      ...item,
      fill: CATEGORY_COLORS[index % CATEGORY_COLORS.length],
    })) ?? []

  const statusChartConfig = buildStatusChartConfig(overview?.statusBreakdown ?? [])
  const categoryChartConfig = buildCategoryChartConfig(overview?.categoryBreakdown ?? [])

  return (
    <div className="min-w-0 space-y-6 overflow-x-hidden">
      <DeviceRegistryPageHeader
        title="Fleet overview"
        description="HQ summary of current fleet posture, warranty exposure, ownership distribution, and recent intake."
        actions={
          <>
          <Button asChild>
            <Link href="/manage/devices">Open inventory</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/manage/device-catalog">Open catalog</Link>
          </Button>
          </>
        }
      />

      {overviewQuery.isLoading ? (
        <div className="space-y-4">
          <div className="grid min-w-0 gap-4 md:grid-cols-2 xl:grid-cols-3 [&>*]:min-w-0">
            {Array.from({ length: 6 }).map((_, index) => (
              <DeviceRegistryMetricCard
                key={index}
                label="Loading"
                value="-"
                detail="Loading metric"
                icon={Boxes}
                loading
              />
            ))}
          </div>
          <div className="grid min-w-0 gap-6 xl:grid-cols-2 [&>*]:min-w-0">
            <Skeleton className="h-[360px] w-full" />
            <Skeleton className="h-[360px] w-full" />
          </div>
          <div className="grid min-w-0 gap-6 xl:grid-cols-2 [&>*]:min-w-0">
            <Skeleton className="h-[320px] w-full" />
            <Skeleton className="h-[320px] w-full" />
          </div>
        </div>
      ) : overviewQuery.isError || !overview ? (
        <Empty
          icon={ShieldAlert}
          title="Overview unavailable"
          description={overviewQuery.error?.message ?? 'The device overview could not be loaded.'}
        />
      ) : (
        <>
          <div className="grid min-w-0 gap-4 md:grid-cols-2 xl:grid-cols-3 [&>*]:min-w-0">
            <DeviceRegistryMetricCard
              label="Total fleet"
              value={overview.kpis.total}
              detail="All inventory rows currently tracked."
              icon={Boxes}
            />
            <DeviceRegistryMetricCard
              label="Deployed"
              value={overview.kpis.deployed}
              detail="Active production units tied to merchant operations."
              icon={HardDrive}
            />
            <DeviceRegistryMetricCard
              label="Warehouse"
              value={overview.kpis.warehouse}
              detail="Available stock sitting in DEXA inventory."
              icon={Warehouse}
            />
            <DeviceRegistryMetricCard
              label="Transit / provisioning"
              value={overview.kpis.inTransit}
              detail="Units in allocation, shipping, or provisioning states."
              icon={Truck}
            />
            <DeviceRegistryMetricCard
              label="Needs attention"
              value={overview.kpis.needsAttention}
              detail="Repair, loss, or RMA states requiring follow-up."
              icon={AlertTriangle}
            />
            <DeviceRegistryMetricCard
              label="Unlinked units"
              value={overview.kpis.unlinked}
              detail="Inventory rows with no station, terminal, or printer link yet."
              icon={Link2}
            />
          </div>

          {overview.kpis.total === 0 ? (
            <Card>
              <CardContent className="py-12">
                <Empty
                  icon={Boxes}
                  title="No registry inventory yet"
                  description="The overview is ready, but it needs device_inventory rows before charts and watchlists can render meaningful data."
                  action={
                    <div className="flex flex-wrap items-center justify-center gap-3">
                      <Button asChild>
                        <Link href="/manage/devices">Open inventory</Link>
                      </Button>
                      <Button asChild variant="outline">
                        <Link href="/manage/device-catalog">Open catalog</Link>
                      </Button>
                    </div>
                  }
                />
              </CardContent>
            </Card>
          ) : (
            <>
              <div className="grid min-w-0 gap-6 xl:grid-cols-2 [&>*]:min-w-0">
                <Card className="min-w-0 overflow-hidden">
                  <CardHeader>
                    <CardTitle>Status breakdown</CardTitle>
                    <CardDescription>
                      Current lifecycle distribution across the fleet.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="min-w-0 px-2 sm:px-6">
                    <ChartContainer
                      config={statusChartConfig}
                      className="h-[320px] w-full"
                    >
                      <PieChart>
                        <ChartTooltip
                          cursor={false}
                          content={<ChartTooltipContent hideLabel nameKey="name" />}
                        />
                        <Pie
                          data={statusChartData}
                          dataKey="value"
                          nameKey="name"
                          innerRadius="38%"
                          outerRadius="62%"
                          strokeWidth={4}
                        >
                          {statusChartData.map((entry) => (
                            <Cell key={entry.key} fill={entry.fill} />
                          ))}
                        </Pie>
                        <ChartLegend
                          content={<ChartLegendContent nameKey="name" className="flex-wrap" />}
                        />
                      </PieChart>
                    </ChartContainer>
                  </CardContent>
                </Card>

                <Card className="min-w-0 overflow-hidden">
                  <CardHeader>
                    <CardTitle>Category mix</CardTitle>
                    <CardDescription>
                      Fleet volume by hardware class.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="min-w-0 px-2 sm:px-6">
                    <ChartContainer
                      config={categoryChartConfig}
                      className="h-[320px] w-full"
                    >
                      <BarChart data={categoryChartData} layout="vertical" margin={{ left: 0, right: 8 }}>
                        <CartesianGrid horizontal={false} strokeDasharray="3 3" />
                        <XAxis type="number" allowDecimals={false} />
                        <YAxis
                          dataKey="label"
                          type="category"
                          width={104}
                          tickLine={false}
                          axisLine={false}
                          tickFormatter={(value: string) => value.length > 16 ? `${value.slice(0, 15)}…` : value}
                        />
                        <ChartTooltip
                          cursor={false}
                          content={<ChartTooltipContent hideLabel />}
                        />
                        <Bar dataKey="value" radius={[0, 8, 8, 0]}>
                          {categoryChartData.map((entry) => (
                            <Cell key={entry.key} fill={entry.fill} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ChartContainer>
                  </CardContent>
                </Card>
              </div>

              <div className="grid min-w-0 gap-6 xl:grid-cols-[1.2fr_0.8fr] [&>*]:min-w-0">
                <Card className="min-w-0 overflow-hidden">
                  <CardHeader>
                    <CardTitle>Recent registry intake</CardTitle>
                    <CardDescription>
                      Physical units added to the registry over the last six months.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="min-w-0 px-2 sm:px-6">
                    <ChartContainer
                      config={{ value: { label: 'Devices registered', color: '#2563EB' } }}
                      className="h-[300px] w-full"
                    >
                      <AreaChart data={overview.registrationTrend} margin={{ left: 0, right: 8 }}>
                        <defs>
                          <linearGradient id="device-registry-trend" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#2563EB" stopOpacity={0.35} />
                            <stop offset="95%" stopColor="#2563EB" stopOpacity={0.02} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="month" tickLine={false} axisLine={false} />
                        <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
                        <ChartTooltip content={<ChartTooltipContent />} />
                        <Area
                          type="monotone"
                          dataKey="value"
                          stroke="#2563EB"
                          fill="url(#device-registry-trend)"
                          strokeWidth={2}
                        />
                      </AreaChart>
                    </ChartContainer>
                  </CardContent>
                </Card>

                <Card className="min-w-0 overflow-hidden">
                  <CardHeader>
                    <CardTitle>Warranty watchlist</CardTitle>
                    <CardDescription>
                      Warranty exposure windows based on `warranty_expires_at`.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="rounded-2xl border bg-muted/20 p-4">
                      <div className="text-sm font-medium">30-day window</div>
                      <div className="mt-2 text-3xl font-semibold">{overview.kpis.warranty30}</div>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-3 xl:grid-cols-1">
                      <div className="rounded-2xl border bg-muted/20 p-4">
                        <div className="text-sm font-medium">60-day window</div>
                        <div className="mt-2 text-2xl font-semibold">{overview.kpis.warranty60}</div>
                      </div>
                      <div className="rounded-2xl border bg-muted/20 p-4">
                        <div className="text-sm font-medium">90-day window</div>
                        <div className="mt-2 text-2xl font-semibold">{overview.kpis.warranty90}</div>
                      </div>
                      <div className="rounded-2xl border border-red-200 bg-red-50 p-4">
                        <div className="text-sm font-medium text-red-700">Expired</div>
                        <div className="mt-2 text-2xl font-semibold text-red-700">
                          {overview.kpis.expiredWarranty}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              <Card className="min-w-0 overflow-hidden">
                <CardHeader>
                  <CardTitle>Merchant distribution</CardTitle>
                  <CardDescription>
                    Top merchants by assigned device count.
                  </CardDescription>
                </CardHeader>
                <CardContent className="min-w-0 px-2 sm:px-6">
                  <ChartContainer
                    config={{ value: { label: 'Assigned units', color: '#0F766E' } }}
                    className="h-[340px] w-full"
                  >
                    <BarChart data={merchantChartData} layout="vertical" margin={{ left: 0, right: 8 }}>
                      <CartesianGrid horizontal={false} strokeDasharray="3 3" />
                      <XAxis type="number" allowDecimals={false} tickLine={false} axisLine={false} />
                      <YAxis
                        dataKey="merchantName"
                        type="category"
                        width={112}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(value: string) => value.length > 17 ? `${value.slice(0, 16)}…` : value}
                      />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <Bar dataKey="value" radius={[0, 8, 8, 0]}>
                        {merchantChartData.map((entry, index) => (
                          <Cell key={`${entry.merchantName}-${index}`} fill={entry.fill} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ChartContainer>
                </CardContent>
              </Card>
            </>
          )}
        </>
      )}
    </div>
  )
}
