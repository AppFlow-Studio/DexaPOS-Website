'use client'

import { ChartCard } from './ChartCard'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip } from 'recharts'
import { Users } from 'lucide-react'
import type { TablePerformanceStats } from '@/types/analytics'

interface CoversTrackerProps {
  data?: TablePerformanceStats | null
  isLoading?: boolean
  // If you know the number of days in the period, pass it to compute average
  numberOfDays?: number
}

const HOUR_LABELS = [
  '12 AM', '1 AM', '2 AM', '3 AM', '4 AM', '5 AM',
  '6 AM', '7 AM', '8 AM', '9 AM', '10 AM', '11 AM',
  '12 PM', '1 PM', '2 PM', '3 PM', '4 PM', '5 PM',
  '6 PM', '7 PM', '8 PM', '9 PM', '10 PM', '11 PM',
]

export function CoversTracker({ data, isLoading, numberOfDays = 1 }: CoversTrackerProps) {
  const isEmpty = !data || data.total_covers === 0

  // Build chart data: if numberOfDays > 1, compute average covers per hour,
  // otherwise use total covers per hour.
  const chartData = data?.hourly_revpash?.map(item => {
    const avgCovers = numberOfDays > 1 ? item.covers / numberOfDays : item.covers
    return {
      hourNum: item.hour,
      hourLabel: HOUR_LABELS[item.hour] || `${item.hour}:00`,
      covers: item.covers,          // keep raw total if needed
      avgCovers: Math.round(avgCovers * 10) / 10, // rounded to 1 decimal
    }
  }).sort((a, b) => a.hourNum - b.hourNum) || []

  // Find peak hour (max avgCovers)
  const peakHour = chartData.reduce(
    (max, cur) => (cur.avgCovers > max.avgCovers ? cur : max),
    { avgCovers: -Infinity, hourLabel: '' }
  )

  // Custom tooltip
  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload
      return (
        <div className="bg-white dark:bg-slate-950 p-3 rounded border border-slate-200 dark:border-slate-700 shadow-lg">
          <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2">
            {data.hourLabel}
          </p>
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-slate-700 dark:text-slate-300">
              {numberOfDays > 1 ? 'Avg covers:' : 'Total covers:'}
            </span>
            <span className="text-xs font-bold text-slate-900 dark:text-slate-100">
              {data.avgCovers}
            </span>
          </div>
          {numberOfDays > 1 && (
            <div className="flex items-center justify-between gap-2 mt-1 text-xs text-slate-500">
              <span>Total:</span>
              <span>{data.covers}</span>
            </div>
          )}
        </div>
      )
    }
    return null
  }

  return (
    <ChartCard
      className="min-w-[400px]" // replaced min-w-100 with a specific width
      title="Covers Tracker"
      subtitle={numberOfDays > 1 ? 'Average covers per hour' : 'Covers per hour'}
      icon={Users}
      isLoading={isLoading}
      isEmpty={isEmpty}
    >
      {data && !isEmpty && (
        <div className="space-y-4">
          {/* Stat Cards */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1 bg-pink-50 dark:bg-pink-950 p-2 rounded">
              <p className="text-xs text-muted-foreground">Total Covers</p>
              <p className="text-lg font-bold text-pink-600 dark:text-pink-400">
                {data.total_covers}
              </p>
            </div>
            <div className="space-y-1 bg-purple-50 dark:bg-purple-950 p-2 rounded">
              <p className="text-xs text-muted-foreground">Peak Hour</p>
              <p className="text-lg font-bold text-purple-600 dark:text-purple-400">
                {peakHour.avgCovers > -Infinity
                  ? `${peakHour.hourLabel} (${peakHour.avgCovers})`
                  : '—'}
              </p>
            </div>
          </div>

          {/* Line Chart */}
          {chartData.length > 0 && (
            <div className="w-full h-[240px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ left: 0, right: 10, top: 5, bottom: 20 }}>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" />
                  <XAxis
                    dataKey="hourLabel"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 11 }}
                    angle={-45}
                    textAnchor="end"
                    height={60}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 12 }}
                    domain={[0, 'auto']}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Line
                    type="monotone"
                    dataKey="avgCovers"
                    stroke="#EC4899" // pink-500
                    strokeWidth={2}
                    dot={(props: any) => {
                      const { cx, cy, payload } = props
                      const isPeak = payload.hourLabel === peakHour.hourLabel
                      return (
                        <circle
                          key={payload.hourNum}
                          cx={cx}
                          cy={cy}
                          r={isPeak ? 6 : 4}
                          fill="#EC4899"
                          stroke={isPeak ? 'white' : 'none'}
                          strokeWidth={2}
                        />
                      )
                    }}
                    activeDot={{ r: 6 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}
    </ChartCard>
  )
}