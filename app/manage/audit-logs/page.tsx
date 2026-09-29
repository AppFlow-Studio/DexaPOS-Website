'use client'

import { Fragment, useEffect, useMemo, useState } from 'react'
import { format, formatDistanceToNow } from 'date-fns'
import {
  Bookmark,
  BookmarkCheck,
  ChevronDown,
  Copy,
  Download,
  RefreshCcwDot,
  Search,
  ShieldAlert,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
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
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PageHeader, PageShell, Panel, PanelSection } from '@/components/dashboard/shell'
import { PaginationBar } from '@/components/dashboard/PaginationBar'
import { useClientPagination } from '@/lib/hooks/useClientPagination'
import type { PaginationMeta } from '@/types/pagination'
import { cn } from '@/lib/utils'
import { usePlatformAuditLogs } from '@/lib/queries/use-platform-analytics'
import type { PlatformAuditLogFilters, PlatformAuditLogRow } from '@/app/manage/actions/hq-platform/analytics'
import { MerchantSearchSelect } from '@/components/admin/MerchantSearchSelect'
import { buildAuditSentence, formatChangesForDisplay } from '@/lib/audit/sentence-templates'
import type { AuditLogWithLocation } from '@/types/audit-log'
import { PII_ACCESS_TYPES, PII_ACCESS_TYPE_LABELS, type PiiAccessType } from '@/types/audit-log'
import {
  CardField,
  CardFields,
  CardGridEmpty,
  FilterDate,
  FilterSelect,
  LoadError,
  RecordCard,
  RecordCardSkeletons,
  TableEmptyRow,
} from '@/app/manage/transactions/components/ledger-primitives'

/** Rows per page, table and card grid alike (UI-DESIGN-SYSTEM §5.7). */
const PAGE_SIZE = 10

/**
 * Rows fetched per request. Anomaly detection looks for bursts (5+ voids by one
 * actor within an hour), so it needs a wider window than a single 10-row page.
 * The pager slices this window on the client and fetches the next one when the
 * user pages past it.
 */
const WINDOW_SIZE = 50
const PAGES_PER_WINDOW = WINDOW_SIZE / PAGE_SIZE

/** Columns in the wide table — loading, empty and detail rows span all of them. */
const COLUMN_COUNT = 9

const COMMON_ACTION_CATEGORIES = [
  'merchant', 'user_management', 'device', 'staff', 'notes',
  'settings', 'authentication', 'order', 'inventory', 'settlement', 'system',
]

const CATEGORY_OPTIONS = COMMON_ACTION_CATEGORIES.map((value) => ({
  value,
  label: formatActionLabel(value),
}))

const SEVERITY_OPTIONS = [
  { value: 'info', label: 'Info' },
  { value: 'warning', label: 'Warning' },
  { value: 'error', label: 'Error' },
  { value: 'critical', label: 'Critical' },
]

const STATUS_OPTIONS = [
  { value: 'success', label: 'Success' },
  { value: 'failed', label: 'Failed' },
]

/** 'all' = no PII filter · 'any' = any PII access · otherwise one access type. */
type PiiFilter = 'all' | 'any' | PiiAccessType

const PII_OPTIONS = [
  { value: 'any', label: 'Any PII access' },
  ...PII_ACCESS_TYPES.map((value) => ({ value, label: PII_ACCESS_TYPE_LABELS[value] })),
]

type TabId = 'all' | 'flagged'

// ─── Anomaly Detection (client-side) ─────────────────────────────────────────

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
  if (!value) return '—'
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

const STATUS_LABELS: Record<ReturnType<typeof normalizeStatus>, string> = {
  success: 'Success',
  failed: 'Failed',
  unknown: 'Unknown',
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

// ─── Change Diff Viewer ───────────────────────────────────────────────────────

function ChangeDiffViewer({ row }: { row: PlatformAuditLogRow }) {
  const [showRaw, setShowRaw] = useState(false)

  if (!row.changes) {
    return (
      <div className="min-w-0 space-y-2">
        <p className="text-sm text-muted-foreground">Changes</p>
        <p className="text-sm text-muted-foreground">This action didn&apos;t change any data.</p>
      </div>
    )
  }

  const changeRows = formatChangesForDisplay(row.changes as AuditLogWithLocation['changes'])
  const raw = showRaw || changeRows.length === 0

  return (
    <div className="min-w-0 space-y-2">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">Changes</p>
        {changeRows.length > 0 && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-3 text-xs text-muted-foreground"
            onClick={() => setShowRaw((v) => !v)}
          >
            {showRaw ? 'Show summary' : 'Show raw JSON'}
          </Button>
        )}
      </div>

      {raw ? (
        <pre className="thin-scrollbar max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-2xl bg-background/80 p-3 font-mono text-xs">
          {JSON.stringify(row.changes, null, 2)}
        </pre>
      ) : (
        // One row per field: the old value struck through, →, the new value
        // (§14.6.4). No tinted red/green wells and no dividers (§3.5, §5.5).
        <div className="rounded-2xl bg-background/80 px-4 py-1">
          {changeRows.map((cr, i) => (
            <div
              key={i}
              className="grid gap-1 py-2.5 @md:grid-cols-[minmax(0,8rem)_minmax(0,1fr)] @md:gap-4"
            >
              <span className="truncate text-xs text-muted-foreground @md:pt-0.5">{cr.field}</span>
              <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1 font-mono text-xs">
                {cr.from !== null ? (
                  <span className="break-words text-muted-foreground line-through">
                    <span className="sr-only">Changed from </span>
                    {cr.from}
                  </span>
                ) : (
                  <span className="font-sans italic text-muted-foreground">new</span>
                )}
                <span aria-hidden className="text-muted-foreground">→</span>
                {cr.to !== null ? (
                  <span className="break-words text-foreground">
                    <span className="sr-only">to </span>
                    {cr.to}
                  </span>
                ) : (
                  <span className="font-sans italic text-muted-foreground">removed</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Event Detail ─────────────────────────────────────────────────────────────

/**
 * The expanded detail for one audit event. Shared by the table row and the
 * phone card so the two views cannot drift apart (§5.3). A container query
 * lays the diff and metadata side by side only when there is room: in the
 * wide table, not in a card.
 */
function AuditEventDetail({
  row,
  anomalyReason,
  className,
}: {
  row: PlatformAuditLogRow
  anomalyReason?: string
  className?: string
}) {
  const { sentence, highlight } = buildAuditSentence(rowToFakeLog(row))
  const hasMetadata = !!row.metadata && Object.keys(row.metadata).length > 0

  function copyResourceId() {
    if (row.resource_id) navigator.clipboard.writeText(row.resource_id)
  }

  return (
    <div className={cn('@container min-w-0 space-y-4', className)}>
      {/* Anomalies and errors are said in words on a neutral well (§3.5). */}
      {anomalyReason && (
        <div className="flex items-start gap-2 rounded-2xl bg-background/80 px-4 py-3 text-sm">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
          <p className="min-w-0">
            <span className="font-medium">Anomaly detected:</span> {anomalyReason}
          </p>
        </div>
      )}
      {row.error_message && (
        <div className="rounded-2xl bg-background/80 px-4 py-3 text-sm">
          <p className="min-w-0 break-words">
            <span className="font-medium">Error:</span> {row.error_message}
          </p>
        </div>
      )}

      <div className="space-y-1">
        <p className="text-sm text-muted-foreground">What happened</p>
        <p className="text-sm font-medium leading-snug">{sentence}</p>
        {highlight && <p className="text-sm text-muted-foreground">{highlight}</p>}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-1 text-xs text-muted-foreground">
          <span className="tabular-nums">{absoluteTime(row.created_at)}</span>
          {row.resource_id && (
            <button
              type="button"
              onClick={copyResourceId}
              className="inline-flex items-center gap-1 transition-colors hover:text-foreground"
            >
              <Copy className="h-3 w-3" aria-hidden />
              Copy resource ID
            </button>
          )}
        </div>
      </div>

      <div className="grid gap-4 @3xl:grid-cols-2">
        <ChangeDiffViewer row={row} />

        <div className="min-w-0 space-y-2">
          <p className="text-sm text-muted-foreground">Metadata</p>
          {hasMetadata ? (
            <pre className="thin-scrollbar max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-2xl bg-background/80 p-3 font-mono text-xs">
              {JSON.stringify(row.metadata, null, 2)}
            </pre>
          ) : (
            <p className="text-sm text-muted-foreground">No metadata recorded for this event.</p>
          )}
        </div>
      </div>
    </div>
  )
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
  const [piiAccess, setPiiAccess] = useState<PiiFilter>('all')

  // Tabs
  const [activeTab, setActiveTab] = useState<TabId>('all')

  // Table state — `page` is the All-logs page across the whole result set.
  const [page, setPage] = useState(1)
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null)

  // Export
  const [isExporting, setIsExporting] = useState(false)
  const [exportNote, setExportNote] = useState<{ kind: 'capped' | 'failed'; text: string } | null>(null)

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
      piiAccessOnly: piiAccess === 'any' ? true : undefined,
      piiAccessType: piiAccess !== 'all' && piiAccess !== 'any' ? piiAccess : undefined,
    }),
    [search, actor, actionCategory, severity, status, merchantId, dateFrom, dateTo, resourceType, hasError, piiAccess]
  )

  const windowIndex = Math.floor((page - 1) / PAGES_PER_WINDOW)
  const windowOffset = windowIndex * WINDOW_SIZE

  const { data: auditResult, isLoading, isFetching, isError, refetch } = usePlatformAuditLogs(
    filters, WINDOW_SIZE, windowOffset
  )

  const windowRows = useMemo(() => auditResult?.data ?? [], [auditResult])
  const total = auditResult?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  // Anomaly detection runs on the loaded window
  const anomalyMap = useMemo(() => detectAnomalies(windowRows), [windowRows])

  const flaggedRows = useMemo(
    () => windowRows.filter((r) => flaggedIds.has(r.id) || anomalyMap.has(r.id)),
    [windowRows, flaggedIds, anomalyMap]
  )
  const flagged = useClientPagination(flaggedRows, PAGE_SIZE)
  const setFlaggedPage = flagged.setPage

  useEffect(() => {
    setPage(1)
    setFlaggedPage(1)
  }, [filters, setFlaggedPage])

  useEffect(() => {
    if (page > totalPages) setPage(totalPages)
  }, [page, totalPages])

  const pageStart = ((page - 1) % PAGES_PER_WINDOW) * PAGE_SIZE
  const allPageRows = windowRows.slice(pageStart, pageStart + PAGE_SIZE)
  const allPagination: PaginationMeta = {
    page,
    pageSize: PAGE_SIZE,
    total,
    totalPages,
    hasNextPage: page < totalPages,
    hasPreviousPage: page > 1,
  }

  const isFlaggedTab = activeTab === 'flagged'
  const rows = isFlaggedTab ? flagged.pageRows : allPageRows
  const pagination = isFlaggedTab ? flagged.pagination : allPagination
  const onPageChange = isFlaggedTab ? flagged.setPage : setPage

  const windowLabel = total === 0
    ? 'the loaded events'
    : `events ${(windowOffset + 1).toLocaleString()}–${Math.min(windowOffset + WINDOW_SIZE, total).toLocaleString()} of ${total.toLocaleString()}`

  const hasActiveFilters =
    search !== '' ||
    actor !== '' ||
    actionCategory !== 'all' ||
    severity !== 'all' ||
    status !== 'all' ||
    merchantId !== 'all' ||
    dateFrom !== '' ||
    dateTo !== '' ||
    resourceType !== '' ||
    hasError ||
    piiAccess !== 'all'

  function clearFilters() {
    setSearch(''); setActor(''); setActionCategory('all'); setSeverity('all')
    setStatus('all'); setMerchantId('all'); setDateFrom(''); setDateTo('')
    setResourceType(''); setHasError(false); setPiiAccess('all'); setPage(1)
  }

  async function handleExport() {
    setIsExporting(true); setExportNote(null)
    try {
      const { getPlatformAuditLogsExport } = await import('@/app/manage/actions/hq-platform/analytics')
      const result = await getPlatformAuditLogsExport(filters, 10000)
      const csv = buildCsv(result.data)
      downloadCsv(`DEXA_Admin_Audit_Logs_${format(new Date(), 'yyyy-MM-dd_HHmm')}.csv`, csv)
      if (result.capped) {
        setExportNote({
          kind: 'capped',
          text: `Export capped at ${result.cap.toLocaleString()} rows. Narrow the filters to export the rest.`,
        })
      }
    } catch (e) {
      console.error('[AuditLogsPage] export:', e)
      setExportNote({ kind: 'failed', text: 'The CSV could not be generated. Try again.' })
    } finally {
      setIsExporting(false)
    }
  }

  const showSkeleton = isLoading || isFetching

  let emptyTitle: string
  let emptyHint: string
  if (hasActiveFilters && total === 0) {
    emptyTitle = 'No audit events match these filters'
    emptyHint = 'Clear the search or filters to widen the results.'
  } else if (total === 0) {
    emptyTitle = 'No audit events yet'
    emptyHint = 'Events appear here as merchants and HQ staff make changes.'
  } else {
    // Only the Flagged tab can be empty while the result set is not.
    emptyTitle = `All clear — nothing flagged among ${windowLabel}`
    emptyHint = 'Anomalies and entries you flag appear here. Page through All logs to check other events.'
  }

  return (
    <PageShell as="div">
      <PageHeader
        title="Audit Logs"
        subtitle="Platform-wide event history with anomaly detection and flagging"
        actions={
          <>
            <Button
              variant="outline"
              className="h-9 px-4 text-[0.8125rem] font-medium"
              onClick={() => void refetch()}
              disabled={isFetching}
            >
              <RefreshCcwDot className="mr-2 h-4 w-4" />
              {isFetching ? 'Refreshing…' : 'Refresh'}
            </Button>
            <Button
              variant="outline"
              className="h-9 px-4 text-[0.8125rem] font-medium"
              onClick={handleExport}
              disabled={isExporting}
            >
              <Download className="mr-2 h-4 w-4" />
              {isExporting ? 'Exporting…' : 'Export CSV'}
            </Button>
          </>
        }
      />

      {exportNote?.kind === 'failed' && (
        <LoadError title="Export failed" detail={exportNote.text} onRetry={handleExport} />
      )}
      {exportNote?.kind === 'capped' && (
        <p role="status" className="rounded-2xl bg-muted/60 px-4 py-3 text-sm">
          {exportNote.text}
        </p>
      )}

      <Tabs
        value={activeTab}
        onValueChange={(value) => {
          setActiveTab(value as TabId)
          setExpandedRowId(null)
        }}
      >
        {/* Pill rail (§4.5). Classes are literal, not tokens (C7). */}
        <div className="thin-scrollbar relative w-full min-w-0 overflow-x-auto pb-1">
          <TabsList className="inline-flex h-auto w-max flex-nowrap gap-0.5 rounded-full bg-muted/70 p-1">
            {([
              { value: 'all', label: 'All logs', count: total },
              { value: 'flagged', label: 'Flagged activity', count: flaggedRows.length },
            ] as const).map((tab) => (
              <TabsTrigger
                key={tab.value}
                value={tab.value}
                className="shrink-0 whitespace-nowrap rounded-full px-4 py-2 text-[0.8125rem] font-medium text-muted-foreground transition-colors hover:text-foreground data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm data-[state=active]:ring-1 data-[state=active]:ring-border"
              >
                {tab.label}
                {!isLoading && (
                  <span className="ml-1.5 tabular-nums text-muted-foreground">
                    {tab.count.toLocaleString()}
                  </span>
                )}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
      </Tabs>

      <Panel>
        <PanelSection
          label={isFlaggedTab ? 'Flagged activity' : 'Events'}
          caption={
            isFlaggedTab
              ? `Anomalies and entries you flagged, among ${windowLabel}. Anomaly checks run on ${WINDOW_SIZE} loaded events at a time.`
              : undefined
          }
          // The caption says which events the tab covers — scope, not decoration (§13.4).
          showCaptionOnMobile
        >
          <div className="min-w-0 space-y-4">
            {/* Toolbar (§5.2): muted borderless fields; two per row on phones. */}
            <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
              <div className="relative col-span-2 min-w-0 sm:w-72">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/50"
                  aria-hidden
                />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search action, actor or resource"
                  aria-label="Search audit events"
                  className="h-9 pl-9 text-[0.8125rem]"
                />
              </div>
              <Input
                value={actor}
                onChange={(e) => setActor(e.target.value)}
                placeholder="Actor name or email"
                aria-label="Filter by actor"
                className="h-9 w-full min-w-0 text-[0.8125rem] sm:w-48"
              />
              <Input
                value={resourceType}
                onChange={(e) => setResourceType(e.target.value)}
                placeholder="Resource type, e.g. order"
                aria-label="Filter by resource type"
                className="h-9 w-full min-w-0 text-[0.8125rem] sm:w-48"
              />
              <MerchantSearchSelect
                value={merchantId}
                onChange={setMerchantId}
                placeholder="Search merchants..."
                className="col-span-2 w-full min-w-0 sm:w-52"
              />
              <FilterSelect
                value={actionCategory}
                onValueChange={setActionCategory}
                options={CATEGORY_OPTIONS}
                allLabel="All categories"
                ariaLabel="Category"
              />
              <FilterSelect
                value={severity}
                onValueChange={setSeverity}
                options={SEVERITY_OPTIONS}
                allLabel="All severities"
                ariaLabel="Severity"
              />
              <FilterSelect
                value={status}
                onValueChange={(value) => setStatus(value as 'all' | 'success' | 'failed')}
                options={STATUS_OPTIONS}
                allLabel="All statuses"
                ariaLabel="Status"
              />
              <FilterSelect
                value={piiAccess}
                onValueChange={(value) => setPiiAccess(value as PiiFilter)}
                options={PII_OPTIONS}
                allLabel="No PII filter"
                ariaLabel="PII access"
              />
              <FilterDate value={dateFrom} onChange={setDateFrom} placeholder="From date" />
              <FilterDate value={dateTo} onChange={setDateTo} placeholder="To date" />
              {/* A toggle filter chip (DS-CTL-03); pressed reads as the pill-rail active state. */}
              <Button
                type="button"
                variant="ghost"
                aria-pressed={hasError}
                onClick={() => setHasError((v) => !v)}
                className="h-9 rounded-full border-0 bg-muted/60 px-4 text-[0.8125rem] font-medium text-muted-foreground shadow-none hover:bg-muted hover:text-foreground aria-pressed:bg-background aria-pressed:text-foreground aria-pressed:ring-1 aria-pressed:ring-border"
              >
                Has error
              </Button>
              {hasActiveFilters && (
                <Button variant="ghost" size="sm" className="h-9 px-4" onClick={clearFilters}>
                  Clear filters
                </Button>
              )}
            </div>

            {isError ? (
              <LoadError
                title="We hit a snag loading audit logs"
                detail="Retry, or refresh the page if it keeps failing."
                onRetry={() => void refetch()}
              />
            ) : (
              <>
                {/* Wide table from 2xl, where its min-width fits the content column (§5.3). */}
                <Table variant="data" containerClassName="hidden 2xl:block" className="min-w-[1150px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[130px]">Timestamp</TableHead>
                      <TableHead>Organization</TableHead>
                      <TableHead>Location</TableHead>
                      <TableHead>What happened</TableHead>
                      <TableHead>Who</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Severity</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="w-[88px]">
                        <span className="sr-only">Actions</span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {showSkeleton ? (
                      Array.from({ length: PAGE_SIZE }).map((_, rowIndex) => (
                        <TableRow key={`audit-loading-${rowIndex}`}>
                          {Array.from({ length: COLUMN_COUNT }).map((__, cellIndex) => (
                            <TableCell key={`audit-loading-${rowIndex}-${cellIndex}`}>
                              <Skeleton className="h-4 w-full" />
                            </TableCell>
                          ))}
                        </TableRow>
                      ))
                    ) : rows.length === 0 ? (
                      <TableEmptyRow colSpan={COLUMN_COUNT} title={emptyTitle} hint={emptyHint} />
                    ) : (
                      rows.map((row) => {
                        const isExpanded = expandedRowId === row.id
                        const statusValue = normalizeStatus(row.status)
                        const isFlagged = flaggedIds.has(row.id)
                        const anomalyReason = anomalyMap.get(row.id)
                        // A row that needs attention is marked by weight, not a tinted row (§3.5).
                        const needsAttention = statusValue === 'failed' || !!anomalyReason || isFlagged
                        const { sentence, highlight } = buildAuditSentence(rowToFakeLog(row))

                        return (
                          <Fragment key={row.id}>
                            <TableRow data-state={isExpanded ? 'selected' : undefined}>
                              <TableCell className="text-xs">
                                <div className="flex flex-col gap-0.5" title={absoluteTime(row.created_at)}>
                                  <span className="font-medium text-foreground">
                                    {relativeTime(row.created_at)}
                                  </span>
                                  <span className="text-muted-foreground tabular-nums">
                                    {format(new Date(row.created_at), 'MMM d, yyyy')}
                                  </span>
                                </div>
                              </TableCell>

                              <TableCell>
                                <div className="flex flex-col gap-0.5">
                                  <span className="text-sm font-medium">
                                    {row.merchant_name || row.organization_name || '—'}
                                  </span>
                                  <span className="text-xs text-muted-foreground">{inferOrgType(row)}</span>
                                </div>
                              </TableCell>

                              <TableCell className="text-sm text-muted-foreground">
                                {row.location_name || '—'}
                              </TableCell>

                              <TableCell className="max-w-[280px] whitespace-normal">
                                <div className="space-y-0.5">
                                  {anomalyReason && (
                                    <p className="flex items-center gap-1 text-xs font-medium text-foreground">
                                      <ShieldAlert className="h-3 w-3 text-muted-foreground" aria-hidden />
                                      Anomaly detected
                                    </p>
                                  )}
                                  <p
                                    className={cn('line-clamp-2 text-sm leading-snug', needsAttention && 'font-medium')}
                                  >
                                    {sentence}
                                  </p>
                                  {highlight && (
                                    <p className="text-xs text-muted-foreground">{highlight}</p>
                                  )}
                                </div>
                              </TableCell>

                              <TableCell>
                                <div className="flex flex-col gap-0.5">
                                  <span className="text-sm font-medium">{row.actor_name || '—'}</span>
                                  {(row.actor_role || row.actor_email) && (
                                    <span className="text-xs text-muted-foreground">
                                      {row.actor_role || row.actor_email}
                                    </span>
                                  )}
                                </div>
                              </TableCell>

                              <TableCell>
                                <Badge variant="outline" className="whitespace-nowrap">
                                  {formatActionLabel(row.action_category)}
                                </Badge>
                              </TableCell>

                              <TableCell>
                                <Badge variant="outline" className="capitalize">
                                  {row.severity || 'info'}
                                </Badge>
                              </TableCell>

                              <TableCell>
                                <Badge variant="outline">{STATUS_LABELS[statusValue]}</Badge>
                              </TableCell>

                              <TableCell>
                                <div className="flex items-center gap-1">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 rounded-full p-0"
                                    aria-label={isFlagged ? 'Remove flag' : 'Flag for review'}
                                    aria-pressed={isFlagged}
                                    title={isFlagged ? 'Remove flag' : 'Flag for review'}
                                    onClick={() => toggleFlag(row.id)}
                                  >
                                    {isFlagged
                                      ? <BookmarkCheck className="h-4 w-4" />
                                      : <Bookmark className="h-4 w-4" />}
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 rounded-full p-0"
                                    aria-label={isExpanded ? 'Hide details' : 'Show details'}
                                    aria-expanded={isExpanded}
                                    onClick={() => setExpandedRowId(isExpanded ? null : row.id)}
                                  >
                                    <ChevronDown
                                      className={cn('h-4 w-4 transition-transform', isExpanded && 'rotate-180')}
                                    />
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>

                            {isExpanded && (
                              <TableRow className="hover:bg-transparent">
                                <TableCell colSpan={COLUMN_COUNT} className="whitespace-normal p-0">
                                  <AuditEventDetail row={row} anomalyReason={anomalyReason} className="p-4" />
                                </TableCell>
                              </TableRow>
                            )}
                          </Fragment>
                        )
                      })
                    )}
                  </TableBody>
                </Table>

                {/* Record cards below 2xl (§5.3): same rows, same detail component. */}
                <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 2xl:hidden">
                  {showSkeleton ? (
                    <RecordCardSkeletons count={4} />
                  ) : rows.length === 0 ? (
                    <CardGridEmpty title={emptyTitle} hint={emptyHint} />
                  ) : (
                    rows.map((row) => {
                      const isExpanded = expandedRowId === row.id
                      const statusValue = normalizeStatus(row.status)
                      const isFlagged = flaggedIds.has(row.id)
                      const anomalyReason = anomalyMap.get(row.id)
                      const needsAttention = statusValue === 'failed' || !!anomalyReason || isFlagged
                      const { sentence } = buildAuditSentence(rowToFakeLog(row))

                      return (
                        <RecordCard
                          key={row.id}
                          selected={isExpanded}
                          className={cn(isExpanded && 'sm:col-span-2')}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 space-y-0.5">
                              {anomalyReason && (
                                <p className="flex items-center gap-1 text-xs font-medium text-foreground">
                                  <ShieldAlert className="h-3 w-3 text-muted-foreground" aria-hidden />
                                  Anomaly detected
                                </p>
                              )}
                              <p className={cn('line-clamp-2 text-sm leading-snug', needsAttention && 'font-medium')}>
                                {sentence}
                              </p>
                            </div>
                            <p
                              className="shrink-0 text-xs text-muted-foreground tabular-nums"
                              title={absoluteTime(row.created_at)}
                            >
                              {relativeTime(row.created_at)}
                            </p>
                          </div>

                          <CardFields>
                            <CardField
                              label="Organization"
                              value={row.merchant_name || row.organization_name || inferOrgType(row)}
                            />
                            <CardField label="Location" value={row.location_name || '—'} />
                            <CardField label="Who" value={row.actor_name || row.actor_email || '—'} />
                            <CardField label="Category" value={formatActionLabel(row.action_category)} />
                            <CardField label="Severity" value={formatActionLabel(row.severity || 'info')} />
                            <CardField label="Status" value={STATUS_LABELS[statusValue]} />
                          </CardFields>

                          <div className="mt-3 flex items-center justify-between gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 gap-1.5 px-3 text-muted-foreground"
                              aria-pressed={isFlagged}
                              onClick={() => toggleFlag(row.id)}
                            >
                              {isFlagged
                                ? <BookmarkCheck className="h-4 w-4" aria-hidden />
                                : <Bookmark className="h-4 w-4" aria-hidden />}
                              {isFlagged ? 'Flagged' : 'Flag'}
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 gap-1.5 px-3"
                              aria-expanded={isExpanded}
                              onClick={() => setExpandedRowId(isExpanded ? null : row.id)}
                            >
                              {isExpanded ? 'Hide details' : 'Details'}
                              <ChevronDown
                                className={cn('h-4 w-4 transition-transform', isExpanded && 'rotate-180')}
                                aria-hidden
                              />
                            </Button>
                          </div>

                          {isExpanded && (
                            <AuditEventDetail row={row} anomalyReason={anomalyReason} className="mt-4" />
                          )}
                        </RecordCard>
                      )
                    })
                  )}
                </div>

                <PaginationBar
                  pagination={pagination}
                  onPageChange={(next) => {
                    onPageChange(next)
                    setExpandedRowId(null)
                  }}
                  itemLabel={isFlaggedTab ? 'flagged events' : 'events'}
                  isLoading={isFetching}
                />
                {!showSkeleton && pagination.total > 0 && pagination.total <= PAGE_SIZE && (
                  <p className="text-xs text-muted-foreground tabular-nums sm:text-sm">
                    {pagination.total.toLocaleString()} {isFlaggedTab ? 'flagged events' : 'events'}
                  </p>
                )}
              </>
            )}
          </div>
        </PanelSection>
      </Panel>
    </PageShell>
  )
}
