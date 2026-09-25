'use client'

import { useState } from 'react'
import { useOrderTypeIntelligence } from '@/lib/queries/use-platform-analytics'
import { Skeleton } from '@/components/ui/skeleton'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  MobileColumnsButton,
  initialHiddenColumns,
  type ReportColumn,
} from '@/components/dashboard/reports/MobileColumnsButton'
import { cn } from '@/lib/utils'
import {
  PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from 'recharts'
import { Utensils, ShoppingBag, Truck, Globe, TrendingUp, Package2, ChefHat, ArrowLeftRight } from 'lucide-react'
import { Panel } from '@/components/dashboard/shell/Panel'
import { PanelSection, PanelSubLabel } from '@/components/dashboard/shell/PanelSection'
import { InsetTile } from '@/components/dashboard/shell/StatTile'
import { AnalyticsTooltip, CATEGORY_AXIS_WIDTH, valueAxisWidthMobile } from '@/app/manage/components/analytics-primitives'
import { useIsMobile } from '@/hooks/use-mobile'
import { useClientPagination } from '@/lib/hooks/useClientPagination'
import { PaginationBar } from '@/components/dashboard/PaginationBar'
import type { ChannelStat } from '@/app/manage/actions/hq-platform/analytics'

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtGPV(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}k`
  return `$${n.toFixed(2)}`
}

const TYPE_ICONS: Record<string, React.ElementType> = {
  dine_in: Utensils,
  takeout: ShoppingBag,
  delivery: Truck,
  online: Globe,
  catering: ChefHat,
}

/**
 * Per-type fills. These map a row or segment to its chart series, so they are
 * data encoding rather than status tinting (§4.6b's second exception) — which is
 * also why the surrounding card chrome no longer carries a matching tint.
 */
const TYPE_FILL: Record<string, string> = {
  dine_in: '#3b82f6',
  takeout: '#22c55e',
  delivery: '#f59e0b',
  online: '#8b5cf6',
  catering: '#ec4899',
}

/** Mobile column meta for the per-merchant type mix table. */
const TYPE_MIX_COLUMNS: ReportColumn[] = [
  { id: 'merchant', label: 'Merchant', locked: true },
  { id: 'dineIn', label: 'Dine In' },
  { id: 'takeout', label: 'Takeout' },
  { id: 'delivery', label: 'Delivery', defaultHidden: true },
  { id: 'online', label: 'Online', defaultHidden: true },
]

// ── Main Component ───────────────────────────────────────────────────────────

export function OrderTypeIntelligence() {
  const [days, setDays] = useState(30)
  const { data, isLoading } = useOrderTypeIntelligence(days)
  const isMobile = useIsMobile()
  const merchantPage = useClientPagination(data?.merchantBreakdown ?? [])
  const [hiddenCols, setHiddenCols] = useState<Set<string>>(() => initialHiddenColumns(TYPE_MIX_COLUMNS))
  const showCol = (id: string) => !isMobile || !hiddenCols.has(id)

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
        <Skeleton className="h-72 w-full rounded-3xl" />
        <Skeleton className="h-64 w-full rounded-3xl" />
      </div>
    )
  }

  if (!data) return null

  if (data.breakdown.length === 0) {
    return (
      <Panel>
        <PanelSection label="Order type mix" icon={Package2}>
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-center text-muted-foreground">
            <Package2 className="h-12 w-12 opacity-25" />
            <p className="font-medium">No order type data available</p>
            <p className="text-sm">Orders for this period have no order_type recorded.</p>
          </div>
        </PanelSection>
      </Panel>
    )
  }

  const trendData = data.weeklyTrend.map(p => ({
    ...p,
    date: p.date.slice(5), // "MM-DD"
  }))

  const onlineStat = data.breakdown.find(s => s.type === 'online')
  const onlinePct = onlineStat?.percentage ?? 0

  return (
    <div className="space-y-6">
      <Panel>
        <PanelSection
          label="Order type mix"
          icon={Package2}
          caption={`${data.totalOrders.toLocaleString()} orders · ${fmtGPV(data.totalGPV)} GPV in the last ${days} days`}
          action={periodSelect}
        >
          <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {data.breakdown.map(stat => {
              const Icon = TYPE_ICONS[stat.type] ?? Package2
              return (
                <InsetTile
                  key={stat.type}
                  label={stat.label}
                  icon={<Icon />}
                  value={stat.orderCount.toLocaleString()}
                  meta={`${stat.percentage}% of orders · ${fmtGPV(stat.totalGPV)} · avg $${stat.avgOrderValue.toFixed(2)}`}
                />
              )
            })}
          </div>
        </PanelSection>
      </Panel>

      {(data.channelBreakdown?.length ?? 0) > 0 && (
        <Panel>
          <PanelSection
            label="Channel comparison"
            icon={ArrowLeftRight}
            caption="Order volume and average ticket value by fulfillment channel (order_channel)"
            action={
              onlinePct > 0 ? (
                <div className="text-right text-sm">
                  <p className="text-muted-foreground">Online vs In-Store</p>
                  <p className="font-semibold tabular-nums">
                    {onlinePct}% online · {Math.round((100 - onlinePct) * 10) / 10}% in-store
                  </p>
                </div>
              ) : undefined
            }
          >
            <div className="grid min-w-0 grid-cols-1 gap-6 md:grid-cols-2">
              <div className="min-w-0">
                <PanelSubLabel>Orders by channel</PanelSubLabel>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={data.channelBreakdown ?? []} layout="vertical" margin={{ left: 0, right: isMobile ? 12 : 32 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 11 }} />
                    <YAxis type="category" dataKey="label" tick={{ fontSize: 12 }} width={isMobile ? CATEGORY_AXIS_WIDTH.mobile : 80} />
                    <Tooltip content={<AnalyticsTooltip formatter={(v: number) => `${v.toLocaleString()} orders`} />} />
                    <Bar dataKey="orderCount" radius={[0, 4, 4, 0]}>
                      {(data.channelBreakdown ?? []).map((entry, i) => (
                        <Cell key={i} fill={entry.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="min-w-0">
                <PanelSubLabel>Avg order value by channel</PanelSubLabel>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={data.channelBreakdown ?? []} layout="vertical" margin={{ left: 0, right: isMobile ? 12 : 32 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={v => `$${v}`} />
                    <YAxis type="category" dataKey="label" tick={{ fontSize: 12 }} width={isMobile ? CATEGORY_AXIS_WIDTH.mobile : 80} />
                    <Tooltip content={<AnalyticsTooltip formatter={(v: number) => `$${v.toFixed(2)}`} />} />
                    <Bar dataKey="avgOrderValue" radius={[0, 4, 4, 0]}>
                      {(data.channelBreakdown ?? []).map((entry, i) => (
                        <Cell key={i} fill={entry.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="mt-4 grid min-w-0 grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
              {(data.channelBreakdown ?? []).map((ch: ChannelStat) => (
                <div key={ch.channel} className="flex items-center gap-2 rounded-2xl bg-muted/40 p-2">
                  <div className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: ch.color }} />
                  <div className="min-w-0">
                    <p className="truncate text-xs font-medium">{ch.label}</p>
                    <p className="text-xs tabular-nums text-muted-foreground">
                      {ch.orderCount.toLocaleString()} · {ch.percentage}%
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </PanelSection>
        </Panel>
      )}

      <div className="grid min-w-0 grid-cols-1 gap-6 md:grid-cols-2">
        <Panel>
          <PanelSection label="Order count split" caption={`By order type, last ${days} days`}>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={data.breakdown}
                  cx="50%" cy="45%"
                  innerRadius={60} outerRadius={95}
                  paddingAngle={3}
                  dataKey="orderCount"
                  nameKey="label"
                >
                  {data.breakdown.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip content={<AnalyticsTooltip formatter={(v: number) => `${v.toLocaleString()} orders`} />} />
                <Legend verticalAlign="bottom" />
              </PieChart>
            </ResponsiveContainer>
          </PanelSection>
        </Panel>

        <Panel>
          <PanelSection label="GPV by order type" caption="Revenue distribution across service channels">
            <ResponsiveContainer width="100%" height={240}>
              {/* `left: 0` plus a tight category gutter: the 16px margin and a
                  65px label column started the bars ~81px in, so a phone lost a
                  quarter of the plot before the first bar. */}
              <BarChart data={data.breakdown} layout="vertical" margin={{ left: 0, right: isMobile ? 12 : 24 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={v => fmtGPV(v)} />
                <YAxis
                  type="category"
                  dataKey="label"
                  tick={{ fontSize: 12 }}
                  width={isMobile ? 56 : 65}
                />
                <Tooltip content={<AnalyticsTooltip formatter={(v: number) => fmtGPV(v)} />} />
                <Bar dataKey="totalGPV" radius={[0, 4, 4, 0]}>
                  {data.breakdown.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </PanelSection>
        </Panel>
      </div>

      {trendData.length > 1 && (
        <Panel>
          <PanelSection label="Daily order type trend" icon={TrendingUp} caption="Order counts by type per day">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={trendData} barSize={14} margin={{ top: 4, right: isMobile ? 8 : 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                {/* Daily order counts are 1-2 digits, so the axis only needs
                    room for those rather than Recharts' default ~60px. */}
                <YAxis tick={{ fontSize: 11 }} width={isMobile ? valueAxisWidthMobile(2) : undefined} />
                <Tooltip content={<AnalyticsTooltip />} />
                <Bar dataKey="dine_in" stackId="a" fill={TYPE_FILL.dine_in} name="Dine In" radius={[0, 0, 0, 0]} />
                <Bar dataKey="takeout" stackId="a" fill={TYPE_FILL.takeout} name="Takeout" radius={[0, 0, 0, 0]} />
                <Bar dataKey="delivery" stackId="a" fill={TYPE_FILL.delivery} name="Delivery" radius={[0, 0, 0, 0]} />
                <Bar dataKey="online" stackId="a" fill={TYPE_FILL.online} name="Online" radius={[4, 4, 0, 0]} />
                <Legend />
              </BarChart>
            </ResponsiveContainer>
          </PanelSection>
        </Panel>
      )}

      {data.merchantBreakdown.length > 0 && (
        <Panel>
          <PanelSection
            label="Per-merchant type mix"
            caption={`Top ${data.merchantBreakdown.length} merchants — share of orders by type`}
            action={
              <MobileColumnsButton columns={TYPE_MIX_COLUMNS} hidden={hiddenCols} onChange={setHiddenCols} />
            }
          >
            {/* Min-width lifted on mobile so hidden columns actually shrink the
                table rather than leaving it scrolling sideways. */}
            <Table variant="data" className={cn(!isMobile && 'min-w-[480px]')}>
              <TableHeader className="[&_tr]:border-0">
                <TableRow>
                  <TableHead>Merchant</TableHead>
                  {showCol('dineIn') && <TableHead className="text-right">Dine In</TableHead>}
                  {showCol('takeout') && <TableHead className="text-right">Takeout</TableHead>}
                  {showCol('delivery') && <TableHead className="text-right">Delivery</TableHead>}
                  {showCol('online') && <TableHead className="text-right">Online</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {merchantPage.pageRows.map(row => (
                  <TableRow key={row.merchantId}>
                    <TableCell className="font-medium">{row.merchantName}</TableCell>
                    {showCol('dineIn') && (
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {row.dineInPct > 0 ? `${row.dineInPct}%` : '—'}
                      </TableCell>
                    )}
                    {showCol('takeout') && (
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {row.takeoutPct > 0 ? `${row.takeoutPct}%` : '—'}
                      </TableCell>
                    )}
                    {showCol('delivery') && (
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {row.deliveryPct > 0 ? `${row.deliveryPct}%` : '—'}
                      </TableCell>
                    )}
                    {showCol('online') && (
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {row.onlinePct > 0 ? `${row.onlinePct}%` : '—'}
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <PaginationBar
              className="border-t-0 pt-0"
              pagination={merchantPage.pagination}
              onPageChange={merchantPage.setPage}
              itemLabel="merchants"
            />
          </PanelSection>
        </Panel>
      )}
    </div>
  )
}
