'use client'

import { ChartCard } from './ChartCard'
import { ChartContainer, type ChartConfig } from '@/components/ui/chart'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { DollarSign } from 'lucide-react'
import type { RevenueBreakdown } from '@/types/analytics'
import { getAdaptiveTickFormatter, extractMonetaryValues } from '@/lib/analytics/currency-formatter'

const COLORS = {
  subtotal: '#0A5C9E',    // Dexa blue
  tax: '#EF4444',         // Red
  tips: '#10B981',        // Emerald
  serviceCharges: '#F59E0B', // Amber
  discounts: '#8B5CF6',   // Violet
}

const chartConfig = {
  subtotal: {
    label: 'Subtotal',
    color: COLORS.subtotal,
  },
  tax: {
    label: 'Tax',
    color: COLORS.tax,
  },
  tips: {
    label: 'Tips',
    color: COLORS.tips,
  },
  serviceCharges: {
    label: 'Service Charges',
    color: COLORS.serviceCharges,
  },
  discounts: {
    label: 'Discounts',
    color: COLORS.discounts,
  },
} satisfies ChartConfig

interface RevenueBreakdownCardProps {
  data?: RevenueBreakdown
  isLoading?: boolean
}

export function RevenueBreakdownCard({ data, isLoading }: RevenueBreakdownCardProps) {
  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount)

  const isEmpty = !data || data.byDate.length === 0

  const chartData = data?.byDate.map((d) => ({
    date: new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    subtotal: Math.max(d.subtotal, 0),
    tax: Math.max(d.tax, 0),
    tips: Math.max(d.tips, 0),
    serviceCharges: Math.max(d.serviceCharges, 0),
    discounts: Math.max(-d.discounts, 0), // Negative, so show positive
  })) || []

  // Get adaptive formatter based on actual data range
  const monetaryValues = extractMonetaryValues(chartData, [
    'subtotal',
    'tax',
    'tips',
    'serviceCharges',
    'discounts',
  ])
  const adaptiveTickFormatter = getAdaptiveTickFormatter(monetaryValues)

  return (
    <ChartCard
      title="Revenue Breakdown"
      subtitle="Components of total revenue"
      icon={DollarSign}
      isLoading={isLoading}
      isEmpty={isEmpty}
      className="lg:col-span-2"
    >
      {data && (
        <>
          {/* Stat boxes – DexaPOS themed with dark mode support */}
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="bg-gray-50 dark:bg-slate-800/50 border border-gray-200 dark:border-gray-700 p-2 rounded space-y-1">
              <p className="text-xs text-gray-500 dark:text-gray-400">Subtotal</p>
              <p className="text-lg font-bold text-gray-900 dark:text-white">{formatCurrency(data.subtotal)}</p>
            </div>
            <div className="bg-gray-50 dark:bg-slate-800/50 border border-gray-200 dark:border-gray-700 p-2 rounded space-y-1">
              <p className="text-xs text-gray-500 dark:text-gray-400">Net Revenue</p>
              <p className="text-lg font-bold text-[#0A5C9E] dark:text-[#0A7AB8]">
                {formatCurrency(data.netRevenue)}
              </p>
            </div>
            <div className="bg-gray-50 dark:bg-slate-800/50 border border-gray-200 dark:border-gray-700 p-2 rounded space-y-1">
              <p className="text-xs text-gray-500 dark:text-gray-400">Tax + Charges</p>
              <p className="text-lg font-bold text-gray-900 dark:text-white">
                {formatCurrency(data.tax + data.serviceCharges)}
              </p>
            </div>
            <div className="bg-gray-50 dark:bg-slate-800/50 border border-gray-200 dark:border-gray-700 p-2 rounded space-y-1">
              <p className="text-xs text-gray-500 dark:text-gray-400">Tips</p>
              <p className="text-lg font-bold text-gray-900 dark:text-white">{formatCurrency(data.tips)}</p>
            </div>
          </div>

          {/* Stacked bar chart */}
          <div className="w-full h-[350px]">
            <ChartContainer config={chartConfig} className="w-full h-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ left: 0, right: 10, top: 5, bottom: 20 }}>
                  <CartesianGrid 
                    vertical={false} 
                    strokeDasharray="3 3" 
                    stroke="hsl(var(--border))"
                  />
                  <XAxis
                    dataKey="date"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
                    tickFormatter={adaptiveTickFormatter}
                  />
                  <Tooltip
                    cursor={{ fill: 'hsl(var(--muted)/0.3)' }}
                    content={({ active, payload, label }) => {
                      if (active && payload && payload.length) {
                        return (
                          <div className="bg-white dark:bg-slate-900 p-3 rounded-lg border border-gray-200 dark:border-gray-700 shadow-lg">
                            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2">
                              {label}
                            </p>
                            <div className="space-y-1.5">
                              {payload.map((item, index) => (
                                <div key={index} className="flex items-center justify-between gap-4">
                                  <div className="flex items-center gap-2">
                                    <div 
                                      className="w-2 h-2 rounded-full" 
                                      style={{ backgroundColor: item.color }}
                                    />
                                    <span className="text-xs text-gray-600 dark:text-gray-300">
                                      {item.name}:
                                    </span>
                                  </div>
                                  <span className="text-xs font-medium text-gray-900 dark:text-white">
                                    {formatCurrency(Number(item.value))}
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
                  <Bar dataKey="subtotal" stackId="a" fill={COLORS.subtotal} />
                  <Bar dataKey="tax" stackId="a" fill={COLORS.tax} />
                  <Bar dataKey="tips" stackId="a" fill={COLORS.tips} />
                  <Bar dataKey="serviceCharges" stackId="a" fill={COLORS.serviceCharges} />
                  <Bar dataKey="discounts" stackId="a" fill={COLORS.discounts} />
                </BarChart>
              </ResponsiveContainer>
            </ChartContainer>
          </div>

          {/* Legend – matches chart colors */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-4 text-xs">
            {Object.entries(chartConfig).map(([key, config]) => (
              <div key={key} className="flex items-center gap-2">
                <div
                  className="w-3 h-3 rounded-sm flex-shrink-0"
                  style={{ backgroundColor: config.color }}
                />
                <span className="text-gray-500 dark:text-gray-400 truncate">{config.label}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </ChartCard>
  )
}