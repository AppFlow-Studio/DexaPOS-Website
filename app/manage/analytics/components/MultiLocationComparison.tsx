'use client'

import { useState, useMemo } from 'react'
import { useMultiLocationComparison } from '@/lib/queries/use-platform-analytics'
import { Panel } from '@/components/dashboard/shell/Panel'
import { PanelSection } from '@/components/dashboard/shell/PanelSection'
import { StatRow, StatTile } from '@/components/dashboard/shell/StatTile'
import { AnalyticsTooltip, VALUE_AXIS_WIDTH_MOBILE } from '@/app/manage/components/analytics-primitives'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  MobileColumnsButton,
  initialHiddenColumns,
  type ReportColumn,
} from '@/components/dashboard/reports/MobileColumnsButton'
import { useIsMobile } from '@/hooks/use-mobile'
import { cn } from '@/lib/utils'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
} from 'recharts'
import {
  MapPin, ArrowUpRight, ArrowDownRight, Trophy,
  Search, Users, Monitor,
} from 'lucide-react'
import type { LocationMetrics, SparklinePoint } from '@/app/manage/actions/hq-platform/analytics'

/**
 * Mobile column meta for the "All locations" table.
 *
 * Rank and Location stay locked so a narrowed table still says which location
 * each row is; GPV is the metric the table is ranked by, so it is the one
 * number kept by default. Everything else starts hidden, giving the two-column
 * start the table needs to fit a phone without horizontal scrolling.
 */
const ALL_LOCATIONS_COLUMNS: ReportColumn[] = [
  { id: 'location', label: 'Location', locked: true },
  { id: 'merchant', label: 'Merchant', defaultHidden: true },
  { id: 'gpv', label: 'GPV' },
  { id: 'vsAvg', label: 'vs Avg', defaultHidden: true },
  { id: 'orders', label: 'Orders', defaultHidden: true },
  { id: 'avgOrder', label: 'Avg Order', defaultHidden: true },
  { id: 'voidRate', label: 'Void %', defaultHidden: true },
  { id: 'staff', label: 'Staff', defaultHidden: true },
  { id: 'devices', label: 'Devices', defaultHidden: true },
  { id: 'vsPrev', label: 'vs Prev', defaultHidden: true },
  { id: 'trend', label: '7d Trend', defaultHidden: true },
]

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtGPV(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}k`
  return `$${n.toFixed(2)}`
}

/**
 * Direction is carried by the arrow glyph, not a tint — the icon already states
 * up or down, so the colour was a second encoding of the same fact.
 */
function TrendChip({ pct }: { pct: number | null }) {
  if (pct === null) return <span className="text-xs text-muted-foreground">—</span>
  const isPos = pct >= 0
  return (
    <span className="flex items-center justify-end gap-0.5 text-xs font-medium tabular-nums">
      {isPos ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
      {pct > 0 ? '+' : ''}{pct}%
    </span>
  )
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

  // The line's shape shows the trend; `currentColor` keeps it on the text
  // colour so it stays legible in both themes without encoding status.
  return (
    <svg width={W} height={H} className="overflow-visible text-muted-foreground" aria-hidden>
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}

// ── Main Component ───────────────────────────────────────────────────────────

export function MultiLocationComparison() {
  const [days, setDays] = useState(30)
  const [search, setSearch] = useState('')
  const [selectedMerchantId, setSelectedMerchantId] = useState<string>('all')
  const isMobile = useIsMobile()
  const [hiddenCols, setHiddenCols] = useState<Set<string>>(() =>
    initialHiddenColumns(ALL_LOCATIONS_COLUMNS)
  )
  // Hiding is mobile-only: on desktop every column fits, and the picker is
  // `md:hidden`, so the two must agree or desktop would keep stale hides.
  const showCol = (id: string) => !isMobile || !hiddenCols.has(id)
  // Keeps the empty-state cell spanning the full width as columns are toggled.
  const visibleColCount = ALL_LOCATIONS_COLUMNS.filter(c => showCol(c.id)).length
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
              <YAxis tick={{ fontSize: 11 }} tickFormatter={v => fmtGPV(v)} width={isMobile ? VALUE_AXIS_WIDTH_MOBILE : undefined} />
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
            // `flex-wrap` + `min-w-0`: the row sits in PanelSection's header,
            // which lets it shrink. A rigid `w-52` input in a non-wrapping row
            // could not, so on a phone the field ran past the panel's rounded
            // edge and its right half was clipped. The input now takes the
            // full remaining width and drops below the Columns button when
            // there isn't enough, capped at its old 13rem on wider screens.
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <MobileColumnsButton
                columns={ALL_LOCATIONS_COLUMNS}
                hidden={hiddenCols}
                onChange={setHiddenCols}
              />
              <div className="relative min-w-0 flex-1 sm:max-w-52">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/50" />
                <Input
                  placeholder="Filter location or merchant…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="h-9 w-full rounded-full pl-9"
                />
              </div>
            </div>
          }
        >
          <div className="max-h-96 overflow-auto">
            {/* The min-width is what forces horizontal scrolling, so it has to
                lift on mobile — otherwise hiding columns just widens the gaps
                and the table still scrolls sideways. */}
            <Table variant="data" className={cn(!isMobile && 'min-w-[1120px]')}>
              <TableHeader className="[&_tr]:border-0">
                <TableRow>
                  <TableHead>Location</TableHead>
                  {showCol('merchant') && <TableHead>Merchant</TableHead>}
                  {showCol('gpv') && <TableHead className="text-right">GPV</TableHead>}
                  {showCol('vsAvg') && <TableHead>vs Avg</TableHead>}
                  {showCol('orders') && <TableHead className="text-right">Orders</TableHead>}
                  {showCol('avgOrder') && <TableHead className="text-right">Avg Order</TableHead>}
                  {showCol('voidRate') && <TableHead className="text-right">Void %</TableHead>}
                  {showCol('staff') && (
                    <TableHead className="text-right">
                      <span className="flex items-center justify-end gap-1">
                        <Users className="h-3 w-3" /> Staff
                      </span>
                    </TableHead>
                  )}
                  {showCol('devices') && (
                    <TableHead className="text-right">
                      <span className="flex items-center justify-end gap-1">
                        <Monitor className="h-3 w-3" /> Devices
                      </span>
                    </TableHead>
                  )}
                  {showCol('vsPrev') && <TableHead className="text-right">vs Prev</TableHead>}
                  {showCol('trend') && <TableHead className="text-right">7d Trend</TableHead>}
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
                      <TableCell className="max-w-40">
                        <div className="flex items-center gap-1.5">
                          <MapPin className="h-3 w-3 shrink-0 text-muted-foreground" />
                          <span className="truncate font-medium" title={loc.locationName}>{loc.locationName}</span>
                        </div>
                      </TableCell>
                      {showCol('merchant') && (
                        <TableCell className="max-w-32 text-muted-foreground">
                          <span className="block truncate" title={loc.merchantName}>{loc.merchantName}</span>
                        </TableCell>
                      )}
                      {showCol('gpv') && (
                        <TableCell className="text-right">
                          <p className="font-semibold tabular-nums">{fmtGPV(loc.totalGPV)}</p>
                        </TableCell>
                      )}
                      {showCol('vsAvg') && (
                        <TableCell className="tabular-nums text-muted-foreground">
                          {vsAvgPct >= 0 ? '+' : ''}{vsAvgPct}% avg
                        </TableCell>
                      )}
                      {showCol('orders') && (
                        <TableCell className="text-right tabular-nums">{loc.orderCount.toLocaleString()}</TableCell>
                      )}
                      {showCol('avgOrder') && (
                        <TableCell className="text-right tabular-nums">${loc.avgOrderValue.toFixed(2)}</TableCell>
                      )}
                      {showCol('voidRate') && (
                        <TableCell className="text-right tabular-nums">
                          {loc.voidRate > 0 ? (
                            <span className={loc.voidRate > 5 ? 'font-medium' : 'text-muted-foreground'}>
                              {loc.voidRate}%
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                      )}
                      {showCol('staff') && (
                        <TableCell className="text-right tabular-nums">
                          {loc.staffCount > 0
                            ? loc.staffCount
                            : <span className="text-muted-foreground">—</span>}
                        </TableCell>
                      )}
                      {showCol('devices') && (
                        <TableCell className="text-right tabular-nums">
                          {loc.deviceCount > 0
                            ? loc.deviceCount
                            : <span className="text-muted-foreground">—</span>}
                        </TableCell>
                      )}
                      {showCol('vsPrev') && (
                        <TableCell>
                          <TrendChip pct={loc.trendVsPrev} />
                        </TableCell>
                      )}
                      {showCol('trend') && (
                        <TableCell className="text-right">
                          <MiniSparkline data={loc.sparkline ?? []} />
                        </TableCell>
                      )}
                    </TableRow>
                  )
                })}
                {filteredLocations.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={visibleColCount} className="h-24 text-center text-muted-foreground">
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
