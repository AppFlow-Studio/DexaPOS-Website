'use client'

import { ChartCard } from './ChartCard'
import {
  CHART_CURSOR_FILL,
  CHART_GRID,
  CHART_TICK,
  ChartTooltipPanel,
  StatRow,
  StatTile,
} from './AnalyticsPrimitives'
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
          {/* Stats */}
          <StatRow columns={4}>
            <StatTile
              label="Rush Items"
              value={data.rush_items}
              meta={`${(data.rush_percentage ?? 0).toFixed(1)}% of total`}
              accent="warning"
            />
            <StatTile
              label="Rush Avg Time"
              value={formatTime(data.avg_rush_time_minutes ?? 0)}
              accent="brand"
            />
            <StatTile
              label="Normal Avg Time"
              value={formatTime(data.avg_normal_time_minutes ?? 0)}
              accent="positive"
            />
            <StatTile
              label="Rush Impact"
              value={`${difference > 0 ? '+' : ''}${formatTime(Math.abs(difference))}`}
              meta={`${differencePercent}% slower`}
            />
          </StatRow>

          {/* Chart */}
          <div className="w-full h-[280px]">
            <ChartContainer config={chartConfig} className="aspect-auto w-full h-full">
                <BarChart data={chartData} margin={{ left: 0, right: 10, top: 5, bottom: 20 }}>
                  <CartesianGrid vertical={false} {...CHART_GRID} />
                  <XAxis
                    dataKey="name"
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
