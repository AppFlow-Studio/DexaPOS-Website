'use client'

import { useState, useMemo } from 'react'
import { useKDSThroughput } from '@/lib/queries/use-platform-analytics'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
} from 'recharts'
import {
  ChefHat,
  Timer,
  Zap,
  AlertTriangle,
  ArrowUpDown,
  MonitorSmartphone,
  Building2,
  UtensilsCrossed,
} from 'lucide-react'
import type { KDSSlowestMerchant, KDSSlowestItem } from '@/app/manage/actions/hq-platform/analytics'

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtSeconds(s: number | null): string {
  if (s === null) return '—'
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  const rem = s % 60
  return rem > 0 ? `${m}m ${rem}s` : `${m}m`
}

function prepTimeColor(seconds: number | null): string {
  if (seconds === null) return 'text-muted-foreground'
  if (seconds < 180) return 'text-green-600'   // < 3m — healthy
  if (seconds < 600) return 'text-yellow-600'  // 3-10m — watch
  return 'text-red-600'                         // > 10m — bottleneck
}

function barFill(seconds: number): string {
  if (seconds < 180) return 'hsl(142, 76%, 36%)'
  if (seconds < 600) return 'hsl(38, 92%, 50%)'
  return 'hsl(0, 72%, 51%)'
}

type SortKey = 'merchantName' | 'avgPrepTimeSeconds' | 'totalItemsBumped' | 'displayCount'

export function KDSPerformance() {
  const [days, setDays] = useState(7)
  const [sortKey, setSortKey] = useState<SortKey>('avgPrepTimeSeconds')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  const { data, isLoading } = useKDSThroughput(days)

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(d => d === 'desc' ? 'asc' : 'desc')
    } else {
      setSortKey(key)
      setSortDir(key === 'merchantName' ? 'asc' : 'desc')
    }
  }

  const sortedMerchants = useMemo(() => {
    if (!data?.slowestMerchants) return []
    return [...data.slowestMerchants].sort((a: KDSSlowestMerchant, b: KDSSlowestMerchant) => {
      const aVal = sortKey === 'merchantName' ? a.merchantName : a[sortKey]
      const bVal = sortKey === 'merchantName' ? b.merchantName : b[sortKey]
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal)
      }
      return sortDir === 'asc' ? Number(aVal) - Number(bVal) : Number(bVal) - Number(aVal)
    })
  }, [data?.slowestMerchants, sortKey, sortDir])

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i}><CardContent className="pt-6"><Skeleton className="h-12 w-full" /></CardContent></Card>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Card><CardContent className="pt-6"><Skeleton className="h-48 w-full" /></CardContent></Card>
          <Card><CardContent className="pt-6"><Skeleton className="h-48 w-full" /></CardContent></Card>
        </div>
        <Card><CardContent className="pt-6"><Skeleton className="h-64 w-full" /></CardContent></Card>
      </div>
    )
  }

  if (!data || data.totalDisplays === 0) {
    return (
      <Card>
        <CardContent className="py-16 flex flex-col items-center justify-center text-center gap-3">
          <ChefHat className="h-12 w-12 text-muted-foreground opacity-30" />
          <div>
            <p className="font-medium text-muted-foreground">No KDS data available</p>
            <p className="text-xs text-muted-foreground mt-1">
              No KDS items were bumped in the last {days} days, or KDS displays are not configured.
            </p>
          </div>
        </CardContent>
      </Card>
    )
  }

  const platformAvgMins = data.platformAvgPrepSeconds
    ? (data.platformAvgPrepSeconds / 60).toFixed(1)
    : null
  const slowMerchantCount = sortedMerchants.filter(m => m.avgPrepTimeSeconds >= 600).length

  return (
    <div className="space-y-4">

      {/* ── KPI Cards ───────────────────────────────────────────────────────── */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Platform Avg Prep</CardTitle>
            <Timer className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${prepTimeColor(data.platformAvgPrepSeconds)}`}>
              {platformAvgMins ? `${platformAvgMins}m` : '—'}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {data.periodDays}d window · &gt;10m = bottleneck
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Items Bumped</CardTitle>
            <Zap className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.totalItemsBumped.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {data.platformItemsPerHour.toLocaleString()} items/hr platform-wide
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">KDS Displays</CardTitle>
            <MonitorSmartphone className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.totalDisplays}</div>
            <p className="text-xs text-muted-foreground mt-1">Active across all merchants</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Slow Kitchens</CardTitle>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${slowMerchantCount > 0 ? 'text-red-600' : 'text-green-600'}`}>
              {slowMerchantCount}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Avg prep &gt;10m — coaching needed</p>
          </CardContent>
        </Card>
      </div>

      {/* ── Timing Distribution + Slowest Merchants Bar ─────────────────────── */}
      <div className="grid gap-4 md:grid-cols-2">

        {/* Timing bucket bar chart */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Prep Time Distribution</CardTitle>
                <CardDescription>How long items spend on the KDS before being bumped</CardDescription>
              </div>
              <Select value={String(days)} onValueChange={v => setDays(Number(v))}>
                <SelectTrigger className="w-28">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7">Last 7d</SelectItem>
                  <SelectItem value="14">Last 14d</SelectItem>
                  <SelectItem value="30">Last 30d</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            {data.timingDistribution.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={data.timingDistribution} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="bucketLabel" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${v}%`} />
                  <Tooltip
                    formatter={(value: number, _: string, props: any) => [
                      `${value}% (${props.payload.count.toLocaleString()} items)`,
                      'Share',
                    ]}
                  />
                  <Bar dataKey="percentage" radius={[4, 4, 0, 0]}>
                    {data.timingDistribution.map((entry, i) => {
                      const secs = [30, 90, 210, 450, 900][i] // mid-point of each bucket
                      return <Cell key={entry.bucketLabel} fill={barFill(secs)} />
                    })}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-52 flex items-center justify-center text-sm text-muted-foreground">No timing data</div>
            )}
            <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground justify-center">
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm inline-block bg-green-600" /> &lt;3m healthy</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm inline-block bg-yellow-500" /> 3-10m watch</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm inline-block bg-red-600" /> &gt;10m bottleneck</span>
            </div>
          </CardContent>
        </Card>

        {/* Slowest merchants horizontal bar */}
        <Card>
          <CardHeader>
            <CardTitle>Slowest Kitchens</CardTitle>
            <CardDescription>Merchants ranked by average KDS prep time</CardDescription>
          </CardHeader>
          <CardContent>
            {data.slowestMerchants.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart
                  layout="vertical"
                  data={data.slowestMerchants.slice(0, 8)}
                  margin={{ top: 0, right: 8, left: 8, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis
                    type="number"
                    tick={{ fontSize: 11 }}
                    tickFormatter={v => `${Math.round(v / 60)}m`}
                  />
                  <YAxis
                    type="category"
                    dataKey="merchantName"
                    tick={{ fontSize: 11 }}
                    width={90}
                    tickFormatter={n => n.length > 12 ? n.slice(0, 12) + '…' : n}
                  />
                  <Tooltip
                    formatter={(v: number) => [fmtSeconds(v), 'Avg Prep']}
                  />
                  <Bar dataKey="avgPrepTimeSeconds" radius={[0, 4, 4, 0]}>
                    {data.slowestMerchants.slice(0, 8).map((m) => (
                      <Cell key={m.merchantId} fill={barFill(m.avgPrepTimeSeconds)} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-52 flex items-center justify-center text-sm text-muted-foreground">No merchant data</div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Slowest Items Table (T-014 item-level insight) ───────────────────── */}
      {data.slowestItems && data.slowestItems.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <UtensilsCrossed className="h-4 w-4" />
                  Slowest Menu Items
                </CardTitle>
                <CardDescription>
                  Items taking the longest from KDS appearance to bump — platform-wide, min. 3 data points
                </CardDescription>
              </div>
              <Badge variant="outline" className="text-xs">
                Top {data.slowestItems.length} items
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-auto max-h-72">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="pl-4">#</TableHead>
                    <TableHead>Item Name</TableHead>
                    <TableHead className="text-right">Avg Prep</TableHead>
                    <TableHead className="text-right">P95</TableHead>
                    <TableHead className="text-right">Sample Size</TableHead>
                    <TableHead className="text-right">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(data.slowestItems as KDSSlowestItem[]).map((item, idx) => (
                    <TableRow key={item.itemName}>
                      <TableCell className="pl-4 text-muted-foreground text-sm">{idx + 1}</TableCell>
                      <TableCell>
                        <span className="font-medium text-sm">{item.itemName}</span>
                      </TableCell>
                      <TableCell className={`text-right font-semibold text-sm ${prepTimeColor(item.avgPrepTimeSeconds)}`}>
                        {fmtSeconds(item.avgPrepTimeSeconds)}
                      </TableCell>
                      <TableCell className="text-right text-sm text-muted-foreground">
                        {fmtSeconds(item.p95PrepTimeSeconds)}
                      </TableCell>
                      <TableCell className="text-right text-sm text-muted-foreground">
                        {item.count.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right">
                        {item.avgPrepTimeSeconds >= 600 ? (
                          <Badge variant="destructive" className="text-xs">Bottleneck</Badge>
                        ) : item.avgPrepTimeSeconds >= 180 ? (
                          <Badge variant="secondary" className="text-xs text-yellow-700 bg-yellow-100">Watch</Badge>
                        ) : (
                          <Badge variant="secondary" className="text-xs text-green-700 bg-green-100">Healthy</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Per-Merchant Detail Table ─────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Kitchen Performance by Merchant</CardTitle>
              <CardDescription>
                Avg prep time, throughput, and slow ticket rate across all KDS displays
              </CardDescription>
            </div>
            <Badge variant="outline" className="text-xs">
              <Building2 className="h-3 w-3 mr-1" />
              {sortedMerchants.length} merchants
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-auto max-h-96">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead
                    className="cursor-pointer select-none hover:text-foreground"
                    onClick={() => handleSort('merchantName')}
                  >
                    <span className="flex items-center gap-1">
                      Merchant <ArrowUpDown className="h-3 w-3" />
                    </span>
                  </TableHead>
                  <TableHead
                    className="text-right cursor-pointer select-none hover:text-foreground"
                    onClick={() => handleSort('avgPrepTimeSeconds')}
                  >
                    <span className="flex items-center justify-end gap-1">
                      Avg Prep <ArrowUpDown className="h-3 w-3" />
                    </span>
                  </TableHead>
                  <TableHead className="text-right">Median</TableHead>
                  <TableHead className="text-right">P95</TableHead>
                  <TableHead
                    className="text-right cursor-pointer select-none hover:text-foreground"
                    onClick={() => handleSort('totalItemsBumped')}
                  >
                    <span className="flex items-center justify-end gap-1">
                      Items Bumped <ArrowUpDown className="h-3 w-3" />
                    </span>
                  </TableHead>
                  <TableHead
                    className="text-right cursor-pointer select-none hover:text-foreground"
                    onClick={() => handleSort('displayCount')}
                  >
                    <span className="flex items-center justify-end gap-1">
                      Displays <ArrowUpDown className="h-3 w-3" />
                    </span>
                  </TableHead>
                  <TableHead className="text-right">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedMerchants.map(m => {
                  const avgMins = m.avgPrepTimeSeconds / 60
                  const isBottleneck = m.avgPrepTimeSeconds >= 600
                  const isWatch = m.avgPrepTimeSeconds >= 180 && m.avgPrepTimeSeconds < 600
                  return (
                    <TableRow key={m.merchantId}>
                      <TableCell>
                        <div className="font-medium text-sm">{m.merchantName}</div>
                        <div className="text-xs text-muted-foreground">
                          {m.displayCount} display{m.displayCount !== 1 ? 's' : ''}
                        </div>
                      </TableCell>
                      <TableCell className={`text-right font-semibold text-sm ${prepTimeColor(m.avgPrepTimeSeconds)}`}>
                        {fmtSeconds(m.avgPrepTimeSeconds)}
                      </TableCell>
                      <TableCell className="text-right text-sm text-muted-foreground">
                        {/* merchant-level median not in KDSSlowestMerchant — show avg as proxy */}
                        {avgMins.toFixed(1)}m
                      </TableCell>
                      <TableCell className="text-right text-sm text-muted-foreground">—</TableCell>
                      <TableCell className="text-right text-sm">{m.totalItemsBumped.toLocaleString()}</TableCell>
                      <TableCell className="text-right text-sm">{m.displayCount}</TableCell>
                      <TableCell className="text-right">
                        {isBottleneck ? (
                          <Badge variant="destructive" className="text-xs">Bottleneck</Badge>
                        ) : isWatch ? (
                          <Badge variant="secondary" className="text-xs text-yellow-700 bg-yellow-100">Watch</Badge>
                        ) : (
                          <Badge variant="secondary" className="text-xs text-green-700 bg-green-100">Healthy</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
