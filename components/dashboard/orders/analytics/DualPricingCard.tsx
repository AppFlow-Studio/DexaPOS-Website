'use client'

import { ChartCard } from './ChartCard'
import { StatRow, StatTile } from './AnalyticsPrimitives'
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
          <StatRow columns={3} className="mb-8">
            <StatTile
              label="Card Revenue"
              value={formatCurrency(data.cardRevenue)}
              meta={`${data.cardTransactions} transactions`}
            />
            <StatTile
              label="Cash Revenue"
              value={formatCurrency(data.cashRevenue)}
              meta={`${data.cashTransactions} transactions`}
            />
            <StatTile
              label="Cash Discount Savings"
              value={formatCurrency(data.cashDiscountSavings)}
            />
          </StatRow>

          <div className="w-full h-[320px]">
            <ChartContainer config={chartConfig} className="aspect-auto w-full h-full">
                <BarChart data={chartData} margin={{ left: 0, right: 10, top: 5, bottom: 20 }}>
                  <CartesianGrid
                    vertical={false}
                    strokeDasharray="3 3"
                    stroke="var(--border)"
                  />
                  <XAxis
                    dataKey="date"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }}
                    tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`}
                  />
                  <ChartTooltip
                    cursor={{ fill: 'color-mix(in srgb, var(--muted) 40%, transparent)' }}
                    content={({ active, payload, label }) => {
                      if (active && payload && payload.length) {
                        return (
                          <div className="rounded-xl border bg-popover p-3 text-popover-foreground shadow-lg">
                            <p className="mb-2 text-[0.8125rem] font-medium text-muted-foreground">
                              {label}
                            </p>
                            <div className="space-y-1.5">
                              {payload.map((item, index) => (
                                <div key={index} className="flex items-center justify-between gap-6">
                                  <div className="flex items-center gap-2">
                                    <span
                                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                                      style={{ backgroundColor: item.color }}
                                    />
                                    <span className="text-[0.8125rem] text-muted-foreground">
                                      {item.name}
                                    </span>
                                  </div>
                                  <span className="text-[0.8125rem] tabular-nums">
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
                    formatter={(value) => (
                      <span className="text-[0.8125rem] text-muted-foreground">{value}</span>
                    )}
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