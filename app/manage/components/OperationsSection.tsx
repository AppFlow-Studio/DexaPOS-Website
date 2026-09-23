'use client'

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { Clock, Zap, TrendingUp } from 'lucide-react'

import { Panel } from '@/components/dashboard/shell/Panel'
import { PanelSection } from '@/components/dashboard/shell/PanelSection'
import { StatRow, StatTile } from '@/components/dashboard/shell/StatTile'
import {
  CHART_GRID,
  CHART_TICK,
} from '@/components/dashboard/orders/analytics/AnalyticsPrimitives'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { usePlatformOperationalMetrics } from '@/lib/queries/use-platform-analytics-layer2'
import { useIsMobile } from '@/hooks/use-mobile'
import {
  AnalyticsPanel,
  AnalyticsTooltip,
  SERIES,
  fillDateGaps,
  monthAwareDateTick,
  valueAxisWidthMobile,
} from './analytics-primitives'

interface OperationsSectionProps {
  from: string
  to: string
}

const CURSOR_LINE = { stroke: 'var(--border)', strokeWidth: 1 }
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

/**
 * Peak-hours intensity ramp, green (low) → yellow → orange → red (high).
 *
 * §4.6b exception 2: this is a heatmap, so the colour IS the data. Kept as-is.
 */
function getHeatmapColor(intensity: number) {
  const stops = [
    { pos: 0, r: 34, g: 197, b: 94 },   // green
    { pos: 0.33, r: 234, g: 179, b: 8 }, // yellow
    { pos: 0.66, r: 249, g: 115, b: 22 }, // orange
    { pos: 1, r: 239, g: 68, b: 68 },    // red
  ]

  let lower = stops[0]
  let upper = stops[stops.length - 1]
  for (let i = 0; i < stops.length - 1; i++) {
    if (intensity >= stops[i].pos && intensity <= stops[i + 1].pos) {
      lower = stops[i]
      upper = stops[i + 1]
      break
    }
  }

  const range = upper.pos - lower.pos
  const t = range === 0 ? 0 : (intensity - lower.pos) / range
  const r = Math.round(lower.r + (upper.r - lower.r) * t)
  const g = Math.round(lower.g + (upper.g - lower.g) * t)
  const b = Math.round(lower.b + (upper.b - lower.b) * t)
  return `rgb(${r}, ${g}, ${b})`
}

export function OperationsSection({ from, to }: OperationsSectionProps) {
  const { data, isLoading } = usePlatformOperationalMetrics(from, to)
  // Called before the early return below — a hook after a conditional return
  // would change hook order between the loading and loaded renders.
  const isMobile = useIsMobile()
  // Sized to the longest tick rather than Recharts' ~60px default, which left
  // a blank gutter down the left of the plot. "3253" is 4 characters.
  const minuteAxisWidth = isMobile ? valueAxisWidthMobile(4) : undefined

  if (isLoading) {
    return (
      <div className="min-w-0 space-y-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-64 w-full rounded-3xl" />
        ))}
      </div>
    )
  }

  const adoptionRates = {
    kds: data?.featureAdoption.find((f) => f.feature === 'kds'),
    tableManagement: data?.featureAdoption.find((f) => f.feature === 'table_management'),
    onlineOrdering: data?.featureAdoption.find((f) => f.feature === 'online_ordering'),
  }

  const maxOrderCount = Math.max(...(data?.peakHoursHeatmap || []).map((h) => h.order_count), 1)
  const busiestLocations = data?.busiestLocations ?? []
  // The RPCs omit days with no measurable sample rather than reporting a zero
  // (a day where every ticket was abandoned has no median). On a categorical
  // x-axis those omissions would close up silently, drawing a straight segment
  // across a three-week hole. Materialising them as nulls makes the line break
  // where the data actually stops. See `fillDateGaps`.
  const kitchenTrend = fillDateGaps(data?.kitchenTrend ?? [], ['avg_minutes'])
  const tableTurnTrend = fillDateGaps(data?.tableTurnTrend ?? [], ['avg_minutes'])

  return (
    <div className="min-w-0 space-y-6">
      {/* KPIs. The five icons previously carried blue/green/yellow/purple/orange
          that encoded nothing — purple being the framework --primary, not the
          DEXA brand (C5). They are now quiet muted glyphs. */}
      <Panel>
        {/* Five figures, and `StatRow` tops out at four columns — so one row
            always orphaned the fifth tile onto a line of its own. They split on
            meaning rather than arbitrarily 3+2: two service-timing averages in
            minutes, then the three adoption rates, which share a unit (%) and a
            denominator (all merchants) and so read as one comparable set. */}
        <PanelSection label="Service Timing">
          <StatRow columns={2}>
            <StatTile
              label="Avg Kitchen Time"
              icon={<Clock />}
              value={`${data?.avgKitchenMinutes.toFixed(1) || 0} min`}
            />
            <StatTile
              label="Avg Table Turn"
              icon={<Clock />}
              value={`${data?.avgTableTurnMinutes.toFixed(1) || 0} min`}
            />
          </StatRow>
        </PanelSection>

        {/* Caption is desktop-only, like the chart panels'. This is a direct
            `PanelSection` rather than an `AnalyticsPanel`, so it does not
            inherit that wrapper's `captionClassName` and has to opt in. */}
        <PanelSection
          label="Feature Adoption"
          caption="Share of merchants using each feature"
          captionClassName="hidden sm:block"
          divider
        >
          <StatRow columns={3}>
            <StatTile
              label="KDS"
              icon={<Zap />}
              value={`${adoptionRates.kds?.adoption_pct.toFixed(1) || 0}%`}
            />
            <StatTile
              label="Table Mgmt"
              icon={<TrendingUp />}
              value={`${adoptionRates.tableManagement?.adoption_pct.toFixed(1) || 0}%`}
            />
            <StatTile
              label="Online Ordering"
              icon={<Zap />}
              value={`${adoptionRates.onlineOrdering?.adoption_pct.toFixed(1) || 0}%`}
            />
          </StatRow>
        </PanelSection>
      </Panel>

      <AnalyticsPanel
        title="Peak Hours Heatmap"
        caption="Order volume by day and hour (green = low, red = high)"
      >
        <div className="min-w-0 overflow-x-auto">
          <div className="inline-block min-w-full">
            {/* Column headers (hours) */}
            <div className="mb-2 ml-16 flex">
              {Array.from({ length: 24 }, (_, h) => (
                <div key={h} className="w-8 text-center text-xs font-medium text-muted-foreground">
                  {h.toString().padStart(2, '0')}
                </div>
              ))}
            </div>

            {/* Heatmap rows */}
            {Array.from({ length: 7 }, (_, dow) => (
              <div key={dow} className="mb-1 flex items-center">
                <div className="w-16 pr-2 text-xs font-medium">{DAY_NAMES[dow].slice(0, 3)}</div>
                {Array.from({ length: 24 }, (_, hour) => {
                  const cellData = (data?.peakHoursHeatmap || []).find(
                    (h) => h.day_of_week === dow && h.hour === hour
                  )
                  const intensity = cellData ? cellData.order_count / maxOrderCount : 0

                  return (
                    <div
                      key={`${dow}-${hour}`}
                      className="flex h-8 w-8 items-center justify-center rounded-sm text-xs font-medium tabular-nums"
                      style={{
                        backgroundColor: intensity > 0 ? getHeatmapColor(intensity) : 'var(--muted)',
                        color: intensity > 0.5 ? 'white' : undefined,
                      }}
                      title={`${DAY_NAMES[dow]} ${hour}:00 – ${cellData?.order_count || 0} orders`}
                    >
                      {cellData && cellData.order_count > 0 ? cellData.order_count : ''}
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        </div>

        {/* Legend */}
        <div className="mt-4 flex items-center justify-center gap-2 text-xs">
          <span className="text-muted-foreground">Low</span>
          <div className="flex h-3 w-20 overflow-hidden rounded-sm">
            {[0, 0.25, 0.5, 0.75, 1].map((stop) => (
              <div
                key={stop}
                className="h-full w-1/5"
                style={{ backgroundColor: getHeatmapColor(stop) }}
              />
            ))}
          </div>
          <span className="text-muted-foreground">High</span>
        </div>
      </AnalyticsPanel>

      <div className="grid min-w-0 gap-6 md:grid-cols-2">
        <AnalyticsPanel title="Kitchen Time Trend">
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={kitchenTrend}>
              <CartesianGrid {...CHART_GRID} />
              <XAxis
                dataKey="date"
                tickFormatter={monthAwareDateTick(kitchenTrend)}
                tick={CHART_TICK}
                tickLine={false}
                axisLine={false}
              />
              <YAxis width={minuteAxisWidth} tick={CHART_TICK} tickLine={false} axisLine={false} />
              <Tooltip
                content={<AnalyticsTooltip formatter={(v: number) => `${v} min`} />}
                cursor={CURSOR_LINE}
              />
              <Line
                type="monotone"
                dataKey="avg_minutes"
                stroke={SERIES[0]}
                strokeWidth={2}
                dot={false}
                name="Kitchen Time"
              />
            </LineChart>
          </ResponsiveContainer>
        </AnalyticsPanel>

        <AnalyticsPanel title="Table Turn Time Trend">
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={tableTurnTrend}>
              <CartesianGrid {...CHART_GRID} />
              <XAxis
                dataKey="date"
                tickFormatter={monthAwareDateTick(tableTurnTrend)}
                tick={CHART_TICK}
                tickLine={false}
                axisLine={false}
              />
              <YAxis width={minuteAxisWidth} tick={CHART_TICK} tickLine={false} axisLine={false} />
              <Tooltip
                content={<AnalyticsTooltip formatter={(v: number) => `${v} min`} />}
                cursor={CURSOR_LINE}
              />
              <Line
                type="monotone"
                dataKey="avg_minutes"
                stroke={SERIES[1]}
                strokeWidth={2}
                dot={false}
                name="Table Turn Time"
              />
            </LineChart>
          </ResponsiveContainer>
        </AnalyticsPanel>
      </div>

      {/* The RPC is already `ORDER BY count DESC LIMIT 10`, so a short table
          means only that few locations took an order in the range — not that
          rows were dropped. A fixed "Top 10" caption over three rows reads as a
          bug, so it states the count it actually rendered. */}
      <AnalyticsPanel
        title="Busiest Locations"
        caption={
          busiestLocations.length === 0
            ? 'By order count'
            : busiestLocations.length < 10
              ? `All ${busiestLocations.length} ${busiestLocations.length === 1 ? 'location' : 'locations'} with orders in this range`
              : 'Top 10 by order count'
        }
      >
        {busiestLocations.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-1 py-10 text-center">
            <p className="text-sm font-medium">No locations took orders in this range</p>
            <p className="text-xs text-muted-foreground">
              Try a longer date range, or check back once merchants start trading.
            </p>
          </div>
        ) : (
          <Table variant="data" className="min-w-[360px]">
            <TableHeader className="[&_tr]:border-0">
              <TableRow>
                <TableHead className="text-xs font-medium">Location</TableHead>
                <TableHead className="text-xs font-medium">Merchant</TableHead>
                <TableHead className="text-right text-xs font-medium">Orders</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {busiestLocations.map((location) => (
                <TableRow key={location.location_id}>
                  <TableCell className="text-sm font-medium">{location.location_name}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{location.merchant_name}</TableCell>
                  <TableCell className="text-right text-sm font-semibold tabular-nums">
                    {location.order_count}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </AnalyticsPanel>
    </div>
  )
}
