'use client'

import { useMemo } from 'react'
import { PieChart, Pie, Cell, Legend } from 'recharts'
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart'
import { ChartCard } from './ChartCard'
import { DataTable } from '@/components/ui/data-table'
import { ColumnDef } from '@tanstack/react-table'
import { PieChart as PieChartIcon } from 'lucide-react'
import type { OrderFlowStats, OrderTypeStats } from '@/types/analytics'

interface OrderTypeBreakdownProps {
  data?: OrderFlowStats | null
  isLoading?: boolean
}

const chartConfig = {
  count: {
    label: 'Orders',
    color: '#3b82f6',
  },
} satisfies ChartConfig

const PIE_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6']

export function OrderTypeBreakdown({ data, isLoading }: OrderTypeBreakdownProps) {
  const isEmpty = !data || data.order_types.length === 0

  const pieData = useMemo(() => {
    if (!data?.order_types) return []
    return data.order_types.map((type) => ({
      name: type.order_type.replace(/_/g, ' ').toUpperCase(),
      value: type.count,
      originalName: type.order_type,
    }))
  }, [data?.order_types])

  const columns: ColumnDef<OrderTypeStats>[] = [
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
      accessorKey: 'count',
      header: 'Count',
      cell: ({ row }) => row.getValue('count'),
    },
    {
      accessorKey: 'total_revenue',
      header: 'Total Revenue',
      cell: ({ row }) => (
        <div className="font-medium">
          ${(row.getValue('total_revenue') as number).toFixed(2)}
        </div>
      ),
    },
    {
      accessorKey: 'avg_order_value',
      header: 'Avg Order Value',
      cell: ({ row }) => (
        <div>
          ${(row.getValue('avg_order_value') as number).toFixed(2)}
        </div>
      ),
    },
    {
      accessorKey: 'pct_of_total',
      header: '% of Total',
      cell: ({ row }) => (
        <div>
          {(row.getValue('pct_of_total') as number).toFixed(1)}%
        </div>
      ),
    },
  ]

  return (
    <ChartCard
      title="Order Type Breakdown"
      subtitle="Revenue and count by order type"
      icon={PieChartIcon}
      isLoading={isLoading}
      isEmpty={isEmpty}
      emptyMessage="No order type data available"
    >
      <div className="space-y-6">
        {/* Donut Chart */}
        {pieData.length > 0 && (
          <ChartContainer config={chartConfig} className="aspect-auto h-[300px] w-full">
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  innerRadius="45%"
                  outerRadius="80%"
                  fill="#3b82f6"
                  dataKey="value"
                >
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <ChartTooltip content={<ChartTooltipContent />} />
                <Legend
                  verticalAlign="bottom"
                  height={36}
                  wrapperStyle={{ fontSize: 12 }}
                  formatter={(value, entry) => {
                    const v = (entry?.payload as { value?: number } | undefined)?.value
                    return `${value}${v != null ? `: ${v}` : ''}`
                  }}
                />
              </PieChart>
          </ChartContainer>
        )}

        {/* Data Table */}
        {data?.order_types && (
          <div>
            <h3 className="text-sm font-semibold mb-4">Details by Order Type</h3>
            <DataTable columns={columns} data={data.order_types} tableClassName="min-w-[560px]" />
          </div>
        )}
      </div>
    </ChartCard>
  )
}
