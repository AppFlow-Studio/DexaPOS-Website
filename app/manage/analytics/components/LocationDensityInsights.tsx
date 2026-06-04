'use client'

import { MapPin, Globe, TrendingUp, AlertTriangle } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
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
import { useMemo } from 'react'

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
                    <p className="text-xs text-red-500">No locations — sales whitespace</p>
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

export function LocationDensityInsights() {
  const { data, isLoading } = useLocationDensity()

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-72 w-full" />
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

      {/* ── KPI Cards ────────────────────────────────────────────────────── */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Locations</CardTitle>
            <MapPin className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.totalLocations.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground mt-1">Active across the platform</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">States Covered</CardTitle>
            <Globe className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.totalStates} <span className="text-base font-normal text-muted-foreground">/ 51</span></div>
            <p className="text-xs text-muted-foreground mt-1">Including D.C.</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Whitespace States</CardTitle>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${data.coverageGaps.length > 10 ? 'text-red-600' : data.coverageGaps.length > 5 ? 'text-yellow-600' : 'text-green-600'}`}>
              {data.coverageGaps.length}
            </div>
            <p className="text-xs text-muted-foreground mt-1">States with no presence</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Top State</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{topStateEntry?.stateName || '—'}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {topStateEntry ? `${topStateEntry.locationCount} location${topStateEntry.locationCount !== 1 ? 's' : ''}` : ''}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* ── US Choropleth Tile Map ────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Geographic Distribution</CardTitle>
          <CardDescription>
            Location density by state — hover for details · red = no presence (sales whitespace)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <USChoropleth byState={data.byState} coverageGaps={data.coverageGaps} />
        </CardContent>
      </Card>

      {/* ── Top States Bar Chart ──────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Top 10 States by Location Count</CardTitle>
          <CardDescription>Active locations per state — highest concentration markets</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={chartData} margin={{ bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="state" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
              <RechartsTooltip
                formatter={(value: number, name: string) => [
                  value.toLocaleString(),
                  name === 'locations' ? 'Locations' : 'Merchants',
                ]}
              />
              <Bar dataKey="locations" name="locations" fill="hsl(var(--chart-1))" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* ── State Breakdown Table + Coverage Gaps ────────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-3">

        {/* State table */}
        <Card className="lg:col-span-2 min-w-0 overflow-hidden">
          <CardHeader>
            <CardTitle>State Breakdown</CardTitle>
            <CardDescription>All represented states sorted by location count</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="max-h-80 overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>State</TableHead>
                    <TableHead className="text-right">Locations</TableHead>
                    <TableHead className="text-right">Merchants</TableHead>
                    <TableHead className="text-right whitespace-nowrap">30d GPV</TableHead>
                    <TableHead className="hidden lg:table-cell">Top Cities</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.byState.map(row => (
                    <TableRow key={row.state}>
                      <TableCell>
                        <div className="font-medium text-sm">{row.stateName}</div>
                        <div className="text-xs text-muted-foreground">{row.state}</div>
                      </TableCell>
                      <TableCell className="text-right font-medium">{row.locationCount}</TableCell>
                      <TableCell className="text-right text-muted-foreground">{row.merchantCount}</TableCell>
                      <TableCell className="text-right text-sm">{fmtGPV(row.gpv30d)}</TableCell>
                      <TableCell className="hidden lg:table-cell">
                        <div className="flex flex-wrap gap-1">
                          {row.topCities.slice(0, 2).map(city => (
                            <Badge key={city} variant="secondary" className="text-xs font-normal">{city}</Badge>
                          ))}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* Coverage gaps */}
        <Card className="min-w-0 overflow-hidden">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 flex-wrap">
              Coverage Gaps
              <Badge variant={data.coverageGaps.length > 0 ? 'destructive' : 'default'} className="text-xs shrink-0">
                {data.coverageGaps.length} state{data.coverageGaps.length !== 1 ? 's' : ''}
              </Badge>
            </CardTitle>
            <CardDescription>States with zero active locations — sales targets</CardDescription>
          </CardHeader>
          <CardContent>
            {data.coverageGaps.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center gap-2">
                <Globe className="h-8 w-8 text-green-500 opacity-70" />
                <p className="text-sm font-medium text-green-700">Full Coverage</p>
                <p className="text-xs text-muted-foreground">Locations in all 51 states</p>
              </div>
            ) : (
              <div className="flex flex-wrap gap-1.5 max-h-64 overflow-auto">
                {data.coverageGaps.map(code => (
                  <Badge key={code} variant="outline" className="text-xs text-muted-foreground border-dashed">
                    {code}
                  </Badge>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Top Cities Table ─────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Top Cities</CardTitle>
          <CardDescription>Highest concentration markets by city — top 20</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="max-h-80 overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8">#</TableHead>
                  <TableHead>City</TableHead>
                  <TableHead>State</TableHead>
                  <TableHead className="text-right">Locations</TableHead>
                  <TableHead className="text-right">Merchants</TableHead>
                  <TableHead className="text-right">30d GPV</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.byCity.map((row, i) => (
                  <TableRow key={`${row.city}-${row.state}`}>
                    <TableCell className="text-xs text-muted-foreground">{i + 1}</TableCell>
                    <TableCell className="font-medium text-sm">{row.city}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="text-xs font-normal">{row.state}</Badge>
                    </TableCell>
                    <TableCell className="text-right font-medium">{row.locationCount}</TableCell>
                    <TableCell className="text-right text-muted-foreground">{row.merchantCount}</TableCell>
                    <TableCell className="text-right text-sm">{fmtGPV(row.gpv30d)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

    </div>
  )
}
