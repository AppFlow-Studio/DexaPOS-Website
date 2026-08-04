'use client'

import { ChartCard } from './ChartCard'
import {
  AnalyticsSubLabel,
  CHART_CURSOR_FILL,
  CHART_GRID,
  CHART_TICK,
  ChartTooltipPanel,
  StatRow,
  StatTile,
} from './AnalyticsPrimitives'
import { ChartContainer, ChartTooltip, type ChartConfig } from '@/components/ui/chart'
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend } from 'recharts'
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
      title="Average Table Turn Time"
      subtitle="Seated to cleared"
      icon={Timer}
      isLoading={isLoading}
      isEmpty={isEmpty}
    >
      {data && !isEmpty && (
        <div className="space-y-6">
          <StatRow columns={3}>
            <StatTile
              label="Avg Turn Time"
              value={formatTime(data.avg_turn_time_minutes)}
              accent="brand"
            />
            <StatTile label="Total Sessions" value={data.total_sessions} />
            <StatTile label="Total Covers" value={data.total_covers} />
          </StatRow>

          {/* Charts side by side - fixed heights so they don't collapse on mobile */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Daily Trend Line Chart */}
            {dailyChartData.length > 0 && (
              <div className="w-full h-[250px]">
                <ChartContainer config={chartConfig} className="aspect-auto w-full h-full">
                    <LineChart data={dailyChartData} margin={{ left: 0, right: 10, top: 5, bottom: 20 }}>
                      <CartesianGrid vertical={false} {...CHART_GRID} />
                      <XAxis
                        dataKey="date"
                        tickLine={false}
                        axisLine={false}
                        tick={CHART_TICK}
                      />
                      <YAxis
                        tickLine={false}
                        axisLine={false}
                        tick={CHART_TICK}
                        tickFormatter={(value) => `${value.toFixed(0)}m`}
                      />
                      <ChartTooltip
                        cursor={{ stroke: 'var(--border)', strokeWidth: 2 }}
                        content={({ active, payload, label }) => {
                          if (active && payload && payload.length) {
                            return (
                              <ChartTooltipPanel
                                label={label}
                                items={payload.map((item) => ({
                                  name: item.name,
                                  color: item.color,
                                  value: formatTime(Number(item.value)),
                                }))}
                              />
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
                      <Legend iconType="circle" formatter={(value) => (<span className="text-[0.8125rem] text-muted-foreground">{value}</span>)} />
                    </LineChart>
                </ChartContainer>
              </div>
            )}

            {/* Party Size Breakdown Bar Chart */}
            {partySizeChartData.length > 0 && (
              <div className="w-full h-[274px]">
                <AnalyticsSubLabel>Turn time by party size</AnalyticsSubLabel>
                <div className="h-[250px]">
                  <ChartContainer config={chartConfig} className="aspect-auto w-full h-full">
                      <BarChart data={partySizeChartData} margin={{ left: 0, right: 10, top: 5, bottom: 20 }}>
                        <CartesianGrid vertical={false} {...CHART_GRID} />
                        <XAxis
                          dataKey="bucket"
                          tickLine={false}
                          axisLine={false}
                          tick={CHART_TICK}
                        />
                        <YAxis
                          tickLine={false}
                          axisLine={false}
                          tick={CHART_TICK}
                          tickFormatter={(value) => `${value.toFixed(0)}m`}
                        />
                        <ChartTooltip
                          cursor={{ fill: CHART_CURSOR_FILL }}
                          content={({ active, payload, label }) => {
                            if (!active || !payload?.length) return null

                            const item = payload[0]

                            return (
                              <ChartTooltipPanel
                                label={`Party size: ${label}`}
                                items={[
                                  {
                                    name: 'Avg Turn Time',
                                    color: item.color,
                                    value: formatTime(Number(item.value)),
                                  },
                                ]}
                              />
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