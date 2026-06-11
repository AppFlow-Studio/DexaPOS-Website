'use client'

import { useMemo } from 'react'
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
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
 * Distinct palette for order statuses
 */
const STATUS_COLOR_MAP: Record<string, string> = {
  pending: '#000000',
  sent_to_kitchen: '#8b5cf6',
  preparing: '#f59e0b',
  ready: '#06b6d4',
  completed: '#10b981',
  cancelled: '#ef4444',
  refunded: '#f97316',
  void: '#b91c1c',
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
            <div className="relative h-[340px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null
                      const item = payload[0]
                      const step = item.payload as { label: string; count: number; percentage: string }
                      return (
                        <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-lg dark:border-slate-700 dark:bg-slate-950">
                          <p className="mb-1 text-xs font-semibold text-slate-500 dark:text-slate-400">
                            {step.label}
                          </p>
                          <p className="text-xs font-bold text-slate-900 dark:text-slate-100">
                            {step.count} ({step.percentage}%)
                          </p>
                        </div>
                      )
                    }}
                  />
                  <Pie
                    data={chartData}
                    dataKey="count"
                    nameKey="label"
                    innerRadius="62%"
                    outerRadius="90%"
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