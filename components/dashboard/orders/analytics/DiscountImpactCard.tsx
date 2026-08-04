'use client'

import { ChartCard } from './ChartCard'
import { AnalyticsSubLabel, StatRow, StatTile } from './AnalyticsPrimitives'
import { Badge } from '@/components/ui/badge'
import { ChartContainer, ChartTooltip, type ChartConfig } from '@/components/ui/chart'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Cell } from 'recharts'
import { Percent } from 'lucide-react'
import type { DiscountImpact } from '@/types/analytics'

const COLORS = [
  '#3B82F6', // Blue
  '#10B981', // Emerald
  '#F59E0B', // Amber
  '#EF4444', // Red
  '#8B5CF6', // Violet
  '#EC4899', // Pink
  '#06B6D4', // Cyan
]

const chartConfig = {} satisfies ChartConfig

interface DiscountImpactCardProps {
  data?: DiscountImpact
  isLoading?: boolean
}

export function DiscountImpactCard({ data, isLoading }: DiscountImpactCardProps) {
  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount)

  const isEmpty = !data || (data.bySource.length === 0 && data.totalDiscounts === 0)

  return (
    <ChartCard
      title="Discount Impact"
      subtitle="Discounts applied and their sources"
      icon={Percent}
      isLoading={isLoading}
      isEmpty={isEmpty}
    >
      {data && (
        <>
          <StatRow columns={3}>
            <StatTile
              label="Total Discounts"
              value={formatCurrency(data.totalDiscounts)}
            />
            <StatTile
              label="Discounted Orders"
              value={`${data.discountedOrderCount} / ${data.totalOrderCount}`}
              meta={`${data.discountedOrderPercent.toFixed(1)}% of orders`}
            />
            <StatTile
              label="Avg Discount per Order"
              value={formatCurrency(data.avgDiscountPerOrder)}
              accent="brand"
            />
          </StatRow>

          {data.bySource.length > 0 && (
            <div className="mt-8">
              <AnalyticsSubLabel>By source</AnalyticsSubLabel>

              <div className="w-full h-[240px]">
                <ChartContainer config={chartConfig} className="aspect-auto w-full h-full">
                    <BarChart
                      data={data.bySource}
                      layout="vertical"
                      margin={{ left: 0, right: 20, top: 5, bottom: 5 }}
                    >
                      <CartesianGrid 
                        horizontal={false} 
                        strokeDasharray="3 3" 
                        vertical={false}
                        stroke="var(--border)"
                      />
                      <XAxis
                        type="number"
                        tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }}
                        tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`}
                      />
                      <YAxis
                        type="category"
                        dataKey="source"
                        tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
                        width={105}
                        tickFormatter={(value) => {
                          const formatted = String(value)
                            .replace(/_/g, ' ')
                            .split(' ')
                            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
                            .join(' ')
                          return formatted.length > 14 ? formatted.slice(0, 14) : formatted
                        }}
                      />
                      <ChartTooltip
                        cursor={{ fill: 'color-mix(in srgb, var(--muted) 40%, transparent)' }}
                        content={({ active, payload }) => {
                          if (active && payload && payload.length) {
                            const item = payload[0]
                            const total = data.bySource.reduce((sum, s) => sum + s.amount, 0)
                            const percent = ((Number(item.value) / total) * 100).toFixed(1)
                            return (
                              <div className="rounded-xl border bg-popover p-3 text-popover-foreground shadow-lg">
                                <p className="mb-1 text-[0.8125rem] font-medium text-muted-foreground">
                                  {String(item.payload.source)
                                    .replace(/_/g, ' ')
                                    .split(' ')
                                    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
                                    .join(' ')}
                                </p>
                                <p className="text-base font-medium tabular-nums">
                                  {formatCurrency(Number(item.value))}
                                </p>
                                <p className="mt-1 text-[0.8125rem] text-muted-foreground">
                                  {percent}% of total
                                </p>
                              </div>
                            )
                          }
                          return null
                        }}
                      />
                      <Bar dataKey="amount" radius={[0, 6, 6, 0]}>
                        {data.bySource.map((_, index) => (
                          <Cell key={index} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                </ChartContainer>
              </div>

              {/* Legend */}
              <div className="mt-4">
                {data.bySource.map((source, idx) => {
                  const total = data.bySource.reduce((sum, s) => sum + s.amount, 0)
                  const percent = ((source.amount / total) * 100).toFixed(1)
                  return (
                    <div
                      key={idx}
                      className="flex items-center justify-between gap-3 border-b border-border/60 py-2.5 last:border-0"
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        <span
                          className="h-2.5 w-2.5 shrink-0 rounded-full"
                          style={{ backgroundColor: COLORS[idx % COLORS.length] }}
                        />
                        <span className="truncate text-sm">
                          {String(source.source)
                            .replace(/_/g, ' ')
                            .split(' ')
                            .map(w => w.charAt(0).toUpperCase() + w.slice(1))
                            .join(' ')}
                        </span>
                      </div>
                      <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
                        {percent}%
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {data.topDiscounts.length > 0 && (
            <div className="mt-8">
              <AnalyticsSubLabel>Top discounts</AnalyticsSubLabel>
              <div>
                {data.topDiscounts.slice(0, 5).map((discount, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between gap-3 border-b border-border/60 py-2.5 last:border-0"
                  >
                    <span className="truncate text-sm">{discount.name}</span>
                    <div className="flex shrink-0 items-center gap-3">
                      <Badge
                        variant="outline"
                        className="rounded-full bg-transparent font-medium tabular-nums"
                      >
                        {discount.count}x
                      </Badge>
                      <span className="w-16 text-right text-sm tabular-nums">
                        {formatCurrency(discount.amount)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </ChartCard>
  )
}