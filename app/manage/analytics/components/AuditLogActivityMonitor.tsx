'use client'

import { useState } from 'react'
import { usePlatformAuditLogs, useAuditLogAnalytics } from '@/lib/queries/use-platform-analytics'
import { Panel } from '@/components/dashboard/shell/Panel'
import { PanelSection } from '@/components/dashboard/shell/PanelSection'
import { StatRow, StatTile } from '@/components/dashboard/shell/StatTile'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  MobileColumnsButton,
  initialHiddenColumns,
  type ReportColumn,
} from '@/components/dashboard/reports/MobileColumnsButton'
import { useIsMobile } from '@/hooks/use-mobile'
import { cn } from '@/lib/utils'
import {
  ShieldAlert,
  Search,
  ChevronLeft,
  ChevronRight,
  Activity,
  AlertTriangle,
  XCircle,
  Info,
  TrendingUp,
  User,
  AlertCircle,
  CheckCircle2,
  Layers,
} from 'lucide-react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts'
import type { TopAuditActor, FailedAuditAction, DailyAuditActivity } from '@/app/manage/actions/hq-platform/analytics'
import { VALUE_AXIS_WIDTH_MOBILE } from '@/app/manage/components/analytics-primitives'

/**
 * Mobile column meta for the three audit tables.
 *
 * Each keeps its identity column locked plus the one field the table is ranked
 * or read by — action count for actors, the error itself for failures, the
 * action name for the log — so a narrowed table still answers its own question.
 */
const TOP_ACTOR_COLUMNS: ReportColumn[] = [
  { id: 'actor', label: 'Actor', locked: true },
  { id: 'role', label: 'Role', defaultHidden: true },
  { id: 'actions', label: 'Actions' },
  { id: 'warnings', label: 'Warnings', defaultHidden: true },
  { id: 'errors', label: 'Errors', defaultHidden: true },
  { id: 'merchants', label: 'Merchants', defaultHidden: true },
  { id: 'lastActive', label: 'Last Active', defaultHidden: true },
]

const FAILED_ACTION_COLUMNS: ReportColumn[] = [
  { id: 'time', label: 'Time', locked: true },
  { id: 'actor', label: 'Actor', defaultHidden: true },
  { id: 'action', label: 'Action / Category', defaultHidden: true },
  { id: 'error', label: 'Error Message' },
  { id: 'resource', label: 'Resource', defaultHidden: true },
  { id: 'merchant', label: 'Merchant', defaultHidden: true },
  { id: 'severity', label: 'Severity', defaultHidden: true },
]

const FULL_LOG_COLUMNS: ReportColumn[] = [
  { id: 'time', label: 'Time', locked: true },
  { id: 'actor', label: 'Actor', defaultHidden: true },
  { id: 'action', label: 'Action' },
  { id: 'category', label: 'Category', defaultHidden: true },
  { id: 'resource', label: 'Resource', defaultHidden: true },
  { id: 'merchant', label: 'Merchant', defaultHidden: true },
  { id: 'severity', label: 'Severity', defaultHidden: true },
]

// ============================================================================
// CONSTANTS & HELPERS
// ============================================================================

const PAGE_SIZE = 25

const ACTION_CATEGORIES = [
  { value: 'all',      label: 'All Categories' },
  { value: 'auth',     label: 'Auth' },
  { value: 'merchant', label: 'Merchant' },
  { value: 'staff',    label: 'Staff' },
  { value: 'order',    label: 'Order' },
  { value: 'settings', label: 'Settings' },
  { value: 'device',   label: 'Device' },
]

const SEVERITIES = [
  { value: 'all',      label: 'All Severities' },
  { value: 'info',     label: 'Info' },
  { value: 'warning',  label: 'Warning' },
  { value: 'critical', label: 'Critical' },
  { value: 'error',    label: 'Error' },
]

/** Category → colour mapping (chart bars) */
const CATEGORY_CHART_COLORS: Record<string, string> = {
  auth:     '#8B5CF6',
  merchant: '#3B82F6',
  staff:    '#14B8A6',
  order:    '#22C55E',
  settings: '#F97316',
  device:   '#6366F1',
  other:    '#9CA3AF',
}

function fmtTime(iso: string) {
  const d = new Date(iso)
  return {
    date: d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }),
    time: d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
  }
}

function fmtRelative(iso: string): string {
  const delta = Date.now() - new Date(iso).getTime()
  const mins  = Math.floor(delta / 60_000)
  if (mins < 1)  return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24)  return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

/**
 * Severity and category read as plain text, not tinted pills.
 *
 * §14.3 HQ-2 keeps severity colour to `/manage/health` and the DLQ, and a log
 * this dense drew a coloured chip on every row of every column — the tint
 * stopped marking anything and just filled the table with noise. The words
 * carry the distinction; the chart above still uses colour, where it maps a
 * stacked bar to its legend entry (§4.6b).
 */
function SeverityBadge({ severity }: { severity: string | null }) {
  return (
    <span className="text-sm capitalize text-muted-foreground">{severity ?? 'info'}</span>
  )
}

function CategoryBadge({ category }: { category: string | null }) {
  if (!category) return <span className="text-muted-foreground">—</span>
  return <span className="text-sm capitalize text-muted-foreground">{category}</span>
}

// ── Custom chart tooltip ────────────────────────────────────────────────────
function DailyChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  const d: DailyAuditActivity = payload[0]?.payload
  if (!d) return null
  return (
    <div className="bg-background border rounded-lg p-3 shadow-md text-xs space-y-1 min-w-44">
      <p className="font-semibold text-foreground mb-1.5">{d.date}</p>
      <p className="text-muted-foreground font-medium">Total: <span className="text-foreground font-bold">{d.total}</span></p>
      <div className="space-y-0.5 pt-1">
        {(Object.keys(CATEGORY_CHART_COLORS) as Array<keyof typeof CATEGORY_CHART_COLORS>)
          .filter(cat => (d as any)[cat] > 0)
          .map(cat => (
            <div key={cat} className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: CATEGORY_CHART_COLORS[cat] }} />
                <span className="capitalize text-muted-foreground">{cat}</span>
              </span>
              <span className="font-medium text-foreground">{(d as any)[cat]}</span>
            </div>
          ))}
      </div>
    </div>
  )
}

// ============================================================================
// SECTION 1 — Summary stat cards
// ============================================================================

function AuditSummaryStats({ analytics, isLoading }: {
  analytics: ReturnType<typeof useAuditLogAnalytics>['data']
  isLoading: boolean
}) {
  // Severity is carried by the label, not a tint: §14.3 HQ-2 keeps severity
  // colour to `/manage/health` and the DLQ, so this surface stays text-led.
  const stats = [
    { label: 'Total Events (30d)', value: analytics?.total30d, icon: Activity },
    { label: 'Info', value: analytics?.infoCount, icon: Info },
    { label: 'Warnings', value: analytics?.warningCount, icon: AlertTriangle },
    {
      label: 'Errors & Critical',
      value: analytics ? analytics.errorCount + analytics.criticalCount : undefined,
      icon: XCircle,
    },
    { label: 'Failed Actions', value: analytics?.failedActionsCount, icon: AlertCircle },
  ]

  const tile = ({ label, value, icon: Icon }: (typeof stats)[number]) => (
    <StatTile
      key={label}
      label={label}
      icon={<Icon />}
      isLoading={isLoading}
      value={value?.toLocaleString() ?? '—'}
    />
  )

  return (
    <Panel>
      <PanelSection label="Audit activity" icon={ShieldAlert}>
        {/* Five figures: 3-up then 2-up — `StatRow` tops out at four columns. */}
        <div className="space-y-6">
          <StatRow columns={3}>{stats.slice(0, 3).map(tile)}</StatRow>
          <StatRow columns={2}>{stats.slice(3).map(tile)}</StatRow>
        </div>
      </PanelSection>
    </Panel>
  )
}

// ============================================================================
// SECTION 2 — Daily Activity Bar Chart (stacked by category)
// ============================================================================

function DailyActivityChart({ analytics, isLoading }: {
  analytics: ReturnType<typeof useAuditLogAnalytics>['data']
  isLoading: boolean
}) {
  const isMobile = useIsMobile()
  const hasData = analytics && analytics.dailyActivity.some(d => d.total > 0)

  return (
    <Panel>
      <PanelSection
        icon={TrendingUp}
        label="Daily activity volume"
        caption="Audit events per day, stacked by action category — last 30 days"
        action={
          !isLoading && analytics ? (
            <div className="text-right text-sm">
              <p className="text-muted-foreground">30-day total</p>
              <p className="font-semibold tabular-nums">{analytics.total30d.toLocaleString()}</p>
            </div>
          ) : undefined
        }
      >
        {isLoading ? (
          <Skeleton className="h-64 w-full" />
        ) : !hasData ? (
          <div className="h-64 flex items-center justify-center text-muted-foreground text-sm gap-2">
            <Activity className="h-5 w-5 opacity-40" />
            No audit activity in the last 30 days
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <BarChart
              data={analytics!.dailyActivity}
              margin={{ top: 4, right: 4, left: -16, bottom: 0 }}
              barSize={10}
            >
              <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-muted" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 10 }}
                tickFormatter={d => d.slice(5)} // MM-DD
                interval={4}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                allowDecimals={false}
                  width={isMobile ? VALUE_AXIS_WIDTH_MOBILE : undefined}
              />
              <RechartsTooltip content={<DailyChartTooltip />} cursor={{ fill: 'var(--muted)' }} />
              <Legend
                iconType="circle"
                iconSize={8}
                wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
                formatter={(val) => <span className="capitalize text-muted-foreground">{val}</span>}
              />
              {(Object.keys(CATEGORY_CHART_COLORS) as Array<keyof typeof CATEGORY_CHART_COLORS>).map((cat, idx) => (
                <Bar
                  key={cat}
                  dataKey={cat}
                  name={cat}
                  stackId="a"
                  fill={CATEGORY_CHART_COLORS[cat]}
                  radius={idx === Object.keys(CATEGORY_CHART_COLORS).length - 1 ? [2, 2, 0, 0] : [0, 0, 0, 0]}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        )}
      </PanelSection>
    </Panel>
  )
}

// ============================================================================
// SECTION 3 — Top Actors Table
// ============================================================================

function TopActorsTable({ actors, isLoading }: {
  actors: TopAuditActor[]
  isLoading: boolean
}) {
  const isMobile = useIsMobile()
  const [hiddenCols, setHiddenCols] = useState<Set<string>>(() =>
    initialHiddenColumns(TOP_ACTOR_COLUMNS)
  )
  const showCol = (id: string) => !isMobile || !hiddenCols.has(id)
  const visibleColCount = TOP_ACTOR_COLUMNS.filter(c => showCol(c.id)).length

  return (
    <Panel>
      <PanelSection
        icon={User}
        label={!isLoading && actors.length > 0 ? `Top actors (${actors.length})` : 'Top actors'}
        caption="Most active admin users ranked by action count — last 30 days"
        action={
          <MobileColumnsButton
            columns={TOP_ACTOR_COLUMNS}
            hidden={hiddenCols}
            onChange={setHiddenCols}
          />
        }
      >
        <div className="max-h-80 overflow-auto">
          {/* Min-width lifted on mobile so hidden columns actually narrow the
              table instead of leaving it scrolling sideways. */}
          <Table variant="data" className={cn(!isMobile && 'min-w-[820px]')}>
            <TableHeader className="[&_tr]:border-0">
              <TableRow>
                <TableHead>Actor</TableHead>
                {showCol('role') && <TableHead>Role</TableHead>}
                {showCol('actions') && <TableHead className="text-right">Actions</TableHead>}
                {showCol('warnings') && <TableHead className="text-right">Warnings</TableHead>}
                {showCol('errors') && <TableHead className="text-right">Errors</TableHead>}
                {showCol('merchants') && <TableHead className="text-right">Merchants</TableHead>}
                {showCol('lastActive') && <TableHead className="text-right">Last Active</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: visibleColCount }).map((_, j) => (
                      <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : actors.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={visibleColCount} className="h-24 text-center text-muted-foreground">
                    <div className="flex flex-col items-center gap-2">
                      <User className="h-7 w-7 opacity-30" />
                      No actor data available
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                actors.map((actor) => (
                  <TableRow key={actor.actorName}>
                    <TableCell>
                      <p className="font-medium leading-tight">{actor.actorName}</p>
                      {actor.actorEmail && actor.actorEmail !== actor.actorName && (
                        <p className="text-xs leading-tight text-muted-foreground">{actor.actorEmail}</p>
                      )}
                    </TableCell>
                    {showCol('role') && (
                      <TableCell>
                        {actor.actorRole ? (
                          <span className="capitalize text-muted-foreground">{actor.actorRole}</span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    )}
                    {showCol('actions') && (
                      <TableCell className="text-right font-semibold tabular-nums">
                        {actor.totalActions.toLocaleString()}
                      </TableCell>
                    )}
                    {showCol('warnings') && (
                      <TableCell className="text-right tabular-nums">
                        {actor.warningCount > 0 ? (
                          <span className="font-medium">{actor.warningCount}</span>
                        ) : (
                          <span className="text-muted-foreground">0</span>
                        )}
                      </TableCell>
                    )}
                    {showCol('errors') && (
                      <TableCell className="text-right tabular-nums">
                        {actor.errorCount > 0 ? (
                          <span className="font-semibold">{actor.errorCount}</span>
                        ) : (
                          <span className="text-muted-foreground">0</span>
                        )}
                      </TableCell>
                    )}
                    {showCol('merchants') && (
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {actor.distinctMerchants}
                      </TableCell>
                    )}
                    {showCol('lastActive') && (
                      <TableCell className="whitespace-nowrap text-right text-muted-foreground">
                        {fmtRelative(actor.lastActionAt)}
                      </TableCell>
                    )}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </PanelSection>
    </Panel>
  )
}

// ============================================================================
// SECTION 4 — Failed Actions Feed
// ============================================================================

function FailedActionsFeed({ failed, isLoading }: {
  failed: FailedAuditAction[]
  isLoading: boolean
  count: number
}) {
  const isMobile = useIsMobile()
  const [hiddenCols, setHiddenCols] = useState<Set<string>>(() =>
    initialHiddenColumns(FAILED_ACTION_COLUMNS)
  )
  const showCol = (id: string) => !isMobile || !hiddenCols.has(id)

  return (
    <Panel>
      <PanelSection
        icon={AlertCircle}
        label={!isLoading && failed.length > 0 ? `Failed actions feed (${failed.length})` : 'Failed actions feed'}
        caption={
          <>
            All actions where <code className="rounded bg-muted px-1 text-xs">status = &apos;failed&apos;</code> or an{' '}
            <code className="rounded bg-muted px-1 text-xs">error_message</code> is present
          </>
        }
        action={
          !isLoading && failed.length === 0 ? (
            <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <CheckCircle2 className="h-4 w-4" />
              All clear
            </span>
          ) : (
            <MobileColumnsButton
              columns={FAILED_ACTION_COLUMNS}
              hidden={hiddenCols}
              onChange={setHiddenCols}
            />
          )
        }
      >
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
          </div>
        ) : failed.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-10 text-muted-foreground">
            <CheckCircle2 className="h-8 w-8 opacity-70" />
            <p className="text-sm font-medium">No failed actions detected</p>
            <p className="text-xs">All recent platform operations completed successfully.</p>
          </div>
        ) : (
          <div className="max-h-96 overflow-auto">
            {/* Min-width lifted on mobile so hidden columns actually narrow the
                table instead of leaving it scrolling sideways. */}
            <Table variant="data" className={cn(!isMobile && 'min-w-[920px]')}>
              <TableHeader className="[&_tr]:border-0">
                <TableRow>
                  <TableHead className="w-36">Time</TableHead>
                  {showCol('actor') && <TableHead>Actor</TableHead>}
                  {showCol('action') && <TableHead>Action / Category</TableHead>}
                  {showCol('error') && <TableHead className="max-w-72">Error Message</TableHead>}
                  {showCol('resource') && <TableHead>Resource</TableHead>}
                  {showCol('merchant') && <TableHead>Merchant</TableHead>}
                  {showCol('severity') && <TableHead>Severity</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {failed.map((f) => {
                  const { date, time } = fmtTime(f.createdAt)
                  return (
                    <TableRow key={f.id}>
                      <TableCell className="align-top">
                        <p className="text-xs font-medium">{time}</p>
                        <p className="text-xs text-muted-foreground">{date}</p>
                      </TableCell>
                      {showCol('actor') && (
                        <TableCell className="align-top">
                          <p className="leading-tight">{f.actorName ?? <span className="text-muted-foreground">System</span>}</p>
                          {f.actorEmail && f.actorEmail !== f.actorName && (
                            <p className="text-xs text-muted-foreground">{f.actorEmail}</p>
                          )}
                        </TableCell>
                      )}
                      {showCol('action') && (
                        <TableCell className="align-top">
                          <p className="max-w-48 truncate font-medium leading-tight" title={f.action ?? ''}>
                            {f.action ?? <span className="text-muted-foreground">—</span>}
                          </p>
                          <div className="mt-0.5"><CategoryBadge category={f.actionCategory} /></div>
                        </TableCell>
                      )}
                      {showCol('error') && (
                        <TableCell className="max-w-72 align-top">
                          {f.errorMessage ? (
                            // The message keeps its own quiet well so a wrapped
                            // stack string stays distinguishable from the row.
                            <p
                              className="line-clamp-2 rounded-2xl bg-muted/60 px-2 py-1 font-mono text-xs leading-snug"
                              title={f.errorMessage}
                            >
                              {f.errorMessage}
                            </p>
                          ) : f.status ? (
                            <span className="text-sm text-muted-foreground">{f.status}</span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                      )}
                      {showCol('resource') && (
                        <TableCell className="align-top">
                          {f.resourceName || f.resourceType ? (
                            <>
                              <p className="leading-tight">{f.resourceName ?? '—'}</p>
                              {f.resourceType && (
                                <p className="text-xs capitalize text-muted-foreground">{f.resourceType}</p>
                              )}
                            </>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                      )}
                      {showCol('merchant') && (
                        <TableCell className="align-top">
                          {f.merchantName ? (
                            <p>{f.merchantName}</p>
                          ) : (
                            <span className="text-muted-foreground">Platform</span>
                          )}
                        </TableCell>
                      )}
                      {showCol('severity') && (
                        <TableCell className="align-top">
                          <SeverityBadge severity={f.severity} />
                        </TableCell>
                      )}
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </PanelSection>
    </Panel>
  )
}

// ============================================================================
// SECTION 5 — Full paginated log table (original, unchanged)
// ============================================================================

interface AuditLogRow {
  id: string
  created_at: string
  action: string
  action_category: string | null
  severity: string | null
  actor_name: string | null
  resource_type: string | null
  resource_name: string | null
  merchants: { name: string } | null
  location: { id: string; name: string } | null
}

function FullLogTable() {
  const isMobile = useIsMobile()
  const [hiddenCols, setHiddenCols] = useState<Set<string>>(() =>
    initialHiddenColumns(FULL_LOG_COLUMNS)
  )
  const showCol = (id: string) => !isMobile || !hiddenCols.has(id)
  const visibleColCount = FULL_LOG_COLUMNS.filter(c => showCol(c.id)).length

  const [search, setSearch]         = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [category, setCategory]     = useState('all')
  const [severity, setSeverity]     = useState('all')
  const [page, setPage]             = useState(0)

  const filters = {
    ...(search   ? { search }   : {}),
    ...(category !== 'all' ? { action_category: category } : {}),
    ...(severity !== 'all' ? { severity }                  : {}),
  }
  const offset = page * PAGE_SIZE

  const { data, isLoading } = usePlatformAuditLogs(
    Object.keys(filters).length > 0 ? filters : undefined,
    PAGE_SIZE,
    offset,
  )

  // Plain function, not a `useCallback`: this is only ever passed to onKeyDown
  // and onBlur, never used as a memo dependency, so wrapping it bought nothing
  // — and its dep list omitted `setPage`, which made React Compiler bail out of
  // optimizing the whole component.
  const applySearch = () => { setSearch(searchInput); setPage(0) }

  const logs: AuditLogRow[]   = data?.data  ?? []
  const total: number         = data?.total ?? 0
  const totalPages            = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <Panel>
      <PanelSection
        icon={Layers}
        label={!isLoading && total > 0 ? `Full event log (${total.toLocaleString()} events)` : 'Full event log'}
        caption="Filterable, paginated view of every audit entry — newest first"
      >
        {/* Toolbar — §5.2: rounded search on the left, borderless muted pills right. */}
        <div className="mb-4 flex flex-wrap gap-2">
          <div className="relative min-w-56 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/50" />
            <Input
              placeholder="Search action, actor, resource…"
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && applySearch()}
              onBlur={applySearch}
              className="h-10 w-full rounded-full pl-10"
            />
          </div>
          <Select value={category} onValueChange={v => { setCategory(v); setPage(0) }}>
            <SelectTrigger className="h-9 w-40 rounded-full border-0 bg-muted/60 px-3 shadow-none"><SelectValue /></SelectTrigger>
            <SelectContent>
              {ACTION_CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={severity} onValueChange={v => { setSeverity(v); setPage(0) }}>
            <SelectTrigger className="h-9 w-38 rounded-full border-0 bg-muted/60 px-3 shadow-none"><SelectValue /></SelectTrigger>
            <SelectContent>
              {SEVERITIES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <MobileColumnsButton
            columns={FULL_LOG_COLUMNS}
            hidden={hiddenCols}
            onChange={setHiddenCols}
          />
        </div>

        <div className="space-y-4">
          {/* Min-width lifted on mobile so hidden columns actually narrow the
              table instead of leaving it scrolling sideways. */}
          <Table variant="data" className={cn(!isMobile && 'min-w-[920px]')}>
            <TableHeader className="[&_tr]:border-0">
              <TableRow>
                <TableHead className="w-36">Time</TableHead>
                {showCol('actor') && <TableHead>Actor</TableHead>}
                {showCol('action') && <TableHead>Action</TableHead>}
                {showCol('category') && <TableHead>Category</TableHead>}
                {showCol('resource') && <TableHead>Resource</TableHead>}
                {showCol('merchant') && <TableHead>Merchant</TableHead>}
                {showCol('severity') && <TableHead>Severity</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: visibleColCount }).map((_, j) => (
                      <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : logs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={visibleColCount} className="py-10 text-center text-muted-foreground">
                    <div className="flex flex-col items-center gap-2">
                      <Activity className="h-8 w-8 opacity-30" />
                      <span>No audit events found</span>
                      {(search || category !== 'all' || severity !== 'all') && (
                        <Button variant="ghost" size="sm" onClick={() => {
                          setSearch(''); setSearchInput(''); setCategory('all'); setSeverity('all'); setPage(0)
                        }}>Clear filters</Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                logs.map((log) => {
                  const { date, time } = fmtTime(log.created_at)
                  return (
                    <TableRow key={log.id}>
                      <TableCell className="align-top">
                        <p className="text-xs font-medium text-foreground">{time}</p>
                        <p className="text-xs text-muted-foreground">{date}</p>
                      </TableCell>
                      {showCol('actor') && (
                        <TableCell>
                          {log.actor_name ?? <span className="text-muted-foreground">System</span>}
                        </TableCell>
                      )}
                      {showCol('action') && (
                        <TableCell className="max-w-48 truncate font-medium" title={log.action}>
                          {log.action}
                        </TableCell>
                      )}
                      {showCol('category') && (
                        <TableCell>
                          <CategoryBadge category={log.action_category} />
                        </TableCell>
                      )}
                      {showCol('resource') && (
                        <TableCell className="align-top">
                          {log.resource_name || log.resource_type ? (
                            <>
                              <p>{log.resource_name ?? '—'}</p>
                              {log.resource_type && <p className="text-xs capitalize text-muted-foreground">{log.resource_type}</p>}
                            </>
                          ) : <span className="text-muted-foreground">—</span>}
                        </TableCell>
                      )}
                      {showCol('merchant') && (
                        <TableCell className="align-top">
                          {log.merchants?.name ? (
                            <>
                              <p>{log.merchants.name}</p>
                              {log.location?.name && <p className="text-xs text-muted-foreground">{log.location.name}</p>}
                            </>
                          ) : <span className="text-muted-foreground">Platform</span>}
                        </TableCell>
                      )}
                      {showCol('severity') && (
                        <TableCell>
                          <SeverityBadge severity={log.severity} />
                        </TableCell>
                      )}
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {isLoading ? '…'
              : total === 0 ? 'No results'
              : `Showing ${offset + 1}–${Math.min(offset + PAGE_SIZE, total)} of ${total.toLocaleString()}`}
          </span>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="sm" className="h-7 px-2"
              onClick={() => setPage(p => p - 1)} disabled={page === 0 || isLoading}>
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <span className="px-2">{page + 1} / {totalPages}</span>
            <Button variant="outline" size="sm" className="h-7 px-2"
              onClick={() => setPage(p => p + 1)} disabled={page >= totalPages - 1 || isLoading}>
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </PanelSection>
    </Panel>
  )
}

// ============================================================================
// MAIN EXPORT
// ============================================================================

export function AuditLogActivityMonitor() {
  const { data: analytics, isLoading: analyticsLoading } = useAuditLogAnalytics(30)

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-slate-100">
          <ShieldAlert className="h-5 w-5 text-slate-600" />
        </div>
        <div>
          <h3 className="text-base font-semibold">Audit Log Activity Monitor</h3>
          <p className="text-sm text-muted-foreground">
            Platform-wide admin action trail — compliance visibility across all merchants and HQ operations
          </p>
        </div>
      </div>

      {/* ── Section 1: Summary stat cards ── */}
      <AuditSummaryStats analytics={analytics} isLoading={analyticsLoading} />

      {/* ── Section 2: Daily activity bar chart ── */}
      <DailyActivityChart analytics={analytics} isLoading={analyticsLoading} />

      {/* ── Section 3: Top actors table ── */}
      <TopActorsTable
        actors={analytics?.topActors ?? []}
        isLoading={analyticsLoading}
      />

      {/* ── Section 4: Failed actions feed ── */}
      <FailedActionsFeed
        failed={analytics?.failedActions ?? []}
        isLoading={analyticsLoading}
        count={analytics?.failedActionsCount ?? 0}
      />

      {/* ── Section 5: Full paginated log ── */}
      <FullLogTable />
    </div>
  )
}
