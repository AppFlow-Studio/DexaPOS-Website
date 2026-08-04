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
    color: '#0A5C9E', // Dexa blue
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
          <StatRow columns={4}>
            <StatTile
              label="Current Rate"
              value={`${currentRate.toFixed(1)}%`}
              accent={isHighAlert ? 'warning' : 'brand'}
            />
            <StatTile
              label="Auto-Bumped"
              value={data.auto_bumped}
              meta={`${((data.auto_bumped / (data.total_items || 1)) * 100).toFixed(1)}% of items`}
            />
            <StatTile
              label="Manual Completed"
              value={data.manual_completed}
              meta={`${((data.manual_completed / (data.total_items || 1)) * 100).toFixed(1)}% of items`}
              accent="positive"
            />
            <StatTile label="Total Items" value={data.total_items} />
          </StatRow>

          {/* Alert if High — kept as signal, but as an icon + text strip rather
              than another tinted box inside the section. */}
          {isHighAlert && (
            <div className="flex items-start gap-2.5 text-amber-600 dark:text-amber-400">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <p className="text-sm">
                <span className="font-medium">High auto-bump rate.</span>{' '}
                <span className="text-muted-foreground">
                  Kitchen is falling behind — {currentRate.toFixed(1)}% of items
                  are auto-bumped.
                </span>
              </p>
            </div>
          )}

          {/* Trend Line Chart */}
          {chartData.length > 0 && (
            <div className="w-full h-[280px]">
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
                      tickFormatter={(value) => `${value.toFixed(0)}%`}
                      domain={[0, 100]}
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
                                value: `${Number(item.value).toFixed(1)}%`,
                              }))}
                            />
                          )
                        }
                        return null
                      }}
                    />
                    <ReferenceLine
                      y={warningThreshold}
                      stroke={chartConfig.threshold.color}
                      strokeDasharray="5 5"
                      label={{ value: 'High Alert', position: 'right', fontSize: 12, fill: 'var(--muted-foreground)' }}
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
                    <Legend
                      iconType="circle"
                      formatter={(value) => (
                        <span className="text-[0.8125rem] text-muted-foreground">{value}</span>
                      )}
                    />
                  </LineChart>
              </ChartContainer>
            </div>
          )}
        </div>
      )}
    </ChartCard>
  )
}