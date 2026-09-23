'use client'

import {
  ComposedChart,
  Area,
  Line,
  BarChart,
  Bar,
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
import { CreditCard, TrendingDown, AlertTriangle } from 'lucide-react'

import { Panel } from '@/components/dashboard/shell/Panel'
import { PanelSection } from '@/components/dashboard/shell/PanelSection'
import { StatRow, StatTile, InsetTile } from '@/components/dashboard/shell/StatTile'
import {
  CHART_GRID,
  CHART_TICK,
  CHART_CURSOR_FILL,
} from '@/components/dashboard/orders/analytics/AnalyticsPrimitives'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { usePlatformPaymentMetrics } from '@/lib/queries/use-platform-analytics-layer2'
import {
  AnalyticsPanel,
  AnalyticsTooltip,
  SERIES,
  monthAwareDateTick,
} from './analytics-primitives'
import { useIsMobile } from '@/hooks/use-mobile'

interface PaymentsSectionProps {
  from: string
  to: string
}

const CURSOR_LINE = { stroke: 'var(--border)', strokeWidth: 1 }
const count = (v: number) => v.toLocaleString()

const legendLabel = (value: string) => (
  <span className="text-xs text-muted-foreground">{value}</span>
)

// An empty range still draws a full axis frame with no marks, which reads as a
// broken chart rather than an honest "nothing happened". A row whose measures
// are all zero is just as empty as no row at all, so both count.
function isEmptySeries<T>(rows: T[], ...measures: ((row: T) => number)[]) {
  return rows.length === 0 || rows.every((row) => measures.every((m) => !m(row)))
}

function ChartEmpty({
  height,
  title,
  hint,
}: {
  height: number
  title: string
  hint: string
}) {
  return (
    <div
      className="flex flex-col items-center justify-center gap-1 text-center"
      style={{ height }}
    >
      <p className="text-sm font-medium">{title}</p>
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  )
}

export function PaymentsSection({ from, to }: PaymentsSectionProps) {
  const { data, isLoading } = usePlatformPaymentMetrics(from, to)
  const isMobile = useIsMobile()
  // Side margins are dead space on a phone; the axes already reserve gutters.
  const chartMargin = isMobile
    ? { top: 12, right: 0, left: 0, bottom: 5 }
    : { top: 20, right: 30, left: 20, bottom: 5 }
  const numAxisWidth = isMobile ? 38 : 60

  if (isLoading) {
    return (
      <div className="min-w-0 space-y-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-64 w-full rounded-3xl" />
        ))}
      </div>
    )
  }

  const failureRate = data?.summaryStats.overall_failure_rate ?? 0
  // A failure rate over the 5% threshold is a real operational alarm, so it
  // keeps its colour (§14.3 HQ-2). The other three figures had decorative
  // blue/red/orange that encoded nothing, and are now neutral.
  const failureIsAlarming = failureRate > 5

  // Merge transaction volume and failure rate data
  const combinedData = (data?.transactionVolumeByDay || []).map((day) => {
    const failureDay = (data?.failureRateByDay || []).find((f) => f.date === day.date)
    return {
      date: day.date,
      txn_count: day.txn_count,
      total_amount: day.total_amount,
      failure_rate_pct: failureDay?.failure_rate_pct || 0,
    }
  })

  const adopted = data?.dualPricingAdoption.adopted_merchants || 0
  const totalMerchants = data?.dualPricingAdoption.total_merchants || 0

  // These arrays are RPC rows passed straight through, so an empty range gives
  // an empty array — but a zero-count row would draw just as blank a chart.
  const volumeEmpty = isEmptySeries(combinedData, (d) => d.txn_count)
  const chargebacksEmpty = isEmptySeries(
    data?.chargebacksByMonth || [],
    (d) => d.chargeback_count
  )
  const terminalsEmpty = isEmptySeries(
    data?.terminalDistribution || [],
    (d) => d.terminal_count
  )

  return (
    <div className="min-w-0 space-y-6">
      <Panel>
        <PanelSection label="Payments Overview">
          <StatRow columns={4}>
            <StatTile
              label="Total Transactions"
              icon={<CreditCard />}
              value={data?.summaryStats.total_transactions.toLocaleString() || '0'}
            />
            <StatTile
              label="Failure Rate"
              icon={<TrendingDown />}
              value={
                <span className={cn(failureIsAlarming && 'text-red-600 dark:text-red-400')}>
                  {`${failureRate.toFixed(1)}%`}
                </span>
              }
              meta={failureIsAlarming ? 'Above 5% threshold' : undefined}
            />
            <StatTile
              label="Chargebacks"
              icon={<AlertTriangle />}
              value={data?.summaryStats.total_chargebacks.toLocaleString() || '0'}
            />
            <StatTile
              label="Chargeback Amount"
              icon={<CreditCard />}
              value={`$${Number(data?.summaryStats.total_chargeback_amount || 0).toLocaleString()}`}
            />
          </StatRow>
        </PanelSection>
      </Panel>

      <AnalyticsPanel
        title="Transaction Volume & Failure Rate"
        caption="Daily transactions and failure rate trend"
      >
        {volumeEmpty ? (
          // Without transactions the failure-rate line and 5% threshold have
          // nothing to sit against, so the whole frame goes rather than
          // implying a 0% failure rate that was never measured.
          <ChartEmpty
            height={350}
            title="No transactions in this period"
            hint="Volume and failure rate will appear once merchants start taking payments."
          />
        ) : (
        <ResponsiveContainer width="100%" height={350}>
          {/* Dual-axis chart: each YAxis already reserves its own gutter, so the
              extra left/right margin was pure dead space — ~50px of a phone
              screen the plot never got to use. Dropped on mobile, kept at
              desktop where the breathing room is affordable. */}
          <ComposedChart data={combinedData} margin={chartMargin}>
            <CartesianGrid {...CHART_GRID} />
            <XAxis
              dataKey="date"
              tickFormatter={monthAwareDateTick(combinedData)}
              tick={CHART_TICK}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              yAxisId="left"
              width={numAxisWidth}
              tick={CHART_TICK}
              tickLine={false}
              axisLine={false}
              tickFormatter={count}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              width={numAxisWidth}
              domain={[0, 100]}
              tick={CHART_TICK}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => `${v}%`}
            />
            <Tooltip content={<AnalyticsTooltip formatter={count} />} cursor={CURSOR_LINE} />
            <Legend verticalAlign="bottom" height={36} iconType="circle" formatter={legendLabel} />
            <Area
              yAxisId="left"
              type="monotone"
              dataKey="txn_count"
              fill={SERIES[0]}
              stroke={SERIES[0]}
              fillOpacity={0.2}
              name="Transactions"
            />
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="failure_rate_pct"
              stroke={SERIES[4]}
              strokeWidth={2}
              name="Failure Rate %"
              dot={false}
            />
            {/* Reference line — neutral, it is not itself a data series. */}
            <Line
              yAxisId="right"
              type="monotone"
              dataKey={() => 5}
              stroke="var(--muted-foreground)"
              strokeDasharray="5 5"
              strokeWidth={1}
              dot={false}
              name="5% Threshold"
            />
          </ComposedChart>
        </ResponsiveContainer>
        )}
      </AnalyticsPanel>

      <div className="grid min-w-0 gap-6 md:grid-cols-2">
        <AnalyticsPanel title="Chargeback Volume" caption="By month">
          {chargebacksEmpty ? (
            // No chargebacks is good news, so say it plainly rather than
            // drawing an empty grid that looks like a failed load.
            <ChartEmpty
              height={300}
              title="No chargebacks in this period"
              hint="Disputed transactions will appear here if any are filed."
            />
          ) : (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={data?.chargebacksByMonth || []} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
              <CartesianGrid {...CHART_GRID} />
              <XAxis dataKey="month" tick={CHART_TICK} tickLine={false} axisLine={false} />
              <YAxis
                tick={CHART_TICK}
                tickLine={false}
                axisLine={false}
                tickFormatter={count}
              />
              <Tooltip content={<AnalyticsTooltip formatter={count} />} cursor={{ fill: CHART_CURSOR_FILL }} />
              <Bar dataKey="chargeback_count" fill={SERIES[4]} radius={[4, 4, 0, 0]} name="Chargebacks" />
            </BarChart>
          </ResponsiveContainer>
          )}
        </AnalyticsPanel>

        <AnalyticsPanel title="Terminal Distribution">
          {terminalsEmpty ? (
            <ChartEmpty
              height={350}
              title="No terminals reporting"
              hint="Device types will appear here once terminals are registered."
            />
          ) : (
          <ResponsiveContainer width="100%" height={350}>
            <PieChart>
              <Pie
                data={data?.terminalDistribution || []}
                cx="50%"
                cy="45%"
                outerRadius={100}
                dataKey="terminal_count"
                nameKey="terminal_type"
              >
                {(data?.terminalDistribution || []).map((_, index) => (
                  <Cell key={`cell-${index}`} fill={SERIES[index % SERIES.length]} />
                ))}
              </Pie>
              <Tooltip content={<AnalyticsTooltip formatter={count} />} />
              <Legend verticalAlign="bottom" height={36} iconType="circle" formatter={legendLabel} />
            </PieChart>
          </ResponsiveContainer>
          )}
        </AnalyticsPanel>
      </div>

      <AnalyticsPanel
        title="Dual Pricing (Cash Discount) Adoption"
        caption="Merchants using cash discounts"
      >
        <div className="min-w-0 space-y-4">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="font-medium tabular-nums">
                {adopted} of {totalMerchants} merchants
              </span>
              <span className="font-semibold tabular-nums">
                {data?.dualPricingAdoption.adoption_pct.toFixed(1) || 0}%
              </span>
            </div>
            <Progress
              value={data?.dualPricingAdoption.adoption_pct || 0}
              className="h-3"
            />
          </div>
          <div className="grid min-w-0 grid-cols-2 gap-3">
            <InsetTile label="Adopted" value={adopted} />
            <InsetTile label="Not Adopted" value={totalMerchants - adopted} />
          </div>
        </div>
      </AnalyticsPanel>
    </div>
  )
}
