'use client'

import { ChartCard } from './ChartCard'
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
          {/* Stat boxes – DexaPOS themed with dark mode support */}
          <div className="mt-4 space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="bg-gray-50 dark:bg-slate-800/50 border border-gray-200 dark:border-gray-700 p-2 rounded space-y-1">
                <p className="text-xs text-gray-500 dark:text-gray-400">Total Discounts</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">{formatCurrency(data.totalDiscounts)}</p>
              </div>
              <div className="bg-gray-50 dark:bg-slate-800/50 border border-gray-200 dark:border-gray-700 p-2 rounded space-y-1">
                <p className="text-xs text-gray-500 dark:text-gray-400">Discounted Orders</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {data.discountedOrderCount} / {data.totalOrderCount}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {data.discountedOrderPercent.toFixed(1)}%
                </p>
              </div>
            </div>

            {/* Highlight box – Dexa blue with dark mode variant */}
            <div className="bg-[#0A5C9E]/10 dark:bg-[#0A7AB8]/20 border border-[#0A5C9E]/20 dark:border-[#0A7AB8]/30 p-2 rounded">
              <p className="text-xs text-gray-500 dark:text-gray-400">Avg Discount per Order</p>
              <p className="text-lg font-semibold text-[#0A5C9E] dark:text-[#0A7AB8]">
                {formatCurrency(data.avgDiscountPerOrder)}
              </p>
            </div>
          </div>

          {data.bySource.length > 0 && (
            <div className="mt-6">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-semibold text-gray-900 dark:text-white">By Source</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {data.bySource.reduce((sum, s) => sum + s.amount, 0) > 0 ? '' : 'No data'}
                </p>
              </div>

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
                        stroke="hsl(var(--border))"
                      />
                      <XAxis
                        type="number"
                        tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
                        tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`}
                      />
                      <YAxis
                        type="category"
                        dataKey="source"
                        tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
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
                        cursor={{ fill: 'hsl(var(--muted)/0.3)' }}
                        content={({ active, payload }) => {
                          if (active && payload && payload.length) {
                            const item = payload[0]
                            const total = data.bySource.reduce((sum, s) => sum + s.amount, 0)
                            const percent = ((Number(item.value) / total) * 100).toFixed(1)
                            return (
                              <div className="bg-white dark:bg-slate-900 p-3 rounded-lg border border-gray-200 dark:border-gray-700 shadow-lg">
                                <p className="text-xs font-semibold text-gray-900 dark:text-white mb-1">
                                  {String(item.payload.source)
                                    .replace(/_/g, ' ')
                                    .split(' ')
                                    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
                                    .join(' ')}
                                </p>
                                <p className="text-sm font-bold text-gray-700 dark:text-gray-300">
                                  {formatCurrency(Number(item.value))}
                                </p>
                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
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
                      <span className="text-gray-500 dark:text-gray-400 truncate">
                        {String(source.source)
                          .replace(/_/g, ' ')
                          .split(' ')
                          .map(w => w.charAt(0).toUpperCase() + w.slice(1))
                          .join(' ')}
                      </span>
                      <span className="font-semibold text-gray-900 dark:text-white ml-auto flex-shrink-0">
                        {percent}%
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {data.topDiscounts.length > 0 && (
            <div className="mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
              <p className="text-xs font-semibold text-gray-900 dark:text-white mb-2">Top Discounts</p>
              <div className="space-y-2">
                {data.topDiscounts.slice(0, 5).map((discount, idx) => (
                  <div key={idx} className="flex items-center justify-between text-xs">
                    <span className="truncate text-gray-500 dark:text-gray-400">{discount.name}</span>
                    <div className="flex items-center gap-2">
                      <Badge 
                        variant="outline" 
                        className="text-xs border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 bg-transparent"
                      >
                        {discount.count}x
                      </Badge>
                      <span className="font-semibold text-gray-900 dark:text-white w-16 text-right">
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