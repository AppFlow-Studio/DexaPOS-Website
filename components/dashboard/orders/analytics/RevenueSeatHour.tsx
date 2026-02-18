'use client'

import { ChartCard } from './ChartCard'
import { ChartContainer, ChartTooltip, type ChartConfig } from '@/components/ui/chart'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend, ResponsiveContainer } from 'recharts'
import { DollarSign } from 'lucide-react'
import type { RevPASHByHour } from '@/types/analytics'

interface RevenueSeatHourProps {
  data?: RevPASHByHour[] | null
  isLoading?: boolean
}

const chartConfig = {
  revpash: {
    label: 'Revenue Per Seat Hour',
    color: '#10B981',
  },
} satisfies ChartConfig

const HOUR_LABELS = [
  '12 AM', '1 AM', '2 AM', '3 AM', '4 AM', '5 AM',
  '6 AM', '7 AM', '8 AM', '9 AM', '10 AM', '11 AM',
  '12 PM', '1 PM', '2 PM', '3 PM', '4 PM', '5 PM',
  '6 PM', '7 PM', '8 PM', '9 PM', '10 PM', '11 PM',
]

export function RevenueSeatHour({ data, isLoading }: RevenueSeatHourProps) {
  const isEmpty = !data || data.length === 0

  const chartData = data?.map((item) => ({
    hour: HOUR_LABELS[item.hour] || `${item.hour}:00`,
    revpash: Number(item.revpash.toFixed(2)),
    covers: item.covers,
  })) || []

  return (
    <ChartCard
      title="Revenue Per Seat Hour"
      subtitle="RevPASH by hour of day"
      icon={DollarSign}
      isLoading={isLoading}
      isEmpty={isEmpty}
    >
      {!isEmpty && (
        <div className="space-y-4">
          {/* Bar Chart */}
          <div className="w-full h-[280px]">
            <ChartContainer config={chartConfig} className="w-full h-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ left: 0, right: 10, top: 5, bottom: 20 }}>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" />
                  <XAxis
                    dataKey="hour"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 11 }}
                    angle={-45}
                    textAnchor="end"
                    height={60}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 12 }}
                    tickFormatter={(value) => `$${value.toFixed(0)}`}
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
                              {payload.map((item, index) => {
                                if (item.dataKey === 'revpash') {
                                  return (
                                    <div key={index} className="flex items-center justify-between gap-2">
                                      <span className="text-xs text-slate-700 dark:text-slate-300">
                                        RevPASH:
                                      </span>
                                      <span className="text-xs font-bold text-slate-900 dark:text-slate-100">
                                        ${Number(item.value).toFixed(2)}
                                      </span>
                                    </div>
                                  )
                                }
                                return null
                              })}
                            </div>
                          </div>
                        )
                      }
                      return null
                    }}
                  />
                  <Bar
                    dataKey="revpash"
                    fill={chartConfig.revpash.color}
                    name="Revenue Per Seat Hour"
                    radius={[8, 8, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </ChartContainer>
          </div>
        </div>
      )}
    </ChartCard>
  )
}
