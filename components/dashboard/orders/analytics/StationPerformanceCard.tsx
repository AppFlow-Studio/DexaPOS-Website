'use client'

import { ChartCard } from './ChartCard'
import { DataTable } from '@/components/ui/data-table'
import { ChartContainer, ChartTooltip, type ChartConfig } from '@/components/ui/chart'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend, ResponsiveContainer } from 'recharts'
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
        <div className="flex items-center gap-2">
          <span>{row.getValue('manual_completed')}</span>
          <Badge variant="outline" className="text-xs">
            {(
              ((row.getValue('manual_completed') as number) /
                ((row.getValue('total_items') as number) || 1)) *
              100
            ).toFixed(0)}
            %
          </Badge>
        </div>
      ),
    },
    {
      accessorKey: 'auto_bumped',
      header: 'Auto-Bumped',
      cell: ({ row }) => (
        <Badge variant="secondary">{row.getValue('auto_bumped')}</Badge>
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
            <ChartContainer config={chartConfig} className="w-full h-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ left: 0, right: 10, top: 5, bottom: 20 }}>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" />
                  <XAxis
                    dataKey="name"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 12 }}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 12 }}
                  />
                  <ChartTooltip
                    cursor={{ fill: 'rgba(0, 0, 0, 0.1)' }}
                    content={({ active, payload, label }) => {
                      if (active && payload && payload.length) {
                        return (
                          <div className="bg-white dark:bg-slate-950 p-3 rounded border border-slate-200 dark:border-slate-700 shadow-lg">
                            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2">
                              {label}
                            </p>
                            <div className="space-y-1">
                              {payload.map((item, index) => (
                                <div key={index} className="flex items-center justify-between gap-2">
                                  <span className="text-xs text-slate-700 dark:text-slate-300">
                                    {item.name}:
                                  </span>
                                  <span className="text-xs font-bold text-slate-900 dark:text-slate-100">
                                    {item.name === 'Avg Prep Time (min)' ? `${Number(item.value).toFixed(1)}m` : Number(item.value).toFixed(1)}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )
                      }
                      return null
                    }}
                  />
                  <Bar dataKey="avg_prep_minutes" fill={COLORS.prepTime} name="Avg Prep Time (min)" />
                  <Bar dataKey="items_per_hour" fill={COLORS.completionRate} name="Items/Hour" />
                  <Bar dataKey="total_items" fill={COLORS.itemsProcessed} name="Total Items" />
                  <Legend />
                </BarChart>
              </ResponsiveContainer>
            </ChartContainer>
          </div>

          {/* Detail Table */}
          <div>
            <p className="text-xs font-semibold mb-3 text-muted-foreground">Detailed Breakdown</p>
            <DataTable columns={columns} data={stations} />
          </div>
        </div>
      )}
    </ChartCard>
  )
}
