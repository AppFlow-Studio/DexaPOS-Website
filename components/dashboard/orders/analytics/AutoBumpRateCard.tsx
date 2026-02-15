'use client'

import { ChartCard } from './ChartCard'
import { ChartContainer, ChartTooltip, type ChartConfig } from '@/components/ui/chart'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Legend, ResponsiveContainer, ReferenceLine } from 'recharts'
import { AlertTriangle } from 'lucide-react'
import type { AutoBumpStats, DailyTrend } from '@/types/analytics'

interface AutoBumpRateCardProps {
  data?: AutoBumpStats
  dailyTrend?: DailyTrend[]
  isLoading?: boolean
}

const chartConfig = {
  auto_bump_rate: {
    label: 'Auto-Bump Rate',
    color: '#3B82F6',
  },
  threshold: {
    label: 'High Alert (50%)',
    color: '#EF4444',
  },
} satisfies ChartConfig

export function AutoBumpRateCard({
  data,
  dailyTrend,
  isLoading,
}: AutoBumpRateCardProps) {
  const isEmpty = !data || data.total_items === 0

  // Convert daily trend to chart data with rates
  const chartData = dailyTrend?.map((item) => {
    // Calculate rate from the trend (assuming trend has counts or we calculate it)
    return {
      date: new Date(item.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      auto_bump_rate: (item as any).auto_bump_rate ?? 0,
    }
  }) || []

  const currentRate = data?.auto_bump_rate ?? 0
  const warningThreshold = 50 // 50% is high alert

  const isHighAlert = currentRate > warningThreshold

  return (
    <ChartCard
      title="Auto-Bump Rate"
      subtitle="Items auto-bumped vs manually completed"
      icon={AlertTriangle}
      isLoading={isLoading}
      isEmpty={isEmpty}
      className="lg:col-span-2"
    >
      {data && (
        <div className="space-y-4">
          {/* Stats Cards */}
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1 bg-blue-50 dark:bg-blue-950 p-2 rounded">
              <p className="text-xs text-muted-foreground">Auto-Bumped</p>
              <p className="text-lg font-bold text-blue-600 dark:text-blue-400">
                {data.auto_bumped}
              </p>
              <p className="text-xs text-muted-foreground">
                {((data.auto_bumped / (data.total_items || 1)) * 100).toFixed(1)}%
              </p>
            </div>
            <div className="space-y-1 bg-emerald-50 dark:bg-emerald-950 p-2 rounded">
              <p className="text-xs text-muted-foreground">Manual Completed</p>
              <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400">
                {data.manual_completed}
              </p>
              <p className="text-xs text-muted-foreground">
                {((data.manual_completed / (data.total_items || 1)) * 100).toFixed(1)}%
              </p>
            </div>
            <div className="space-y-1 bg-slate-50 dark:bg-slate-900 p-2 rounded">
              <p className="text-xs text-muted-foreground">Total Items</p>
              <p className="text-lg font-bold">{data.total_items}</p>
            </div>
          </div>

          {/* Alert if High */}
          {isHighAlert && (
            <div className="bg-red-50 dark:bg-red-950 p-3 rounded border border-red-200 dark:border-red-800">
              <p className="text-xs font-semibold text-red-700 dark:text-red-300 mb-1">⚠️ High Auto-Bump Rate</p>
              <p className="text-sm text-red-600 dark:text-red-400">
                Kitchen is falling behind. {currentRate.toFixed(1)}% of items are auto-bumped.
              </p>
            </div>
          )}

          {/* Rate Badge */}
          <div className="bg-slate-50 dark:bg-slate-900 p-3 rounded border border-slate-200 dark:border-slate-800">
            <p className="text-xs text-muted-foreground mb-1">Current Auto-Bump Rate</p>
            <p className="text-lg font-bold">{currentRate.toFixed(1)}%</p>
          </div>

          {/* Trend Line Chart */}
          {chartData.length > 0 && (
            <div className="w-full h-[280px]">
              <ChartContainer config={chartConfig} className="w-full h-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ left: 0, right: 10, top: 5, bottom: 20 }}>
                    <CartesianGrid vertical={false} strokeDasharray="3 3" />
                    <XAxis
                      dataKey="date"
                      tickLine={false}
                      axisLine={false}
                      tick={{ fontSize: 12 }}
                    />
                    <YAxis
                      tickLine={false}
                      axisLine={false}
                      tick={{ fontSize: 12 }}
                      tickFormatter={(value) => `${value.toFixed(0)}%`}
                      domain={[0, 100]}
                    />
                    <ChartTooltip
                      cursor={{ stroke: 'rgba(0, 0, 0, 0.1)', strokeWidth: 2 }}
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
                                      {Number(item.value).toFixed(1)}%
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
                    <ReferenceLine
                      y={warningThreshold}
                      stroke={chartConfig.threshold.color}
                      strokeDasharray="5 5"
                      label={{ value: 'High Alert', position: 'right', fontSize: 12, fill: '#9CA3AF' }}
                    />
                    <Line
                      type="monotone"
                      dataKey="auto_bump_rate"
                      stroke={chartConfig.auto_bump_rate.color}
                      strokeWidth={2}
                      dot={{ fill: chartConfig.auto_bump_rate.color, r: 4 }}
                      activeDot={{ r: 6 }}
                      name="Auto-Bump Rate"
                    />
                    <Legend />
                  </LineChart>
                </ResponsiveContainer>
              </ChartContainer>
            </div>
          )}
        </div>
      )}
    </ChartCard>
  )
}
