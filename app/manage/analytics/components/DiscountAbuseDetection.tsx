'use client'

import { useState } from 'react'
import { useDiscountUsageAnalysis } from '@/lib/queries/use-platform-analytics'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  MobileColumnsButton,
  initialHiddenColumns,
  type ReportColumn,
} from '@/components/dashboard/reports/MobileColumnsButton'
import { useIsMobile } from '@/hooks/use-mobile'
import { useClientPagination } from '@/lib/hooks/useClientPagination'
import { PaginationBar } from '@/components/dashboard/PaginationBar'
import { cn } from '@/lib/utils'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { TicketPercent, Users, Layers, Flag } from 'lucide-react'
import { Panel } from '@/components/dashboard/shell/Panel'
import { PanelSection } from '@/components/dashboard/shell/PanelSection'
import { StatRow, StatTile } from '@/components/dashboard/shell/StatTile'
import { AnalyticsTooltip, SERIES } from '@/app/manage/components/analytics-primitives'
import type { MerchantDiscountRate, StaffDiscountEntry, DiscountTypeBreakdown, DiscountScopeBreakdown } from '@/app/manage/actions/hq-platform/analytics'

function fmt(n: number) {
  return n >= 1000 ? `$${(n / 1000).toFixed(1)}k` : `$${n.toFixed(2)}`
}

/** Scope fills are chart-series encoding: each maps a bar to its legend row (§4.6b). */
const SCOPE_META: Record<string, { label: string; color: string }> = {
  order: { label: 'Order-level', color: 'bg-blue-500' },
  item: { label: 'Item-level', color: 'bg-purple-500' },
  both: { label: 'Both', color: 'bg-green-500' },
  unknown: { label: 'Unknown', color: 'bg-slate-400' },
}

/**
 * Mobile column meta for the staff discount leaderboard. Total discount amount
 * is what ranks the list, so it rides along with the staff name.
 */
const STAFF_DISCOUNT_COLUMNS: ReportColumn[] = [
  { id: 'staff', label: 'Staff', locked: true },
  { id: 'merchant', label: 'Merchant', defaultHidden: true },
  { id: 'count', label: 'Count', defaultHidden: true },
  { id: 'total', label: 'Total' },
  { id: 'approvals', label: 'Mgr Approvals', defaultHidden: true },
]

export function DiscountAbuseDetection() {
  const [days, setDays] = useState(30)
  const { data, isLoading } = useDiscountUsageAnalysis(days)
  const isMobile = useIsMobile()
  const [hiddenCols, setHiddenCols] = useState<Set<string>>(() =>
    initialHiddenColumns(STAFF_DISCOUNT_COLUMNS)
  )
  const showCol = (id: string) => !isMobile || !hiddenCols.has(id)
  // Keeps the empty-state cell full-width as columns are toggled.
  const visibleColCount = STAFF_DISCOUNT_COLUMNS.filter(c => showCol(c.id)).length

  // Paging hooks sit above the loading/empty early returns.
  const flagged = (data?.merchantDiscountRates ?? []).filter(m => m.isFlagged)
  const staffPage = useClientPagination(data?.staffLeaderboard ?? [])
  const flaggedPage = useClientPagination(flagged)

  const periodSelect = (
    <Select value={String(days)} onValueChange={v => setDays(Number(v))}>
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

  return (
    <div className="space-y-6">
      <Panel>
        <PanelSection label="Discount usage" icon={TicketPercent} action={periodSelect}>
          <StatRow columns={4}>
            <StatTile label="Total Discounts Issued" value={fmt(data.totalDiscountAmount30d)} />
            <StatTile label="% of Gross Revenue" value={`${data.discountAsPercentOfRevenue}%`} />
            <StatTile label="Discounted Orders" value={data.discountedOrdersCount.toLocaleString()} />
            <StatTile
              label="Merchants Flagged (>10%)"
              value={flagged.length}
              meta={flagged.length > 0 ? 'Above 10% of gross revenue' : 'None flagged'}
            />
          </StatRow>
        </PanelSection>
      </Panel>

      {/* Type and scope are both "how discounts break down", so they pair up;
          the staff leaderboard takes its own full-width row below. */}
      <div className={cn('grid min-w-0 grid-cols-1 gap-6', data.scopeBreakdown.length > 0 && 'md:grid-cols-2')}>
        <Panel>
          <PanelSection label="Discount type breakdown">
            {data.typeBreakdown.length > 0 ? (
              <>
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie data={data.typeBreakdown} cx="50%" cy="50%" outerRadius={75} paddingAngle={3} dataKey="count">
                      {data.typeBreakdown.map((_: DiscountTypeBreakdown, i: number) => (
                        <Cell key={i} fill={SERIES[i % SERIES.length]} />
                      ))}
                    </Pie>
                    <Tooltip content={<AnalyticsTooltip />} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>

                <div className="mt-2 space-y-1">
                  {data.typeBreakdown.map((t: DiscountTypeBreakdown, i) => (
                    <div key={t.type} className="flex items-center justify-between gap-3 text-xs">
                      <div className="flex min-w-0 items-center gap-2">
                        <div
                          className="h-2.5 w-2.5 shrink-0 rounded-full"
                          style={{ backgroundColor: SERIES[i % SERIES.length] }}
                        />
                        <span className="truncate capitalize">{t.type.replace(/_/g, ' ')}</span>
                      </div>
                      <span className="shrink-0 tabular-nums text-muted-foreground">
                        {t.count} uses · {t.percentage}%
                      </span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="flex h-50 items-center justify-center text-sm text-muted-foreground">
                No discount data in period
              </div>
            )}
          </PanelSection>
        </Panel>

        {data.scopeBreakdown.length > 0 && (
          <Panel>
            <PanelSection
              label="Discount scope breakdown"
              icon={Layers}
              caption="Order-level vs item-level vs both — how discounts are applied across the platform"
            >
              <div className="space-y-3">
                {data.scopeBreakdown.map((s: DiscountScopeBreakdown) => {
                  const meta = SCOPE_META[s.scope] ?? SCOPE_META.unknown
                  return (
                    <div key={s.scope} className="space-y-1">
                      <div className="flex items-center justify-between gap-3 text-xs">
                        <div className="flex min-w-0 items-center gap-2">
                          <div className={`h-2.5 w-2.5 shrink-0 rounded-full ${meta.color}`} />
                          <span className="truncate font-medium">{meta.label}</span>
                        </div>
                        <span className="shrink-0 tabular-nums text-muted-foreground">
                          {s.count.toLocaleString()} uses
                          <span className="ml-2 font-semibold text-foreground">{s.percentage}%</span>
                        </span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-muted">
                        <div
                          className={`h-full rounded-full transition-all ${meta.color}`}
                          style={{ width: `${s.percentage}%` }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            </PanelSection>
          </Panel>
        )}
      </div>

      <Panel>
        <PanelSection
          label="Top staff by discounts applied"
          icon={Users}
          caption="Highest discount issuers across the platform"
          action={
            <MobileColumnsButton
              columns={STAFF_DISCOUNT_COLUMNS}
              hidden={hiddenCols}
              onChange={setHiddenCols}
            />
          }
        >
          {/* Min-width lifted on mobile so hidden columns actually narrow the
              table instead of leaving it scrolling sideways. */}
          <Table variant="data" className={cn(!isMobile && 'min-w-[560px]')}>
            <TableHeader className="[&_tr]:border-0">
              <TableRow>
                <TableHead>Staff</TableHead>
                {showCol('merchant') && <TableHead>Merchant</TableHead>}
                {showCol('count') && <TableHead className="text-right">Count</TableHead>}
                {showCol('total') && <TableHead className="text-right">Total</TableHead>}
                {showCol('approvals') && <TableHead className="text-right">Mgr Approvals</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {staffPage.pageRows.map((s: StaffDiscountEntry) => (
                <TableRow key={s.staffId}>
                  <TableCell className="font-medium">{s.staffName}</TableCell>
                  {showCol('merchant') && (
                    <TableCell className="text-muted-foreground">{s.merchantName}</TableCell>
                  )}
                  {showCol('count') && (
                    <TableCell className="text-right tabular-nums">{s.discountCount}</TableCell>
                  )}
                  {showCol('total') && (
                    <TableCell className="text-right tabular-nums">{fmt(s.totalDiscountAmount)}</TableCell>
                  )}
                  {showCol('approvals') && (
                    <TableCell className="text-right tabular-nums">
                      {s.requiresManagerApprovalCount > 0 ? (
                        <span className="font-medium">{s.requiresManagerApprovalCount}</span>
                      ) : (
                        <span className="text-muted-foreground">0</span>
                      )}
                    </TableCell>
                  )}
                </TableRow>
              ))}
              {data.staffLeaderboard.length === 0 && (
                // colSpan tracks the visible headers, so the empty-state cell
                // keeps spanning the table as columns are toggled.
                <TableRow>
                  <TableCell colSpan={visibleColCount} className="h-24 text-center text-muted-foreground">
                    No staff discount data
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          <PaginationBar
            className="border-t-0 pt-0"
            pagination={staffPage.pagination}
            onPageChange={staffPage.setPage}
            itemLabel="staff"
          />
        </PanelSection>
      </Panel>

      {flagged.length > 0 && (
        <Panel>
          <PanelSection
            label={`Flagged merchants (${flagged.length})`}
            icon={Flag}
            caption="Discount rate exceeds 10% of gross revenue"
          >
            <Table variant="data" className="min-w-[520px]">
              <TableHeader className="[&_tr]:border-0">
                <TableRow>
                  <TableHead>Merchant</TableHead>
                  <TableHead className="text-right">Discount %</TableHead>
                  <TableHead className="text-right">Discount Amt</TableHead>
                  <TableHead className="text-right">Gross Revenue</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {flaggedPage.pageRows.map((m: MerchantDiscountRate) => (
                  <TableRow key={m.merchantId}>
                    <TableCell className="font-medium">{m.merchantName}</TableCell>
                    <TableCell className="text-right font-medium tabular-nums">{m.discountRate}%</TableCell>
                    <TableCell className="text-right tabular-nums">{fmt(m.discountAmount)}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">{fmt(m.grossRevenue)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <PaginationBar
              className="border-t-0 pt-0"
              pagination={flaggedPage.pagination}
              onPageChange={flaggedPage.setPage}
              itemLabel="merchants"
            />
          </PanelSection>
        </Panel>
      )}
    </div>
  )
}
