'use client'

import { useState } from 'react'
import { useMerchantOnboardingFunnel } from '@/lib/queries/use-platform-analytics'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  MobileColumnsButton,
  initialHiddenColumns,
  type ReportColumn,
} from '@/components/dashboard/reports/MobileColumnsButton'
import { useIsMobile } from '@/hooks/use-mobile'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { AlertTriangle, TrendingUp, Filter } from 'lucide-react'
import { Panel } from '@/components/dashboard/shell/Panel'
import { PanelSection } from '@/components/dashboard/shell/PanelSection'
import { StatRow, StatTile } from '@/components/dashboard/shell/StatTile'
import { AnalyticsTooltip } from '@/app/manage/components/analytics-primitives'
import type { OnboardingFunnelStage, StuckMerchant } from '@/app/manage/actions/hq-platform/analytics'

/**
 * Stage colours are data encoding, not status decoration — each bar maps to its
 * lifecycle stage the way a chart series maps to its legend entry (§4.6b's
 * second exception).
 */
const STAGE_COLORS: Record<string, string> = {
  created: '#94a3b8',
  onboarding: '#f59e0b',
  active: '#22c55e',
  churned: '#ef4444',
}

/**
 * Mobile column meta for the stuck-merchants table. Days in onboarding is the
 * measure the list is built on, so it rides along with the merchant name.
 */
const STUCK_MERCHANT_COLUMNS: ReportColumn[] = [
  { id: 'merchant', label: 'Merchant', locked: true },
  { id: 'days', label: 'Days in Onboarding' },
  { id: 'lastActivity', label: 'Last Activity', defaultHidden: true },
  { id: 'admin', label: 'Assigned Admin', defaultHidden: true },
  { id: 'risk', label: 'Risk', defaultHidden: true },
]

export function MerchantOnboardingFunnel() {
  const { data, isLoading } = useMerchantOnboardingFunnel()
  const isMobile = useIsMobile()
  const [hiddenCols, setHiddenCols] = useState<Set<string>>(() =>
    initialHiddenColumns(STUCK_MERCHANT_COLUMNS)
  )
  const showCol = (id: string) => !isMobile || !hiddenCols.has(id)

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-50 w-full rounded-3xl" />
        <Skeleton className="h-75 w-full rounded-3xl" />
      </div>
    )
  }

  if (!data) return null

  const maxCount = Math.max(...data.funnel.map(s => s.count), 1)

  return (
    <div className="space-y-6">
      <Panel>
        <PanelSection label="Onboarding funnel" icon={Filter} caption="All merchants by lifecycle stage">
          <div className="space-y-6">
            <StatRow columns={3}>
              <StatTile
                label="Overall Conversion Rate"
                value={`${data.conversionRate}%`}
              />
              <StatTile
                label="Stuck (>14 days onboarding)"
                value={data.stuckMerchants.length}
              />
              <StatTile
                label="Active Merchants"
                value={data.funnel.find(f => f.stage === 'active')?.count ?? 0}
              />
            </StatRow>

            <div className="space-y-3">
              {data.funnel.map((stage: OnboardingFunnelStage) => {
                const pct = Math.round((stage.count / maxCount) * 100)
                return (
                  <div key={stage.stage} className="flex items-center gap-3">
                    <div className="w-24 shrink-0 text-right text-xs text-muted-foreground">{stage.label}</div>
                    <div className="h-8 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
                      <div
                        className="flex h-full items-center rounded-full pl-3 text-xs font-medium text-white transition-all duration-500"
                        style={{ width: `${Math.max(pct, 5)}%`, backgroundColor: STAGE_COLORS[stage.stage] || '#94a3b8' }}
                      >
                        {stage.count}
                      </div>
                    </div>
                    {stage.conversionFromPrev !== null && (
                      <div className="w-20 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                        {stage.conversionFromPrev}% conv.
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </PanelSection>
      </Panel>

      {data.stuckMerchants.length > 0 && (
        <Panel>
          <PanelSection
            label={`Stuck merchants (${data.stuckMerchants.length})`}
            icon={AlertTriangle}
            caption="Merchants in onboarding for more than 14 days without progressing"
            action={
              <MobileColumnsButton
                columns={STUCK_MERCHANT_COLUMNS}
                hidden={hiddenCols}
                onChange={setHiddenCols}
              />
            }
          >
            {/* The `variant="data"` well is the surface — §5.2: a table is not
                wrapped in panel padding, or you get a box inside a box. */}
            <Table variant="data">
              <TableHeader className="[&_tr]:border-0">
                <TableRow>
                  <TableHead>Merchant</TableHead>
                  {showCol('days') && <TableHead className="text-right">Days in Onboarding</TableHead>}
                  {showCol('lastActivity') && <TableHead>Last Activity</TableHead>}
                  {showCol('admin') && <TableHead>Assigned Admin</TableHead>}
                  {showCol('risk') && <TableHead>Risk</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.stuckMerchants.map((m: StuckMerchant) => (
                  <TableRow key={m.id}>
                    <TableCell className="font-medium">{m.name}</TableCell>
                    {showCol('days') && (
                      <TableCell className="text-right tabular-nums">{m.daysInOnboarding}d</TableCell>
                    )}
                    {showCol('lastActivity') && (
                      <TableCell className="text-muted-foreground">
                        {m.lastActivity ? new Date(m.lastActivity).toLocaleDateString() : 'No activity'}
                      </TableCell>
                    )}
                    {showCol('admin') && (
                      <TableCell>
                        {m.assignedAdmin ?? <span className="text-xs italic text-muted-foreground">Unassigned</span>}
                      </TableCell>
                    )}
                    {showCol('risk') && (
                      <TableCell>
                        <Badge
                          variant="secondary"
                          className="w-fit rounded-full border-0 px-2.5 text-xs font-medium"
                        >
                          {m.daysInOnboarding >= 30 ? 'Critical' : 'At Risk'}
                        </Badge>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </PanelSection>
        </Panel>
      )}

      <Panel>
        <PanelSection
          label="Monthly onboarding trend"
          icon={TrendingUp}
          caption="New vs Active merchants per month (last 12 months)"
        >
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={data.monthlyTrend}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="month" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip content={<AnalyticsTooltip />} />
              <Bar dataKey="newCount" name="New Merchants" fill="#94a3b8" radius={[3, 3, 0, 0]} />
              <Bar dataKey="activeCount" name="Activated" fill="#22c55e" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </PanelSection>
      </Panel>
    </div>
  )
}
