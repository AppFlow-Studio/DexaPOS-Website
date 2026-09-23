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
  CHART_MARGIN,
  monthAwareDateTick,
  valueAxisWidthMobile,
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

  // Recharts reserves ~60px for a numeric Y axis whatever the labels measure,
  // so a `0%`–`28%` axis left ~40px of empty gutter between the panel edge and
  // the plot — the blank strip down the left of these charts. Each axis is
  // sized to its own longest tick instead: one width cannot serve both `7%`
  // and `$60,000`.
  //
  // Sized at BOTH widths, not just mobile. Leaving desktop on the ~60px
  // default is what left the gutter visible on a full-size screen.
  //
  // Measured rather than padded: `CHART_TICK` is a 12px font, whose digits are
  // ~6.7px wide, so `valueAxisWidthMobile`'s 7px/char plus 10px is already
  // generous at desktop — adding a character on top of it made the widest axis
  // ($60,000 → 66px) LARGER than the 60px default it was meant to replace.
  // The same character count is used at both sizes; the tick font only steps
  // from 10px to 12px, which the built-in 10px of slack absorbs.
  const axisW = (chars: number) => valueAxisWidthMobile(chars)
  const pctAxisWidth = axisW(3) // "28%"     -> 31px
  const moneyAxisWidth = axisW(6) // "$1,234"  -> 52px
  const gmvAxisWidth = axisW(7) // "$60,000" -> 59px
  // Cash vs Card totals the whole period rather than a single day, so its
  // ticks run an order of magnitude higher than the GMV trend's — "$269,291"
  // is 8 characters. Sized separately so the widest label is not clipped.
  const totalAxisWidth = axisW(8) // "$269,291" -> 66px
  // The merchant-name gutter. Trimmed from the 120px desktop default, which
  // was sized for a full-width chart; this one sits in a half-width panel, so
  // that much of it was the empty left strip rather than name.
  const merchantAxisWidth = isMobile ? CATEGORY_AXIS_WIDTH.mobile : 96

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
  // Hoisted so the axis formatter and the chart read the same array — the
  // formatter needs the previous row to decide whether to name the month.
  const avgTicketByDay = data?.avgTicketByDay || []
  const tipRateByDay = data?.tipRateByDay || []
  const refundRateByDay = data?.refundRateByDay || []
  const totalRevenue = gmvByDay.reduce((sum, day) => sum + day.revenue, 0)
  const totalOrders = gmvByDay.reduce((sum, day) => sum + (day.order_count || 0), 0)

  return (
    <div className="min-w-0 space-y-6">
      <Panel>
        <PanelSection label="Revenue Overview">
          <StatRow columns={3}>
            {/* No `meta` lines here. "Selected period", "Per day" and "All
                orders" each restated their own label — the range bar already
                states the period, "Avg Daily" already says per-day, and
                "Total Orders" already says all of them. Three lines of type
                that added nothing but made the row twice as tall. `meta` is
                for a figure that needs qualifying, as in the Payments row's
                conditional "Above 5% threshold". */}
            <StatTile label="Total GMV" value={usd(totalRevenue)} />
            <StatTile
              label="Avg Daily GMV"
              value={`$${(totalRevenue / (gmvByDay.length || 1)).toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
            />
            <StatTile label="Total Orders" value={totalOrders.toLocaleString()} />
          </StatRow>
        </PanelSection>
      </Panel>

      <AnalyticsPanel title="Platform GMV Trend" caption="Daily gross merchandise value">
        <ResponsiveContainer width="100%" height={350}>
          <AreaChart data={gmvByDay} margin={CHART_MARGIN}>
            <defs>
              <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={SERIES[0]} stopOpacity={0.3} />
                <stop offset="95%" stopColor={SERIES[0]} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid {...CHART_GRID} />
            <XAxis
              dataKey="date"
              tickFormatter={monthAwareDateTick(gmvByDay)}
              tick={CHART_TICK}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              width={gmvAxisWidth}
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
            <BarChart data={merchantRows} layout="vertical" margin={CHART_MARGIN}>
              <CartesianGrid {...CHART_GRID} horizontal={false} />
              <XAxis type="number" tick={CHART_TICK} tickLine={false} axisLine={false} />
              {/* Unlike the value axes above, this gutter holds merchant names
                  — real content, so it is not shrunk to nothing. It is only
                  trimmed from the 120px desktop default, which was sized for a
                  full-width chart and is too generous inside a half-width
                  panel; `CategoryTick` wraps a long name into whatever it
                  gets. */}
              <YAxis
                dataKey="merchant_name"
                type="category"
                tick={<CategoryTick width={merchantAxisWidth} />}
                tickLine={false}
                axisLine={false}
                width={merchantAxisWidth}
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
            {/* `margin.left` was 20px on top of the axis's own ~60px gutter —
                the plot was indented twice, which is what left the bars
                hanging off to the right of an empty strip. The axis `width`
                below is the only left inset now. */}
            <BarChart data={data?.cashVsCardSplit || []} margin={CHART_MARGIN}>
              <CartesianGrid {...CHART_GRID} />
              <XAxis
                dataKey="pricing_mode"
                tick={CHART_TICK}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                width={totalAxisWidth}
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
            <LineChart data={avgTicketByDay} margin={CHART_MARGIN}>
              <CartesianGrid {...CHART_GRID} />
              <XAxis
                dataKey="date"
                tickFormatter={monthAwareDateTick(avgTicketByDay)}
                tick={{ ...CHART_TICK, fontSize: 10 }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                width={moneyAxisWidth}
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
            <LineChart data={tipRateByDay} margin={CHART_MARGIN}>
              <CartesianGrid {...CHART_GRID} />
              <XAxis
                dataKey="date"
                tickFormatter={monthAwareDateTick(tipRateByDay)}
                tick={{ ...CHART_TICK, fontSize: 10 }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                width={pctAxisWidth}
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
            <LineChart data={refundRateByDay} margin={CHART_MARGIN}>
              <CartesianGrid {...CHART_GRID} />
              <XAxis
                dataKey="date"
                tickFormatter={monthAwareDateTick(refundRateByDay)}
                tick={{ ...CHART_TICK, fontSize: 10 }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                width={pctAxisWidth}
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
