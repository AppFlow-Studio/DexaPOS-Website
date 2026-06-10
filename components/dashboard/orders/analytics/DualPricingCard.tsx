'use client'

import { ChartCard } from './ChartCard'
import { ChartContainer, ChartTooltip, type ChartConfig } from '@/components/ui/chart'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend } from 'recharts'
import { CreditCard } from 'lucide-react'
import type { DualPricingComparison } from '@/types/analytics'

const COLORS = {
  cardRevenue: '#0A5C9E', // Dexa blue
  cashRevenue: '#10B981',  // Emerald
}

const chartConfig = {
  cardRevenue: {
    label: 'Card Revenue',
    color: COLORS.cardRevenue,
  },
  cashRevenue: {
    label: 'Cash Revenue',
    color: COLORS.cashRevenue,
  },
} satisfies ChartConfig

interface DualPricingCardProps {
  data?: DualPricingComparison
  isLoading?: boolean
}

export function DualPricingCard({ data, isLoading }: DualPricingCardProps) {
  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount)

  // Don't render if no dual pricing
  if (!data?.hasDualPricing) {
    return null
  }

  const isEmpty = data.byDate.length === 0

  const chartData = data.byDate.map((d) => ({
    date: new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    cardRevenue: d.cardRevenue,
    cashRevenue: d.cashRevenue,
  }))

  return (
    <ChartCard
      title="Dual Pricing Comparison"
      subtitle="Card vs Cash revenue breakdown"
      icon={CreditCard}
      isLoading={isLoading}
      isEmpty={isEmpty}
      className="lg:col-span-2"
    >
      {data && (
        <>
          <div className="grid grid-cols-1 gap-3 mb-4 sm:grid-cols-2">
            <div className="space-y-1 bg-[#0A5C9E]/10 p-2 rounded">
              <p className="text-xs text-muted-foreground">Card Revenue</p>
              <p className="text-lg font-bold text-[#0A5C9E]">
                {formatCurrency(data.cardRevenue)}
              </p>
              <p className="text-xs text-muted-foreground">{data.cardTransactions} transactions</p>
            </div>
            <div className="space-y-1 bg-emerald-50 dark:bg-emerald-950 p-2 rounded">
              <p className="text-xs text-muted-foreground">Cash Revenue</p>
              <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400">
                {formatCurrency(data.cashRevenue)}
              </p>
              <p className="text-xs text-muted-foreground">{data.cashTransactions} transactions</p>
            </div>
          </div>

          <div className="bg-amber-50 dark:bg-amber-950 p-2 rounded mb-4 border border-amber-200 dark:border-amber-800">
            <p className="text-xs text-muted-foreground">Cash Discount Savings</p>
            <p className="text-lg font-bold text-amber-600 dark:text-amber-400">
              {formatCurrency(data.cashDiscountSavings)}
            </p>
          </div>

          <div className="w-full h-[320px]">
            <ChartContainer config={chartConfig} className="aspect-auto w-full h-full">
                <BarChart data={chartData} margin={{ left: 0, right: 10, top: 5, bottom: 20 }}>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" />
                  <XAxis
                    dataKey="date"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 12 }}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 12 }}
                    tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`}
                  />
                  <ChartTooltip
                    cursor={{ fill: 'rgba(0, 0, 0, 0.1)' }}
                    content={({ active, payload, label }) => {
                      if (active && payload && payload.length) {
                        return (
                          <div className="bg-white dark:bg-slate-950 p-3 rounded border border-slate-200 dark:border-slate-700 shadow-lg">
                            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2">
                              {label}
                            </p>
                            <div className="space-y-1">
                              {payload.map((item, index) => (
                                <div key={index} className="flex items-center justify-between gap-2">
                                  <span className="text-xs text-slate-700 dark:text-slate-300">{item.name}:</span>
                                  <span className="text-xs font-bold text-slate-900 dark:text-slate-100">
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
                  {/* Legend added here */}
                  <Legend
                    verticalAlign="top"
                    height={36}
                    iconType="circle"
                    formatter={(value) => <span className="text-xs text-gray-700">{value}</span>}
                  />
                  <Bar dataKey="cardRevenue" fill={COLORS.cardRevenue} name="Card Revenue" />
                  <Bar dataKey="cashRevenue" fill={COLORS.cashRevenue} name="Cash Revenue" />
                </BarChart>
            </ChartContainer>
          </div>
        </>
      )}
    </ChartCard>
  )
}