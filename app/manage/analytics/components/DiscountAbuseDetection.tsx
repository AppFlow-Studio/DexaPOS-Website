'use client'

import { useState } from 'react'
import { useDiscountUsageAnalysis } from '@/lib/queries/use-platform-analytics'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import type { MerchantDiscountRate, StaffDiscountEntry, DiscountTypeBreakdown, DiscountScopeBreakdown } from '@/app/manage/actions/hq-platform/analytics'

function fmt(n: number) {
  return n >= 1000 ? `$${(n / 1000).toFixed(1)}k` : `$${n.toFixed(2)}`
}

const TYPE_COLORS = ['#3b82f6', '#f59e0b', '#22c55e', '#8b5cf6', '#ef4444', '#94a3b8']

export function DiscountAbuseDetection() {
  const [days, setDays] = useState(30)
  const { data, isLoading } = useDiscountUsageAnalysis(days)

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => (
            <Card key={i}><CardContent className="pt-6"><Skeleton className="h-12 w-full" /></CardContent></Card>
          ))}
        </div>
        <Skeleton className="h-75 w-full" />
      </div>
    )
  }

  if (!data) return null

  const flagged = data.merchantDiscountRates.filter(m => m.isFlagged)

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">Period:</span>
        <Select value={String(days)} onValueChange={v => setDays(Number(v))}>
          <SelectTrigger className="w-32 h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7">Last 7 days</SelectItem>
            <SelectItem value="30">Last 30 days</SelectItem>
            <SelectItem value="90">Last 90 days</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <p className="text-2xl font-bold">{fmt(data.totalDiscountAmount30d)}</p>
            <p className="text-xs text-muted-foreground">Total Discounts Issued</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-2xl font-bold">{data.discountAsPercentOfRevenue}%</p>
            <p className="text-xs text-muted-foreground">% of Gross Revenue</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-2xl font-bold">{data.discountedOrdersCount.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground">Discounted Orders</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className={`text-2xl font-bold ${flagged.length > 0 ? 'text-red-600' : 'text-green-600'}`}>
              {flagged.length}
            </p>
            <p className="text-xs text-muted-foreground">Merchants Flagged (&gt;10%)</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Discount type breakdown */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Discount Type Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            {data.typeBreakdown.length > 0 ? (
              <>
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie data={data.typeBreakdown} cx="50%" cy="50%" outerRadius={75} paddingAngle={3} dataKey="count">
                      {data.typeBreakdown.map((_: DiscountTypeBreakdown, i: number) => (
                        <Cell key={i} fill={TYPE_COLORS[i % TYPE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v: number) => [v, 'Uses']} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
                <div className="mt-2 space-y-1">
                  {data.typeBreakdown.map((t: DiscountTypeBreakdown, i) => (
                    <div key={t.type} className="flex justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: TYPE_COLORS[i % TYPE_COLORS.length] }} />
                        <span className="capitalize">{t.type.replace(/_/g, ' ')}</span>
                      </div>
                      <span className="text-muted-foreground">{t.count} uses · {t.percentage}%</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="h-50 flex items-center justify-center text-sm text-muted-foreground">
                No discount data in period
              </div>
            )}
          </CardContent>
        </Card>

        {/* Staff leaderboard */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Top Staff by Discounts Applied</CardTitle>
            <CardDescription className="text-xs">Highest discount issuers across the platform</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
            <Table>
              <TableHeader>
              <TableRow>
                  <TableHead className="text-xs">Staff</TableHead>
                  <TableHead className="text-xs">Merchant</TableHead>
                  <TableHead className="text-xs text-right">Count</TableHead>
                  <TableHead className="text-xs text-right">Total</TableHead>
                  <TableHead className="text-xs text-right">Mgr Approvals</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.staffLeaderboard.slice(0, 10).map((s: StaffDiscountEntry) => (
                  <TableRow key={s.staffId}>
                    <TableCell className="text-sm py-2 font-medium">{s.staffName}</TableCell>
                    <TableCell className="text-sm py-2 text-muted-foreground">{s.merchantName}</TableCell>
                    <TableCell className="text-sm py-2 text-right">{s.discountCount}</TableCell>
                    <TableCell className="text-sm py-2 text-right font-mono">{fmt(s.totalDiscountAmount)}</TableCell>
                    <TableCell className="text-sm py-2 text-right">
                      {s.requiresManagerApprovalCount > 0 ? (
                        <span className="text-amber-600 font-medium">{s.requiresManagerApprovalCount}</span>
                      ) : (
                        <span className="text-muted-foreground">0</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {data.staffLeaderboard.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground text-sm py-4">No staff discount data</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Discount Scope Breakdown */}
      {data.scopeBreakdown.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Discount Scope Breakdown</CardTitle>
            <CardDescription className="text-xs">
              Order-level vs item-level vs both — how discounts are applied across the platform
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {data.scopeBreakdown.map((s: DiscountScopeBreakdown) => {
                const SCOPE_META: Record<string, { label: string; color: string; bg: string }> = {
                  order:   { label: 'Order-level',  color: 'bg-blue-500',   bg: 'text-blue-700' },
                  item:    { label: 'Item-level',   color: 'bg-purple-500', bg: 'text-purple-700' },
                  both:    { label: 'Both',         color: 'bg-green-500',  bg: 'text-green-700' },
                  unknown: { label: 'Unknown',      color: 'bg-slate-400',  bg: 'text-slate-600' },
                }
                const meta = SCOPE_META[s.scope] ?? SCOPE_META.unknown
                return (
                  <div key={s.scope} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <div className={`w-2.5 h-2.5 rounded-full ${meta.color}`} />
                        <span className="font-medium">{meta.label}</span>
                      </div>
                      <span className="text-muted-foreground">
                        {s.count.toLocaleString()} uses
                        <span className={`ml-2 font-semibold ${meta.bg}`}>{s.percentage}%</span>
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-muted overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${meta.color}`}
                        style={{ width: `${s.percentage}%` }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Flagged merchants */}
      {flagged.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              Flagged Merchants
              <Badge variant="destructive" className="text-xs">{flagged.length}</Badge>
            </CardTitle>
            <CardDescription className="text-xs">Discount rate exceeds 10% of gross revenue</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Merchant</TableHead>
                  <TableHead className="text-xs text-right">Discount %</TableHead>
                  <TableHead className="text-xs text-right">Discount Amt</TableHead>
                  <TableHead className="text-xs text-right">Gross Revenue</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {flagged.map((m: MerchantDiscountRate) => (
                  <TableRow key={m.merchantId}>
                    <TableCell className="text-sm py-2 font-medium">{m.merchantName}</TableCell>
                    <TableCell className="text-sm py-2 text-right font-mono text-red-600">{m.discountRate}%</TableCell>
                    <TableCell className="text-sm py-2 text-right font-mono">{fmt(m.discountAmount)}</TableCell>
                    <TableCell className="text-sm py-2 text-right font-mono text-muted-foreground">{fmt(m.grossRevenue)}</TableCell>
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
