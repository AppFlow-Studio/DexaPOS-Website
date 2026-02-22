'use client'

import { ChartCard } from './ChartCard'
import { ChartContainer, ChartTooltip, type ChartConfig } from '@/components/ui/chart'
import { BarChart, Bar, XAxis, YAxis, Cell, Legend, ResponsiveContainer } from 'recharts'
import { Workflow } from 'lucide-react'
import type { ServicePhase } from '@/types/analytics'

interface ServiceTimelineBreakdownProps {
  phases?: ServicePhase[] | null
  isLoading?: boolean
}

const PHASE_COLORS: Record<string, string> = {
  'seated_to_order': '#3B82F6',      // Blue
  'order_to_food': '#10B981',        // Emerald
  'food_to_check': '#F59E0B',        // Amber
  'check_to_payment': '#EF4444',     // Red
  'payment_to_cleared': '#8B5CF6',   // Violet
}

const PHASE_LABELS: Record<string, string> = {
  'seated_to_order': 'Seated → Order',
  'order_to_food': 'Order → Food',
  'food_to_check': 'Food → Check',
  'check_to_payment': 'Check → Payment',
  'payment_to_cleared': 'Payment → Cleared',
}

export function ServiceTimelineBreakdown({ phases, isLoading }: ServiceTimelineBreakdownProps) {
  const isEmpty = !phases || phases.length === 0

  // Prepare data for stacked bar chart (single row)
  const chartData = phases && phases.length > 0 ? [
    {
      name: 'Service Timeline',
      ...Object.fromEntries(
        phases.map((p) => [p.phase, p.avg_minutes])
      ),
    },
  ] : []

  // Calculate total for percentage display
  const totalMinutes = phases?.reduce((sum, p) => sum + p.avg_minutes, 0) || 0

  const chartConfig = Object.entries(PHASE_LABELS).reduce((acc, [key, label]) => {
    return {
      ...acc,
      [key]: {
        label,
        color: PHASE_COLORS[key],
      },
    }
  }, {}) satisfies ChartConfig

  return (
    <ChartCard
      title="Service Timeline Breakdown"
      subtitle="Average time spent in each service phase"
      icon={Workflow}
      isLoading={isLoading}
      isEmpty={isEmpty}
      className="lg:col-span-2"
    >
      {!isEmpty && (
        <div className="space-y-6">
          {/* Stacked Bar Chart */}
          <div className="w-full h-[120px]">
            <ChartContainer config={chartConfig} className="w-full h-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} layout="vertical" margin={{ left: 100, right: 10, top: 10, bottom: 10 }}>
                  <XAxis type="number" tickFormatter={(value) => `${value.toFixed(0)}m`} />
                  <YAxis dataKey="name" type="category" width={90} />
                  <ChartTooltip
                    cursor={{ fill: 'rgba(0, 0, 0, 0.1)' }}
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        return (
                          <div className="bg-white dark:bg-slate-950 p-3 rounded border border-slate-200 dark:border-slate-700 shadow-lg">
                            <div className="space-y-1">
                              {payload.map((item, index) => (
                                <div key={index} className="flex items-center justify-between gap-2">
                                  <span className="text-xs text-slate-700 dark:text-slate-300">
                                    {PHASE_LABELS[item.dataKey as string]}:
                                  </span>
                                  <span className="text-xs font-bold text-slate-900 dark:text-slate-100">
                                    {Number(item.value).toFixed(1)}m
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
                  <Legend wrapperStyle={{ paddingTop: '10px' }} />
                  {phases?.map((phase) => (
                    <Bar
                      key={phase.phase}
                      dataKey={phase.phase}
                      stackId="timeline"
                      fill={PHASE_COLORS[phase.phase]}
                      name={PHASE_LABELS[phase.phase]}
                      radius={[0, 8, 8, 0]}
                    />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </ChartContainer>
          </div>

          {/* Phase Breakdown Table */}
          <div>
            <p className="text-xs font-semibold mb-3 text-muted-foreground">Phase Details</p>
            <div className="space-y-2">
              {phases?.map((phase) => {
                const percentage = totalMinutes > 0 ? (phase.avg_minutes / totalMinutes) * 100 : 0
                return (
                  <div key={phase.phase} className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-900 rounded border border-slate-200 dark:border-slate-700">
                    <div className="flex items-center gap-3 flex-1">
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: PHASE_COLORS[phase.phase] }}
                      />
                      <div className="flex-1">
                        <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                          {PHASE_LABELS[phase.phase]}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {phase.sessions} sessions
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-slate-900 dark:text-slate-100">
                        {phase.avg_minutes.toFixed(1)}m
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {percentage.toFixed(1)}%
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </ChartCard>
  )
}
