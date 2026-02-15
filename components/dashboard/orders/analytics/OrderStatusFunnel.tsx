'use client'

import { useMemo } from 'react'
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { ChartContainer, ChartTooltipContent } from '@/components/ui/chart'
import { ChartCard } from './ChartCard'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { GitBranch } from 'lucide-react'
import type { OrderFlowStats } from '@/types/analytics'

interface OrderStatusFunnelProps {
  data?: OrderFlowStats | null
  isLoading?: boolean
}

/**
 * Softer but more distinct palette
 */
const STATUS_COLOR_MAP: Record<string, string> = {
  pending: '#3b82f6',
  sent_to_kitchen: '#6366f1',
  preparing: '#8b5cf6',
  ready: '#06b6d4',
  completed: '#10b981',
  cancelled: '#ef4444',
  refunded: '#f59e0b',
  void: '#dc2626',
}

export function OrderStatusFunnel({
  data,
  isLoading,
}: OrderStatusFunnelProps) {
  const totalOrders = data?.total_orders ?? 0

  const chartData = useMemo(() => {
    if (!data?.funnel || totalOrders === 0) return []

    return data.funnel
      .filter((step) => step.count > 0)
      .map((step) => ({
        ...step,
        percentage: (
          (step.count / totalOrders) *
          100
        ).toFixed(1),
      }))
  }, [data, totalOrders])

  const isEmpty = chartData.length === 0

  return (
    <ChartCard
      title="Order Distribution"
      subtitle="Lifecycle status breakdown"
      icon={GitBranch}
      isLoading={isLoading}
      isEmpty={isEmpty}
      emptyMessage="No order data available"
    >
      <div className="space-y-10">
        {/* KPI Row */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardContent className="pt-6">
              <div className="text-sm text-muted-foreground">
                Total Orders
              </div>
              <div className="text-2xl font-bold mt-1">
                {totalOrders}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="text-sm text-muted-foreground">
                Completion Rate
              </div>
              <div className="text-2xl font-bold mt-1">
                {data?.completion_rate ?? 0}%
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="text-sm text-muted-foreground">
                Cancellation Rate
              </div>
              <div className="text-2xl font-bold mt-1">
                {data?.cancellation_rate ?? 0}%
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Donut + Legend */}
        {chartData.length > 0 && (
  <div className="grid md:grid-cols-2 gap-12 items-center">
    <ChartContainer
  config={{ pie: { label: 'Orders' } }}
  className="h-[340px] w-full"
>
  <div className="relative h-full w-full">
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Tooltip content={<ChartTooltipContent />} />
        <Pie
          data={chartData}
          dataKey="count"
          nameKey="label"
          innerRadius={90}
          outerRadius={130}
          paddingAngle={4}
        >
          {chartData.map((entry) => (
            <Cell
              key={entry.status}
              fill={
                STATUS_COLOR_MAP[entry.status] ?? '#3b82f6'
              }
            />
          ))}
        </Pie>
      </PieChart>
    </ResponsiveContainer>

    {/* Center Label */}
    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
      <div className="text-4xl font-bold leading-none">
        {totalOrders}
      </div>
      <div className="text-sm text-muted-foreground mt-1">
        Total Orders
      </div>
    </div>
  </div>
</ChartContainer>


    {/* Legend */}
    <div className="space-y-4">
      {chartData.map((step) => (
        <div
          key={step.status}
          className="flex justify-between items-center rounded-lg px-4 py-3 bg-muted/30 hover:bg-muted/50 transition"
        >
          <div className="flex items-center gap-3">
            <span
              className="w-3 h-3 rounded-full"
              style={{
                backgroundColor:
                  STATUS_COLOR_MAP[step.status] ??
                  '#3b82f6',
              }}
            />
            <span className="font-medium">
              {step.label}
            </span>
          </div>

          <div className="text-sm text-muted-foreground">
            {step.count} ({step.percentage}%)
          </div>
        </div>
      ))}
    </div>
  </div>
)}


        {/* Drop-offs */}
        {data && (
          <div>
            <h3 className="text-sm font-semibold mb-3">
              Drop-offs
            </h3>
            <div className="flex gap-3 flex-wrap">
              {data.funnel
                .filter((s) =>
                  ['cancelled', 'refunded', 'void'].includes(
                    s.status
                  )
                )
                .map((step) => (
                  <Badge
                    key={step.status}
                    style={{
                      backgroundColor:
                        STATUS_COLOR_MAP[step.status],
                      color: 'white',
                    }}
                  >
                    {step.label}: {step.count}
                  </Badge>
                ))}
            </div>
          </div>
        )}
      </div>
    </ChartCard>
  )
}
