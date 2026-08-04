'use client'

import { ChartCard } from './ChartCard'
import {
  CHART_GRID,
  CHART_TICK,
  ChartTooltipPanel,
  StatRow,
  StatTile,
} from './AnalyticsPrimitives'
import { ChartContainer, ChartTooltip, type ChartConfig } from '@/components/ui/chart'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Legend, ReferenceLine } from 'recharts'
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
          <StatRow columns={3}>
            <StatTile
              label="Current Avg"
              value={formatTime(currentTime)}
              accent="brand"
            />
            <StatTile label="Target Alert" value={formatTime(benchmark)} />
            <StatTile label="Total Items" value={data.total_items_processed} />
          </StatRow>

          {/* Trend Line Chart */}
          <div className="w-full h-[320px]">
            <ChartContainer config={chartConfig} className="aspect-auto w-full h-full">
                <LineChart data={chartData} margin={{ left: 0, right: 10, top: 5, bottom: 20 }}>
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
                  <ReferenceLine
                    y={benchmark}
                    stroke={chartConfig.benchmark.color}
                    strokeDasharray="5 5"
                    label={{
                      value: 'Target',
                      position: 'right',
                      fontSize: 12,
                      fill: 'var(--muted-foreground)',
                    }}
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
                  <Legend
                    iconType="circle"
                    formatter={(value) => (
                      <span className="text-[0.8125rem] text-muted-foreground">{value}</span>
                    )}
                  />
                </LineChart>
            </ChartContainer>
          </div>
        </div>
      )}
    </ChartCard>
  )
}
