'use client'

import { useState } from 'react'
import { useOrderTypeIntelligence } from '@/lib/queries/use-platform-analytics'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from 'recharts'
import { Utensils, ShoppingBag, Truck, Globe, TrendingUp, Package2, ChefHat, ArrowLeftRight } from 'lucide-react'
import type { OrderTypeStat, ChannelStat } from '@/app/manage/actions/hq-platform/analytics'

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtGPV(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}k`
  return `$${n.toFixed(2)}`
}

const TYPE_ICONS: Record<string, React.ElementType> = {
  dine_in:  Utensils,
  takeout:  ShoppingBag,
  delivery: Truck,
  online:   Globe,
  catering: ChefHat,
}

const TYPE_BG: Record<string, string> = {
  dine_in:  'bg-blue-50 border-blue-200',
  takeout:  'bg-green-50 border-green-200',
  delivery: 'bg-amber-50 border-amber-200',
  online:   'bg-purple-50 border-purple-200',
  catering: 'bg-pink-50 border-pink-200',
}

const TYPE_ICON_BG: Record<string, string> = {
  dine_in:  'bg-blue-100 text-blue-600',
  takeout:  'bg-green-100 text-green-600',
  delivery: 'bg-amber-100 text-amber-600',
  online:   'bg-purple-100 text-purple-600',
  catering: 'bg-pink-100 text-pink-600',
}

const DOMINANT_BADGE: Record<string, string> = {
  dine_in:  'bg-blue-100 text-blue-700',
  takeout:  'bg-green-100 text-green-700',
  delivery: 'bg-amber-100 text-amber-700',
  online:   'bg-purple-100 text-purple-700',
  catering: 'bg-pink-100 text-pink-700',
}

// ── Stacked bar cell ─────────────────────────────────────────────────────────

function TypeBar({ dineInPct, takeoutPct, deliveryPct, onlinePct }: {
  dineInPct: number; takeoutPct: number; deliveryPct: number; onlinePct: number
}) {
  const segments = [
    { pct: dineInPct, color: 'bg-blue-500', label: 'Dine In' },
    { pct: takeoutPct, color: 'bg-green-500', label: 'Takeout' },
    { pct: deliveryPct, color: 'bg-amber-500', label: 'Delivery' },
    { pct: onlinePct, color: 'bg-purple-500', label: 'Online' },
  ].filter(s => s.pct > 0)

  return (
    <div className="flex h-2 w-full rounded-full overflow-hidden gap-px bg-muted min-w-24">
      {segments.map(s => (
        <div
          key={s.label}
          className={`${s.color} transition-all`}
          style={{ width: `${s.pct}%` }}
          title={`${s.label}: ${s.pct}%`}
        />
      ))}
    </div>
  )
}

// ── Stat Card ────────────────────────────────────────────────────────────────

function TypeStatCard({ stat }: { stat: OrderTypeStat }) {
  const Icon = TYPE_ICONS[stat.type] ?? Package2
  return (
    <Card className={`border ${TYPE_BG[stat.type] ?? 'bg-muted/20'}`}>
      <CardContent className="pt-5 pb-4">
        <div className="flex items-start justify-between">
          <div className={`p-2.5 rounded-lg ${TYPE_ICON_BG[stat.type] ?? 'bg-muted'}`}>
            <Icon className="h-5 w-5" />
          </div>
          <Badge variant="secondary" className="text-xs font-medium">
            {stat.percentage}% of orders
          </Badge>
        </div>
        <div className="mt-3">
          <p className="text-2xl font-bold">{stat.orderCount.toLocaleString()}</p>
          <p className="text-sm font-medium mt-0.5">{stat.label}</p>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
          <div>
            <p className="text-muted-foreground">Total GPV</p>
            <p className="font-semibold">{fmtGPV(stat.totalGPV)}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Avg Order</p>
            <p className="font-semibold">${stat.avgOrderValue.toFixed(2)}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// ── Main Component ───────────────────────────────────────────────────────────

export function OrderTypeIntelligence() {
  const [days, setDays] = useState(30)
  const { data, isLoading } = useOrderTypeIntelligence(days)

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-36" />)}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Skeleton className="h-72" />
          <Skeleton className="h-72" />
        </div>
        <Skeleton className="h-64" />
      </div>
    )
  }

  if (!data) return null

  if (data.breakdown.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
        <Package2 className="h-12 w-12 opacity-25" />
        <p className="font-medium">No order type data available</p>
        <p className="text-sm">Orders for this period have no order_type recorded.</p>
      </div>
    )
  }

  const trendData = data.weeklyTrend.map(p => ({
    ...p,
    date: p.date.slice(5), // "MM-DD"
  }))

  return (
    <div className="space-y-6">
      {/* Period selector + summary */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="text-sm text-muted-foreground">
            <span className="font-semibold text-foreground">{data.totalOrders.toLocaleString()}</span> orders ·{' '}
            <span className="font-semibold text-foreground">{fmtGPV(data.totalGPV)}</span> GPV in the last {days} days
          </p>
        </div>
        <Select value={String(days)} onValueChange={v => setDays(Number(v))}>
          <SelectTrigger className="h-8 w-32 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7">Last 7 days</SelectItem>
            <SelectItem value="30">Last 30 days</SelectItem>
            <SelectItem value="90">Last 90 days</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Type cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {data.breakdown.map(stat => (
          <TypeStatCard key={stat.type} stat={stat} />
        ))}
      </div>

      {/* ── Channel Comparison ──────────────────────────────────────────── */}
      {(data.channelBreakdown?.length ?? 0) > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <ArrowLeftRight className="h-4 w-4 text-muted-foreground" />
                  Channel Comparison
                </CardTitle>
                <CardDescription className="text-xs">
                  Order volume and average ticket value by fulfillment channel (order_channel)
                </CardDescription>
              </div>
              {/* Online vs In-Store callout */}
              {(() => {
                const onlineStat = data.breakdown.find(s => s.type === 'online')
                const onlinePct = onlineStat?.percentage ?? 0
                return onlinePct > 0 ? (
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground">Online vs In-Store</p>
                    <p className="text-sm font-bold">
                      <span className="text-purple-600">{onlinePct}%</span>
                      {' '}online · <span className="text-foreground">{Math.round((100 - onlinePct) * 10) / 10}%</span> in-store
                    </p>
                  </div>
                ) : null
              })()}
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Order count per channel */}
              <div>
                <p className="text-xs text-muted-foreground mb-3 font-medium uppercase tracking-wide">Orders by Channel</p>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={data.channelBreakdown ?? []} layout="vertical" margin={{ left: 8, right: 32 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 11 }} />
                    <YAxis type="category" dataKey="label" tick={{ fontSize: 12 }} width={80} />
                    <Tooltip formatter={(v: number, _n, props) => [`${v.toLocaleString()} orders (${props.payload?.percentage}%)`, 'Orders']} />
                    <Bar dataKey="orderCount" radius={[0, 4, 4, 0]}>
                      {(data.channelBreakdown ?? []).map((entry, i) => (
                        <Cell key={i} fill={entry.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Avg order value per channel */}
              <div>
                <p className="text-xs text-muted-foreground mb-3 font-medium uppercase tracking-wide">Avg Order Value by Channel</p>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={data.channelBreakdown ?? []} layout="vertical" margin={{ left: 8, right: 32 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={v => `$${v}`} />
                    <YAxis type="category" dataKey="label" tick={{ fontSize: 12 }} width={80} />
                    <Tooltip formatter={(v: number) => [`$${v.toFixed(2)}`, 'Avg Order Value']} />
                    <Bar dataKey="avgOrderValue" radius={[0, 4, 4, 0]}>
                      {(data.channelBreakdown ?? []).map((entry, i) => (
                        <Cell key={i} fill={entry.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Channel stat row */}
            <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {(data.channelBreakdown ?? []).map((ch: ChannelStat) => (
                <div key={ch.channel} className="flex items-center gap-2 p-2 rounded-lg bg-muted/40">
                  <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: ch.color }} />
                  <div className="min-w-0">
                    <p className="text-xs font-medium truncate">{ch.label}</p>
                    <p className="text-xs text-muted-foreground">{ch.orderCount.toLocaleString()} · {ch.percentage}%</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Charts row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Donut — order split */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Order Count Split</CardTitle>
            <CardDescription className="text-xs">By order type, last {days} days</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie
                  data={data.breakdown}
                  cx="50%" cy="50%"
                  innerRadius={60} outerRadius={95}
                  paddingAngle={3}
                  dataKey="orderCount"
                  nameKey="label"
                >
                  {data.breakdown.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(v: number, _name, props) => [
                    `${v.toLocaleString()} orders (${props.payload?.percentage}%)`,
                    props.payload?.label,
                  ]}
                />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* GPV bar chart */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">GPV by Order Type</CardTitle>
            <CardDescription className="text-xs">Revenue distribution across service channels</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={data.breakdown} layout="vertical" margin={{ left: 16, right: 24 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={v => fmtGPV(v)} />
                <YAxis type="category" dataKey="label" tick={{ fontSize: 12 }} width={65} />
                <Tooltip formatter={(v: number) => [fmtGPV(v), 'GPV']} />
                <Bar dataKey="totalGPV" radius={[0, 4, 4, 0]}>
                  {data.breakdown.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Daily trend stacked bar */}
      {trendData.length > 1 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
              Daily Order Type Trend
            </CardTitle>
            <CardDescription className="text-xs">Order counts by type per day</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={trendData} barSize={14}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="dine_in"  stackId="a" fill="#3b82f6" name="Dine In"  radius={[0, 0, 0, 0]} />
                <Bar dataKey="takeout"  stackId="a" fill="#22c55e" name="Takeout"  radius={[0, 0, 0, 0]} />
                <Bar dataKey="delivery" stackId="a" fill="#f59e0b" name="Delivery" radius={[0, 0, 0, 0]} />
                <Bar dataKey="online"   stackId="a" fill="#8b5cf6" name="Online"   radius={[4, 4, 0, 0]} />
                <Legend />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Per-merchant breakdown */}
      {data.merchantBreakdown.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Per-Merchant Type Mix</CardTitle>
            <CardDescription className="text-xs">
              Top {data.merchantBreakdown.length} merchants — dominant channel and order type breakdown
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-auto max-h-80">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="text-xs">Merchant</TableHead>
                    <TableHead className="text-xs text-right">Orders</TableHead>
                    <TableHead className="text-xs">Dominant Type</TableHead>
                    <TableHead className="text-xs min-w-32">Type Mix</TableHead>
                    <TableHead className="text-xs text-right">Dine In</TableHead>
                    <TableHead className="text-xs text-right">Takeout</TableHead>
                    <TableHead className="text-xs text-right">Delivery</TableHead>
                    <TableHead className="text-xs text-right">Online</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.merchantBreakdown.map(row => (
                    <TableRow key={row.merchantId}>
                      <TableCell className="text-sm py-2 font-medium">{row.merchantName}</TableCell>
                      <TableCell className="text-sm py-2 text-right">{row.totalOrders.toLocaleString()}</TableCell>
                      <TableCell className="py-2">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize ${DOMINANT_BADGE[row.dominantType] ?? 'bg-gray-100 text-gray-700'}`}>
                          {ORDER_TYPE_LABELS[row.dominantType] ?? row.dominantType.replace(/_/g, ' ')}
                        </span>
                      </TableCell>
                      <TableCell className="py-2">
                        <TypeBar
                          dineInPct={row.dineInPct}
                          takeoutPct={row.takeoutPct}
                          deliveryPct={row.deliveryPct}
                          onlinePct={row.onlinePct}
                        />
                      </TableCell>
                      <TableCell className="text-xs py-2 text-right text-muted-foreground">
                        {row.dineInPct > 0 ? `${row.dineInPct}%` : '—'}
                      </TableCell>
                      <TableCell className="text-xs py-2 text-right text-muted-foreground">
                        {row.takeoutPct > 0 ? `${row.takeoutPct}%` : '—'}
                      </TableCell>
                      <TableCell className="text-xs py-2 text-right text-muted-foreground">
                        {row.deliveryPct > 0 ? `${row.deliveryPct}%` : '—'}
                      </TableCell>
                      <TableCell className="text-xs py-2 text-right text-muted-foreground">
                        {row.onlinePct > 0 ? `${row.onlinePct}%` : '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

const ORDER_TYPE_LABELS: Record<string, string> = {
  dine_in: 'Dine In', takeout: 'Takeout', delivery: 'Delivery', online: 'Online',
}
