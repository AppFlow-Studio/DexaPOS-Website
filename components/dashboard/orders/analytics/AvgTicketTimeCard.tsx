'use client'

import { ChartCard } from './ChartCard'
import { ChartContainer, ChartTooltip, type ChartConfig } from '@/components/ui/chart'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Legend, ResponsiveContainer, ReferenceLine } from 'recharts'
import { Clock } from 'lucide-react'
import type { KitchenPerformanceStats } from '@/types/analytics'

interface AvgTicketTimeCardProps {
  data?: KitchenPerformanceStats
  isLoading?: boolean
  benchmarkMinutes?: number
}

const chartConfig = {
  avg_ticket_minutes: {
    label: 'Avg Ticket Time',
    color: '#3B82F6',
  },
  benchmark: {
    label: 'Target/Alert',
    color: '#EF4444',
  },
} satisfies ChartConfig

export function AvgTicketTimeCard({
  data,
  isLoading,
  benchmarkMinutes,
}: AvgTicketTimeCardProps) {
  const formatTime = (minutes: number) => {
    const mins = Math.floor(minutes)
    const secs = Math.round((minutes - mins) * 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const isEmpty = !data || !data.daily_trend || data.daily_trend.length === 0

  const chartData = data?.daily_trend?.map((item) => ({
    date: new Date(item.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    avg_ticket_minutes: item.avg_ticket_minutes,
  })) || []

  const currentTime = data?.avg_ticket_time_minutes || 0
  const benchmark = benchmarkMinutes || 20 // Default to 8 minutes if not provided

  return (
    <ChartCard
      title="Average Ticket Time"
      subtitle="Trend from order to completion"
      icon={Clock}
      isLoading={isLoading}
      isEmpty={isEmpty}
      className="lg:col-span-2"
    >
      {data && !isEmpty && (
        <div className="space-y-4">
          {/* Current Metric */}
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1 bg-blue-50 dark:bg-blue-950 p-2 rounded">
              <p className="text-xs text-muted-foreground">Current Avg</p>
              <p className="text-lg font-bold text-blue-600 dark:text-blue-400">
                {formatTime(currentTime)}
              </p>
            </div>
            <div className="space-y-1 bg-slate-50 dark:bg-slate-900 p-2 rounded">
              <p className="text-xs text-muted-foreground">Target Alert</p>
              <p className="text-lg font-bold">{formatTime(benchmark)}</p>
            </div>
            <div className="space-y-1 bg-slate-50 dark:bg-slate-900 p-2 rounded">
              <p className="text-xs text-muted-foreground">Total Items</p>
              <p className="text-lg font-bold">{data.total_items_processed}</p>
            </div>
          </div>

          {/* Trend Line Chart */}
          <div className="w-full h-[320px]">
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
                    tickFormatter={(value) => `${value.toFixed(0)}m`}
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
                                    {formatTime(Number(item.value))}
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
                    y={benchmark}
                    stroke={chartConfig.benchmark.color}
                    strokeDasharray="5 5"
                    label={{ value: 'Target', position: 'right', fontSize: 12, fill: '#9CA3AF' }}
                  />
                  <Line
                    type="monotone"
                    dataKey="avg_ticket_minutes"
                    stroke={chartConfig.avg_ticket_minutes.color}
                    strokeWidth={2}
                    dot={{ fill: chartConfig.avg_ticket_minutes.color, r: 4 }}
                    activeDot={{ r: 6 }}
                    name="Avg Ticket Time"
                  />
                  <Legend />
                </LineChart>
              </ResponsiveContainer>
            </ChartContainer>
          </div>
        </div>
      )}
    </ChartCard>
  )
}
