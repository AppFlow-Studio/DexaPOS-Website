'use client'

import { useState } from 'react'
import { useVoidRefundIntelligence } from '@/lib/queries/use-platform-analytics'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  MobileColumnsButton,
  initialHiddenColumns,
  type ReportColumn,
} from '@/components/dashboard/reports/MobileColumnsButton'
import { useIsMobile } from '@/hooks/use-mobile'
import { cn } from '@/lib/utils'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { Ban, ListFilter, Users } from 'lucide-react'
import { Panel } from '@/components/dashboard/shell/Panel'
import { PanelSection } from '@/components/dashboard/shell/PanelSection'
import { StatRow, StatTile } from '@/components/dashboard/shell/StatTile'
import { AnalyticsTooltip, SERIES } from '@/app/manage/components/analytics-primitives'
import type { VoidAnomalyMerchant, VoidReasonBreakdown, StaffVoidEntry } from '@/app/manage/actions/hq-platform/analytics'

function fmt(n: number) {
  return n >= 1000 ? `$${(n / 1000).toFixed(1)}k` : `$${n.toFixed(2)}`
}

/**
 * Mobile column meta for the void-rate anomaly table. Void rate is the measure
 * the flagging is based on, so it stays beside the merchant name.
 */
const VOID_ANOMALY_COLUMNS: ReportColumn[] = [
  { id: 'merchant', label: 'Merchant', locked: true },
  { id: 'voidRate', label: 'Void Rate' },
  { id: 'voided', label: 'Voided', defaultHidden: true },
  { id: 'refundAmt', label: 'Refund Amt', defaultHidden: true },
  { id: 'topReason', label: 'Top Reason', defaultHidden: true },
  { id: 'status', label: 'Status', defaultHidden: true },
]

export function VoidRefundIntelligence() {
  const [days, setDays] = useState(30)
  const { data, isLoading } = useVoidRefundIntelligence(days)
  const isMobile = useIsMobile()
  const [hiddenCols, setHiddenCols] = useState<Set<string>>(() =>
    initialHiddenColumns(VOID_ANOMALY_COLUMNS)
  )
  const showCol = (id: string) => !isMobile || !hiddenCols.has(id)
  // Keeps the empty-state cell full-width as columns are toggled.
  const visibleColCount = VOID_ANOMALY_COLUMNS.filter(c => showCol(c.id)).length

  const periodSelect = (
    <Select value={String(days)} onValueChange={v => setDays(Number(v))}>
      {/* Borderless muted pill — the §5.2 toolbar filter recipe. */}
      <SelectTrigger className="h-9 w-36 rounded-full border-0 bg-muted/60 px-3 shadow-none">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="7">Last 7 days</SelectItem>
        <SelectItem value="30">Last 30 days</SelectItem>
        <SelectItem value="90">Last 90 days</SelectItem>
      </SelectContent>
    </Select>
  )

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-40 w-full rounded-3xl" />
        <Skeleton className="h-75 w-full rounded-3xl" />
      </div>
    )
  }

  if (!data) return null

  const anomalies = data.merchantAnomalies.filter(m => m.isAnomaly)

  return (
    <div className="space-y-6">
      <Panel>
        <PanelSection label="Void & refund rates" icon={Ban} action={periodSelect}>
          <StatRow columns={3}>
            <StatTile label="Platform Void Rate" value={`${data.platformVoidRate}%`} />
            <StatTile label="Platform Refund Rate" value={`${data.platformRefundRate}%`} />
            <StatTile
              label="Anomalous Merchants"
              value={anomalies.length}
              meta={anomalies.length > 0 ? 'Above 2× platform average' : 'None flagged'}
            />
          </StatRow>
        </PanelSection>
      </Panel>

      <div className="grid min-w-0 grid-cols-1 gap-6 md:grid-cols-2">
        <Panel>
          <PanelSection label="Void reason breakdown" icon={ListFilter} caption="Why orders are being voided">
            {data.voidReasonBreakdown.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={data.voidReasonBreakdown} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis type="number" tick={{ fontSize: 10 }} />
                  <YAxis type="category" dataKey="reason" tick={{ fontSize: 10 }} width={90} />
                  <Tooltip content={<AnalyticsTooltip />} />
                  <Bar dataKey="count" name="Count" radius={[0, 4, 4, 0]}>
                    {data.voidReasonBreakdown.map((_: VoidReasonBreakdown, i: number) => (
                      <Cell key={i} fill={SERIES[i % SERIES.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-55 items-center justify-center text-sm text-muted-foreground">
                No void reason data recorded
              </div>
            )}
          </PanelSection>
        </Panel>

        <Panel>
          <PanelSection
            label={
              anomalies.length > 0
                ? `Merchant void rate anomalies (${anomalies.length} flagged)`
                : 'Merchant void rate anomalies'
            }
            caption={`Merchants with void rate >2× platform average (${data.platformVoidRate}%)`}
            action={
              <MobileColumnsButton
                columns={VOID_ANOMALY_COLUMNS}
                hidden={hiddenCols}
                onChange={setHiddenCols}
              />
            }
          >
            {/* Min-width lifted on mobile so hidden columns actually shrink the
                table rather than leaving it scrolling sideways. */}
            <Table variant="data" className={cn(!isMobile && 'min-w-[640px]')}>
              <TableHeader className="[&_tr]:border-0">
                <TableRow>
                  <TableHead>Merchant</TableHead>
                  {showCol('voidRate') && <TableHead className="text-right">Void Rate</TableHead>}
                  {showCol('voided') && <TableHead className="text-right">Voided</TableHead>}
                  {showCol('refundAmt') && <TableHead className="text-right">Refund Amt</TableHead>}
                  {showCol('topReason') && <TableHead>Top Reason</TableHead>}
                  {showCol('status') && <TableHead>Status</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.merchantAnomalies.slice(0, 12).map((m: VoidAnomalyMerchant) => (
                  <TableRow key={m.merchantId}>
                    <TableCell>{m.merchantName}</TableCell>
                    {showCol('voidRate') && (
                      <TableCell className="text-right tabular-nums">{m.voidRate}%</TableCell>
                    )}
                    {showCol('voided') && (
                      <TableCell className="text-right tabular-nums text-muted-foreground">{m.voidedOrders}</TableCell>
                    )}
                    {showCol('refundAmt') && (
                      <TableCell className="text-right tabular-nums">
                        {m.refundAmount > 0 ? fmt(m.refundAmount) : <span className="text-muted-foreground">—</span>}
                      </TableCell>
                    )}
                    {showCol('topReason') && (
                      <TableCell className="max-w-30 truncate text-muted-foreground">
                        {m.topVoidReason ? m.topVoidReason.replace(/_/g, ' ') : <span className="italic">—</span>}
                      </TableCell>
                    )}
                    {showCol('status') && (
                      <TableCell>
                        <span className="text-sm text-muted-foreground">
                          {m.isAnomaly ? 'Anomaly' : 'Normal'}
                        </span>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
                {data.merchantAnomalies.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={visibleColCount} className="h-24 text-center text-muted-foreground">
                      No void activity in period
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </PanelSection>
        </Panel>
      </div>

      {data.staffVoidLeaderboard && data.staffVoidLeaderboard.length > 0 && (
        <Panel>
          <PanelSection
            label="Staff void leaderboard"
            icon={Users}
            caption="Staff members with highest void counts — may indicate training needs or potential abuse"
          >
            <Table variant="data" className="min-w-[520px]">
              <TableHeader className="[&_tr]:border-0">
                <TableRow>
                  <TableHead className="w-10">#</TableHead>
                  <TableHead>Staff Member</TableHead>
                  <TableHead>Merchant</TableHead>
                  <TableHead className="text-right">Void Count</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.staffVoidLeaderboard.map((s: StaffVoidEntry, idx: number) => (
                  <TableRow key={s.staffId}>
                    <TableCell className="tabular-nums text-muted-foreground">{idx + 1}</TableCell>
                    <TableCell className="font-medium">{s.staffName}</TableCell>
                    <TableCell className="text-muted-foreground">{s.merchantName}</TableCell>
                    <TableCell className="text-right font-medium tabular-nums">{s.voidCount}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </PanelSection>
        </Panel>
      )}
    </div>
  )
}
