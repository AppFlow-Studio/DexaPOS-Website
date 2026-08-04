'use client'

import { ChartCard } from './ChartCard'
import { StatRow, StatTile } from './AnalyticsPrimitives'
import { ChartContainer, type ChartConfig } from '@/components/ui/chart'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts'
import { DollarSign } from 'lucide-react'
import type { RevenueBreakdown } from '@/types/analytics'

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
          {/* Headline figures — hairline-separated, no tinted boxes. */}
          <StatRow columns={4} className="mb-8">
            <StatTile label="Subtotal" value={formatCurrency(data.subtotal)} />
            <StatTile
              label="Net Revenue"
              value={formatCurrency(data.netRevenue)}
              accent="brand"
            />
            <StatTile
              label="Tax + Charges"
              value={formatCurrency(data.tax + data.serviceCharges)}
            />
            <StatTile label="Tips" value={formatCurrency(data.tips)} />
          </StatRow>

          {/* Stacked bar chart */}
          <div className="w-full h-[350px]">
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
                  <Tooltip
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
                  <Bar dataKey="subtotal" stackId="a" fill={COLORS.subtotal} />
                  <Bar dataKey="tax" stackId="a" fill={COLORS.tax} />
                  <Bar dataKey="tips" stackId="a" fill={COLORS.tips} />
                  <Bar dataKey="serviceCharges" stackId="a" fill={COLORS.serviceCharges} />
                  <Bar dataKey="discounts" stackId="a" fill={COLORS.discounts} />
                </BarChart>
            </ChartContainer>
          </div>

          {/* Legend – matches chart colors */}
          <div className="mt-5 flex flex-wrap gap-x-6 gap-y-2">
            {Object.entries(chartConfig).map(([key, config]) => (
              <div key={key} className="flex min-w-0 items-center gap-2">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: config.color }}
                />
                <span className="truncate text-[0.8125rem] text-muted-foreground">
                  {config.label}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </ChartCard>
  )
}