'use client'

import { ChartCard } from './ChartCard'
import { AnalyticsSubLabel, CHART_CURSOR_FILL, CHART_TICK, ChartTooltipPanel } from './AnalyticsPrimitives'
import { ChartContainer, ChartTooltip, type ChartConfig } from '@/components/ui/chart'
import { BarChart, Bar, XAxis, YAxis, Cell, Legend } from 'recharts'
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
          {/* Stacked Bar Chart. The legend wraps to two rows at narrow widths
              and the bar itself needs ~60px, so 120px clipped both the legend
              and the tooltip. */}
          <div className="w-full h-[200px]">
            <ChartContainer config={chartConfig} className="aspect-auto w-full h-full">
                <BarChart data={chartData} layout="vertical" margin={{ left: 0, right: 10, top: 10, bottom: 10 }}>
                  <XAxis type="number" tick={CHART_TICK} tickFormatter={(value) => `${value.toFixed(0)}m`} />
                  <YAxis dataKey="name" type="category" width={90} tick={CHART_TICK} />
                  <ChartTooltip
                    shared={false}
                    cursor={{ fill: CHART_CURSOR_FILL }}
                    /* Only the hovered segment: listing all five phases made
                       the panel taller than the chart, so it overflowed the
                       section and covered the legend. The full list already
                       lives in "Phase details" below. */
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null

                      const item = payload[0]

                      return (
                        <ChartTooltipPanel
                          items={[
                            {
                              name: PHASE_LABELS[item.dataKey as string],
                              color: PHASE_COLORS[item.dataKey as string],
                              value: `${Number(item.value).toFixed(1)}m`,
                            },
                          ]}
                        />
                      )
                    }}
                  />
                  <Legend iconType="circle" wrapperStyle={{ paddingTop: '10px', fontSize: 13, color: 'var(--muted-foreground)' }} />
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
            </ChartContainer>
          </div>

          {/* Phase Breakdown Table */}
          <div>
            <AnalyticsSubLabel>Phase details</AnalyticsSubLabel>
            <div>
              {phases?.map((phase) => {
                const percentage = totalMinutes > 0 ? (phase.avg_minutes / totalMinutes) * 100 : 0
                return (
                  <div
                    key={phase.phase}
                    className="flex items-center justify-between gap-3 border-b border-border/60 py-2.5 last:border-0"
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-2.5">
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: PHASE_COLORS[phase.phase] }}
                      />
                      <div className="min-w-0">
                        <p className="truncate text-sm">
                          {PHASE_LABELS[phase.phase]}
                        </p>
                        <p className="text-[0.8125rem] text-muted-foreground">
                          {phase.sessions} sessions
                        </p>
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-sm tabular-nums">
                        {phase.avg_minutes.toFixed(1)}m
                      </p>
                      <p className="text-[0.8125rem] tabular-nums text-muted-foreground">
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
