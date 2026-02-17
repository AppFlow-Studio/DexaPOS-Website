'use client'

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import { ChartContainer, ChartTooltip, type ChartConfig } from '@/components/ui/chart'
import { ChartCard } from './ChartCard'
import { DataTable } from '@/components/ui/data-table'
import { ColumnDef } from '@tanstack/react-table'
import { Clock, InfoIcon } from 'lucide-react'
import type { OrderFlowStats, CompletionTimeRow } from '@/types/analytics'

interface AvgCompletionTimeProps {
  data?: OrderFlowStats | null
  isLoading?: boolean
}

const chartConfig = {
  avg: {
    label: 'Average',
    color: '#0A5C9E', // Dexa blue
  },
  min: {
    label: 'Minimum',
    color: '#10B981', // emerald green
  },
  max: {
    label: 'Maximum',
    color: '#EF4444', // red
  },
} satisfies ChartConfig

export function AvgCompletionTime({ data, isLoading }: AvgCompletionTimeProps) {
  const isEmpty = !data || data.completion_times.length === 0

  // Transform data for grouped bar chart
  const chartData = data?.completion_times?.map((row) => ({
    name: row.order_type.replace(/_/g, ' ').toUpperCase(),
    avg: row.avg_minutes,
    min: row.min_minutes,
    max: row.max_minutes,
  })) || []

  const columns: ColumnDef<CompletionTimeRow>[] = [
    {
      accessorKey: 'order_type',
      header: 'Order Type',
      cell: ({ row }) => (
        <div className="font-medium capitalize">
          {(row.getValue('order_type') as string).replace(/_/g, ' ')}
        </div>
      ),
    },
    {
      accessorKey: 'avg_minutes',
      header: 'Avg Minutes',
      cell: ({ row }) => (
        <div>{(row.getValue('avg_minutes') as number).toFixed(1)} min</div>
      ),
    },
    {
      accessorKey: 'min_minutes',
      header: 'Min',
      cell: ({ row }) => (
        <div>{(row.getValue('min_minutes') as number).toFixed(1)} min</div>
      ),
    },
    {
      accessorKey: 'max_minutes',
      header: 'Max',
      cell: ({ row }) => (
        <div>{(row.getValue('max_minutes') as number).toFixed(1)} min</div>
      ),
    },
    {
      accessorKey: 'order_count',
      header: 'Order Count',
      cell: ({ row }) => row.getValue('order_count'),
    },
  ]

  return (
    <ChartCard
      title="Avg Completion Time"
      subtitle="Average time from order to completion by type"
      icon={Clock}
      isLoading={isLoading}
      isEmpty={isEmpty}
      emptyMessage="No completion time data available"
    >
      <div className="space-y-6">
        {/* Grouped Bar Chart */}
        {chartData.length > 0 && (
          <ChartContainer config={chartConfig} className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis
                  label={{ value: 'Minutes', angle: -90, position: 'insideLeft' }}
                  domain={[0, 'auto']}
                />
                <ChartTooltip
                  content={({ active, payload, label }) => {
                    if (active && payload && payload.length) {
                      return (
                        <div className="bg-white dark:bg-slate-950 p-3 rounded border border-slate-200 dark:border-slate-700 shadow-lg">
                          <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2">
                            {label}
                          </p>
                          {payload.map((item, index) => (
                            <div key={index} className="flex items-center justify-between gap-2">
                              <span className="text-xs text-slate-700 dark:text-slate-300">
                                {item.name}:
                              </span>
                              <span className="text-xs font-bold text-slate-900 dark:text-slate-100">
                                {Number(item.value).toFixed(1)} min
                              </span>
                            </div>
                          ))}
                        </div>
                      )
                    }
                    return null
                  }}
                />
                <Legend />
                <Bar
                  dataKey="avg"
                  fill={chartConfig.avg.color}
                  radius={[4, 4, 0, 0]}
                  barSize={20}
                />
                <Bar
                  dataKey="min"
                  fill={chartConfig.min.color}
                  radius={[4, 4, 0, 0]}
                  barSize={20}
                />
                <Bar
                  dataKey="max"
                  fill={chartConfig.max.color}
                  radius={[4, 4, 0, 0]}
                  barSize={20}
                />
              </BarChart>
            </ResponsiveContainer>
          </ChartContainer>
        )}

        {/* Info Box - DexaPOS themed */}
        <div className="rounded-lg bg-[#0A5C9E]/10 p-4 flex gap-3">
          <InfoIcon className="h-4 w-4 text-[#0A5C9E] flex-shrink-0 mt-0.5" />
          <p className="text-sm text-[#0A5C9E]">
            Dine-in orders naturally take longer due to table service. Bars show average (blue), minimum (green), and maximum (red) times.
          </p>
        </div>

        {/* Data Table */}
        {data?.completion_times && (
          <div>
            <h3 className="text-sm font-semibold mb-4">Completion Time Details</h3>
            <DataTable columns={columns} data={data.completion_times} />
          </div>
        )}
      </div>
    </ChartCard>
  )
}