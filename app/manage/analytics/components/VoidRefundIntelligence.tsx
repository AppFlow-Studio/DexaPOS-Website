'use client'

import { useState } from 'react'
import { useVoidRefundIntelligence } from '@/lib/queries/use-platform-analytics'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import type { VoidAnomalyMerchant, VoidReasonBreakdown, StaffVoidEntry } from '@/app/manage/actions/hq-platform/analytics'

function fmt(n: number) {
  return n >= 1000 ? `$${(n / 1000).toFixed(1)}k` : `$${n.toFixed(2)}`
}

export function VoidRefundIntelligence() {
  const [days, setDays] = useState(30)
  const { data, isLoading } = useVoidRefundIntelligence(days)

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          {[...Array(2)].map((_, i) => (
            <Card key={i}><CardContent className="pt-6"><Skeleton className="h-12 w-full" /></CardContent></Card>
          ))}
        </div>
        <Skeleton className="h-75 w-full" />
      </div>
    )
  }

  if (!data) return null

  const COLORS = ['#3b82f6', '#8b5cf6', '#f59e0b', '#ef4444', '#94a3b8']
  const anomalies = data.merchantAnomalies.filter(m => m.isAnomaly)

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

      {/* Platform rates */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <p className="text-2xl font-bold">{data.platformVoidRate}%</p>
            <p className="text-xs text-muted-foreground">Platform Void Rate</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-2xl font-bold">{data.platformRefundRate}%</p>
            <p className="text-xs text-muted-foreground">Platform Refund Rate</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className={`text-2xl font-bold ${anomalies.length > 0 ? 'text-red-600' : 'text-green-600'}`}>
              {anomalies.length}
            </p>
            <p className="text-xs text-muted-foreground">Anomalous Merchants</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Void Reason Breakdown */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Void Reason Breakdown</CardTitle>
            <CardDescription className="text-xs">Why orders are being voided</CardDescription>
          </CardHeader>
          <CardContent>
            {data.voidReasonBreakdown.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={data.voidReasonBreakdown} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis type="number" tick={{ fontSize: 10 }} />
                  <YAxis type="category" dataKey="reason" tick={{ fontSize: 10 }} width={90} />
                  <Tooltip />
                  <Bar dataKey="count" name="Count" radius={[0, 4, 4, 0]}>
                    {data.voidReasonBreakdown.map((_: VoidReasonBreakdown, i: number) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-55 flex items-center justify-center text-sm text-muted-foreground">
                No void reason data recorded
              </div>
            )}
          </CardContent>
        </Card>

        {/* Merchant Anomalies */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">
              Merchant Void Rate Anomalies
              {anomalies.length > 0 && (
                <Badge variant="destructive" className="ml-2 text-xs">{anomalies.length} flagged</Badge>
              )}
            </CardTitle>
            <CardDescription className="text-xs">Merchants with void rate &gt;2× platform average ({data.platformVoidRate}%)</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Merchant</TableHead>
                  <TableHead className="text-xs text-right">Void Rate</TableHead>
                  <TableHead className="text-xs text-right">Voided</TableHead>
                  <TableHead className="text-xs text-right">Refund Amt</TableHead>
                  <TableHead className="text-xs">Top Reason</TableHead>
                  <TableHead className="text-xs">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.merchantAnomalies.slice(0, 12).map((m: VoidAnomalyMerchant) => (
                  <TableRow key={m.merchantId}>
                    <TableCell className="text-sm py-2">{m.merchantName}</TableCell>
                    <TableCell className="text-sm py-2 text-right font-mono">{m.voidRate}%</TableCell>
                    <TableCell className="text-sm py-2 text-right text-muted-foreground">{m.voidedOrders}</TableCell>
                    <TableCell className="text-sm py-2 text-right font-mono text-red-600">
                      {m.refundAmount > 0 ? fmt(m.refundAmount) : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="text-xs py-2 text-muted-foreground max-w-30 truncate">
                      {m.topVoidReason
                        ? m.topVoidReason.replace(/_/g, ' ')
                        : <span className="italic">—</span>}
                    </TableCell>
                    <TableCell className="py-2">
                      {m.isAnomaly ? (
                        <Badge variant="destructive" className="text-xs">Anomaly</Badge>
                      ) : (
                        <Badge variant="secondary" className="text-xs">Normal</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {data.merchantAnomalies.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground text-sm py-4">No void activity in period</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {/* Staff Void Leaderboard */}
      {data.staffVoidLeaderboard && data.staffVoidLeaderboard.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Staff Void Leaderboard</CardTitle>
            <CardDescription className="text-xs">
              Staff members with highest void counts — may indicate training needs or potential abuse
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">#</TableHead>
                  <TableHead className="text-xs">Staff Member</TableHead>
                  <TableHead className="text-xs">Merchant</TableHead>
                  <TableHead className="text-xs text-right">Void Count</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.staffVoidLeaderboard.map((s: StaffVoidEntry, idx: number) => (
                  <TableRow key={s.staffId}>
                    <TableCell className="text-xs py-2 text-muted-foreground font-mono w-6">{idx + 1}</TableCell>
                    <TableCell className="text-sm py-2 font-medium">{s.staffName}</TableCell>
                    <TableCell className="text-sm py-2 text-muted-foreground">{s.merchantName}</TableCell>
                    <TableCell className="text-sm py-2 text-right">
                      <span className={`font-bold ${
                        s.voidCount >= 20 ? 'text-red-600' : s.voidCount >= 10 ? 'text-amber-600' : 'text-foreground'
                      }`}>
                        {s.voidCount}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
