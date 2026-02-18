'use client'

import { ChartCard } from './ChartCard'
import { ChartContainer, ChartTooltip, type ChartConfig } from '@/components/ui/chart'
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend, ResponsiveContainer } from 'recharts'
import { Timer } from 'lucide-react'
import type { TablePerformanceStats } from '@/types/analytics'

interface AvgTableTurnTimeProps {
  data?: TablePerformanceStats | null
  isLoading?: boolean
}

const chartConfig = {
  avg_turn_time_minutes: {
    label: 'Avg Turn Time (min)',
    color: '#3B82F6',
  },
} satisfies ChartConfig

export function AvgTableTurnTime({ data, isLoading }: AvgTableTurnTimeProps) {
  const isEmpty = !data || data.total_sessions === 0

  const dailyChartData = data?.daily_trend?.map((item) => ({
    date: new Date(item.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    avg_turn_time_minutes: Number(item.avg_turn_time_minutes.toFixed(1)),
  })) || []

  const partySizeChartData = data?.by_party_size?.map((item) => ({
    bucket: item.bucket,
    avg_turn_time_minutes: Number(item.avg_turn_time_minutes.toFixed(1)),
  })) || []

  const formatTime = (minutes: number) => {
    const mins = Math.floor(minutes)
    const secs = Math.round((minutes - mins) * 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  return (
    <ChartCard 
      className='min-w-150 '
      title="Average Table Turn Time"
      subtitle="Seated to cleared"
      icon={Timer}
      isLoading={isLoading}
      isEmpty={isEmpty}
    >
      {data && !isEmpty && (
        <div className="space-y-6">
          {/* Stat Cards */}
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1 bg-blue-50 dark:bg-blue-950 p-2 rounded">
              <p className="text-xs text-muted-foreground">Avg Turn Time</p>
              <p className="text-lg font-bold text-blue-600 dark:text-blue-400">
                {formatTime(data.avg_turn_time_minutes)}
              </p>
            </div>
            <div className="space-y-1 bg-emerald-50 dark:bg-emerald-950 p-2 rounded">
              <p className="text-xs text-muted-foreground">Total Sessions</p>
              <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400">
                {data.total_sessions}
              </p>
            </div>
            <div className="space-y-1 bg-amber-50 dark:bg-amber-950 p-2 rounded">
              <p className="text-xs text-muted-foreground">Total Covers</p>
              <p className="text-lg font-bold text-amber-600 dark:text-amber-400">
                {data.total_covers}
              </p>
            </div>
          </div>

          {/* Charts side by side - flexible heights */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 auto-rows-fr ">
            {/* Daily Trend Line Chart */}
            {dailyChartData.length > 0 && (
              <div className="w-full min-h-[250px]">
                <ChartContainer config={chartConfig} className="w-full h-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={dailyChartData} margin={{ left: 0, right: 10, top: 5, bottom: 20 }}>
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
                      <Line
                        type="monotone"
                        dataKey="avg_turn_time_minutes"
                        stroke={chartConfig.avg_turn_time_minutes.color}
                        strokeWidth={2}
                        dot={{ fill: chartConfig.avg_turn_time_minutes.color, r: 4 }}
                        activeDot={{ r: 6 }}
                        name="Avg Turn Time"
                      />
                      <Legend />
                    </LineChart>
                  </ResponsiveContainer>
                </ChartContainer>
              </div>
            )}

            {/* Party Size Breakdown Bar Chart */}
            {partySizeChartData.length > 0 && (
              <div className="w-full min-h-[250px]">
                <p className="text-xs font-semibold mb-2 text-muted-foreground">Turn Time by Party Size</p>
                <div className="h-[calc(100%-24px)]">
                  <ChartContainer config={chartConfig} className="w-full h-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={partySizeChartData} margin={{ left: 0, right: 10, top: 5, bottom: 20 }}>
                        <CartesianGrid vertical={false} strokeDasharray="3 3" />
                        <XAxis
                          dataKey="bucket"
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
                          cursor={{ fill: 'rgba(0,0,0,0.05)' }}
                          content={({ active, payload, label }) => {
                            if (!active || !payload?.length) return null

                            const item = payload[0]

                            return (
                              <div className="bg-white dark:bg-slate-950 p-3 rounded-lg border shadow-lg">
                                <p className="text-xs font-semibold mb-2 text-muted-foreground">
                                  Party Size: {label}
                                </p>
                                <div className="flex justify-between text-xs">
                                  <span>Avg Turn Time: </span>
                                  <span className="font-bold">
                                    {formatTime(Number(item.value))}
                                  </span>
                                </div>
                              </div>
                            )
                          }}
                        />
                        <Bar
                          dataKey="avg_turn_time_minutes"
                          fill={chartConfig.avg_turn_time_minutes.color}
                          name="Avg Turn Time"
                          radius={[8, 8, 0, 0]}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </ChartContainer>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </ChartCard>
  )
}