'use client'

import { useMemo } from 'react'
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart'
import { ChartCard } from './ChartCard'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { DataTable } from '@/components/ui/data-table'
import { ColumnDef } from '@tanstack/react-table'
import { AlertTriangle, DollarSign } from 'lucide-react'
import type { OrderFlowStats, TopVoidedItem, RefundReasonRow, StaffVoidRow } from '@/types/analytics'

interface VoidRefundAnalysisProps {
  data?: OrderFlowStats | null
  isLoading?: boolean
}

const chartConfig = {
  reason: {
    label: 'Refunds',
    color: '#3b82f6',
  },
} satisfies ChartConfig

const PIE_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899']

interface TopVoidedItemRow extends TopVoidedItem {}

interface RefundReasonRowType extends RefundReasonRow {}

interface StaffVoidRowType extends StaffVoidRow {}

export function VoidRefundAnalysis({ data, isLoading }: VoidRefundAnalysisProps) {
  const isEmpty =
    !data ||
    ((data.void_refund?.total_voids ?? 0) + (data.void_refund?.total_refunds ?? 0) === 0)

  const refundReasonData = useMemo(() => {
    if (!data?.void_refund?.by_reason) return []
    return data.void_refund.by_reason.map((item) => ({
      name: item.reason,
      value: item.count,
    }))
  }, [data?.void_refund?.by_reason])

  const staffVoidChartData = useMemo(() => {
    if (!data?.void_refund?.staff_voids) return []
    return data.void_refund.staff_voids.slice(0, 5).map((staff) => ({
      name: staff.staff_name,
      voids: staff.void_count,
    }))
  }, [data?.void_refund?.staff_voids])

  const voidedItemsColumns: ColumnDef<TopVoidedItemRow>[] = [
    {
      accessorKey: 'item_name',
      header: 'Item Name',
      cell: ({ row }) => (
        <div className="font-medium">{row.getValue('item_name')}</div>
      ),
    },
    {
      accessorKey: 'void_count',
      header: 'Void Count',
      cell: ({ row }) => row.getValue('void_count'),
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
  ]

  return (
    <ChartCard
      title="Void & Refund Analysis"
      subtitle="Order cancellations and loss prevention tracking"
      icon={AlertTriangle}
      isLoading={isLoading}
      isEmpty={isEmpty}
      emptyMessage="No void or refund data available"
    >
      <div className="space-y-6">
        {/* Stat Cards */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Voids</CardTitle>
              <AlertTriangle className="h-4 w-4 text-red-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {data?.void_refund?.total_voids ?? 0}
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                ${(data?.void_refund?.void_amount ?? 0).toFixed(2)}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Refunds</CardTitle>
              <DollarSign className="h-4 w-4 text-orange-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {data?.void_refund?.total_refunds ?? 0}
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                ${(data?.void_refund?.refund_amount ?? 0).toFixed(2)}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Void Loss</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                ${(data?.void_refund?.void_amount ?? 0).toFixed(0)}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Refund Loss</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                ${(data?.void_refund?.refund_amount ?? 0).toFixed(0)}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Charts Grid */}
        <div className="grid gap-4 md:grid-cols-2">
          {/* Refund Reason Pie Chart */}
          {refundReasonData.length > 0 && (
            <ChartContainer config={chartConfig} className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={refundReasonData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, value }) => `${name}: ${value}`}
                    outerRadius={100}
                    fill="#3b82f6"
                    dataKey="value"
                  >
                    {refundReasonData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <ChartTooltip content={<ChartTooltipContent />} />
                </PieChart>
              </ResponsiveContainer>
            </ChartContainer>
          )}

          {/* Staff Voids Bar Chart */}
          {staffVoidChartData.length > 0 && (
            <ChartContainer config={chartConfig} className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={staffVoidChartData}
                  layout="vertical"
                  margin={{ top: 5, right: 30, left: 150, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" />
                  <YAxis dataKey="name" type="category" width={150} tick={{ fontSize: 12 }} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="voids" fill="#ef4444" radius={[0, 8, 8, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartContainer>
          )}
        </div>

        {/* Top Voided Items Table */}
        {data?.void_refund?.top_voided_items && data.void_refund.top_voided_items.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold mb-4">Top Voided Items</h3>
            <DataTable columns={voidedItemsColumns} data={data.void_refund.top_voided_items} />
          </div>
        )}
      </div>
    </ChartCard>
  )
}
