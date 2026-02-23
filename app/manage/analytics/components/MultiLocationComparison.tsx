'use client'

import { useState, useMemo } from 'react'
import { useMultiLocationComparison } from '@/lib/queries/use-platform-analytics'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
} from 'recharts'
import {
  MapPin, ArrowUpRight, ArrowDownRight, Minus, Trophy,
  TrendingDown, Search, Building2,
} from 'lucide-react'
import type { LocationMetrics, SparklinePoint } from '@/app/manage/actions/hq-platform/analytics'

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtGPV(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}k`
  return `$${n.toFixed(2)}`
}

function TrendChip({ pct }: { pct: number | null }) {
  if (pct === null) return <span className="text-xs text-muted-foreground">—</span>
  const isPos = pct >= 0
  return (
    <span className={`flex items-center justify-end gap-0.5 text-xs font-medium ${isPos ? 'text-green-600' : 'text-red-600'}`}>
      {isPos ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
      {pct > 0 ? '+' : ''}{pct}%
    </span>
  )
}

function RankBadge({ rank, total }: { rank: number; total: number }) {
  if (rank === 1) return (
    <span className="inline-flex items-center gap-1 text-xs font-bold text-amber-600">
      <Trophy className="h-3 w-3" /> #1
    </span>
  )
  if (rank === total && total > 1) return (
    <span className="inline-flex items-center gap-1 text-xs text-red-500">
      <TrendingDown className="h-3 w-3" /> #{rank}
    </span>
  )
  return <span className="text-xs text-muted-foreground">#{rank}</span>
}

// ── Inline SVG sparkline (7-day GPV trend) ───────────────────────────────────

function MiniSparkline({ data }: { data: SparklinePoint[] }) {
  const maxGPV = Math.max(...data.map(d => d.gpv), 1)
  const hasData = data.some(d => d.gpv > 0)
  if (!hasData) return <span className="text-xs text-muted-foreground">—</span>

  const W = 56, H = 20, PAD = 1
  const points = data.map((d, i) => {
    const x = PAD + (i / (data.length - 1)) * (W - PAD * 2)
    const y = PAD + (1 - d.gpv / maxGPV) * (H - PAD * 2)
    return `${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')

  // Determine trend color: compare last 2 days
  const last = data[data.length - 1]?.gpv ?? 0
  const prev = data[data.length - 2]?.gpv ?? 0
  const color = last >= prev ? '#22c55e' : '#ef4444'

  return (
    <svg width={W} height={H} className="overflow-visible" aria-hidden>
      <polyline points={points} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}

// ── Performance bar (% of top location GPV) ──────────────────────────────────

function PerformanceBar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0
  const color = pct >= 70 ? 'bg-green-500' : pct >= 40 ? 'bg-amber-500' : 'bg-red-400'
  return (
    <div className="flex items-center gap-2 min-w-28">
      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-muted-foreground w-8 text-right">{pct}%</span>
    </div>
  )
}

// ── Main Component ───────────────────────────────────────────────────────────

export function MultiLocationComparison() {
  const [days, setDays] = useState(30)
  const [search, setSearch] = useState('')
  const [selectedMerchantId, setSelectedMerchantId] = useState<string>('all')
  const { data, isLoading } = useMultiLocationComparison(days)

  // Extract multi-location merchants (≥2 locations) from the dataset
  const multiLocationMerchants = useMemo(() => {
    if (!data?.locations) return []
    const counts = new Map<string, { id: string; name: string; count: number }>()
    data.locations.forEach(l => {
      const existing = counts.get(l.merchantId)
      if (existing) {
        existing.count += 1
      } else {
        counts.set(l.merchantId, { id: l.merchantId, name: l.merchantName, count: 1 })
      }
    })
    return Array.from(counts.values())
      .filter(m => m.count >= 2)
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [data?.locations])

  const filteredLocations = useMemo(() => {
    if (!data?.locations) return []
    let base = data.locations
    if (selectedMerchantId !== 'all') {
      base = base.filter(l => l.merchantId === selectedMerchantId)
    }
    if (!search.trim()) return base
    const q = search.toLowerCase()
    return base.filter(l =>
      l.locationName.toLowerCase().includes(q) ||
      l.merchantName.toLowerCase().includes(q)
    )
  }, [data?.locations, selectedMerchantId, search])

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
        <Skeleton className="h-72" />
        <Skeleton className="h-64" />
      </div>
    )
  }

  if (!data || data.locations.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
        <MapPin className="h-12 w-12 opacity-25" />
        <p className="font-medium">No location data available</p>
        <p className="text-sm">No locations with transaction activity in the selected period.</p>
      </div>
    )
  }

  const topGPV = filteredLocations.length > 0
    ? Math.max(...filteredLocations.map(l => l.totalGPV))
    : (data.topLocation?.totalGPV ?? 0)

  // Top 15 locations for the chart (from filtered set)
  const chartData = filteredLocations.slice(0, 15).map((l, i) => ({
    name: l.locationName.length > 14 ? l.locationName.slice(0, 13) + '…' : l.locationName,
    gpv: l.totalGPV,
    fill: i === 0 ? '#f59e0b' : i < 3 ? '#3b82f6' : '#94a3b8',
  }))

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3 flex-wrap">
          {/* Merchant picker — core of the T018 scope fix */}
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
            <Select
              value={selectedMerchantId}
              onValueChange={v => { setSelectedMerchantId(v); setSearch('') }}
            >
              <SelectTrigger className="h-8 w-52 text-xs">
                <SelectValue placeholder="Select merchant…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Merchants (platform-wide)</SelectItem>
                {multiLocationMerchants.map(m => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.name} ({m.count} locations)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <p className="text-xs text-muted-foreground">
            {selectedMerchantId === 'all'
              ? <>Showing <span className="font-semibold text-foreground">{data.totalLocations}</span> locations across all merchants</>
              : <>Showing <span className="font-semibold text-foreground">{filteredLocations.length}</span> locations for selected merchant</>
            }
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

      {/* Summary cards — reflect filtered view */}
      {(() => {
        const visibleGPVs = filteredLocations.map(l => l.totalGPV)
        const totalVisibleGPV = visibleGPVs.reduce((s, v) => s + v, 0)
        const avgVisible = filteredLocations.length > 0 ? totalVisibleGPV / filteredLocations.length : 0
        const sortedVisible = [...visibleGPVs].sort((a, b) => a - b)
        const medianVisible = sortedVisible.length > 0
          ? sortedVisible[Math.floor(sortedVisible.length / 2)]
          : 0
        const topVisible = filteredLocations[0]
        return (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-5">
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Locations Shown</p>
                <p className="text-2xl font-bold mt-1">{filteredLocations.length}</p>
                {selectedMerchantId === 'all' && (
                  <p className="text-xs text-muted-foreground">of {data.totalLocations} total</p>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-5">
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Avg GPV / Location</p>
                <p className="text-2xl font-bold mt-1">{fmtGPV(avgVisible)}</p>
              </CardContent>
            </Card>
            <Card className="border-amber-200 bg-amber-50/40">
              <CardContent className="pt-5">
                <p className="text-xs text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                  <Trophy className="h-3 w-3 text-amber-500" /> Top Location
                </p>
                <p className="text-lg font-bold mt-1 truncate">{topVisible?.locationName ?? '—'}</p>
                <p className="text-xs text-muted-foreground">{fmtGPV(topVisible?.totalGPV ?? 0)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-5">
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Median GPV</p>
                <p className="text-2xl font-bold mt-1">{fmtGPV(medianVisible)}</p>
              </CardContent>
            </Card>
          </div>
        )
      })()}

      {/* Top 15 bar chart */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Top {Math.min(15, filteredLocations.length)} Locations by GPV</CardTitle>
          <CardDescription className="text-xs">Last {days} days{selectedMerchantId !== 'all' ? ` · ${multiLocationMerchants.find(m => m.id === selectedMerchantId)?.name}` : ''}</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={chartData} margin={{ bottom: 32 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="name"
                tick={{ fontSize: 10 }}
                angle={-35}
                textAnchor="end"
                interval={0}
                height={60}
              />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={v => fmtGPV(v)} />
              <Tooltip formatter={(v: number) => [fmtGPV(v), 'GPV']} />
              <Bar dataKey="gpv" radius={[4, 4, 0, 0]}>
                {chartData.map((entry, i) => (
                  <Cell key={i} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Full location table */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <CardTitle className="text-sm font-medium">All Locations</CardTitle>
              <CardDescription className="text-xs mt-0.5">
                Ranked by GPV — vs. prior {days}-day period
              </CardDescription>
            </div>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Filter location or merchant…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="h-8 text-xs pl-8 w-52"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-auto max-h-96">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="text-xs w-10">#</TableHead>
                  <TableHead className="text-xs">Location</TableHead>
                  <TableHead className="text-xs">Merchant</TableHead>
                  <TableHead className="text-xs text-right">GPV</TableHead>
                  <TableHead className="text-xs">vs Avg</TableHead>
                  <TableHead className="text-xs text-right">Orders</TableHead>
                  <TableHead className="text-xs text-right">Avg Order</TableHead>
                  <TableHead className="text-xs text-right">Void %</TableHead>
                  <TableHead className="text-xs text-right">vs Prev</TableHead>
                  <TableHead className="text-xs text-right">7d Trend</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredLocations.map((loc: LocationMetrics) => (
                  <TableRow key={loc.locationId}>
                    <TableCell className="py-2 text-center">
                      <RankBadge rank={loc.gpvRank} total={data.totalLocations} />
                    </TableCell>
                    <TableCell className="py-2">
                      <div className="flex items-center gap-1.5">
                        <MapPin className="h-3 w-3 text-muted-foreground shrink-0" />
                        <span className="text-sm font-medium">{loc.locationName}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm py-2 text-muted-foreground">{loc.merchantName}</TableCell>
                    <TableCell className="py-2 text-right">
                      <div>
                        <p className="text-sm font-bold">{fmtGPV(loc.totalGPV)}</p>
                        <PerformanceBar value={loc.totalGPV} max={topGPV} />
                      </div>
                    </TableCell>
                    <TableCell className="py-2">
                      {(() => {
                        const diff = loc.totalGPV - data.avgGPVPerLocation
                        const pct = data.avgGPVPerLocation > 0
                          ? Math.round((diff / data.avgGPVPerLocation) * 100)
                          : 0
                        return (
                          <Badge
                            variant={pct >= 0 ? 'default' : 'secondary'}
                            className={`text-xs ${pct >= 0 ? 'bg-green-100 text-green-700 border-green-200' : 'bg-red-100 text-red-700 border-red-200'}`}
                          >
                            {pct >= 0 ? '+' : ''}{pct}% avg
                          </Badge>
                        )
                      })()}
                    </TableCell>
                    <TableCell className="text-sm py-2 text-right">{loc.orderCount.toLocaleString()}</TableCell>
                    <TableCell className="text-sm py-2 text-right">${loc.avgOrderValue.toFixed(2)}</TableCell>
                    <TableCell className="py-2 text-right">
                      {loc.voidRate > 0 ? (
                        <span className={`text-xs font-medium ${loc.voidRate > 5 ? 'text-red-600' : 'text-muted-foreground'}`}>
                          {loc.voidRate}%
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="py-2">
                      <TrendChip pct={loc.trendVsPrev} />
                    </TableCell>
                    <TableCell className="py-2 text-right">
                      <MiniSparkline data={loc.sparkline ?? []} />
                    </TableCell>
                  </TableRow>
                ))}
                {filteredLocations.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center text-muted-foreground text-sm py-8">
                      No locations match your search
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
