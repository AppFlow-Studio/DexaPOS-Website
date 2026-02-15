'use client'

import {
  BarChart,
  Bar,
  ErrorBar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart'
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
  avg_minutes: {
    label: 'Avg Minutes',
    color: '#3b82f6',
  },
} satisfies ChartConfig

export function AvgCompletionTime({ data, isLoading }: AvgCompletionTimeProps) {
  const isEmpty = !data || data.completion_times.length === 0

  const chartData = data?.completion_times?.map((row) => ({
    name: row.order_type.replace(/_/g, ' ').toUpperCase(),
    value: row.avg_minutes,
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
        {/* Bar Chart with Error Bars */}
        {chartData.length > 0 && (
          <ChartContainer config={chartConfig} className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis label={{ value: 'Minutes', angle: -90, position: 'insideLeft' }} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="value" fill="#3b82f6" radius={[8, 8, 0, 0]}>
                  <ErrorBar
                    dataKey="max"
                    width={4}
                    strokeWidth={2}
                    stroke="#ef4444"
                    direction="y"
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartContainer>
        )}

        {/* Info Box */}
        <div className="rounded-lg bg-blue-50 dark:bg-blue-950 p-4 flex gap-3">
          <InfoIcon className="h-4 w-4 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-blue-900 dark:text-blue-200">
            Dine-in orders naturally take longer due to table service. Error bars show minimum to maximum times
            observed.
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
