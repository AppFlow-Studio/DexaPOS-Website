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

/** Mobile column meta for the staff void leaderboard. */
const STAFF_VOID_COLUMNS: ReportColumn[] = [
  { id: 'staff', label: 'Staff Member', locked: true },
  { id: 'merchant', label: 'Merchant', defaultHidden: true },
  { id: 'voidCount', label: 'Voided Items' },
  { id: 'ordersTaken', label: 'Orders Taken', defaultHidden: true },
  { id: 'voidsPerOrder', label: 'Voids / Order' },
]

/** `days` comes from the Revenue & Risk tab's shared period picker. */
export function VoidRefundIntelligence({ days }: { days: number }) {
  const { data, isLoading } = useVoidRefundIntelligence(days)
  const isMobile = useIsMobile()
  const [hiddenCols, setHiddenCols] = useState<Set<string>>(() =>
    initialHiddenColumns(VOID_ANOMALY_COLUMNS)
  )
  const showCol = (id: string) => !isMobile || !hiddenCols.has(id)
  const [hiddenStaffCols, setHiddenStaffCols] = useState<Set<string>>(() =>
    initialHiddenColumns(STAFF_VOID_COLUMNS)
  )
  const showStaffCol = (id: string) => !isMobile || !hiddenStaffCols.has(id)

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
  // A column of dashes carries no information, so Refund Amt and Top Reason
  // drop out when no row has a value. The count keeps the empty-state cell
  // full-width.
  const anyRefunds = data.merchantAnomalies.some(m => m.refundAmount > 0)
  const anyReasons = data.merchantAnomalies.some(m => m.topVoidReason)
  const emptyCols = new Set([...(anyRefunds ? [] : ['refundAmt']), ...(anyReasons ? [] : ['topReason'])])
  const showRow = (id: string) => !emptyCols.has(id) && showCol(id)
  const rowColCount = VOID_ANOMALY_COLUMNS.filter(c => showRow(c.id)).length

  return (
    <div className="space-y-6">
      <Panel>
        <PanelSection label="Void & refund rates" icon={Ban} caption={`Last ${days} days`}>
          <StatRow columns={3}>
            <StatTile label="Platform Void Rate" value={`${data.platformVoidRate}%`} />
            <StatTile label="Platform Refund Rate" value={`${data.platformRefundRate}%`} />
            <StatTile
              label="Anomalous Merchants"
              value={anomalies.length}
              meta={`Void rate above ${data.anomalyThreshold}%`}
            />
          </StatRow>
          {data.voidReasonBreakdown.length === 0 && (
            <p className="mt-6 text-sm text-muted-foreground max-md:hidden">No void reasons recorded in this period.</p>
          )}
        </PanelSection>
      </Panel>

      {data.voidReasonBreakdown.length > 0 && (
        <Panel>
          <PanelSection label="Void reason breakdown" icon={ListFilter} caption="Why orders are being voided">
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
          </PanelSection>
        </Panel>
      )}

      <Panel>
        <PanelSection
          label="Void rate by merchant"
          caption={`Merchants with voids or refunds. Flagged when above 2× the platform rate (${data.anomalyThreshold}%).`}
          action={
            <MobileColumnsButton
              columns={VOID_ANOMALY_COLUMNS.filter(c => !emptyCols.has(c.id))}
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
                {showRow('refundAmt') && <TableHead className="text-right">Refund Amt</TableHead>}
                {showRow('topReason') && <TableHead>Top Reason</TableHead>}
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
                  {showRow('refundAmt') && (
                    <TableCell className="text-right tabular-nums">
                      {m.refundAmount > 0 ? fmt(m.refundAmount) : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                  )}
                  {showRow('topReason') && (
                    <TableCell className="max-w-30 truncate text-muted-foreground">
                      {m.topVoidReason ? m.topVoidReason.replace(/_/g, ' ') : <span className="italic">—</span>}
                    </TableCell>
                  )}
                  {showCol('status') && (
                    <TableCell>
                      <span className="text-sm text-muted-foreground">
                        {m.isAnomaly ? 'Flagged' : '—'}
                      </span>
                    </TableCell>
                  )}
                </TableRow>
              ))}
              {data.merchantAnomalies.length === 0 && (
                <TableRow>
                  <TableCell colSpan={rowColCount} className="h-24 text-center text-muted-foreground">
                    No void activity in period
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </PanelSection>
      </Panel>

      {data.staffVoidLeaderboard && data.staffVoidLeaderboard.length > 0 && (
        <Panel>
          <PanelSection
            label="Staff void leaderboard"
            icon={Users}
            caption="Voided items by staff member. Voids per order accounts for how many orders each person rings up."
            action={
              <MobileColumnsButton
                columns={STAFF_VOID_COLUMNS}
                hidden={hiddenStaffCols}
                onChange={setHiddenStaffCols}
              />
            }
          >
            {/* The rank column is desktop-only: on a phone the row order
                already says it, and the width goes to the figures. */}
            <Table variant="data" className={cn(!isMobile && 'min-w-[640px]')}>
              <TableHeader className="[&_tr]:border-0">
                <TableRow>
                  {!isMobile && <TableHead className="w-10">#</TableHead>}
                  <TableHead>Staff Member</TableHead>
                  {showStaffCol('merchant') && <TableHead>Merchant</TableHead>}
                  {showStaffCol('voidCount') && <TableHead className="text-right">Voided Items</TableHead>}
                  {showStaffCol('ordersTaken') && <TableHead className="text-right">Orders Taken</TableHead>}
                  {showStaffCol('voidsPerOrder') && <TableHead className="text-right">Voids / Order</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.staffVoidLeaderboard.map((s: StaffVoidEntry, idx: number) => (
                  <TableRow key={s.staffId}>
                    {!isMobile && <TableCell className="tabular-nums text-muted-foreground">{idx + 1}</TableCell>}
                    <TableCell className="font-medium">{s.staffName}</TableCell>
                    {showStaffCol('merchant') && <TableCell className="text-muted-foreground">{s.merchantName}</TableCell>}
                    {showStaffCol('voidCount') && (
                      <TableCell className="text-right font-medium tabular-nums">{s.voidCount}</TableCell>
                    )}
                    {showStaffCol('ordersTaken') && (
                      <TableCell className="text-right tabular-nums text-muted-foreground">{s.ordersTaken}</TableCell>
                    )}
                    {showStaffCol('voidsPerOrder') && (
                      <TableCell className="text-right tabular-nums">{s.voidsPerOrder ?? '—'}</TableCell>
                    )}
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
