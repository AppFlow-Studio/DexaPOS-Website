'use client'

import { useMemo } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts'
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart'
import { ChartCard } from './ChartCard'
import { DataTable } from '@/components/ui/data-table'
import { ColumnDef } from '@tanstack/react-table'
import { Badge } from '@/components/ui/badge'
import { AlertCircle, Activity } from 'lucide-react'
import type { StaffPerformanceStats, StaffOrderActivityRow } from '@/types/analytics'

interface StaffOrderActivityCardProps {
  data?: StaffPerformanceStats | null
  isLoading?: boolean
}

const chartConfig = {
  orders_created: {
    label: 'Orders Created',
    color: '#3b82f6',
  },
  payments_processed: {
    label: 'Payments Processed',
    color: '#10b981',
  },
  voids_count: {
    label: 'Voids',
    color: '#ef4444',
  },
} satisfies ChartConfig

export function StaffOrderActivityCard({ data, isLoading }: StaffOrderActivityCardProps) {
  const isEmpty = !data || data.order_activity.length === 0

  const chartData = useMemo(() => {
    if (!data?.order_activity) return []

    return data.order_activity.slice(0, 10).map((row) => ({
      name: row.staff_name,
      orders_created: row.orders_created,
      payments_processed: row.payments_processed,
      voids_count: row.voids_count,
    }))
  }, [data?.order_activity])

  const avgVoids = useMemo(() => {
    if (!data?.order_activity || data.order_activity.length === 0) return 0
    const total = data.order_activity.reduce((sum, row) => sum + row.voids_count, 0)
    return total / data.order_activity.length
  }, [data?.order_activity])

  const columns: ColumnDef<StaffOrderActivityRow>[] = [
    {
      accessorKey: 'staff_name',
      header: 'Staff Member',
      cell: ({ row }) => (
        <div className="font-medium">{row.getValue('staff_name')}</div>
      ),
    },
    {
      accessorKey: 'orders_created',
      header: 'Orders Created',
      cell: ({ row }) => row.getValue('orders_created'),
    },
    {
      accessorKey: 'payments_processed',
      header: 'Payments Processed',
      cell: ({ row }) => row.getValue('payments_processed'),
    },
    {
      accessorKey: 'voids_count',
      header: 'Voids',
      cell: ({ row }) => {
        const voidsCount = row.getValue('voids_count') as number
        const isAnomaly = voidsCount > avgVoids * 2

        return (
          <div className="flex items-center gap-2">
            {isAnomaly && (
              <AlertCircle className="h-4 w-4 text-red-500" />
            )}
            <span>{voidsCount}</span>
          </div>
        )
      },
    },
    {
      accessorKey: 'void_amount',
      header: 'Void Amount',
      cell: ({ row }) => (
        <div className="font-medium">
          ${(row.getValue('void_amount') as number).toFixed(2)}
        </div>
      ),
    },
    {
      accessorKey: 'refunds_count',
      header: 'Refunds',
      cell: ({ row }) => row.getValue('refunds_count'),
    },
    {
      accessorKey: 'refund_amount',
      header: 'Refund Amount',
      cell: ({ row }) => (
        <div className="font-medium">
          ${(row.getValue('refund_amount') as number).toFixed(2)}
        </div>
      ),
    },
  ]

  return (
    <ChartCard
      title="Staff Order Activity"
      subtitle="Orders created, payments processed, and anomalies"
      icon={Activity}
      isLoading={isLoading}
      isEmpty={isEmpty}
      emptyMessage="No order activity data available"
    >
      <div className="space-y-6">
        {/* Stacked Bar Chart */}
        {chartData.length > 0 && (
          <ChartContainer config={chartConfig} className="aspect-auto h-[340px] w-full">
              <BarChart data={chartData} margin={{ left: 0, right: 8, top: 5, bottom: 50 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="name"
                  interval={0}
                  angle={-40}
                  textAnchor="end"
                  height={70}
                  tick={{ fontSize: 11 }}
                  tickFormatter={(value: string) =>
                    value.length > 10 ? `${value.slice(0, 10)}…` : value
                  }
                />
                <YAxis tick={{ fontSize: 12 }} width={32} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="orders_created" stackId="a" fill="#3b82f6" />
                <Bar dataKey="payments_processed" stackId="a" fill="#10b981" />
                <Bar dataKey="voids_count" stackId="a" fill="#ef4444" />
              </BarChart>
          </ChartContainer>
        )}

        {/* Data Table */}
        {data?.order_activity && (
          <div>
            <h3 className="text-sm font-semibold mb-4">Detailed Activity</h3>
            <DataTable columns={columns} data={data.order_activity} tableClassName="min-w-[640px]" />
          </div>
        )}

        {/* Info Box */}
        <div className="rounded-lg bg-amber-50 dark:bg-amber-950 p-4 text-sm text-amber-900 dark:text-amber-200">
          <p className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4" />
            <span>
              Red alert icon indicates staff members with void count &gt; {Math.round(avgVoids * 2 * 10) / 10} (2x average)
            </span>
          </p>
        </div>
      </div>
    </ChartCard>
  )
}
