'use client'

import { ChartCard } from './ChartCard'
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend, Tooltip } from 'recharts'
import { Zap } from 'lucide-react'
import type { RushStats } from '@/types/analytics'

interface RushTrackingCardProps {
  data?: RushStats
  isLoading?: boolean
}

const COLORS = {
  rushTime: '#EF4444',    // Red
  normalTime: '#10B981',  // Emerald
}

const chartConfig = {
  rushTime: {
    label: 'Rush Avg Time',
    color: COLORS.rushTime,
  },
  normalTime: {
    label: 'Normal Avg Time',
    color: COLORS.normalTime,
  },
} satisfies ChartConfig

export function RushTrackingCard({
  data,
  isLoading,
}: RushTrackingCardProps) {
  const formatTime = (minutes: number) => {
    const mins = Math.floor(minutes)
    const secs = Math.round((minutes - mins) * 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const isEmpty = !data || data.total_items === 0

  const chartData = data
    ? [
        {
          name: 'Time (Minutes)',
          rushTime: data.avg_rush_time_minutes ?? 0,
          normalTime: data.avg_normal_time_minutes ?? 0,
        },
      ]
    : []

  const difference =
    data && data.avg_rush_time_minutes && data.avg_normal_time_minutes
      ? data.avg_rush_time_minutes - data.avg_normal_time_minutes
      : 0
  const differencePercent = difference > 0 ? ((difference / (data?.avg_normal_time_minutes || 1)) * 100).toFixed(1) : '0'

  return (
    <ChartCard
      title="Rush Order Tracking"
      subtitle="Rush vs normal order performance"
      icon={Zap}
      isLoading={isLoading}
      isEmpty={isEmpty}
    >
      {data && (
        <div className="space-y-4">
          {/* Stats Cards */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="space-y-1 bg-orange-50 dark:bg-orange-950 p-2 rounded">
              <p className="text-xs text-muted-foreground">Rush Items</p>
              <p className="text-lg font-bold text-orange-600 dark:text-orange-400">
                {data.rush_items}
              </p>
              <p className="text-xs text-muted-foreground">
                {(data.rush_percentage ?? 0).toFixed(1)}% of total
              </p>
            </div>
            <div className="space-y-1 bg-blue-50 dark:bg-blue-950 p-2 rounded">
              <p className="text-xs text-muted-foreground">Rush Avg Time</p>
              <p className="text-lg font-bold text-blue-600 dark:text-blue-400">
                {formatTime(data.avg_rush_time_minutes ?? 0)}
              </p>
            </div>
            <div className="space-y-1 bg-emerald-50 dark:bg-emerald-950 p-2 rounded">
              <p className="text-xs text-muted-foreground">Normal Avg Time</p>
              <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400">
                {formatTime(data.avg_normal_time_minutes ?? 0)}
              </p>
            </div>
          </div>

          {/* Impact Badge */}
          <div className="bg-slate-50 dark:bg-slate-900 p-3 rounded border border-slate-200 dark:border-slate-800">
            <p className="text-xs text-muted-foreground mb-1">Rush Impact</p>
            <p className="text-sm font-semibold">
              {difference > 0 ? '+' : ''}{formatTime(Math.abs(difference))} slower
              ({differencePercent}%)
            </p>
          </div>

          {/* Chart */}
          <div className="w-full h-[280px]">
            <ChartContainer config={chartConfig} className="aspect-auto w-full h-full">
                <BarChart data={chartData} margin={{ left: 0, right: 10, top: 5, bottom: 20 }}>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" />
                  <XAxis dataKey="name" tickLine={false} axisLine={false} />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(value) => `${value.toFixed(0)}m`}
                  />
                  <ChartTooltip
                    cursor={{ fill: 'rgba(0, 0, 0, 0.1)' }}
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
                                  <span className="text-xs text-slate-700 dark:text-slate-300">{item.name}:</span>
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
                  <Bar dataKey="rushTime" fill={COLORS.rushTime} name="Rush Avg Time" />
                  <Bar dataKey="normalTime" fill={COLORS.normalTime} name="Normal Avg Time" />
                </BarChart>
            </ChartContainer>
          </div>
        </div>
      )}
    </ChartCard>
  )
}
