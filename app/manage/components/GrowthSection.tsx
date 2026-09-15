'use client'

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Cell } from 'recharts'
import { Users, TrendingUp, AlertTriangle } from 'lucide-react'

import { Panel } from '@/components/dashboard/shell/Panel'
import { PanelSection } from '@/components/dashboard/shell/PanelSection'
import { StatRow, StatTile } from '@/components/dashboard/shell/StatTile'
import {
  CHART_GRID,
  CHART_TICK,
  CHART_CURSOR_FILL,
} from '@/components/dashboard/orders/analytics/AnalyticsPrimitives'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { usePlatformGrowthMetrics } from '@/lib/queries/use-platform-analytics-layer2'
import { AnalyticsPanel, AnalyticsTooltip, SERIES } from './analytics-primitives'

interface GrowthSectionProps {
  from: string
  to: string
}

export function GrowthSection({ from, to }: GrowthSectionProps) {
  const { data, isLoading } = usePlatformGrowthMetrics(from, to)

  if (isLoading) {
    return (
      <div className="min-w-0 space-y-6">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-64 w-full rounded-3xl" />
        ))}
      </div>
    )
  }

  const churnRisk = data?.churnRisk ?? []

  return (
    <div className="min-w-0 space-y-6">
      {/* KPIs */}
      <Panel>
        <PanelSection label="Growth Overview">
          <StatRow columns={3}>
            <StatTile
              label="Time to First Order"
              icon={<TrendingUp />}
              value={`${data?.avgTimeToFirstOrder.toFixed(1) || 0} days`}
            />
            <StatTile
              label="Retention Rate"
              icon={<Users />}
              value={`${data?.retention.retention_rate.toFixed(1) || 0}%`}
            />
            <StatTile
              label="Merchants at Risk"
              icon={<AlertTriangle />}
              value={churnRisk.length}
            />
          </StatRow>
        </PanelSection>
      </Panel>

      <AnalyticsPanel
        title="Merchant Acquisition Trend"
        caption="New merchants and locations per week"
      >
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={data?.merchantAcquisition || []}>
            <CartesianGrid {...CHART_GRID} />
            <XAxis
              dataKey="period"
              tickFormatter={(v) => v.slice(5)}
              tick={CHART_TICK}
              tickLine={false}
              axisLine={false}
            />
            <YAxis tick={CHART_TICK} tickLine={false} axisLine={false} />
            <Tooltip content={<AnalyticsTooltip />} cursor={{ stroke: 'var(--border)', strokeWidth: 1 }} />
            <Line
              type="monotone"
              dataKey="new_merchants"
              stroke={SERIES[0]}
              strokeWidth={2}
              name="New Merchants"
              dot={false}
            />
            <Line
              type="monotone"
              dataKey="new_locations"
              stroke={SERIES[1]}
              strokeWidth={2}
              name="New Locations"
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </AnalyticsPanel>

      <AnalyticsPanel
        title="Onboarding Funnel"
        caption="Merchant progression through setup stages"
      >
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={data?.onboardingFunnel || []} layout="vertical">
            <CartesianGrid {...CHART_GRID} horizontal={false} />
            <XAxis type="number" tick={CHART_TICK} tickLine={false} axisLine={false} />
            <YAxis
              dataKey="stage"
              type="category"
              width={120}
              tick={CHART_TICK}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip content={<AnalyticsTooltip />} cursor={{ fill: CHART_CURSOR_FILL }} />
            <Bar dataKey="merchant_count" radius={[0, 4, 4, 0]}>
              {(data?.onboardingFunnel || []).map((_, index) => (
                <Cell key={`cell-${index}`} fill={SERIES[index % SERIES.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </AnalyticsPanel>

      <AnalyticsPanel
        title="Merchants at Risk (50%+ Revenue Drop)"
        caption="Compared to prior period"
      >
        {churnRisk.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            No merchants at churn risk
          </div>
        ) : (
          <Table variant="data" className="min-w-[400px]">
            <TableHeader className="[&_tr]:border-0">
              <TableRow>
                <TableHead className="text-xs font-medium">Merchant</TableHead>
                <TableHead className="text-right text-xs font-medium">Last Period</TableHead>
                <TableHead className="text-right text-xs font-medium">Current Period</TableHead>
                <TableHead className="text-right text-xs font-medium">Change</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {churnRisk.map((merchant) => (
                <TableRow key={merchant.merchant_id}>
                  <TableCell className="text-sm font-medium">{merchant.merchant_name}</TableCell>
                  <TableCell className="text-right text-sm tabular-nums">
                    ${Number(merchant.last_period_revenue).toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right text-sm tabular-nums">
                    ${Number(merchant.current_revenue).toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right">
                    <span className="inline-flex w-fit items-center rounded-full border-0 bg-muted/60 px-2.5 py-0.5 text-xs font-medium tabular-nums">
                      {merchant.change_pct.toFixed(1)}%
                    </span>
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
