'use client'

import { ChartCard } from './ChartCard'
import {
  AnalyticsSubLabel,
  CHART_CURSOR_FILL,
  CHART_GRID,
  CHART_TICK,
  ChartTooltipPanel,
} from './AnalyticsPrimitives'
import { DataTable } from '@/components/ui/data-table'
import { ChartContainer, ChartTooltip, type ChartConfig } from '@/components/ui/chart'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend } from 'recharts'
import { Badge } from '@/components/ui/badge'
import { Activity } from 'lucide-react'
import type { KitchenStationStats } from '@/types/analytics'
import type { ColumnDef } from '@tanstack/react-table'

interface StationPerformanceCardProps {
  stations?: KitchenStationStats[]
  isLoading?: boolean
}

const COLORS = {
  prepTime: '#3B82F6',      // Blue
  completionRate: '#10B981', // Emerald
  itemsProcessed: '#F59E0B', // Amber
}

const chartConfig = {
  avg_prep_minutes: {
    label: 'Avg Prep Time (min)',
    color: COLORS.prepTime,
  },
  items_per_hour: {
    label: 'Items/Hour',
    color: COLORS.completionRate,
  },
  total_items: {
    label: 'Total Items',
    color: COLORS.itemsProcessed,
  },
} satisfies ChartConfig

export function StationPerformanceCard({
  stations,
  isLoading,
}: StationPerformanceCardProps) {
  const formatTime = (minutes: number) => {
    const mins = Math.floor(minutes)
    const secs = Math.round((minutes - mins) * 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  // Prepare chart data with normalized values for display
  const chartData = stations?.map((station) => ({
    name: station.display_name,
    avg_prep_minutes: Number(station.avg_prep_minutes.toFixed(1)),
    items_per_hour: Number((station.total_items / 8).toFixed(1)), // Approximate items per hour
    total_items: station.total_items,
  })) || []

  const columns: ColumnDef<KitchenStationStats>[] = [
    {
      accessorKey: 'display_name',
      header: 'Station',
    },
    {
      accessorKey: 'total_items',
      header: 'Items',
      cell: ({ row }) => row.getValue('total_items'),
    },
    {
      accessorKey: 'avg_prep_minutes',
      header: 'Avg Prep Time',
      cell: ({ row }) => formatTime((row.getValue('avg_prep_minutes') as number) ?? 0),
    },
    {
      accessorKey: 'manual_completed',
      header: 'Completed',
      cell: ({ row }) => (
        <span className="tabular-nums">
          {row.getValue('manual_completed') as number}
          <span className="ml-2 text-muted-foreground">
            {(
              ((row.getValue('manual_completed') as number) /
                ((row.getValue('total_items') as number) || 1)) *
              100
            ).toFixed(0)}
            %
          </span>
        </span>
      ),
    },
    {
      accessorKey: 'auto_bumped',
      header: 'Auto-Bumped',
      cell: ({ row }) => (
        <span className="tabular-nums">{row.getValue('auto_bumped') as number}</span>
      ),
    },
    {
      accessorKey: 'alert_threshold_minutes',
      header: 'Alert Threshold',
      cell: ({ row }) =>
        `${row.getValue('alert_threshold_minutes')} min`,
    },
  ]

  return (
    <ChartCard
      title="Station Performance"
      subtitle="Per-station metrics and bottleneck analysis"
      icon={Activity}
      isLoading={isLoading}
      isEmpty={!stations || stations.length === 0}
      className="lg:col-span-2"
    >
      {stations && stations.length > 0 && (
        <div className="space-y-6">
          {/* Bar Chart */}
          <div className="w-full h-[300px]">
            <ChartContainer config={chartConfig} className="aspect-auto w-full h-full">
                <BarChart data={chartData} margin={{ left: 0, right: 10, top: 5, bottom: 20 }}>
                  <CartesianGrid vertical={false} {...CHART_GRID} />
                  <XAxis
                    dataKey="name"
                    tickLine={false}
                    axisLine={false}
                    tick={CHART_TICK}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    tick={CHART_TICK}
                  />
                  <ChartTooltip
                    cursor={{ fill: CHART_CURSOR_FILL }}
                    content={({ active, payload, label }) => {
                      if (active && payload && payload.length) {
                        return (
                          <ChartTooltipPanel
                            label={label}
                            items={payload.map((item) => ({
                              name: item.name,
                              color: item.color,
                              value:
                                item.name === 'Avg Prep Time (min)'
                                  ? `${Number(item.value).toFixed(1)}m`
                                  : Number(item.value).toFixed(1),
                            }))}
                          />
                        )
                      }
                      return null
                    }}
                  />
                  <Bar dataKey="avg_prep_minutes" fill={COLORS.prepTime} name="Avg Prep Time (min)" />
                  <Bar dataKey="items_per_hour" fill={COLORS.completionRate} name="Items/Hour" />
                  <Bar dataKey="total_items" fill={COLORS.itemsProcessed} name="Total Items" />
                  <Legend
                    iconType="circle"
                    formatter={(value) => (
                      <span className="text-[0.8125rem] text-muted-foreground">{value}</span>
                    )}
                  />
                </BarChart>
            </ChartContainer>
          </div>

          {/* Detail Table */}
          <div>
            <AnalyticsSubLabel>Detailed breakdown</AnalyticsSubLabel>
            <DataTable columns={columns} data={stations} tableClassName="min-w-[560px]" />
          </div>
        </div>
      )}
    </ChartCard>
  )
}
