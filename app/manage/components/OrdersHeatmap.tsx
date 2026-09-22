'use client'

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { Clock } from 'lucide-react'

import { Panel } from '@/components/dashboard/shell/Panel'
import { PanelSection } from '@/components/dashboard/shell/PanelSection'
import {
  CHART_GRID,
  CHART_TICK,
  CHART_CURSOR_FILL,
  ChartTooltipPanel,
} from '@/components/dashboard/orders/analytics/AnalyticsPrimitives'
import { Skeleton } from '@/components/ui/skeleton'
import { usePlatformOrdersHeatmap } from '@/lib/queries/use-platform-dashboard'

/**
 * Volume intensity ramp.
 *
 * This is one of §4.6b's two narrow exceptions to the no-status-colour rule:
 * on a heatmap the colour *is* the data, not a decorative status tint. The
 * ramp and the "now" highlight are therefore kept as-is.
 */
const INTENSITY = {
  low: '#e5e7eb',
  medium: '#fbbf24',
  high: '#f97316',
  peak: '#dc2626',
  now: '#3b82f6',
} as const

const LEGEND: { label: string; color: string }[] = [
  { label: 'Low', color: INTENSITY.low },
  { label: 'Medium', color: INTENSITY.medium },
  { label: 'High', color: INTENSITY.high },
  { label: 'Peak', color: INTENSITY.peak },
  { label: 'Now', color: INTENSITY.now },
]

export function OrdersHeatmap() {
  const { data: heatmapData, isLoading } = usePlatformOrdersHeatmap()

  // Get current hour for highlighting
  const currentHour = new Date().getHours()

  const getBarColor = (intensity: number, hour: number) => {
    if (hour === currentHour) return INTENSITY.now
    if (intensity < 0.25) return INTENSITY.low
    if (intensity < 0.5) return INTENSITY.medium
    if (intensity < 0.75) return INTENSITY.high
    return INTENSITY.peak
  }

  const maxCount = Math.max(...(heatmapData ?? []).map((d) => d.count), 1)
  const chartData = (heatmapData ?? []).map((d) => ({
    ...d,
    timeLabel: formatHour(d.hour),
    intensity: d.count / maxCount, // 0-1 for color intensity
  }))

  return (
    <Panel className="h-full">
      <PanelSection icon={Clock} label="Order Volume (24h)">
        {isLoading ? (
          <Skeleton className="h-[300px] w-full rounded-2xl" />
        ) : chartData.length === 0 ? (
          <div className="flex h-[300px] items-center justify-center text-sm text-muted-foreground">
            No order data available
          </div>
        ) : (
          <>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={chartData} margin={{ top: 20, right: 8, left: 0, bottom: 20 }}>
                <CartesianGrid {...CHART_GRID} vertical={false} />
                <XAxis
                  dataKey="timeLabel"
                  tick={{ ...CHART_TICK, fontSize: 10 }}
                  tickLine={false}
                  axisLine={false}
                  interval={5}
                  padding={{ left: 16, right: 8 }}
                />
                <YAxis hide />
                <Tooltip
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      return (
                        <ChartTooltipPanel
                          label={payload[0].payload.timeLabel}
                          items={[{ name: 'Orders', value: payload[0].value as React.ReactNode }]}
                        />
                      )
                    }
                    return null
                  }}
                  cursor={{ fill: CHART_CURSOR_FILL }}
                />
                <Bar dataKey="count" radius={[4, 4, 0, 0]} isAnimationActive animationDuration={500}>
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={getBarColor(entry.intensity, entry.hour)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>

            <div className="mt-4 flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 text-xs">
              {LEGEND.map(({ label, color }) => (
                <div key={label} className="flex items-center gap-1">
                  <div
                    className="h-3 w-3 shrink-0 rounded"
                    style={{ backgroundColor: color }}
                  />
                  <span className="text-muted-foreground">{label}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </PanelSection>
    </Panel>
  )
}

function formatHour(hour: number): string {
  if (hour === 0) return '12AM'
  if (hour < 12) return `${hour}AM`
  if (hour === 12) return '12PM'
  return `${hour - 12}PM`
}
