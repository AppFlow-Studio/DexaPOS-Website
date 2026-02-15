'use client'

import { ChartCard } from './ChartCard'
import { Badge } from '@/components/ui/badge'
import { ChartContainer, ChartTooltip, type ChartConfig } from '@/components/ui/chart'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Cell, ResponsiveContainer } from 'recharts'
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
          <div className="mt-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Total Discounts</p>
                <p className="text-2xl font-bold">{formatCurrency(data.totalDiscounts)}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Discounted Orders</p>
                <p className="text-2xl font-bold">
                  {data.discountedOrderCount} / {data.totalOrderCount}
                </p>
                <p className="text-xs text-muted-foreground">
                  {data.discountedOrderPercent.toFixed(1)}%
                </p>
              </div>
            </div>

            <div className="bg-blue-50 dark:bg-blue-950 p-2 rounded border border-blue-200 dark:border-blue-800">
              <p className="text-xs text-muted-foreground">Avg Discount per Order</p>
              <p className="text-lg font-semibold text-blue-600 dark:text-blue-400">
                {formatCurrency(data.avgDiscountPerOrder)}
              </p>
            </div>
          </div>

          {data.bySource.length > 0 && (
            <div className="mt-6">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-semibold">By Source</p>
                <p className="text-xs text-muted-foreground">
                  {data.bySource.reduce((sum, s) => sum + s.amount, 0) > 0 ? '' : 'No data'}
                </p>
              </div>

              <div className="w-full h-[240px]">
                <ChartContainer config={chartConfig} className="w-full h-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={data.bySource}
                      layout="vertical"
                      margin={{ left: 110, right: 20, top: 5, bottom: 5 }}
                    >
                      <CartesianGrid horizontal={false} strokeDasharray="3 3" vertical={false} />
                      <XAxis
                        type="number"
                        tick={{ fontSize: 12 }}
                        tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`}
                      />
                      <YAxis
                        type="category"
                        dataKey="source"
                        tick={{ fontSize: 11 }}
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
                        cursor={{ fill: 'rgba(0, 0, 0, 0.08)' }}
                        content={({ active, payload }) => {
                          if (active && payload && payload.length) {
                            const item = payload[0]
                            const total = data.bySource.reduce((sum, s) => sum + s.amount, 0)
                            const percent = ((Number(item.value) / total) * 100).toFixed(1)
                            return (
                              <div className="bg-white dark:bg-slate-950 p-3 rounded border border-slate-200 dark:border-slate-700 shadow-lg">
                                <p className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                                  {String(item.payload.source)
                                    .replace(/_/g, ' ')
                                    .split(' ')
                                    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
                                    .join(' ')}
                                </p>
                                <p className="text-sm font-bold text-slate-700 dark:text-slate-300">
                                  {formatCurrency(Number(item.value))}
                                </p>
                                <p className="text-xs text-muted-foreground">
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
                  </ResponsiveContainer>
                </ChartContainer>
              </div>

              {/* Legend */}
              <div className="mt-4 grid grid-cols-2 gap-2">
                {data.bySource.map((source, idx) => {
                  const total = data.bySource.reduce((sum, s) => sum + s.amount, 0)
                  const percent = ((source.amount / total) * 100).toFixed(1)
                  return (
                    <div key={idx} className="flex items-center gap-2 text-xs">
                      <div
                        className="w-3 h-3 rounded-sm flex-shrink-0"
                        style={{ backgroundColor: COLORS[idx % COLORS.length] }}
                      />
                      <span className="text-muted-foreground truncate">
                        {String(source.source)
                          .replace(/_/g, ' ')
                          .split(' ')
                          .map(w => w.charAt(0).toUpperCase() + w.slice(1))
                          .join(' ')}
                      </span>
                      <span className="font-semibold ml-auto flex-shrink-0">
                        {percent}%
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {data.topDiscounts.length > 0 && (
            <div className="mt-6 pt-4 border-t">
              <p className="text-xs font-semibold mb-2">Top Discounts</p>
              <div className="space-y-2">
                {data.topDiscounts.slice(0, 5).map((discount, idx) => (
                  <div key={idx} className="flex items-center justify-between text-xs">
                    <span className="truncate text-muted-foreground">{discount.name}</span>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">
                        {discount.count}x
                      </Badge>
                      <span className="font-semibold w-16 text-right">
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
