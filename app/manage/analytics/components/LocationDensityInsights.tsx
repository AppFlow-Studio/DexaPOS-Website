'use client'

import { MapPin, Globe, TrendingUp, AlertTriangle } from 'lucide-react'
import { Panel } from '@/components/dashboard/shell/Panel'
import { PanelSection } from '@/components/dashboard/shell/PanelSection'
import { StatRow, StatTile } from '@/components/dashboard/shell/StatTile'
import { AnalyticsTooltip, valueAxisWidthMobile } from '@/app/manage/components/analytics-primitives'
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer,
} from 'recharts'
import { useLocationDensity } from '@/lib/queries/use-platform-analytics'
import type { LocationDensityState } from '@/app/manage/actions/hq-platform/analytics'
import { useMemo, useState } from 'react'

// ── Formatters ────────────────────────────────────────────────────────────────

function fmtGPV(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}k`
  if (n === 0) return '—'
  return `$${n.toFixed(2)}`
}

// ── US State Tile Grid ────────────────────────────────────────────────────────
// Approximate geographic arrangement: 8 rows × 12 cols (0-indexed)

const STATE_GRID: Record<string, { row: number; col: number; name: string }> = {
  // Row 0 — far corners
  AK: { row: 0, col: 0,  name: 'Alaska' },
  ME: { row: 0, col: 11, name: 'Maine' },
  // Row 1 — upper New England
  VT: { row: 1, col: 10, name: 'Vermont' },
  NH: { row: 1, col: 11, name: 'New Hampshire' },
  // Row 2 — northern tier
  WA: { row: 2, col: 0,  name: 'Washington' },
  ID: { row: 2, col: 1,  name: 'Idaho' },
  MT: { row: 2, col: 2,  name: 'Montana' },
  ND: { row: 2, col: 3,  name: 'North Dakota' },
  MN: { row: 2, col: 4,  name: 'Minnesota' },
  WI: { row: 2, col: 5,  name: 'Wisconsin' },
  MI: { row: 2, col: 6,  name: 'Michigan' },
  NY: { row: 2, col: 8,  name: 'New York' },
  MA: { row: 2, col: 10, name: 'Massachusetts' },
  RI: { row: 2, col: 11, name: 'Rhode Island' },
  // Row 3 — upper mid
  OR: { row: 3, col: 0,  name: 'Oregon' },
  NV: { row: 3, col: 1,  name: 'Nevada' },
  WY: { row: 3, col: 2,  name: 'Wyoming' },
  SD: { row: 3, col: 3,  name: 'South Dakota' },
  IA: { row: 3, col: 4,  name: 'Iowa' },
  IL: { row: 3, col: 5,  name: 'Illinois' },
  IN: { row: 3, col: 6,  name: 'Indiana' },
  OH: { row: 3, col: 7,  name: 'Ohio' },
  PA: { row: 3, col: 8,  name: 'Pennsylvania' },
  NJ: { row: 3, col: 9,  name: 'New Jersey' },
  CT: { row: 3, col: 10, name: 'Connecticut' },
  // Row 4 — mid tier
  CA: { row: 4, col: 0,  name: 'California' },
  UT: { row: 4, col: 1,  name: 'Utah' },
  CO: { row: 4, col: 2,  name: 'Colorado' },
  NE: { row: 4, col: 3,  name: 'Nebraska' },
  MO: { row: 4, col: 4,  name: 'Missouri' },
  KY: { row: 4, col: 5,  name: 'Kentucky' },
  WV: { row: 4, col: 6,  name: 'West Virginia' },
  VA: { row: 4, col: 7,  name: 'Virginia' },
  MD: { row: 4, col: 8,  name: 'Maryland' },
  DE: { row: 4, col: 9,  name: 'Delaware' },
  // Row 5 — lower mid
  AZ: { row: 5, col: 1,  name: 'Arizona' },
  NM: { row: 5, col: 2,  name: 'New Mexico' },
  KS: { row: 5, col: 3,  name: 'Kansas' },
  AR: { row: 5, col: 4,  name: 'Arkansas' },
  TN: { row: 5, col: 5,  name: 'Tennessee' },
  NC: { row: 5, col: 6,  name: 'North Carolina' },
  SC: { row: 5, col: 7,  name: 'South Carolina' },
  DC: { row: 5, col: 9,  name: 'D.C.' },
  // Row 6 — south
  OK: { row: 6, col: 3,  name: 'Oklahoma' },
  LA: { row: 6, col: 4,  name: 'Louisiana' },
  MS: { row: 6, col: 5,  name: 'Mississippi' },
  AL: { row: 6, col: 6,  name: 'Alabama' },
  GA: { row: 6, col: 7,  name: 'Georgia' },
  FL: { row: 6, col: 8,  name: 'Florida' },
  // Row 7 — southernmost
  HI: { row: 7, col: 0,  name: 'Hawaii' },
  TX: { row: 7, col: 3,  name: 'Texas' },
}

const GRID_ROWS = 8
const GRID_COLS = 12

// ── Color tier helper ─────────────────────────────────────────────────────────
// Returns Tailwind classes for a cell based on its location count vs platform max.

function getStateCellClasses(count: number, maxCount: number, isGap: boolean): string {
  const base = 'flex flex-col items-center justify-center rounded border transition-colors duration-150 cursor-default select-none'

  if (isGap) {
    return `${base} bg-red-50 border-red-200 text-red-400 dark:bg-red-950/30 dark:border-red-800 dark:text-red-500`
  }

  if (count === 0) {
    // State not in data at all (shouldn't happen, but fallback)
    return `${base} bg-muted/20 border-border/30 text-muted-foreground/40`
  }

  const ratio = maxCount > 0 ? count / maxCount : 0

  if (ratio <= 0.15) return `${base} bg-primary/10 border-primary/20 text-foreground`
  if (ratio <= 0.30) return `${base} bg-primary/20 border-primary/30 text-foreground`
  if (ratio <= 0.50) return `${base} bg-primary/35 border-primary/45 text-foreground`
  if (ratio <= 0.70) return `${base} bg-primary/55 border-primary/65 text-primary-foreground`
  if (ratio <= 0.85) return `${base} bg-primary/75 border-primary/80 text-primary-foreground`
  return `${base} bg-primary border-primary text-primary-foreground`
}

// ── Legend tiers ──────────────────────────────────────────────────────────────

const LEGEND_TIERS = [
  { label: 'No presence',  classes: 'bg-red-100 border-red-300 dark:bg-red-950/40 dark:border-red-800' },
  { label: '1–2',          classes: 'bg-primary/10 border-primary/25' },
  { label: '3–8',          classes: 'bg-primary/25 border-primary/40' },
  { label: '9–20',         classes: 'bg-primary/45 border-primary/55' },
  { label: '21–50',        classes: 'bg-primary/65 border-primary/75' },
  { label: '51+',          classes: 'bg-primary border-primary' },
]

// ============================================================================
// USChoropleth sub-component
// ============================================================================

interface USChoroplethProps {
  byState: LocationDensityState[]
  coverageGaps: string[]
}

function USChoropleth({ byState, coverageGaps }: USChoroplethProps) {
  const locationMap = useMemo(() => {
    const map: Record<string, LocationDensityState> = {}
    byState.forEach(s => { map[s.state] = s })
    return map
  }, [byState])

  const maxCount = useMemo(
    () => Math.max(...byState.map(s => s.locationCount), 1),
    [byState],
  )

  const gapSet = useMemo(() => new Set(coverageGaps), [coverageGaps])

  return (
    <div className="space-y-3">
      <TooltipProvider delayDuration={0}>
        {/* Grid */}
        <div
          className="grid gap-1 w-full"
          style={{
            gridTemplateColumns: `repeat(${GRID_COLS}, minmax(0, 1fr))`,
            gridTemplateRows: `repeat(${GRID_ROWS}, 1fr)`,
          }}
        >
          {/* Empty placeholder cells to fill the full grid */}
          {Array.from({ length: GRID_ROWS * GRID_COLS }).map((_, i) => {
            const row = Math.floor(i / GRID_COLS)
            const col = i % GRID_COLS
            // Check if any state occupies this cell
            const entry = Object.entries(STATE_GRID).find(
              ([, v]) => v.row === row && v.col === col,
            )
            if (!entry) {
              return (
                <div
                  key={i}
                  style={{ gridRow: row + 1, gridColumn: col + 1 }}
                />
              )
            }

            const [code, { name }] = entry
            const data = locationMap[code]
            const count = data?.locationCount ?? 0
            const isGap = gapSet.has(code)

            return (
              <Tooltip key={code}>
                <TooltipTrigger asChild>
                  <div
                    style={{ gridRow: row + 1, gridColumn: col + 1 }}
                    className={`${getStateCellClasses(count, maxCount, isGap)} aspect-square`}
                  >
                    <span className="text-[10px] font-bold leading-none">{code}</span>
                    {count > 0 && (
                      <span className="text-[8px] leading-none mt-0.5 opacity-80">{count}</span>
                    )}
                  </div>
                </TooltipTrigger>
                <TooltipContent side="top" className="space-y-1">
                  <p className="font-semibold text-sm">{name}</p>
                  {isGap ? (
                    // No tint: inherits the tooltip's own foreground, so it stays
                    // legible on the dark surface in either theme.
                    <p className="text-xs">No locations — sales whitespace</p>
                  ) : count > 0 ? (
                    <>
                      <p className="text-xs">
                        <span className="font-medium">{count}</span> location{count !== 1 ? 's' : ''}
                        {' · '}
                        <span className="font-medium">{data?.merchantCount ?? 0}</span> merchant{(data?.merchantCount ?? 0) !== 1 ? 's' : ''}
                      </p>
                      {(data?.gpv30d ?? 0) > 0 && (
                        <p className="text-xs text-muted-foreground">
                          30d GPV: <span className="font-medium text-foreground">{fmtGPV(data!.gpv30d)}</span>
                        </p>
                      )}
                      {data?.topCities && data.topCities.length > 0 && (
                        <p className="text-xs text-muted-foreground">
                          Top: {data.topCities.slice(0, 2).join(', ')}
                        </p>
                      )}
                    </>
                  ) : (
                    <p className="text-xs text-muted-foreground">No data</p>
                  )}
                </TooltipContent>
              </Tooltip>
            )
          })}
        </div>
      </TooltipProvider>

      {/* Legend */}
      <div className="flex items-center gap-3 flex-wrap pt-1">
        <span className="text-xs text-muted-foreground">Locations:</span>
        {LEGEND_TIERS.map(({ label, classes }) => (
          <div key={label} className="flex items-center gap-1">
            <div className={`w-4 h-4 rounded border ${classes}`} />
            <span className="text-xs text-muted-foreground">{label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ============================================================================
// COMPONENT
// ============================================================================

/**
 * Mobile column meta for the two geography tables. Both are read as "where are
 * we concentrated", so Locations — the count each is sorted by — is the number
 * kept beside the place name.
 */
const STATE_BREAKDOWN_COLUMNS: ReportColumn[] = [
  { id: 'state', label: 'State', locked: true },
  { id: 'locations', label: 'Locations' },
  { id: 'merchants', label: 'Merchants', defaultHidden: true },
  { id: 'gpv', label: '30d GPV', defaultHidden: true },
  { id: 'topCities', label: 'Top Cities', defaultHidden: true },
]

const TOP_CITY_COLUMNS: ReportColumn[] = [
  { id: 'city', label: 'City', locked: true },
  { id: 'state', label: 'State', defaultHidden: true },
  { id: 'locations', label: 'Locations' },
  { id: 'merchants', label: 'Merchants', defaultHidden: true },
  { id: 'gpv', label: '30d GPV', defaultHidden: true },
]

export function LocationDensityInsights() {
  const { data, isLoading } = useLocationDensity()
  const isMobile = useIsMobile()
  const [stateHiddenCols, setStateHiddenCols] = useState<Set<string>>(() =>
    initialHiddenColumns(STATE_BREAKDOWN_COLUMNS)
  )
  const showStateCol = (id: string) => !isMobile || !stateHiddenCols.has(id)
  const [cityHiddenCols, setCityHiddenCols] = useState<Set<string>>(() =>
    initialHiddenColumns(TOP_CITY_COLUMNS)
  )
  const showCityCol = (id: string) => !isMobile || !cityHiddenCols.has(id)
  // Above the loading/empty early returns, like the other hooks.
  const cityPage = useClientPagination(data?.byCity ?? [])

  if (isLoading) {
    // Built from the same Panel/PanelSection/StatRow primitives as the loaded
    // view rather than from loose rectangles: the headings, captions and tile
    // labels are known before the data arrives, so they render for real and
    // only the figures are skeletons. A hand-sized `h-24`/`h-64` stack drifts
    // from the real layout every time either one changes — this cannot.
    return (
      <div className="space-y-6">
        <Panel>
          <PanelSection label="Location footprint" icon={MapPin}>
            <StatRow columns={4}>
              <StatTile isLoading label="Total Locations" icon={<MapPin />} value={null} meta="Active across the platform" />
              <StatTile isLoading label="States Covered" icon={<Globe />} value={null} meta="Including D.C." />
              <StatTile isLoading label="Whitespace States" icon={<AlertTriangle />} value={null} meta="States with no presence" />
              <StatTile isLoading label="Top State" icon={<TrendingUp />} value={null} />
            </StatRow>
          </PanelSection>
        </Panel>

        <Panel>
          <PanelSection
            label="Geographic distribution"
            caption="Location density by state — hover for details · red = no presence (sales whitespace)"
          >
            {/* Mirrors USChoropleth: the same 12×8 aspect-square tile grid and
                the same legend row beneath it. */}
            <div className="space-y-3">
              <div
                className="grid w-full gap-1"
                style={{
                  gridTemplateColumns: `repeat(${GRID_COLS}, minmax(0, 1fr))`,
                  gridTemplateRows: `repeat(${GRID_ROWS}, 1fr)`,
                }}
              >
                {Array.from({ length: GRID_ROWS * GRID_COLS }).map((_, i) => {
                  const row = Math.floor(i / GRID_COLS)
                  const col = i % GRID_COLS
                  const occupied = Object.values(STATE_GRID).some(v => v.row === row && v.col === col)
                  return occupied ? (
                    <Skeleton key={i} className="aspect-square rounded" />
                  ) : (
                    <div key={i} />
                  )
                })}
              </div>
              <div className="flex flex-wrap items-center gap-3 pt-1">
                <span className="text-xs text-muted-foreground">Locations:</span>
                {LEGEND_TIERS.map(({ label }) => (
                  <div key={label} className="flex items-center gap-1">
                    <Skeleton className="h-4 w-4 rounded" />
                    <span className="text-xs text-muted-foreground">{label}</span>
                  </div>
                ))}
              </div>
            </div>
          </PanelSection>
        </Panel>

        <Panel>
          <PanelSection
            label="Top 10 states by location count"
            caption="Active locations per state — highest concentration markets"
          >
            <Skeleton className="h-60 w-full" />
          </PanelSection>
        </Panel>

        <div className="grid gap-4 lg:grid-cols-3">
          <Panel className="lg:col-span-2">
            <PanelSection label="State breakdown" caption="All represented states sorted by location count">
              <div className="space-y-3">
                {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}
              </div>
            </PanelSection>
          </Panel>

          <Panel>
            <PanelSection label="Coverage gaps" caption="States with zero active locations — sales targets">
              <div className="flex flex-wrap gap-1.5">
                {[...Array(14)].map((_, i) => <Skeleton key={i} className="h-5 w-10 rounded-full" />)}
              </div>
            </PanelSection>
          </Panel>
        </div>

        <Panel>
          <PanelSection label="Top cities" caption="Highest concentration markets by city — top 20">
            <div className="space-y-3">
              {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}
            </div>
          </PanelSection>
        </Panel>
      </div>
    )
  }

  if (!data || data.totalLocations === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
        <MapPin className="h-12 w-12 opacity-25" />
        <p className="font-medium">No location data available</p>
        <p className="text-sm">No active locations found on the platform.</p>
      </div>
    )
  }

  const topStateEntry = data.byState[0]
  const chartData = data.byState.slice(0, 10).map(s => ({
    state: s.state,
    locations: s.locationCount,
    merchants: s.merchantCount,
  }))

  return (
    <div className="space-y-6">

      <Panel>
        <PanelSection label="Location footprint" icon={MapPin}>
          <StatRow columns={4}>
            <StatTile
              label="Total Locations"
              icon={<MapPin />}
              value={data.totalLocations.toLocaleString()}
              meta="Active across the platform"
            />
            <StatTile
              label="States Covered"
              icon={<Globe />}
              value={
                <>
                  {data.totalStates}{' '}
                  <span className="text-base font-normal text-muted-foreground">/ 51</span>
                </>
              }
              meta="Including D.C."
            />
            <StatTile
              label="Whitespace States"
              icon={<AlertTriangle />}
              value={data.coverageGaps.length}
              meta="States with no presence"
            />
            <StatTile
              label="Top State"
              icon={<TrendingUp />}
              value={topStateEntry?.stateName || '—'}
              meta={topStateEntry ? `${topStateEntry.locationCount} location${topStateEntry.locationCount !== 1 ? 's' : ''}` : undefined}
            />
          </StatRow>
        </PanelSection>
      </Panel>

      <Panel>
        <PanelSection
          label="Geographic distribution"
          caption="Location density by state — hover for details · red = no presence (sales whitespace)"
        >
          <USChoropleth byState={data.byState} coverageGaps={data.coverageGaps} />
        </PanelSection>
      </Panel>

      <Panel>
        <PanelSection
          label="Top 10 states by location count"
          caption="Active locations per state — highest concentration markets"
        >
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={chartData} margin={{ bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="state" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 11 }} allowDecimals={false} width={isMobile ? valueAxisWidthMobile(3) : undefined} />
              <RechartsTooltip content={<AnalyticsTooltip />} />
              {/* `var(--chart-1)` bare, never `hsl(var(--chart-1))` (C2): the
                  token is already an `oklch()` colour, so wrapping it in `hsl()`
                  produced invalid CSS and the bars fell back to black. */}
              <Bar dataKey="locations" name="Locations" fill="var(--chart-1)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </PanelSection>
      </Panel>

      {/* ── State Breakdown Table + Coverage Gaps ────────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-3">

        {/* State table */}
        <Panel className="lg:col-span-2">
          <PanelSection
            label="State breakdown"
            caption="All represented states sorted by location count"
            action={
              <MobileColumnsButton
                columns={STATE_BREAKDOWN_COLUMNS}
                hidden={stateHiddenCols}
                onChange={setStateHiddenCols}
              />
            }
          >
            <div className="max-h-80 overflow-auto">
              {/* Min-width lifted on mobile so hidden columns actually narrow the
                  table instead of leaving it scrolling sideways. */}
              <Table variant="data" className={cn(!isMobile && 'min-w-[620px]')}>
                <TableHeader className="[&_tr]:border-0">
                  <TableRow>
                    <TableHead>State</TableHead>
                    {showStateCol('locations') && <TableHead className="text-right">Locations</TableHead>}
                    {showStateCol('merchants') && <TableHead className="text-right">Merchants</TableHead>}
                    {showStateCol('gpv') && <TableHead className="whitespace-nowrap text-right">30d GPV</TableHead>}
                    {/* Top Cities was `hidden lg:table-cell`; the picker now owns
                        that decision so there is one mechanism, not two fighting. */}
                    {showStateCol('topCities') && <TableHead className="hidden lg:table-cell">Top Cities</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.byState.map(row => (
                    <TableRow key={row.state}>
                      <TableCell>
                        <div className="font-medium">{row.stateName}</div>
                        <div className="text-xs text-muted-foreground">{row.state}</div>
                      </TableCell>
                      {showStateCol('locations') && (
                        <TableCell className="text-right font-medium tabular-nums">{row.locationCount}</TableCell>
                      )}
                      {showStateCol('merchants') && (
                        <TableCell className="text-right tabular-nums text-muted-foreground">{row.merchantCount}</TableCell>
                      )}
                      {showStateCol('gpv') && (
                        <TableCell className="text-right tabular-nums">{fmtGPV(row.gpv30d)}</TableCell>
                      )}
                      {showStateCol('topCities') && (
                        <TableCell className="hidden text-muted-foreground lg:table-cell">
                          {row.topCities.slice(0, 2).join(' · ')}
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </PanelSection>
        </Panel>

        {/* Coverage gaps */}
        <Panel>
          <PanelSection
            label={`Coverage gaps (${data.coverageGaps.length} state${data.coverageGaps.length !== 1 ? 's' : ''})`}
            caption="States with zero active locations — sales targets"
          >
            {data.coverageGaps.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
                <Globe className="h-8 w-8 text-muted-foreground opacity-70" />
                <p className="text-sm font-medium">Full Coverage</p>
                <p className="text-xs text-muted-foreground">Locations in all 51 states</p>
              </div>
            ) : (
              <div className="flex max-h-64 flex-wrap gap-1.5 overflow-auto">
                {data.coverageGaps.map(code => (
                  <span
                    key={code}
                    className="rounded-full bg-muted/60 px-2.5 py-0.5 text-xs font-medium text-muted-foreground"
                  >
                    {code}
                  </span>
                ))}
              </div>
            )}
          </PanelSection>
        </Panel>
      </div>

      <Panel>
        <PanelSection
          label="Top cities"
          caption="Highest concentration markets by city — top 20"
          action={
            <MobileColumnsButton
              columns={TOP_CITY_COLUMNS}
              hidden={cityHiddenCols}
              onChange={setCityHiddenCols}
            />
          }
        >
          {/* Min-width lifted on mobile so hidden columns actually narrow the
              table instead of leaving it scrolling sideways. */}
          <Table variant="data" className={cn(!isMobile && 'min-w-[620px]')}>
            <TableHeader className="[&_tr]:border-0">
              <TableRow>
                <TableHead>City</TableHead>
                {showCityCol('state') && <TableHead>State</TableHead>}
                {showCityCol('locations') && <TableHead className="text-right">Locations</TableHead>}
                {showCityCol('merchants') && <TableHead className="text-right">Merchants</TableHead>}
                {showCityCol('gpv') && <TableHead className="text-right">30d GPV</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {cityPage.pageRows.map(row => (
                <TableRow key={`${row.city}-${row.state}`}>
                  <TableCell className="font-medium">{row.city}</TableCell>
                  {showCityCol('state') && (
                    <TableCell className="text-muted-foreground">{row.state}</TableCell>
                  )}
                  {showCityCol('locations') && (
                    <TableCell className="text-right font-medium tabular-nums">{row.locationCount}</TableCell>
                  )}
                  {showCityCol('merchants') && (
                    <TableCell className="text-right tabular-nums text-muted-foreground">{row.merchantCount}</TableCell>
                  )}
                  {showCityCol('gpv') && (
                    <TableCell className="text-right tabular-nums">{fmtGPV(row.gpv30d)}</TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <PaginationBar
            className="border-t-0 pt-0"
            pagination={cityPage.pagination}
            onPageChange={cityPage.setPage}
            itemLabel="cities"
          />
        </PanelSection>
      </Panel>

    </div>
  )
}
