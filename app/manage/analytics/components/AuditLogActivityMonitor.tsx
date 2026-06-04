'use client'

import { useState, useCallback } from 'react'
import { usePlatformAuditLogs, useAuditLogAnalytics } from '@/lib/queries/use-platform-analytics'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
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
  Building2,
  Clock,
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

/** Category → badge colour (text labels) */
const CATEGORY_BADGE_COLORS: Record<string, string> = {
  auth:     'bg-purple-100 text-purple-700',
  merchant: 'bg-blue-100 text-blue-700',
  staff:    'bg-teal-100 text-teal-700',
  order:    'bg-green-100 text-green-700',
  settings: 'bg-orange-100 text-orange-700',
  device:   'bg-indigo-100 text-indigo-700',
}

const SEVERITY_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  info:     'secondary',
  warning:  'outline',
  critical: 'destructive',
  error:    'destructive',
}
const SEVERITY_BADGE_COLOR: Record<string, string> = {
  info:     'text-blue-600',
  warning:  'text-yellow-600',
  critical: 'text-red-600',
  error:    'text-red-600',
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

function SeverityBadge({ severity }: { severity: string | null }) {
  const s = severity ?? 'info'
  return (
    <Badge variant={SEVERITY_VARIANT[s] ?? 'secondary'} className={`text-xs capitalize ${SEVERITY_BADGE_COLOR[s] ?? ''}`}>
      {s}
    </Badge>
  )
}

function CategoryBadge({ category }: { category: string | null }) {
  if (!category) return <span className="text-xs text-muted-foreground">—</span>
  const cls = CATEGORY_BADGE_COLORS[category.toLowerCase()] ?? 'bg-gray-100 text-gray-700'
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize ${cls}`}>
      {category}
    </span>
  )
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
      <div className="border-t pt-1 space-y-0.5">
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

// ── Section title used within the component ─────────────────────────────────
function SectionTitle({ icon: Icon, title, subtitle, right }: {
  icon: React.ElementType
  title: string
  subtitle?: string
  right?: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between mb-4">
      <div className="flex items-center gap-2.5">
        <div className="p-1.5 rounded-md bg-muted">
          <Icon className="h-4 w-4 text-muted-foreground" />
        </div>
        <div>
          <p className="text-sm font-semibold leading-tight">{title}</p>
          {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
        </div>
      </div>
      {right}
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
  const stats = [
    {
      label: 'Total Events (30d)',
      value: analytics?.total30d,
      icon: Activity,
      color: 'text-blue-600',
      bg:   'bg-blue-50',
    },
    {
      label: 'Info',
      value: analytics?.infoCount,
      icon: Info,
      color: 'text-blue-500',
      bg:   'bg-blue-50',
    },
    {
      label: 'Warnings',
      value: analytics?.warningCount,
      icon: AlertTriangle,
      color: 'text-yellow-600',
      bg:   'bg-yellow-50',
    },
    {
      label: 'Errors & Critical',
      value: analytics ? analytics.errorCount + analytics.criticalCount : undefined,
      icon: XCircle,
      color: 'text-red-600',
      bg:   'bg-red-50',
    },
    {
      label: 'Failed Actions',
      value: analytics?.failedActionsCount,
      icon: AlertCircle,
      color: 'text-destructive',
      bg:   'bg-destructive/10',
    },
  ]

  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
      {stats.map(({ label, value, icon: Icon, color, bg }) => (
        <div key={label} className="rounded-lg border bg-card p-3 flex items-center gap-3">
          <div className={`p-2 rounded-md ${bg} shrink-0`}>
            <Icon className={`h-4 w-4 ${color}`} />
          </div>
          <div>
            {isLoading ? (
              <Skeleton className="h-5 w-12 mb-0.5" />
            ) : (
              <p className={`text-xl font-bold leading-tight ${color}`}>
                {value?.toLocaleString() ?? '—'}
              </p>
            )}
            <p className="text-xs text-muted-foreground leading-tight">{label}</p>
          </div>
        </div>
      ))}
    </div>
  )
}

// ============================================================================
// SECTION 2 — Daily Activity Bar Chart (stacked by category)
// ============================================================================

function DailyActivityChart({ analytics, isLoading }: {
  analytics: ReturnType<typeof useAuditLogAnalytics>['data']
  isLoading: boolean
}) {
  const hasData = analytics && analytics.dailyActivity.some(d => d.total > 0)

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
              Daily Activity Volume
            </CardTitle>
            <CardDescription className="mt-0.5">
              Audit events per day, stacked by action category — last 30 days
            </CardDescription>
          </div>
          {!isLoading && analytics && (
            <div className="text-right">
              <p className="text-xs text-muted-foreground">30-day total</p>
              <p className="text-lg font-bold">{analytics.total30d.toLocaleString()}</p>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent>
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
              />
              <RechartsTooltip content={<DailyChartTooltip />} cursor={{ fill: 'hsl(var(--muted))' }} />
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
      </CardContent>
    </Card>
  )
}

// ============================================================================
// SECTION 3 — Top Actors Table
// ============================================================================

function TopActorsTable({ actors, isLoading }: {
  actors: TopAuditActor[]
  isLoading: boolean
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <User className="h-4 w-4 text-muted-foreground" />
          Top Actors
          {!isLoading && actors.length > 0 && (
            <Badge variant="secondary" className="text-xs ml-1">{actors.length}</Badge>
          )}
        </CardTitle>
        <CardDescription>Most active admin users ranked by action count — last 30 days</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-auto max-h-80">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="text-xs pl-4">#</TableHead>
                <TableHead className="text-xs">Actor</TableHead>
                <TableHead className="text-xs">Role</TableHead>
                <TableHead className="text-xs text-right">Actions</TableHead>
                <TableHead className="text-xs text-right">
                  <span className="text-yellow-600">Warnings</span>
                </TableHead>
                <TableHead className="text-xs text-right">
                  <span className="text-red-600">Errors</span>
                </TableHead>
                <TableHead className="text-xs text-right">Merchants</TableHead>
                <TableHead className="text-xs text-right pr-4">Last Active</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 8 }).map((_, j) => (
                      <TableCell key={j} className="py-2"><Skeleton className="h-4 w-full" /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : actors.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground text-sm py-8">
                    <div className="flex flex-col items-center gap-2">
                      <User className="h-7 w-7 opacity-30" />
                      No actor data available
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                actors.map((actor, idx) => (
                  <TableRow key={actor.actorName} className={idx === 0 ? 'bg-primary/5' : undefined}>
                    <TableCell className="py-2 pl-4 text-xs text-muted-foreground font-medium">
                      {idx + 1}
                    </TableCell>
                    <TableCell className="py-2">
                      <p className="text-sm font-medium leading-tight">{actor.actorName}</p>
                      {actor.actorEmail && actor.actorEmail !== actor.actorName && (
                        <p className="text-xs text-muted-foreground leading-tight">{actor.actorEmail}</p>
                      )}
                    </TableCell>
                    <TableCell className="py-2">
                      {actor.actorRole ? (
                        <Badge variant="outline" className="text-xs capitalize">{actor.actorRole}</Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="py-2 text-right">
                      <span className="text-sm font-bold">{actor.totalActions.toLocaleString()}</span>
                    </TableCell>
                    <TableCell className="py-2 text-right">
                      {actor.warningCount > 0 ? (
                        <span className="text-xs font-medium text-yellow-600">{actor.warningCount}</span>
                      ) : (
                        <span className="text-xs text-muted-foreground">0</span>
                      )}
                    </TableCell>
                    <TableCell className="py-2 text-right">
                      {actor.errorCount > 0 ? (
                        <span className="text-xs font-bold text-red-600">{actor.errorCount}</span>
                      ) : (
                        <span className="text-xs text-muted-foreground flex items-center justify-end gap-0.5">
                          <CheckCircle2 className="h-3 w-3 text-green-500" /> 0
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="py-2 text-right">
                      <span className="text-xs text-muted-foreground flex items-center justify-end gap-1">
                        <Building2 className="h-3 w-3" />
                        {actor.distinctMerchants}
                      </span>
                    </TableCell>
                    <TableCell className="py-2 text-right pr-4">
                      <span className="text-xs text-muted-foreground flex items-center justify-end gap-1">
                        <Clock className="h-3 w-3" />
                        {fmtRelative(actor.lastActionAt)}
                      </span>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
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
  return (
    <Card className="border-destructive/30">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-sm font-semibold flex items-center gap-2 text-destructive">
              <AlertCircle className="h-4 w-4" />
              Failed Actions Feed
              {!isLoading && failed.length > 0 && (
                <Badge variant="destructive" className="text-xs">{failed.length}</Badge>
              )}
            </CardTitle>
            <CardDescription className="mt-0.5">
              All actions where <code className="text-xs bg-muted px-1 rounded">status = &apos;failed&apos;</code> or an <code className="text-xs bg-muted px-1 rounded">error_message</code> is present
            </CardDescription>
          </div>
          {!isLoading && failed.length === 0 && (
            <div className="flex items-center gap-1.5 text-green-600 text-sm">
              <CheckCircle2 className="h-4 w-4" />
              All clear
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="p-4 space-y-3">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
          </div>
        ) : failed.length === 0 ? (
          <div className="py-10 flex flex-col items-center justify-center text-muted-foreground gap-2">
            <CheckCircle2 className="h-8 w-8 text-green-500 opacity-70" />
            <p className="text-sm font-medium">No failed actions detected</p>
            <p className="text-xs">All recent platform operations completed successfully.</p>
          </div>
        ) : (
          <div className="overflow-auto max-h-96">
            <Table>
              <TableHeader>
                <TableRow className="bg-destructive/5">
                  <TableHead className="text-xs pl-4 w-36">Time</TableHead>
                  <TableHead className="text-xs">Actor</TableHead>
                  <TableHead className="text-xs">Action / Category</TableHead>
                  <TableHead className="text-xs max-w-72">Error Message</TableHead>
                  <TableHead className="text-xs">Resource</TableHead>
                  <TableHead className="text-xs">Merchant</TableHead>
                  <TableHead className="text-xs pr-4">Severity</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {failed.map((f) => {
                  const { date, time } = fmtTime(f.createdAt)
                  return (
                    <TableRow key={f.id} className="border-l-2 border-l-destructive/40">
                      <TableCell className="py-2 pl-4 align-top">
                        <p className="text-xs font-medium">{time}</p>
                        <p className="text-xs text-muted-foreground">{date}</p>
                      </TableCell>
                      <TableCell className="py-2 align-top">
                        <p className="text-sm leading-tight">{f.actorName ?? <span className="text-muted-foreground">System</span>}</p>
                        {f.actorEmail && f.actorEmail !== f.actorName && (
                          <p className="text-xs text-muted-foreground">{f.actorEmail}</p>
                        )}
                      </TableCell>
                      <TableCell className="py-2 align-top">
                        <p className="text-sm font-medium leading-tight max-w-48 truncate" title={f.action ?? ''}>
                          {f.action ?? <span className="text-muted-foreground">—</span>}
                        </p>
                        <div className="mt-0.5"><CategoryBadge category={f.actionCategory} /></div>
                      </TableCell>
                      <TableCell className="py-2 align-top max-w-72">
                        {f.errorMessage ? (
                          <p
                            className="text-xs text-destructive leading-snug line-clamp-2 font-mono bg-destructive/5 rounded px-1.5 py-1"
                            title={f.errorMessage}
                          >
                            {f.errorMessage}
                          </p>
                        ) : f.status ? (
                          <Badge variant="destructive" className="text-xs">{f.status}</Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="py-2 align-top">
                        {f.resourceName || f.resourceType ? (
                          <>
                            <p className="text-sm leading-tight">{f.resourceName ?? '—'}</p>
                            {f.resourceType && (
                              <p className="text-xs text-muted-foreground capitalize">{f.resourceType}</p>
                            )}
                          </>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="py-2 align-top">
                        {f.merchantName ? (
                          <p className="text-sm">{f.merchantName}</p>
                        ) : (
                          <span className="text-xs text-muted-foreground">Platform</span>
                        )}
                      </TableCell>
                      <TableCell className="py-2 pr-4 align-top">
                        <SeverityBadge severity={f.severity} />
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
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

  const applySearch = useCallback(() => { setSearch(searchInput); setPage(0) }, [searchInput])

  const logs: AuditLogRow[]   = data?.data  ?? []
  const total: number         = data?.total ?? 0
  const totalPages            = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Layers className="h-4 w-4 text-muted-foreground" />
          Full Event Log
          {!isLoading && total > 0 && (
            <Badge variant="secondary" className="text-xs">{total.toLocaleString()} events</Badge>
          )}
        </CardTitle>
        <CardDescription>Filterable, paginated view of every audit entry — newest first</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Filter bar */}
        <div className="flex flex-wrap gap-2">
          <div className="flex gap-2 flex-1 min-w-56">
            <Input
              placeholder="Search action, actor, resource…"
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && applySearch()}
              className="h-9 text-sm"
            />
            <Button size="sm" variant="outline" className="h-9 px-3" onClick={applySearch}>
              <Search className="h-4 w-4" />
            </Button>
          </div>
          <Select value={category} onValueChange={v => { setCategory(v); setPage(0) }}>
            <SelectTrigger className="h-9 w-40 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              {ACTION_CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={severity} onValueChange={v => { setSeverity(v); setPage(0) }}>
            <SelectTrigger className="h-9 w-38 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              {SEVERITIES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {/* Table */}
        <div className="rounded-lg border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="text-xs w-36">Time</TableHead>
                <TableHead className="text-xs">Actor</TableHead>
                <TableHead className="text-xs">Action</TableHead>
                <TableHead className="text-xs">Category</TableHead>
                <TableHead className="text-xs">Resource</TableHead>
                <TableHead className="text-xs">Merchant</TableHead>
                <TableHead className="text-xs">Severity</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 7 }).map((_, j) => (
                      <TableCell key={j} className="py-2"><Skeleton className="h-4 w-full" /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : logs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground text-sm py-10">
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
                      <TableCell className="py-2 align-top">
                        <p className="text-xs font-medium text-foreground">{time}</p>
                        <p className="text-xs text-muted-foreground">{date}</p>
                      </TableCell>
                      <TableCell className="text-sm py-2">
                        {log.actor_name ?? <span className="text-muted-foreground">System</span>}
                      </TableCell>
                      <TableCell className="text-sm py-2 font-medium max-w-48 truncate" title={log.action}>
                        {log.action}
                      </TableCell>
                      <TableCell className="py-2">
                        <CategoryBadge category={log.action_category} />
                      </TableCell>
                      <TableCell className="py-2 align-top">
                        {log.resource_name || log.resource_type ? (
                          <>
                            <p className="text-sm">{log.resource_name ?? '—'}</p>
                            {log.resource_type && <p className="text-xs text-muted-foreground capitalize">{log.resource_type}</p>}
                          </>
                        ) : <span className="text-xs text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="py-2 align-top">
                        {log.merchants?.name ? (
                          <>
                            <p className="text-sm">{log.merchants.name}</p>
                            {log.location?.name && <p className="text-xs text-muted-foreground">{log.location.name}</p>}
                          </>
                        ) : <span className="text-xs text-muted-foreground">Platform</span>}
                      </TableCell>
                      <TableCell className="py-2">
                        <SeverityBadge severity={log.severity} />
                      </TableCell>
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
      </CardContent>
    </Card>
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
