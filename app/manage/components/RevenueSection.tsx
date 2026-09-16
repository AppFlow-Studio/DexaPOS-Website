'use client'

import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  Legend,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'

import { Panel } from '@/components/dashboard/shell/Panel'
import { PanelSection } from '@/components/dashboard/shell/PanelSection'
import { StatRow, StatTile } from '@/components/dashboard/shell/StatTile'
import {
  CHART_GRID,
  CHART_TICK,
  CHART_CURSOR_FILL,
} from '@/components/dashboard/orders/analytics/AnalyticsPrimitives'
import { Skeleton } from '@/components/ui/skeleton'
import { usePlatformRevenueMetrics } from '@/lib/queries/use-platform-analytics-layer2'
import {
  AnalyticsPanel,
  AnalyticsTooltip,
  SERIES,
  CategoryTick,
  CATEGORY_AXIS_WIDTH,
} from './analytics-primitives'
import { useIsMobile } from '@/hooks/use-mobile'

interface RevenueSectionProps {
  from: string
  to: string
}

const CURSOR_LINE = { stroke: 'var(--border)', strokeWidth: 1 }
const usd = (v: number) => `$${v.toLocaleString()}`

/** Legend labels inherit the themed foreground rather than a fixed slate. */
const legendLabel = (value: string) => (
  <span className="text-xs text-muted-foreground">{value}</span>
)

export function RevenueSection({ from, to }: RevenueSectionProps) {
  const { data, isLoading } = usePlatformRevenueMetrics(from, to)
  const isMobile = useIsMobile()
  const axisWidth = isMobile ? CATEGORY_AXIS_WIDTH.mobile : CATEGORY_AXIS_WIDTH.desktop

  // Height scales with the row count instead of a flat 300px. At 10 merchants
  // that gave each row ~26px, which a wrapped two/three-line merchant name
  // (11px per line) overflows — so adjacent labels collided. 44px a row on a
  // phone leaves clear space between them; the chart just gets taller and the
  // page scrolls, which is the right trade on mobile.
  const merchantRows = (data?.revenueByMerchant || []).slice(0, 10)
  const merchantChartHeight = Math.max(
    300,
    merchantRows.length * (isMobile ? 44 : 34) + 40
  )

  if (isLoading) {
    return (
      <div className="min-w-0 space-y-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-64 w-full rounded-3xl" />
        ))}
      </div>
    )
  }

  const gmvByDay = data?.gmvByDay || []
  const totalRevenue = gmvByDay.reduce((sum, day) => sum + day.revenue, 0)
  const totalOrders = gmvByDay.reduce((sum, day) => sum + (day.order_count || 0), 0)

  return (
    <div className="min-w-0 space-y-6">
      <Panel>
        <PanelSection label="Revenue Overview">
          <StatRow columns={3}>
            <StatTile
              label="Total GMV"
              value={usd(totalRevenue)}
              meta="Selected period"
            />
            <StatTile
              label="Avg Daily GMV"
              value={`$${(totalRevenue / (gmvByDay.length || 1)).toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
              meta="Per day"
            />
            <StatTile
              label="Total Orders"
              value={totalOrders.toLocaleString()}
              meta="All orders"
            />
          </StatRow>
        </PanelSection>
      </Panel>

      <AnalyticsPanel title="Platform GMV Trend" caption="Daily gross merchandise value">
        <ResponsiveContainer width="100%" height={350}>
          <AreaChart data={gmvByDay}>
            <defs>
              <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={SERIES[0]} stopOpacity={0.3} />
                <stop offset="95%" stopColor={SERIES[0]} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid {...CHART_GRID} />
            <XAxis
              dataKey="date"
              tickFormatter={(v) => v.slice(5)}
              tick={CHART_TICK}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              tick={CHART_TICK}
              tickLine={false}
              axisLine={false}
              tickFormatter={usd}
            />
            <Tooltip content={<AnalyticsTooltip formatter={usd} />} cursor={CURSOR_LINE} />
            <Area
              type="monotone"
              dataKey="revenue"
              stroke={SERIES[0]}
              strokeWidth={2}
              fill="url(#revenueGradient)"
              name="Revenue"
            />
          </AreaChart>
        </ResponsiveContainer>
      </AnalyticsPanel>

      <div className="grid min-w-0 gap-6 md:grid-cols-2">
        <AnalyticsPanel title="Revenue by Merchant" caption="Top 10 merchants">
          <ResponsiveContainer width="100%" height={merchantChartHeight}>
            {/* No `margin.left` here: the YAxis `width` already reserves the
                label gutter, so an extra 80px margin indented the whole plot a
                second time and left the bars a sliver of a phone screen. */}
            <BarChart data={merchantRows} layout="vertical">
              <CartesianGrid {...CHART_GRID} horizontal={false} />
              <XAxis type="number" tick={CHART_TICK} tickLine={false} axisLine={false} />
              <YAxis
                dataKey="merchant_name"
                type="category"
                tick={<CategoryTick width={axisWidth} />}
                tickLine={false}
                axisLine={false}
                width={axisWidth}
              />
              <Tooltip content={<AnalyticsTooltip formatter={usd} />} cursor={{ fill: CHART_CURSOR_FILL }} />
              <Bar dataKey="revenue" radius={[0, 4, 4, 0]}>
                {merchantRows.map((_, index) => (
                  <Cell key={`cell-${index}`} fill={SERIES[index % SERIES.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </AnalyticsPanel>

        <AnalyticsPanel title="Revenue by Order Type">
          <ResponsiveContainer width="100%" height={350}>
            <PieChart>
              <Pie
                data={data?.revenueByOrderType || []}
                cx="50%"
                cy="45%"
                outerRadius={100}
                dataKey="revenue"
                nameKey="order_type"
              >
                {(data?.revenueByOrderType || []).map((_, index) => (
                  <Cell key={`cell-${index}`} fill={SERIES[index % SERIES.length]} />
                ))}
              </Pie>
              <Tooltip content={<AnalyticsTooltip formatter={usd} />} />
              <Legend verticalAlign="bottom" height={36} iconType="circle" formatter={legendLabel} />
            </PieChart>
          </ResponsiveContainer>
        </AnalyticsPanel>
      </div>

      <div className="grid min-w-0 gap-6 md:grid-cols-2">
        <AnalyticsPanel title="Payment Method Mix" caption="By transaction count">
          <ResponsiveContainer width="100%" height={350}>
            <PieChart>
              <Pie
                data={data?.paymentMethodMix || []}
                cx="50%"
                cy="45%"
                outerRadius={100}
                dataKey="txn_count"
                nameKey="payment_method"
              >
                {(data?.paymentMethodMix || []).map((_, index) => (
                  <Cell key={`cell-${index}`} fill={SERIES[index % SERIES.length]} />
                ))}
              </Pie>
              <Tooltip content={<AnalyticsTooltip />} />
              <Legend verticalAlign="bottom" height={36} iconType="circle" formatter={legendLabel} />
            </PieChart>
          </ResponsiveContainer>
        </AnalyticsPanel>

        <AnalyticsPanel title="Cash vs Card Split" caption="By pricing mode">
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={data?.cashVsCardSplit || []} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
              <CartesianGrid {...CHART_GRID} />
              <XAxis
                dataKey="pricing_mode"
                tick={CHART_TICK}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                tick={CHART_TICK}
                tickLine={false}
                axisLine={false}
                tickFormatter={usd}
              />
              <Tooltip content={<AnalyticsTooltip formatter={usd} />} cursor={{ fill: CHART_CURSOR_FILL }} />
              <Bar dataKey="revenue" radius={[4, 4, 0, 0]}>
                {(data?.cashVsCardSplit || []).map((_, index) => (
                  <Cell key={`cell-${index}`} fill={SERIES[index % SERIES.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </AnalyticsPanel>
      </div>

      {/* Trend Lines: Avg Ticket, Tip Rate, Refund Rate */}
      <div className="grid min-w-0 gap-6 md:grid-cols-3">
        <AnalyticsPanel title="Avg Ticket Size" caption="Daily trend">
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={data?.avgTicketByDay || []}>
              <CartesianGrid {...CHART_GRID} />
              <XAxis
                dataKey="date"
                tickFormatter={(v) => v.slice(5)}
                tick={{ ...CHART_TICK, fontSize: 10 }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                tick={{ ...CHART_TICK, fontSize: 10 }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => `$${v}`}
              />
              <Tooltip
                content={<AnalyticsTooltip formatter={(v: number) => `$${v.toFixed(2)}`} />}
                cursor={CURSOR_LINE}
              />
              <Line
                type="monotone"
                dataKey="avg_ticket"
                stroke={SERIES[0]}
                strokeWidth={2}
                dot={false}
                name="Avg Ticket"
              />
            </LineChart>
          </ResponsiveContainer>
        </AnalyticsPanel>

        <AnalyticsPanel title="Tip Rate %" caption="Daily average">
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={data?.tipRateByDay || []}>
              <CartesianGrid {...CHART_GRID} />
              <XAxis
                dataKey="date"
                tickFormatter={(v) => v.slice(5)}
                tick={{ ...CHART_TICK, fontSize: 10 }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                tick={{ ...CHART_TICK, fontSize: 10 }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => `${v}%`}
              />
              <Tooltip content={<AnalyticsTooltip formatter={(v: number) => `${v.toFixed(1)}%`} />} />
              <Line
                type="monotone"
                dataKey="tip_rate_pct"
                stroke={SERIES[1]}
                strokeWidth={2}
                dot={false}
                name="Tip Rate"
              />
            </LineChart>
          </ResponsiveContainer>
        </AnalyticsPanel>

        <AnalyticsPanel title="Refund Rate %" caption="Daily (target 5%)">
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={data?.refundRateByDay || []}>
              <CartesianGrid {...CHART_GRID} />
              <XAxis
                dataKey="date"
                tickFormatter={(v) => v.slice(5)}
                tick={{ ...CHART_TICK, fontSize: 10 }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                tick={{ ...CHART_TICK, fontSize: 10 }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => `${v}%`}
              />
              <Tooltip content={<AnalyticsTooltip formatter={(v: number) => `${v.toFixed(1)}%`} />} />
              <Line
                type="monotone"
                dataKey="refund_rate_pct"
                stroke={SERIES[4]}
                strokeWidth={2}
                dot={false}
                name="Refund Rate"
              />
              {/* The 5% target line is a reference, so it stays neutral. */}
              <Line
                type="monotone"
                dataKey={() => 5}
                stroke="var(--muted-foreground)"
                strokeDasharray="5 5"
                strokeWidth={1}
                dot={false}
                name="Target 5%"
              />
            </LineChart>
          </ResponsiveContainer>
        </AnalyticsPanel>
      </div>
    </div>
  )
}
