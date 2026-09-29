'use client'

import { useMemo } from 'react'
import { format } from 'date-fns'
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { CHART_GRID, CHART_TICK, ChartEmpty, isEmptySeries } from '@/components/dashboard/shell'
import {
  AnalyticsTooltip,
  CHART_MARGIN,
  DATE_AXIS_TICK_GAP,
  monthAwareDateTick,
} from '@/app/manage/components/analytics-primitives'
import { formatCurrency } from '@/lib/utils'

// A `type`, not an `interface`: `monthAwareDateTick` takes `Record<string, unknown>`
// rows, and only a type alias gets the implicit index signature that satisfies it.
type FeeTrendPoint = {
  day: string
  gross_dual_pricing_fee: number
  refunded_dual_pricing_fee: number
  net_platform_fee: number
}

const DAY_MS = 86_400_000

/**
 * The server returns only days that had payments. A fee total is a sum, so a
 * missing day is a real $0 — not an unknown (unlike `fillDateGaps`, which
 * inserts nulls for medians). Filling it keeps the x-axis a true time scale.
 * Days are UTC calendar days, matching how the server buckets `captured_at`.
 */
function fillFeeDays(rows: readonly FeeTrendPoint[], from: string, to: string): FeeTrendPoint[] {
  const byDay = new Map(rows.map((r) => [r.day, r]))
  const startDay = from.slice(0, 10)
  const endDay = to.slice(0, 10)
  const toUTC = (d: string) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10))
  const start = toUTC(startDay)
  const end = toUTC(endDay)
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return [...rows]

  const out: FeeTrendPoint[] = []
  for (let t = start; t <= end; t += DAY_MS) {
    const day = new Date(t).toISOString().slice(0, 10)
    out.push(
      byDay.get(day) ?? {
        day,
        gross_dual_pricing_fee: 0,
        refunded_dual_pricing_fee: 0,
        net_platform_fee: 0,
      }
    )
  }
  return out
}

function formatCompactCurrency(value: number) {
  const abs = Math.abs(value)
  if (abs >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000) return `$${(value / 1_000).toFixed(1)}k`
  return `$${value}`
}

function formatDayLabel(day: unknown) {
  const raw = String(day ?? '')
  // Parse as a calendar day, not a UTC instant, so it never slips a day.
  const [y, m, d] = raw.split('-').map(Number)
  if (!y || !m || !d) return raw
  return format(new Date(y, m - 1, d), 'MMM d, yyyy')
}

export function FeeTrendChart({
  data,
  from,
  to,
  height = 260,
}: {
  data: FeeTrendPoint[]
  from: string
  to: string
  height?: number
}) {
  const rows = useMemo(() => fillFeeDays(data ?? [], from, to), [data, from, to])
  const dayTick = useMemo(() => monthAwareDateTick(rows, 'day'), [rows])

  // All-zero is as empty as no rows (§4.9).
  if (isEmptySeries(data ?? [], (r) => r.gross_dual_pricing_fee, (r) => r.net_platform_fee)) {
    return (
      <ChartEmpty
        height={height}
        title="No fee activity in this period"
        hint="The trend appears once merchants take card payments with a surcharge."
      />
    )
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={rows} margin={CHART_MARGIN}>
        <defs>
          <linearGradient id="cardSurchargeFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="var(--brand)" stopOpacity={0.25} />
            <stop offset="95%" stopColor="var(--brand)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid {...CHART_GRID} vertical={false} />
        <XAxis
          dataKey="day"
          tick={CHART_TICK}
          tickFormatter={dayTick}
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          minTickGap={DATE_AXIS_TICK_GAP}
        />
        <YAxis
          width={56}
          tick={CHART_TICK}
          tickFormatter={formatCompactCurrency}
          tickLine={false}
          axisLine={false}
        />
        <Tooltip
          cursor={{ stroke: 'var(--border)', strokeWidth: 1 }}
          content={(props) => (
            <AnalyticsTooltip
              {...props}
              label={formatDayLabel(props.label)}
              formatter={(value: number) => formatCurrency(Number(value) || 0)}
            />
          )}
        />
        <Legend
          iconSize={10}
          formatter={(value: string) => (
            <span className="text-xs text-muted-foreground">{value}</span>
          )}
        />
        <Area
          type="monotone"
          dataKey="gross_dual_pricing_fee"
          name="Card surcharge"
          stroke="var(--brand)"
          fill="url(#cardSurchargeFill)"
          strokeWidth={2}
        />
        <Line
          type="monotone"
          dataKey="net_platform_fee"
          name="Net platform fee"
          stroke="var(--foreground)"
          strokeWidth={2}
          dot={false}
        />
      </ComposedChart>
    </ResponsiveContainer>
  )
}
