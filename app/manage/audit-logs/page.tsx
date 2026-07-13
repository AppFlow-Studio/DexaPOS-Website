'use client'

import { Fragment, useEffect, useMemo, useState } from 'react'
import { format, formatDistanceToNow } from 'date-fns'
import {
  AlertTriangle,
  Bookmark,
  BookmarkCheck,
  ChevronDown,
  ChevronUp,
  Copy,
  Download,
  RefreshCcwDot,
  Search,
  ShieldAlert,
  Zap,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { cn } from '@/lib/utils'
import { usePlatformAuditLogs } from '@/lib/queries/use-platform-analytics'
import type { PlatformAuditLogFilters, PlatformAuditLogRow } from '@/app/manage/actions/hq-platform/analytics'
import { MerchantSearchSelect } from '@/components/admin/MerchantSearchSelect'
import { buildAuditSentence, formatChangesForDisplay } from '@/lib/audit/sentence-templates'
import type { AuditLogWithLocation } from '@/types/audit-log'
import { PII_ACCESS_TYPES, PII_ACCESS_TYPE_LABELS } from '@/types/audit-log'

const PAGE_SIZE = 50

const COMMON_ACTION_CATEGORIES = [
  'merchant', 'user_management', 'device', 'staff', 'notes',
  'settings', 'authentication', 'order', 'inventory', 'system',
]

// ─── Anomaly Detection (client-side) ─────────────────────────────────────────

interface AnomalyInfo {
  id: string
  reason: string
}

function detectAnomalies(rows: PlatformAuditLogRow[]): Map<string, string> {
  const result = new Map<string, string>() // id → reason

  // Pattern 1: Same actor voiding/cancelling 5+ orders within 1 hour
  const voidsByActor = new Map<string, Array<{ time: number; id: string }>>()
  rows.forEach((row) => {
    const actionLower = (row.action || '').toLowerCase()
    if ((actionLower.includes('void') || actionLower.includes('cancel')) && row.actor_user_id) {
      const bucket = voidsByActor.get(row.actor_user_id) ?? []
      bucket.push({ time: new Date(row.created_at).getTime(), id: row.id })
      voidsByActor.set(row.actor_user_id, bucket)
    }
  })
  voidsByActor.forEach((events) => {
    for (let i = 0; i < events.length; i++) {
      const inWindow = events.filter(e => Math.abs(e.time - events[i].time) <= 3_600_000)
      if (inWindow.length >= 5) {
        inWindow.forEach((e) => {
          if (!result.has(e.id)) result.set(e.id, `${inWindow.length} voids/cancels by same actor within 1 hour`)
        })
      }
    }
  })

  // Pattern 2: Bulk deletions — 5+ deletes in 1 hour by same actor
  const deletesByActor = new Map<string, Array<{ time: number; id: string }>>()
  rows.forEach((row) => {
    const actionLower = (row.action || '').toLowerCase()
    if (actionLower.includes('delet') && row.actor_user_id) {
      const bucket = deletesByActor.get(row.actor_user_id) ?? []
      bucket.push({ time: new Date(row.created_at).getTime(), id: row.id })
      deletesByActor.set(row.actor_user_id, bucket)
    }
  })
  deletesByActor.forEach((events) => {
    for (let i = 0; i < events.length; i++) {
      const inWindow = events.filter(e => Math.abs(e.time - events[i].time) <= 3_600_000)
      if (inWindow.length >= 5) {
        inWindow.forEach((e) => {
          if (!result.has(e.id)) result.set(e.id, `${inWindow.length} bulk deletions by same actor within 1 hour`)
        })
      }
    }
  })

  // Pattern 3: After-hours access (10pm–5am local time)
  rows.forEach((row) => {
    if (!row.actor_user_id) return
    const hour = new Date(row.created_at).getHours()
    if (hour >= 22 || hour < 5) {
      if (!result.has(row.id)) result.set(row.id, `After-hours access at ${hour}:00`)
    }
  })

  return result
}

// ─── Flag Persistence (localStorage) ─────────────────────────────────────────

const FLAG_KEY = 'dexa_admin_flagged_audit_logs'

function loadFlaggedIds(): Set<string> {
  if (typeof window === 'undefined') return new Set()
  try {
    const raw = localStorage.getItem(FLAG_KEY)
    return raw ? new Set<string>(JSON.parse(raw)) : new Set()
  } catch {
    return new Set()
  }
}

function saveFlaggedIds(ids: Set<string>): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(FLAG_KEY, JSON.stringify([...ids]))
  } catch { /* ignore */ }
}

// ─── Helper Functions ─────────────────────────────────────────────────────────

function formatActionLabel(value?: string): string {
  if (!value) return '-'
  return value.replace(/\./g, ' ').replace(/_/g, ' ').split(' ').filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ')
}

function normalizeStatus(value?: string): 'success' | 'failed' | 'unknown' {
  if (!value) return 'success'
  const n = value.toLowerCase()
  if (n === 'failed' || n === 'error') return 'failed'
  if (n === 'success') return 'success'
  return 'unknown'
}

function severityClass(value?: string): string {
  const n = (value || '').toLowerCase()
  if (n === 'critical' || n === 'error') return 'border-red-300 bg-red-100 text-red-800 dark:bg-red-950/30 dark:text-red-300'
  if (n === 'warning') return 'border-amber-300 bg-amber-100 text-amber-800 dark:bg-amber-950/30 dark:text-amber-300'
  return 'border-blue-300 bg-blue-100 text-blue-800 dark:bg-blue-950/30 dark:text-blue-300'
}

function statusClass(value: 'success' | 'failed' | 'unknown'): string {
  if (value === 'failed') return 'border-red-300 bg-red-100 text-red-800'
  if (value === 'unknown') return 'border-slate-300 bg-slate-100 text-slate-800'
  return 'border-emerald-300 bg-emerald-100 text-emerald-800'
}

function orgTypeClass(orgType?: string): string {
  const t = (orgType || '').toLowerCase()
  if (t === 'hq' || t === 'internal') return 'border-indigo-300 bg-indigo-100 text-indigo-800'
  if (t === 'carrier') return 'border-cyan-300 bg-cyan-100 text-cyan-800'
  if (t === 'merchant') return 'border-emerald-300 bg-emerald-100 text-emerald-800'
  return 'border-slate-300 bg-slate-100 text-slate-600'
}

function inferOrgType(row: PlatformAuditLogRow): string {
  if (row.organization_type) return row.organization_type
  if (row.merchant_id) return 'Merchant'
  return 'System'
}

function relativeTime(dateStr: string): string {
  return formatDistanceToNow(new Date(dateStr), { addSuffix: true })
}

function absoluteTime(dateStr: string): string {
  return format(new Date(dateStr), 'MMM d, yyyy h:mm:ss a')
}

// ─── CSV Export ───────────────────────────────────────────────────────────────

function escapeCsv(value: unknown): string {
  const raw = value == null ? '' : String(value)
  return `"${raw.replace(/"/g, '""')}"`
}

function buildCsv(rows: PlatformAuditLogRow[]): string {
  const headers = ['Timestamp', 'Actor Name', 'Actor Email', 'Actor Role', 'Action', 'Category',
    'Resource Type', 'Resource Name', 'Resource ID', 'Merchant', 'Location', 'Org Type',
    'Severity', 'Status', 'Error Message', 'Changes', 'Metadata']
  const lines = rows.map((row) => {
    const status = normalizeStatus(row.status)
    return [row.created_at, row.actor_name, row.actor_email, row.actor_role, row.action,
      row.action_category, row.resource_type, row.resource_name, row.resource_id,
      row.merchant_name || row.merchant_id, row.location_name || row.location_id,
      inferOrgType(row), row.severity, status, row.error_message,
      row.changes ? JSON.stringify(row.changes) : '',
      row.metadata ? JSON.stringify(row.metadata) : ''].map(escapeCsv).join(',')
  })
  return [headers.map(escapeCsv).join(','), ...lines].join('\n')
}

function downloadCsv(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}

// ─── Change Diff Viewer ───────────────────────────────────────────────────────

function ChangeDiffViewer({ row }: { row: PlatformAuditLogRow }) {
  const [showRaw, setShowRaw] = useState(false)
  const changeRows = formatChangesForDisplay(
    row.changes as AuditLogWithLocation['changes']
  )

  if (!row.changes) {
    return <p className="text-xs text-muted-foreground italic">No change payload recorded</p>
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Changes</p>
        <button
          onClick={() => setShowRaw((v) => !v)}
          className="text-[10px] text-muted-foreground hover:text-foreground underline"
        >
          {showRaw ? 'Show summary' : 'Show raw JSON'}
        </button>
      </div>

      {showRaw ? (
        <pre className="max-h-72 overflow-auto rounded-md border bg-background p-3 text-xs">
          {JSON.stringify(row.changes, null, 2)}
        </pre>
      ) : changeRows.length > 0 ? (
        <div className="rounded-md border overflow-hidden divide-y">
          {changeRows.map((cr, i) => (
            <div key={i} className="grid grid-cols-[120px_1fr_20px_1fr] items-center gap-2 px-3 py-2 bg-background text-xs">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground truncate">{cr.field}</span>
              <div className={cn('rounded px-2 py-0.5 font-mono break-all',
                cr.from !== null
                  ? 'bg-red-50 text-red-800 dark:bg-red-950/20 dark:text-red-300'
                  : 'text-muted-foreground italic')}>
                {cr.from ?? '(new)'}
              </div>
              <span className="text-center text-muted-foreground">→</span>
              <div className={cn('rounded px-2 py-0.5 font-mono break-all',
                cr.to !== null
                  ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/20 dark:text-emerald-300'
                  : 'text-muted-foreground italic')}>
                {cr.to ?? '(removed)'}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <pre className="max-h-72 overflow-auto rounded-md border bg-background p-3 text-xs">
          {JSON.stringify(row.changes, null, 2)}
        </pre>
      )}
    </div>
  )
}

// ─── Expanded Row Detail ──────────────────────────────────────────────────────

function ExpandedDetail({ row, anomalyReason }: { row: PlatformAuditLogRow; anomalyReason?: string }) {
  const fakeLog = rowToFakeLog(row)
  const { sentence, highlight } = buildAuditSentence(fakeLog)

  function copyResourceId() {
    if (row.resource_id) navigator.clipboard.writeText(row.resource_id)
  }

  return (
    <TableRow>
      <TableCell colSpan={9} className="bg-muted/20 p-0">
        <div className="p-4 space-y-4">
          {/* Anomaly warning banner */}
          {anomalyReason && (
            <div className="flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/20 px-3 py-2 text-sm text-amber-800 dark:text-amber-300">
              <ShieldAlert className="h-4 w-4 shrink-0" />
              <span><strong>Anomaly detected:</strong> {anomalyReason}</span>
            </div>
          )}

          {/* Human-readable summary */}
          <div className="rounded-lg border bg-card p-3 space-y-1">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">What happened</p>
            <p className="text-sm font-medium leading-snug">{sentence}</p>
            {highlight && <p className="text-sm text-muted-foreground">{highlight}</p>}
            <div className="flex flex-wrap items-center gap-3 pt-1 text-xs text-muted-foreground">
              <span title={absoluteTime(row.created_at)}>{relativeTime(row.created_at)}</span>
              {row.resource_id && (
                <button
                  onClick={copyResourceId}
                  className="flex items-center gap-1 hover:text-foreground transition-colors"
                  title="Copy resource ID"
                >
                  <Copy className="h-3 w-3" />
                  Copy resource ID
                </button>
              )}
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {/* Before/after diff */}
            <ChangeDiffViewer row={row} />

            {/* Metadata + error */}
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Metadata</p>
              <pre className="max-h-72 overflow-auto rounded-md border bg-background p-3 text-xs">
                {row.metadata ? JSON.stringify(row.metadata, null, 2) : 'No metadata'}
              </pre>
              {row.error_message && (
                <div className="rounded-md border border-red-300 bg-red-50 p-2 text-xs text-red-800 dark:bg-red-950/20 dark:text-red-300">
                  <strong>Error:</strong> {row.error_message}
                </div>
              )}
            </div>
          </div>
        </div>
      </TableCell>
    </TableRow>
  )
}

// ─── Helper: row → fake AuditLogWithLocation ──────────────────────────────────

function rowToFakeLog(row: PlatformAuditLogRow): AuditLogWithLocation {
  return {
    id: row.id,
    action: row.action,
    action_category: row.action_category as AuditLogWithLocation['action_category'],
    severity: row.severity as AuditLogWithLocation['severity'],
    resource_type: row.resource_type,
    resource_name: row.resource_name,
    resource_id: row.resource_id,
    actor_name: row.actor_name,
    actor_user_id: null,
    actor_role: row.actor_role,
    merchant_id: row.merchant_id as unknown as string,
    location_id: row.location_id as unknown as string,
    changes: row.changes as AuditLogWithLocation['changes'],
    metadata: row.metadata as AuditLogWithLocation['metadata'],
    created_at: row.created_at ?? '',
    location: row.location_name
      ? { id: row.location_id ?? '', name: row.location_name }
      : undefined,
  } as AuditLogWithLocation
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AuditLogsPage() {
  // Filters
  const [search, setSearch] = useState('')
  const [actor, setActor] = useState('')
  const [actionCategory, setActionCategory] = useState('all')
  const [severity, setSeverity] = useState('all')
  const [status, setStatus] = useState<'all' | 'success' | 'failed'>('all')
  const [merchantId, setMerchantId] = useState('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [resourceType, setResourceType] = useState('')
  const [hasError, setHasError] = useState(false)
  // 'any' = no PII filter; 'all' = pii_access_type IS NOT NULL; specific value = exact match
  const [piiAccess, setPiiAccess] = useState<'any' | 'all' | (typeof PII_ACCESS_TYPES)[number]>('any')

  // Tabs
  const [activeTab, setActiveTab] = useState<'all' | 'flagged'>('all')

  // Table state
  const [page, setPage] = useState(1)
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null)

  // Export
  const [isExporting, setIsExporting] = useState(false)
  const [exportNote, setExportNote] = useState<string | null>(null)

  // Flag state (localStorage persisted)
  const [flaggedIds, setFlaggedIds] = useState<Set<string>>(() => loadFlaggedIds())

  function toggleFlag(id: string) {
    setFlaggedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      saveFlaggedIds(next)
      return next
    })
  }

  const filters = useMemo<PlatformAuditLogFilters>(
    () => ({
      search: search.trim() || undefined,
      actor: actor.trim() || undefined,
      actionCategory: actionCategory === 'all' ? undefined : actionCategory,
      severity: severity === 'all' ? undefined : severity,
      status: status === 'all' ? undefined : status,
      merchantIds: merchantId === 'all' ? undefined : [merchantId],
      dateFrom: dateFrom ? new Date(`${dateFrom}T00:00:00`).toISOString() : undefined,
      dateTo: dateTo ? new Date(`${dateTo}T23:59:59.999`).toISOString() : undefined,
      resourceType: resourceType.trim() || undefined,
      hasError: hasError || undefined,
      piiAccessOnly: piiAccess === 'all' ? true : undefined,
      piiAccessType: piiAccess !== 'any' && piiAccess !== 'all' ? piiAccess : undefined,
    }),
    [search, actor, actionCategory, severity, status, merchantId, dateFrom, dateTo, resourceType, hasError, piiAccess]
  )

  useEffect(() => { setPage(1) }, [filters])

  const { data: auditResult, isLoading, isFetching, refetch } = usePlatformAuditLogs(
    filters, PAGE_SIZE, (page - 1) * PAGE_SIZE
  )

  const allRows = auditResult?.data ?? []
  const total = auditResult?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const showingFrom = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1
  const showingTo = total === 0 ? 0 : Math.min((page - 1) * PAGE_SIZE + allRows.length, total)

  // Anomaly detection runs on loaded rows
  const anomalyMap = useMemo(() => detectAnomalies(allRows), [allRows])

  // Tab filtering
  const rows = useMemo(() => {
    if (activeTab === 'flagged') {
      return allRows.filter((r) => flaggedIds.has(r.id) || anomalyMap.has(r.id))
    }
    return allRows
  }, [activeTab, allRows, flaggedIds, anomalyMap])

  const flaggedCount = useMemo(
    () => allRows.filter((r) => flaggedIds.has(r.id) || anomalyMap.has(r.id)).length,
    [allRows, flaggedIds, anomalyMap]
  )

  useEffect(() => {
    if (page > totalPages) setPage(totalPages)
  }, [page, totalPages])

  function clearFilters() {
    setSearch(''); setActor(''); setActionCategory('all'); setSeverity('all')
    setStatus('all'); setMerchantId('all'); setDateFrom(''); setDateTo('')
    setResourceType(''); setHasError(false); setPiiAccess('any'); setPage(1)
  }

  async function handleExport() {
    setIsExporting(true); setExportNote(null)
    try {
      const { getPlatformAuditLogsExport } = await import('@/app/manage/actions/hq-platform/analytics')
      const result = await getPlatformAuditLogsExport(filters, 10000)
      const csv = buildCsv(result.data)
      downloadCsv(`DEXA_Admin_Audit_Logs_${format(new Date(), 'yyyy-MM-dd_HHmm')}.csv`, csv)
      if (result.capped) setExportNote(`Export capped at ${result.cap.toLocaleString()} rows.`)
    } catch (e) {
      console.error('[AuditLogsPage] export:', e)
      setExportNote('Export failed. Please retry.')
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <div className="space-y-6 min-w-0 overflow-x-hidden">
      {/* Header */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Audit Logs</h1>
          <p className="text-muted-foreground">
            Platform-wide event history with anomaly detection and flagging.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => void refetch()} disabled={isFetching}>
            <RefreshCcwDot className="mr-2 h-4 w-4" />
            Refresh
          </Button>
          <Button variant="outline" onClick={handleExport} disabled={isExporting}>
            <Download className="mr-2 h-4 w-4" />
            {isExporting ? 'Exporting...' : 'Export CSV'}
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b">
        {[
          { id: 'all', label: 'All Logs', count: total },
          { id: 'flagged', label: 'Flagged Activity', count: flaggedCount, icon: <ShieldAlert className="h-3.5 w-3.5" /> },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as 'all' | 'flagged')}
            className={cn(
              'flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors',
              activeTab === tab.id
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            {tab.icon}
            {tab.label}
            {tab.count > 0 && (
              <span className={cn(
                'ml-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold',
                activeTab === tab.id ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
              )}>
                {tab.id === 'all' ? tab.count.toLocaleString() : tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Filters */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Filters</CardTitle>
          <CardDescription>Narrow by category, severity, merchant, actor, and date range.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Row 1: Search + Actor + Resource Type */}
          <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 md:grid-cols-4">
            <label className="flex flex-col gap-1 text-sm sm:col-span-2 md:col-span-2">
              <span className="text-muted-foreground">Search</span>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input className="pl-9" placeholder="Action, actor, resource name..."
                  value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-muted-foreground">Actor</span>
              <Input placeholder="Name or email" value={actor} onChange={(e) => setActor(e.target.value)} />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-muted-foreground">Resource Type</span>
              <Input placeholder="menu_item, order, staff_profile..."
                value={resourceType} onChange={(e) => setResourceType(e.target.value)} />
            </label>
          </div>

          {/* Row 2: Category + Severity + Status + Merchant + Clear */}
          <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 md:grid-cols-6">
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-muted-foreground">Category</span>
              <select className="h-9 rounded-md border bg-background px-2 text-sm"
                value={actionCategory} onChange={(e) => setActionCategory(e.target.value)}>
                <option value="all">All categories</option>
                {COMMON_ACTION_CATEGORIES.map((v) => (
                  <option key={v} value={v}>{formatActionLabel(v)}</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-muted-foreground">Severity</span>
              <select className="h-9 rounded-md border bg-background px-2 text-sm"
                value={severity} onChange={(e) => setSeverity(e.target.value)}>
                <option value="all">All</option>
                <option value="info">Info</option>
                <option value="warning">Warning</option>
                <option value="error">Error</option>
                <option value="critical">Critical</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-muted-foreground">Status</span>
              <select className="h-9 rounded-md border bg-background px-2 text-sm"
                value={status} onChange={(e) => setStatus(e.target.value as 'all' | 'success' | 'failed')}>
                <option value="all">All</option>
                <option value="success">Success</option>
                <option value="failed">Failed</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm sm:col-span-2 md:col-span-2">
              <span className="text-muted-foreground">Merchant</span>
              <MerchantSearchSelect
                value={merchantId}
                onChange={setMerchantId}
                placeholder="Search merchants..."
              />
            </label>
            <div className="flex items-end">
              <Button variant="ghost" className="w-full" onClick={clearFilters}>Clear</Button>
            </div>
          </div>

          {/* Row 3: Dates + PII Access + Has Error toggle */}
          <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 md:grid-cols-4 items-end">
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-muted-foreground">Date From</span>
              <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-muted-foreground">Date To</span>
              <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-muted-foreground">PII Access</span>
              <select
                className="h-9 rounded-md border bg-background px-2 text-sm"
                value={piiAccess}
                onChange={(e) => {
                  setPiiAccess(e.target.value as typeof piiAccess)
                  setPage(1)
                }}
              >
                <option value="any">Any (no PII filter)</option>
                <option value="all">PII access only</option>
                {PII_ACCESS_TYPES.map((t) => (
                  <option key={t} value={t}>{PII_ACCESS_TYPE_LABELS[t]}</option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer select-none pt-5">
              <input
                type="checkbox"
                checked={hasError}
                onChange={(e) => { setHasError(e.target.checked); setPage(1) }}
                className="h-4 w-4 rounded border-border accent-primary"
              />
              <span>Has error only</span>
            </label>
          </div>

          {exportNote && (
            <div className="rounded-md border border-amber-300 bg-amber-50 p-2 text-sm text-amber-800">
              {exportNote}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="pt-6">
          {activeTab === 'flagged' && rows.length === 0 && !isLoading && (
            <div className="py-12 text-center">
              <ShieldAlert className="mx-auto h-10 w-10 text-muted-foreground/30 mb-3" />
              <p className="font-medium">No flagged activity in this filter scope</p>
              <p className="text-sm text-muted-foreground mt-1">
                Anomalies and manually starred entries appear here.
              </p>
            </div>
          )}

          {(activeTab === 'all' || rows.length > 0) && (
            <div className="max-h-[62vh] overflow-x-auto overflow-y-auto rounded-md border">
              <Table>
                <TableHeader className="sticky top-0 z-20 bg-card">
                  <TableRow>
                    <TableHead className="w-[130px]">Timestamp</TableHead>
                    <TableHead>Organization</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead>What Happened</TableHead>
                    <TableHead>Who</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Severity</TableHead>
                    <TableHead>Status</TableHead>
                    {/* Actions column: expand + flag */}
                    <TableHead className="w-[88px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading || isFetching ? (
                    Array.from({ length: 8 }).map((_, i) => (
                      <TableRow key={`loading-${i}`}>
                        <TableCell colSpan={9}><Skeleton className="h-8 w-full" /></TableCell>
                      </TableRow>
                    ))
                  ) : rows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9} className="py-10 text-center text-muted-foreground">
                        No audit logs found.
                      </TableCell>
                    </TableRow>
                  ) : (
                    rows.map((row) => {
                      const isExpanded = expandedRowId === row.id
                      const statusValue = normalizeStatus(row.status)
                      const orgType = inferOrgType(row)
                      const isFlagged = flaggedIds.has(row.id)
                      const anomalyReason = anomalyMap.get(row.id)
                      const isAnomaly = !!anomalyReason
                      const { sentence, highlight } = buildAuditSentence(rowToFakeLog(row))

                      return (
                        <Fragment key={row.id}>
                          <TableRow className={cn(
                            statusValue === 'failed' && 'bg-red-50/40 hover:bg-red-50/60 dark:bg-red-950/10',
                            isAnomaly && !isFlagged && 'bg-amber-50/30 dark:bg-amber-950/10',
                            isFlagged && 'bg-amber-50/50 dark:bg-amber-950/20',
                          )}>
                            {/* Timestamp */}
                            <TableCell className="text-xs">
                              <div
                                className="flex flex-col gap-0.5 cursor-default"
                                title={absoluteTime(row.created_at)}
                              >
                                <span className="font-medium text-foreground">
                                  {relativeTime(row.created_at)}
                                </span>
                                <span className="text-muted-foreground text-[10px]">
                                  {format(new Date(row.created_at), 'MMM d, yyyy')}
                                </span>
                              </div>
                            </TableCell>

                            {/* Organization: merchant name + org type badge */}
                            <TableCell>
                              <div className="flex flex-col gap-1">
                                <span className="text-sm font-medium leading-none">
                                  {row.merchant_name || row.organization_name || '—'}
                                </span>
                                <Badge variant="outline" className={cn('h-4 px-1.5 text-[10px] w-fit', orgTypeClass(orgType))}>
                                  {orgType}
                                </Badge>
                              </div>
                            </TableCell>

                            {/* Location */}
                            <TableCell className="text-sm text-muted-foreground">
                              {row.location_name || '—'}
                            </TableCell>

                            {/* What Happened */}
                            <TableCell className="max-w-[260px]">
                              <div className="space-y-0.5">
                                {isAnomaly && (
                                  <div className="flex items-center gap-1 text-[10px] text-amber-600 dark:text-amber-400 font-semibold">
                                    <Zap className="h-3 w-3" />
                                    Anomaly detected
                                  </div>
                                )}
                                <p className="text-sm font-medium leading-snug line-clamp-2">{sentence}</p>
                                {highlight && (
                                  <p className="text-xs text-muted-foreground">{highlight}</p>
                                )}
                              </div>
                            </TableCell>

                            {/* Who */}
                            <TableCell>
                              <div className="flex flex-col gap-0.5">
                                <span className="text-sm font-medium">{row.actor_name || '—'}</span>
                                {row.actor_role && (
                                  <Badge variant="outline" className="h-4 px-1.5 text-[10px] w-fit border-slate-300 bg-slate-50 text-slate-700 dark:bg-slate-900 dark:text-slate-300">
                                    {row.actor_role}
                                  </Badge>
                                )}
                                {!row.actor_role && row.actor_email && (
                                  <span className="text-xs text-muted-foreground">{row.actor_email}</span>
                                )}
                              </div>
                            </TableCell>

                            {/* Category */}
                            <TableCell>
                              <Badge variant="outline" className="capitalize whitespace-nowrap text-[11px]">
                                {row.action_category || '—'}
                              </Badge>
                            </TableCell>

                            {/* Severity */}
                            <TableCell>
                              <Badge variant="outline" className={severityClass(row.severity)}>
                                {row.severity || 'info'}
                              </Badge>
                            </TableCell>

                            {/* Status */}
                            <TableCell>
                              <Badge variant="outline" className={statusClass(statusValue)}>
                                {statusValue}
                              </Badge>
                            </TableCell>

                            {/* Actions: flag + expand */}
                            <TableCell>
                              <div className="flex items-center gap-1">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className={cn('h-7 w-7', isFlagged && 'text-amber-500')}
                                  title={isFlagged ? 'Remove flag' : 'Flag for review'}
                                  onClick={() => toggleFlag(row.id)}
                                >
                                  {isFlagged
                                    ? <BookmarkCheck className="h-3.5 w-3.5" />
                                    : <Bookmark className="h-3.5 w-3.5" />}
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7"
                                  onClick={() => setExpandedRowId(isExpanded ? null : row.id)}
                                >
                                  {isExpanded
                                    ? <ChevronUp className="h-4 w-4" />
                                    : <ChevronDown className="h-4 w-4" />}
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>

                          {isExpanded && (
                            <ExpandedDetail row={row} anomalyReason={anomalyReason} />
                          )}
                        </Fragment>
                      )
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          )}

          {/* Pagination — only shown for All Logs tab */}
          {activeTab === 'all' && (
            <div className="mt-4 flex flex-col gap-2 text-sm text-muted-foreground md:flex-row md:items-center md:justify-between">
              <span>
                Showing {showingFrom.toLocaleString()}–{showingTo.toLocaleString()} of {total.toLocaleString()}
              </span>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" disabled={page <= 1}
                  onClick={() => setPage((v) => Math.max(1, v - 1))}>
                  Previous
                </Button>
                <span>Page {page} of {totalPages}</span>
                <Button variant="outline" size="sm" disabled={page >= totalPages}
                  onClick={() => setPage((v) => Math.min(totalPages, v + 1))}>
                  Next
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
