'use client'

import { ChartCard } from './ChartCard'
import { CHART_GRID, CHART_TICK, StatRow, StatTile } from './AnalyticsPrimitives'
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
        <div className="rounded-xl border bg-popover p-3 text-popover-foreground shadow-lg">
          <p className="mb-2 text-[0.8125rem] font-medium text-muted-foreground">
            {data.hourLabel}
          </p>
          <div className="flex items-center justify-between gap-2">
            <span className="text-[0.8125rem] text-muted-foreground">
              {numberOfDays > 1 ? 'Avg covers:' : 'Total covers:'}
            </span>
            <span className="text-[0.8125rem] tabular-nums">
              {data.avgCovers}
            </span>
          </div>
          {numberOfDays > 1 && (
            <div className="mt-1 flex items-center justify-between gap-2 text-[0.8125rem] text-muted-foreground">
              <span>Total</span>
              <span className="tabular-nums">{data.covers}</span>
            </div>
          )}
        </div>
      )
    }
    return null
  }

  return (
    <ChartCard
      title="Covers Tracker"
      subtitle={numberOfDays > 1 ? 'Average covers per hour' : 'Covers per hour'}
      icon={Users}
      isLoading={isLoading}
      isEmpty={isEmpty}
    >
      {data && !isEmpty && (
        <div className="space-y-4">
          <StatRow columns={2}>
            <StatTile
              label="Total Covers"
              value={data.total_covers}
              accent="brand"
            />
            <StatTile
              label="Peak Hour"
              value={
                peakHour.avgCovers > -Infinity ? peakHour.hourLabel : '—'
              }
              meta={
                peakHour.avgCovers > -Infinity
                  ? `${peakHour.avgCovers} avg covers`
                  : undefined
              }
            />
          </StatRow>

          {/* Line Chart */}
          {chartData.length > 0 && (
            <div className="w-full h-[240px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ left: 0, right: 10, top: 5, bottom: 20 }}>
                  <CartesianGrid vertical={false} {...CHART_GRID} />
                  <XAxis
                    dataKey="hourLabel"
                    tickLine={false}
                    axisLine={false}
                    tick={{ ...CHART_TICK, fontSize: 11 }}
                    angle={-45}
                    textAnchor="end"
                    height={60}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    tick={CHART_TICK}
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