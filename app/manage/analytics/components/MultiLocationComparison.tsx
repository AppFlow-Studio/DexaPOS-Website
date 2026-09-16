'use client'

import { useState, useMemo } from 'react'
import { useMultiLocationComparison } from '@/lib/queries/use-platform-analytics'
import { Panel } from '@/components/dashboard/shell/Panel'
import { PanelSection } from '@/components/dashboard/shell/PanelSection'
import { StatRow, StatTile } from '@/components/dashboard/shell/StatTile'
import { AnalyticsTooltip } from '@/app/manage/components/analytics-primitives'
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
  TrendingDown, Search, Building2, Users, Monitor,
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
    <div className="flex items-center gap-2 w-24">
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
      <div className="space-y-6">
        <Skeleton className="h-40 w-full rounded-3xl" />
        <Skeleton className="h-72 w-full rounded-3xl" />
        <Skeleton className="h-64 w-full rounded-3xl" />
      </div>
    )
  }

  if (!data || data.locations.length === 0) {
    return (
      <Panel>
        <PanelSection label="Location comparison" icon={MapPin}>
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-center text-muted-foreground">
            <MapPin className="h-12 w-12 opacity-25" />
            <p className="font-medium">No location data available</p>
            <p className="text-sm">No locations with transaction activity in the selected period.</p>
          </div>
        </PanelSection>
      </Panel>
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
          <Panel>
            <PanelSection
              label="Location comparison"
              icon={MapPin}
              caption={
                selectedMerchantId === 'all'
                  ? `Showing ${data.totalLocations} locations across all merchants`
                  : `Showing ${filteredLocations.length} locations for selected merchant`
              }
              action={
                <div className="flex flex-wrap items-center gap-2">
                  <Select
                    value={selectedMerchantId}
                    onValueChange={v => { setSelectedMerchantId(v); setSearch('') }}
                  >
                    <SelectTrigger className="h-9 w-52 rounded-full border-0 bg-muted/60 px-3 shadow-none">
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
                </div>
              }
            >
              <StatRow columns={4}>
                <StatTile
                  label="Locations Shown"
                  value={filteredLocations.length}
                  meta={selectedMerchantId === 'all' ? `of ${data.totalLocations} total` : undefined}
                />
                <StatTile label="Avg GPV / Location" value={fmtGPV(avgVisible)} />
                <StatTile
                  label="Top Location"
                  icon={<Trophy />}
                  value={
                    <span className="block truncate" title={topVisible?.locationName}>
                      {topVisible?.locationName ?? '—'}
                    </span>
                  }
                  meta={fmtGPV(topVisible?.totalGPV ?? 0)}
                />
                <StatTile label="Median GPV" value={fmtGPV(medianVisible)} />
              </StatRow>
            </PanelSection>
          </Panel>
        )
      })()}

      <Panel>
        <PanelSection
          label={`Top ${Math.min(15, filteredLocations.length)} locations by GPV`}
          caption={`Last ${days} days${selectedMerchantId !== 'all' ? ` · ${multiLocationMerchants.find(m => m.id === selectedMerchantId)?.name}` : ''}`}
        >
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
              <Tooltip content={<AnalyticsTooltip formatter={(v: number) => fmtGPV(v)} />} />
              <Bar dataKey="gpv" radius={[4, 4, 0, 0]}>
                {chartData.map((entry, i) => (
                  <Cell key={i} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </PanelSection>
      </Panel>

      <Panel>
        <PanelSection
          label="All locations"
          caption={`Ranked by GPV — vs. prior ${days}-day period`}
          action={
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/50" />
              <Input
                placeholder="Filter location or merchant…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="h-9 w-52 rounded-full pl-9"
              />
            </div>
          }
        >
          <div className="max-h-96 overflow-auto">
            <Table variant="data" className="min-w-[1120px]">
              <TableHeader className="[&_tr]:border-0">
                <TableRow>
                  <TableHead className="w-10">#</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Merchant</TableHead>
                  <TableHead className="text-right">GPV</TableHead>
                  <TableHead>vs Avg</TableHead>
                  <TableHead className="text-right">Orders</TableHead>
                  <TableHead className="text-right">Avg Order</TableHead>
                  <TableHead className="text-right">Void %</TableHead>
                  <TableHead className="text-right">
                    <span className="flex items-center justify-end gap-1">
                      <Users className="h-3 w-3" /> Staff
                    </span>
                  </TableHead>
                  <TableHead className="text-right">
                    <span className="flex items-center justify-end gap-1">
                      <Monitor className="h-3 w-3" /> Devices
                    </span>
                  </TableHead>
                  <TableHead className="text-right">vs Prev</TableHead>
                  <TableHead className="text-right">7d Trend</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredLocations.map((loc: LocationMetrics) => {
                  const diff = loc.totalGPV - data.avgGPVPerLocation
                  const vsAvgPct = data.avgGPVPerLocation > 0
                    ? Math.round((diff / data.avgGPVPerLocation) * 100)
                    : 0
                  return (
                    <TableRow key={loc.locationId}>
                      <TableCell className="text-center">
                        <RankBadge rank={loc.gpvRank} total={data.totalLocations} />
                      </TableCell>
                      <TableCell className="max-w-40">
                        <div className="flex items-center gap-1.5">
                          <MapPin className="h-3 w-3 shrink-0 text-muted-foreground" />
                          <span className="truncate font-medium" title={loc.locationName}>{loc.locationName}</span>
                        </div>
                      </TableCell>
                      <TableCell className="max-w-32 text-muted-foreground">
                        <span className="block truncate" title={loc.merchantName}>{loc.merchantName}</span>
                      </TableCell>
                      <TableCell className="text-right">
                        <p className="font-semibold tabular-nums">{fmtGPV(loc.totalGPV)}</p>
                        <PerformanceBar value={loc.totalGPV} max={topGPV} />
                      </TableCell>
                      <TableCell className="tabular-nums text-muted-foreground">
                        {vsAvgPct >= 0 ? '+' : ''}{vsAvgPct}% avg
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{loc.orderCount.toLocaleString()}</TableCell>
                      <TableCell className="text-right tabular-nums">${loc.avgOrderValue.toFixed(2)}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {loc.voidRate > 0 ? (
                          <span className={loc.voidRate > 5 ? 'font-medium' : 'text-muted-foreground'}>
                            {loc.voidRate}%
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {loc.staffCount > 0
                          ? loc.staffCount
                          : <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {loc.deviceCount > 0
                          ? loc.deviceCount
                          : <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell>
                        <TrendChip pct={loc.trendVsPrev} />
                      </TableCell>
                      <TableCell className="text-right">
                        <MiniSparkline data={loc.sparkline ?? []} />
                      </TableCell>
                    </TableRow>
                  )
                })}
                {filteredLocations.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={12} className="h-24 text-center text-muted-foreground">
                      No locations match your search
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </PanelSection>
      </Panel>
    </div>
  )
}
