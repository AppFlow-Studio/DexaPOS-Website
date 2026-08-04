'use client'

import { useMemo, useState } from 'react'
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Legend } from 'recharts'
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart'
import { ChartCard } from './ChartCard'
import { CHART_GRID, CHART_TICK } from './AnalyticsPrimitives'
import { SummaryCard } from '../reports/SummaryCard'
import { DataTable } from '@/components/ui/data-table'
import { Input } from '@/components/ui/input'
import { ColumnDef } from '@tanstack/react-table'
import { AlertTriangle, DollarSign, Search } from 'lucide-react'
import type { OrderFlowStats, TopVoidedItem } from '@/types/analytics'

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

export function VoidRefundAnalysis({ data, isLoading }: VoidRefundAnalysisProps) {
  const [voidSearchQuery, setVoidSearchQuery] = useState('')

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

  // Filter top voided items by search query
  const filteredVoidedItems = useMemo(() => {
    if (!data?.void_refund?.top_voided_items) return []
    const query = voidSearchQuery.toLowerCase().trim()
    if (!query) return data.void_refund.top_voided_items
    return data.void_refund.top_voided_items.filter((item) =>
      item.item_name.toLowerCase().includes(query)
    )
  }, [data?.void_refund?.top_voided_items, voidSearchQuery])

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
    }).format(amount)

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
        {/* Stat Cards – DexaPOS themed SummaryCards */}
        <div className="grid gap-4 md:grid-cols-4">
          <SummaryCard
            label="Total Voids"
            value={data?.void_refund?.total_voids ?? 0}
            icon={<AlertTriangle className="h-5 w-5 text-red-500" />}
          />
          <SummaryCard
            label="Total Refunds"
            value={data?.void_refund?.total_refunds ?? 0}
            icon={<DollarSign className="h-5 w-5 text-orange-500" />}
          />
          <SummaryCard
            label="Void Loss"
            value={formatCurrency(data?.void_refund?.void_amount ?? 0)}
            icon={<AlertTriangle className="h-5 w-5 text-red-500" />}
          />
          <SummaryCard
            label="Refund Loss"
            value={formatCurrency(data?.void_refund?.refund_amount ?? 0)}
            icon={<DollarSign className="h-5 w-5 text-orange-500" />}
          />
        </div>

        {/* Charts Grid */}
        <div className="grid gap-4 md:grid-cols-2">
          {/* Refund Reason Pie Chart */}
          {refundReasonData.length > 0 && (
            <ChartContainer config={chartConfig} className="aspect-auto h-[300px] w-full">
                <PieChart>
                  <Pie
                    data={refundReasonData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    outerRadius="80%"
                    fill="#3b82f6"
                    dataKey="value"
                  >
                    {refundReasonData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Legend
                    verticalAlign="bottom"
                    height={36}
                    wrapperStyle={{ fontSize: 13, color: "var(--muted-foreground)" }}
                    formatter={(value, entry) => {
                      const v = (entry?.payload as { value?: number } | undefined)?.value
                      return `${value}${v != null ? `: ${v}` : ''}`
                    }}
                  />
                </PieChart>
            </ChartContainer>
          )}

          {/* Staff Voids Bar Chart */}
          {staffVoidChartData.length > 0 && (
            <ChartContainer config={chartConfig} className="aspect-auto h-[300px] w-full">
                <BarChart
                  data={staffVoidChartData}
                  layout="vertical"
                  margin={{ top: 5, right: 16, left: 0, bottom: 5 }}
                >
                  <CartesianGrid {...CHART_GRID} />
                  <XAxis type="number" tick={CHART_TICK} />
                  <YAxis dataKey="name" type="category" width={90} tick={CHART_TICK} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="voids" fill="#ef4444" radius={[0, 8, 8, 0]} />
                </BarChart>
            </ChartContainer>
          )}
        </div>

        {/* Top Voided Items Table with Search */}
        {data?.void_refund?.top_voided_items && data.void_refund.top_voided_items.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium">Top Voided Items</h3>
              {filteredVoidedItems.length < data.void_refund.top_voided_items.length && (
                <p className="text-[0.8125rem] text-muted-foreground">
                  Showing {filteredVoidedItems.length} of {data.void_refund.top_voided_items.length}
                </p>
              )}
            </div>

            {/* Search Input — matches the Orders table search: a filled pill
                with no border, going solid on focus. */}
            <div className="relative max-w-sm">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/50" />
              <Input
                placeholder="Search items..."
                value={voidSearchQuery}
                onChange={(e) => setVoidSearchQuery(e.target.value)}
                className="rounded-full border-0 bg-muted/60 pl-9 shadow-none focus-visible:bg-background"
              />
            </div>

            <DataTable columns={voidedItemsColumns} data={filteredVoidedItems} tableClassName="min-w-[560px]" />
          </div>
        )}
      </div>
    </ChartCard>
  )
}