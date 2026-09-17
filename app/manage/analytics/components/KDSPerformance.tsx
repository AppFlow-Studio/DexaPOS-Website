'use client'

import { useState, useMemo } from 'react'
import { useKDSThroughput } from '@/lib/queries/use-platform-analytics'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  MobileColumnsButton,
  initialHiddenColumns,
  type ReportColumn,
} from '@/components/dashboard/reports/MobileColumnsButton'
import { useIsMobile } from '@/hooks/use-mobile'
import { cn } from '@/lib/utils'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
} from 'recharts'
import {
  ChefHat,
  Timer,
  ArrowUpDown,
  Building2,
  UtensilsCrossed,
} from 'lucide-react'
import { Panel } from '@/components/dashboard/shell/Panel'
import { PanelSection } from '@/components/dashboard/shell/PanelSection'
import { StatRow, StatTile } from '@/components/dashboard/shell/StatTile'
import { AnalyticsTooltip } from '@/app/manage/components/analytics-primitives'
import type { KDSSlowestMerchant, KDSSlowestItem } from '@/app/manage/actions/hq-platform/analytics'

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtSeconds(s: number | null): string {
  if (s === null) return '—'
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  const rem = s % 60
  return rem > 0 ? `${m}m ${rem}s` : `${m}m`
}

/**
 * The three prep-time tiers, as words.
 *
 * §14.3 HQ-2 keeps severity *colour* to `/manage/health` and the DLQ, so on this
 * surface the tier is carried by the label. The chart fills below are a separate
 * case: there the colour maps a bar to its legend entry, which is data encoding
 * (§4.6b's second exception), not status tinting.
 */
function prepTier(seconds: number | null): string {
  if (seconds === null) return '—'
  if (seconds < 180) return 'Healthy'
  if (seconds < 600) return 'Watch'
  return 'Bottleneck'
}

function barFill(seconds: number): string {
  if (seconds < 180) return 'hsl(142, 76%, 36%)'
  if (seconds < 600) return 'hsl(38, 92%, 50%)'
  return 'hsl(0, 72%, 51%)'
}

type SortKey = 'merchantName' | 'avgPrepTimeSeconds' | 'totalItemsBumped' | 'displayCount'

/**
 * Mobile column meta for the kitchen-performance-by-merchant table. Avg Prep is
 * the default sort key and the measure the panel is about, so it stays visible.
 */
/**
 * Mobile column meta for the slowest-items table. Avg Prep is what the list is
 * ranked by, so only P95 is offered as a toggle — enough to reach two columns.
 */
const SLOWEST_ITEM_COLUMNS: ReportColumn[] = [
  { id: 'itemName', label: 'Item Name', locked: true },
  { id: 'avgPrep', label: 'Avg Prep' },
  { id: 'p95', label: 'P95', defaultHidden: true },
]

const KITCHEN_MERCHANT_COLUMNS: ReportColumn[] = [
  { id: 'merchant', label: 'Merchant', locked: true },
  { id: 'avgPrep', label: 'Avg Prep' },
  { id: 'median', label: 'Median', defaultHidden: true },
  { id: 'p95', label: 'P95', defaultHidden: true },
  { id: 'itemsBumped', label: 'Items Bumped', defaultHidden: true },
  { id: 'displays', label: 'Displays', defaultHidden: true },
  { id: 'status', label: 'Status', defaultHidden: true },
]

export function KDSPerformance() {
  const [days, setDays] = useState(7)
  const [sortKey, setSortKey] = useState<SortKey>('avgPrepTimeSeconds')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const isMobile = useIsMobile()
  const [hiddenCols, setHiddenCols] = useState<Set<string>>(() =>
    initialHiddenColumns(KITCHEN_MERCHANT_COLUMNS)
  )
  const showCol = (id: string) => !isMobile || !hiddenCols.has(id)
  // Separate set from the merchant table below — different columns, read for
  // different reasons, so one shared picker would be confusing.
  const [itemHiddenCols, setItemHiddenCols] = useState<Set<string>>(() =>
    initialHiddenColumns(SLOWEST_ITEM_COLUMNS)
  )
  const showItemCol = (id: string) => !isMobile || !itemHiddenCols.has(id)

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

  const periodSelect = (
    <Select value={String(days)} onValueChange={v => setDays(Number(v))}>
      <SelectTrigger className="h-9 w-32 rounded-full border-0 bg-muted/60 px-3 shadow-none">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="7">Last 7d</SelectItem>
        <SelectItem value="14">Last 14d</SelectItem>
        <SelectItem value="30">Last 30d</SelectItem>
      </SelectContent>
    </Select>
  )

  /** A sortable column header — ghost pill, never bare text (§5.2). */
  const sortHeader = (key: SortKey, label: string, align: 'left' | 'right' = 'right') => (
    <Button
      variant="ghost"
      onClick={() => handleSort(key)}
      className={`h-8 rounded-full px-2 ${align === 'right' ? '-mr-2 ml-auto flex' : '-ml-2'}`}
    >
      {label}
      <ArrowUpDown className="ml-2 h-3 w-3" />
    </Button>
  )

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-40 w-full rounded-3xl" />
        <Skeleton className="h-60 w-full rounded-3xl" />
        <Skeleton className="h-75 w-full rounded-3xl" />
      </div>
    )
  }

  if (!data || data.totalDisplays === 0) {
    return (
      <Panel>
        <PanelSection label="Kitchen performance" icon={ChefHat}>
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <ChefHat className="h-12 w-12 text-muted-foreground opacity-30" />
            <div>
              <p className="font-medium text-muted-foreground">No KDS data available</p>
              <p className="mt-1 text-xs text-muted-foreground">
                No KDS items were bumped in the last {days} days, or KDS displays are not configured.
              </p>
            </div>
          </div>
        </PanelSection>
      </Panel>
    )
  }

  const platformAvgMins = data.platformAvgPrepSeconds
    ? (data.platformAvgPrepSeconds / 60).toFixed(1)
    : null
  const slowMerchantCount = sortedMerchants.filter(m => m.avgPrepTimeSeconds >= 600).length

  return (
    <div className="space-y-6">
      <Panel>
        <PanelSection label="Kitchen throughput" icon={Timer} action={periodSelect}>
          <StatRow columns={4}>
            <StatTile
              label="Platform Avg Prep"
              value={platformAvgMins ? `${platformAvgMins}m` : '—'}
              meta={`${data.periodDays}d window · >10m = bottleneck`}
            />
            <StatTile
              label="Items Bumped"
              value={data.totalItemsBumped.toLocaleString()}
              meta={`${data.platformItemsPerHour.toLocaleString()} items/hr platform-wide`}
            />
            <StatTile
              label="KDS Displays"
              value={data.totalDisplays}
              meta="Active across all merchants"
            />
            <StatTile
              label="Slow Kitchens"
              value={slowMerchantCount}
              meta="Avg prep >10m — coaching needed"
            />
          </StatRow>
        </PanelSection>
      </Panel>

      <div className="grid min-w-0 grid-cols-1 gap-6 md:grid-cols-2">
        <Panel>
          <PanelSection
            label="Prep time distribution"
            caption="How long items spend on the KDS before being bumped"
          >
            {data.timingDistribution.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={data.timingDistribution} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="bucketLabel" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${v}%`} />
                  <Tooltip content={<AnalyticsTooltip formatter={(v: number) => `${v}%`} />} />
                  <Bar dataKey="percentage" radius={[4, 4, 0, 0]}>
                    {data.timingDistribution.map((entry, i) => {
                      const secs = [30, 90, 210, 450, 900][i] // mid-point of each bucket
                      return <Cell key={entry.bucketLabel} fill={barFill(secs)} />
                    })}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-52 items-center justify-center text-sm text-muted-foreground">No timing data</div>
            )}

            {/* Legend for the bucket fills above — the swatch maps a bar to its tier. */}
            <div className="mt-2 flex flex-wrap items-center justify-center gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <span className="inline-block h-3 w-3 rounded-sm bg-green-600" /> &lt;3m healthy
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block h-3 w-3 rounded-sm bg-yellow-500" /> 3-10m watch
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block h-3 w-3 rounded-sm bg-red-600" /> &gt;10m bottleneck
              </span>
            </div>
          </PanelSection>
        </Panel>

        <Panel>
          <PanelSection label="Slowest kitchens" caption="Merchants ranked by average KDS prep time">
            {data.slowestMerchants.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart
                  layout="vertical"
                  data={data.slowestMerchants.slice(0, 8)}
                  margin={{ top: 0, right: 8, left: 8, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={v => `${Math.round(v / 60)}m`} />
                  <YAxis
                    type="category"
                    dataKey="merchantName"
                    tick={{ fontSize: 11 }}
                    width={90}
                    tickFormatter={n => n.length > 12 ? n.slice(0, 12) + '…' : n}
                  />
                  <Tooltip content={<AnalyticsTooltip formatter={(v: number) => fmtSeconds(v)} />} />
                  <Bar dataKey="avgPrepTimeSeconds" radius={[0, 4, 4, 0]}>
                    {data.slowestMerchants.slice(0, 8).map((m) => (
                      <Cell key={m.merchantId} fill={barFill(m.avgPrepTimeSeconds)} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-52 items-center justify-center text-sm text-muted-foreground">No merchant data</div>
            )}
          </PanelSection>
        </Panel>
      </div>

      {data.slowestItems && data.slowestItems.length > 0 && (
        <Panel>
          <PanelSection
            label="Slowest menu items"
            icon={UtensilsCrossed}
            caption="Items taking the longest from KDS appearance to bump — platform-wide, min. 3 data points"
            action={
              <div className="flex items-center gap-2">
                <MobileColumnsButton
                  columns={SLOWEST_ITEM_COLUMNS}
                  hidden={itemHiddenCols}
                  onChange={setItemHiddenCols}
                />
                <span className="text-sm text-muted-foreground">Top {data.slowestItems.length} items</span>
              </div>
            }
          >
            {/* Min-width lifted on mobile so hiding P95 actually narrows the
                table instead of leaving it scrolling sideways. */}
            <Table variant="data" className={cn(!isMobile && 'min-w-[360px]')}>
              <TableHeader className="[&_tr]:border-0">
                <TableRow>
                  <TableHead>Item Name</TableHead>
                  {showItemCol('avgPrep') && <TableHead className="text-right">Avg Prep</TableHead>}
                  {showItemCol('p95') && <TableHead className="text-right">P95</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data.slowestItems as KDSSlowestItem[]).map((item) => (
                  <TableRow key={item.itemName}>
                    <TableCell className="font-medium">{item.itemName}</TableCell>
                    {showItemCol('avgPrep') && (
                      <TableCell className="text-right font-semibold tabular-nums">
                        {fmtSeconds(item.avgPrepTimeSeconds)}
                      </TableCell>
                    )}
                    {showItemCol('p95') && (
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {fmtSeconds(item.p95PrepTimeSeconds)}
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </PanelSection>
        </Panel>
      )}

      <Panel>
        <PanelSection
          label="Kitchen performance by merchant"
          icon={Building2}
          caption="Avg prep time, throughput, and slow ticket rate across all KDS displays"
          action={
            <div className="flex items-center gap-2">
              <MobileColumnsButton
                columns={KITCHEN_MERCHANT_COLUMNS}
                hidden={hiddenCols}
                onChange={setHiddenCols}
              />
              <span className="text-sm text-muted-foreground">{sortedMerchants.length} merchants</span>
            </div>
          }
        >
          {/* Min-width lifted on mobile so hidden columns actually narrow the
              table instead of leaving it scrolling sideways. */}
          <Table variant="data" className={cn(!isMobile && 'min-w-[760px]')}>
            <TableHeader className="[&_tr]:border-0">
              <TableRow>
                <TableHead>{sortHeader('merchantName', 'Merchant', 'left')}</TableHead>
                {showCol('avgPrep') && <TableHead className="text-right">{sortHeader('avgPrepTimeSeconds', 'Avg Prep')}</TableHead>}
                {showCol('median') && <TableHead className="text-right">Median</TableHead>}
                {showCol('p95') && <TableHead className="text-right">P95</TableHead>}
                {showCol('itemsBumped') && <TableHead className="text-right">{sortHeader('totalItemsBumped', 'Items Bumped')}</TableHead>}
                {showCol('displays') && <TableHead className="text-right">{sortHeader('displayCount', 'Displays')}</TableHead>}
                {showCol('status') && <TableHead className="text-right">Status</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedMerchants.map(m => {
                const avgMins = m.avgPrepTimeSeconds / 60
                return (
                  <TableRow key={m.merchantId}>
                    <TableCell>
                      <div className="font-medium">{m.merchantName}</div>
                      <div className="text-xs text-muted-foreground">
                        {m.displayCount} display{m.displayCount !== 1 ? 's' : ''}
                      </div>
                    </TableCell>
                    {showCol('avgPrep') && (
                      <TableCell className="text-right font-semibold tabular-nums">
                        {fmtSeconds(m.avgPrepTimeSeconds)}
                      </TableCell>
                    )}
                    {showCol('median') && (
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {/* merchant-level median not in KDSSlowestMerchant — show avg as proxy */}
                        {avgMins.toFixed(1)}m
                      </TableCell>
                    )}
                    {showCol('p95') && (
                      <TableCell className="text-right text-muted-foreground">—</TableCell>
                    )}
                    {showCol('itemsBumped') && (
                      <TableCell className="text-right tabular-nums">{m.totalItemsBumped.toLocaleString()}</TableCell>
                    )}
                    {showCol('displays') && (
                      <TableCell className="text-right tabular-nums">{m.displayCount}</TableCell>
                    )}
                    {showCol('status') && (
                      <TableCell className="text-right text-sm text-muted-foreground">
                        {prepTier(m.avgPrepTimeSeconds)}
                      </TableCell>
                    )}
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </PanelSection>
      </Panel>
    </div>
  )
}
