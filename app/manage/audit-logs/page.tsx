'use client'

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { format } from 'date-fns'
import { Bookmark, BookmarkCheck, Download, Search } from 'lucide-react'
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
import type { PaginationMeta } from '@/types/pagination'
import { cn } from '@/lib/utils'
import { usePlatformAuditLogs } from '@/lib/queries/use-platform-analytics'
import type { PlatformAuditLogFilters, PlatformAuditLogRow } from '@/app/manage/actions/hq-platform/analytics'
import { MerchantSearchSelect } from '@/components/admin/MerchantSearchSelect'
import { buildAuditSentence } from '@/lib/audit/sentence-templates'
import { describeSettlementActivity } from '@/lib/audit/settlement-activity'
import { PII_ACCESS_TYPES, PII_ACCESS_TYPE_LABELS, type PiiAccessType } from '@/types/audit-log'
import {
  CardGridEmpty,
  FilterDate,
  FilterSelect,
  LoadError,
  RecordLinkCard,
  RecordLinkCardSkeletons,
  RowLink,
  TableEmptyRow,
} from '@/app/manage/transactions/components/ledger-primitives'
import RouteLoading from './loading'
import {
  AUDIT_LOGS_HREF,
  STATUS_LABELS,
  absoluteTime,
  auditLogHref,
  categoryLabel,
  detectAnomalies,
  inferOrgType,
  normalizeStatus,
  relativeTime,
  rowToFakeLog,
  toggleAuditLogFlag,
  useFlaggedAuditLogIds,
} from './audit-log-shared'

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

/*
 * Column tiers (§5.3). The table shows from `md` with the phone card's fields
 * only — when, what happened, who, status — and the rest join as they fit.
 * Every row opens the entry's own page (§5.9).
 */
const LG_UP = 'hidden lg:table-cell'
const XL_UP = 'hidden xl:table-cell'
const XXL_UP = 'hidden 2xl:table-cell'
/** Per-column visibility, in table order, shared by the loading rows. */
const COLUMN_CLASSES = ['', '', '', LG_UP, XXL_UP, XL_UP, XL_UP, '', '']

const COMMON_ACTION_CATEGORIES = [
  'merchant', 'user_management', 'device', 'staff', 'notes',
  'settings', 'authentication', 'order', 'inventory', 'settlement', 'system',
]

const CATEGORY_OPTIONS = COMMON_ACTION_CATEGORIES.map((value) => ({
  value,
  label: categoryLabel(value),
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

/**
 * Search params that hold a filter. The list keeps its tab, pages and filters
 * in the URL so Back from an entry's page lands on the same page of 10 (§5.9).
 */
const FILTER_PARAMS = [
  'q', 'actor', 'resource', 'merchant', 'category', 'severity', 'status', 'pii', 'from', 'to', 'error',
] as const

/** Typing settles for this long before the text filters reach the URL and the query. */
const TEXT_FILTER_DELAY_MS = 300

function positivePage(raw: string | null): number {
  const page = Number(raw ?? '1')
  return Number.isFinite(page) && page >= 1 ? Math.floor(page) : 1
}

function parsePiiFilter(raw: string | null): PiiFilter {
  if (raw === 'any') return 'any'
  return (PII_ACCESS_TYPES as readonly string[]).includes(raw ?? '') ? (raw as PiiAccessType) : 'all'
}

// ─── CSV Export ───────────────────────────────────────────────────────────────

function escapeCsv(value: unknown): string {
  const raw = value == null ? '' : String(value)
  return `"${raw.replace(/"/g, '""')}"`
}

function buildCsv(rows: PlatformAuditLogRow[]): string {
  const headers = ['Timestamp', 'Actor Name', 'Actor Email', 'Actor Role', 'Action', 'Category',
    'Batch Terminal', 'Terminal Serial',
    'Resource Type', 'Resource Name', 'Resource ID', 'Merchant', 'Location', 'Org Type',
    'Severity', 'Status', 'Error Message', 'Changes', 'Metadata']
  const lines = rows.map((row) => {
    const status = normalizeStatus(row.status)
    const settlement = describeSettlementActivity(rowToFakeLog(row))
    return [row.created_at, row.actor_name, row.actor_email, row.actor_role, row.action,
      row.action_category, settlement?.terminalLabel ?? '', settlement?.terminalSerial ?? '',
      row.resource_type, row.resource_name, row.resource_id,
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

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AuditLogsPage() {
  // useSearchParams needs a Suspense boundary; the fallback is the route skeleton.
  return (
    <Suspense fallback={<RouteLoading />}>
      <AuditLogsPageInner />
    </Suspense>
  )
}

function AuditLogsPageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  // Memo on the string: useSearchParams() returns a new object every render.
  const listQuery = searchParams.toString()
  const params = useMemo(() => new URLSearchParams(listQuery), [listQuery])

  /**
   * Writes to the URL. Changing a filter resets both pagers; changing a page
   * or tab passes `resetPages: false`. A patch that changes nothing is a no-op,
   * so the settled text filters never wipe a restored page.
   */
  const updateParams = useCallback(
    (patch: Record<string, string | null>, { resetPages = true }: { resetPages?: boolean } = {}) => {
      const next = new URLSearchParams(listQuery)
      let changed = false
      for (const [key, value] of Object.entries(patch)) {
        if (value) {
          if (next.get(key) !== value) {
            next.set(key, value)
            changed = true
          }
        } else if (next.has(key)) {
          next.delete(key)
          changed = true
        }
      }
      if (!changed) return
      if (resetPages) {
        next.delete('page')
        next.delete('fpage')
      }
      const query = next.toString()
      router.replace(query ? `?${query}` : AUDIT_LOGS_HREF, { scroll: false })
    },
    [listQuery, router]
  )

  // Text filters type into local state and reach the URL once typing settles.
  const [searchInput, setSearchInput] = useState(() => params.get('q') ?? '')
  const [actorInput, setActorInput] = useState(() => params.get('actor') ?? '')
  const [resourceInput, setResourceInput] = useState(() => params.get('resource') ?? '')

  useEffect(() => {
    const timer = setTimeout(() => {
      updateParams({
        q: searchInput.trim() || null,
        actor: actorInput.trim() || null,
        resource: resourceInput.trim() || null,
      })
    }, TEXT_FILTER_DELAY_MS)
    return () => clearTimeout(timer)
  }, [searchInput, actorInput, resourceInput, updateParams])

  const search = params.get('q') ?? ''
  const actor = params.get('actor') ?? ''
  const resourceType = params.get('resource') ?? ''
  const merchantId = params.get('merchant') ?? 'all'
  const actionCategory = params.get('category') ?? 'all'
  const severity = params.get('severity') ?? 'all'
  const statusParam = params.get('status')
  const status = statusParam === 'success' || statusParam === 'failed' ? statusParam : 'all'
  const piiAccess = parsePiiFilter(params.get('pii'))
  const dateFrom = params.get('from') ?? ''
  const dateTo = params.get('to') ?? ''
  const hasError = params.get('error') === '1'

  const activeTab: TabId = params.get('tab') === 'flagged' ? 'flagged' : 'all'
  const page = positivePage(params.get('page'))
  const requestedFlaggedPage = positivePage(params.get('fpage'))

  // Export
  const [isExporting, setIsExporting] = useState(false)
  const [exportNote, setExportNote] = useState<{ kind: 'capped' | 'failed'; text: string } | null>(null)

  // Flags live in localStorage, shared with each entry's page.
  const flaggedIds = useFlaggedAuditLogIds()

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

  const {
    data: auditResult,
    isLoading,
    isFetching,
    isError,
    isPlaceholderData,
    refetch,
  } = usePlatformAuditLogs(filters, WINDOW_SIZE, windowOffset)

  const windowRows = useMemo(() => auditResult?.data ?? [], [auditResult])
  const total = auditResult?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  // Clamp a page past the end — but only against a real result, never while a
  // restored page's window is still loading (its total would read as 0).
  useEffect(() => {
    if (!auditResult || isPlaceholderData || page <= totalPages) return
    updateParams({ page: totalPages > 1 ? String(totalPages) : null }, { resetPages: false })
  }, [auditResult, isPlaceholderData, page, totalPages, updateParams])

  // Anomaly detection runs on the loaded window
  const anomalyMap = useMemo(() => detectAnomalies(windowRows), [windowRows])

  const flaggedRows = useMemo(
    () => windowRows.filter((r) => flaggedIds.has(r.id) || anomalyMap.has(r.id)),
    [windowRows, flaggedIds, anomalyMap]
  )
  const flaggedTotalPages = Math.max(1, Math.ceil(flaggedRows.length / PAGE_SIZE))
  // Clamped here, so dismissing flags never strands the view on an empty page.
  const flaggedPage = Math.min(requestedFlaggedPage, flaggedTotalPages)

  const pageStart = ((page - 1) % PAGES_PER_WINDOW) * PAGE_SIZE
  const isFlaggedTab = activeTab === 'flagged'
  const rows = isFlaggedTab
    ? flaggedRows.slice((flaggedPage - 1) * PAGE_SIZE, flaggedPage * PAGE_SIZE)
    : windowRows.slice(pageStart, pageStart + PAGE_SIZE)
  const pagination: PaginationMeta = isFlaggedTab
    ? {
        page: flaggedPage,
        pageSize: PAGE_SIZE,
        total: flaggedRows.length,
        totalPages: flaggedTotalPages,
        hasNextPage: flaggedPage < flaggedTotalPages,
        hasPreviousPage: flaggedPage > 1,
      }
    : {
        page,
        pageSize: PAGE_SIZE,
        total,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      }

  function setPage(next: number) {
    updateParams({ [isFlaggedTab ? 'fpage' : 'page']: next > 1 ? String(next) : null }, { resetPages: false })
  }

  function setActiveTab(value: TabId) {
    // The All-logs page stays: the Flagged tab covers the window it loaded.
    updateParams({ tab: value === 'flagged' ? 'flagged' : null, fpage: null }, { resetPages: false })
  }

  const windowLabel = total === 0
    ? 'the loaded events'
    : `events ${(windowOffset + 1).toLocaleString()}–${Math.min(windowOffset + WINDOW_SIZE, total).toLocaleString()} of ${total.toLocaleString()}`

  const hasActiveFilters =
    FILTER_PARAMS.some((key) => params.has(key)) ||
    searchInput !== '' ||
    actorInput !== '' ||
    resourceInput !== ''

  function clearFilters() {
    setSearchInput('')
    setActorInput('')
    setResourceInput('')
    updateParams(Object.fromEntries(FILTER_PARAMS.map((key) => [key, null])))
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

  /** What a row or card needs: its link, its sentence and how it is marked. */
  function describeRow(row: PlatformAuditLogRow) {
    const anomaly = anomalyMap.get(row.id)
    const isFlagged = flaggedIds.has(row.id)
    const statusValue = normalizeStatus(row.status)
    return {
      href: auditLogHref(row.id, { listQuery, anomaly }),
      sentence: buildAuditSentence(rowToFakeLog(row)).sentence,
      // Anomalies and flags are said in words; a row that needs attention is
      // marked by weight, not a tinted row (§3.5).
      marker: anomaly ? 'Anomaly' : isFlagged ? 'Flagged' : null,
      needsAttention: statusValue === 'failed' || !!anomaly || isFlagged,
      isFlagged,
      statusLabel: STATUS_LABELS[statusValue],
      actor: row.actor_name || row.actor_email || '—',
    }
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

      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as TabId)}>
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
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="Search action, actor or resource"
                  aria-label="Search audit events"
                  className="h-9 pl-9 text-[0.8125rem]"
                />
              </div>
              <Input
                value={actorInput}
                onChange={(e) => setActorInput(e.target.value)}
                placeholder="Actor name or email"
                aria-label="Filter by actor"
                className="h-9 w-full min-w-0 text-[0.8125rem] sm:w-48"
              />
              <Input
                value={resourceInput}
                onChange={(e) => setResourceInput(e.target.value)}
                placeholder="Resource type, e.g. order"
                aria-label="Filter by resource type"
                className="h-9 w-full min-w-0 text-[0.8125rem] sm:w-48"
              />
              <MerchantSearchSelect
                value={merchantId}
                onChange={(value) => updateParams({ merchant: value === 'all' ? null : value })}
                placeholder="Search merchants..."
                className="col-span-2 w-full min-w-0 sm:w-52"
              />
              <FilterSelect
                value={actionCategory}
                onValueChange={(value) => updateParams({ category: value === 'all' ? null : value })}
                options={CATEGORY_OPTIONS}
                allLabel="All categories"
                ariaLabel="Category"
              />
              <FilterSelect
                value={severity}
                onValueChange={(value) => updateParams({ severity: value === 'all' ? null : value })}
                options={SEVERITY_OPTIONS}
                allLabel="All severities"
                ariaLabel="Severity"
              />
              <FilterSelect
                value={status}
                onValueChange={(value) => updateParams({ status: value === 'all' ? null : value })}
                options={STATUS_OPTIONS}
                allLabel="All statuses"
                ariaLabel="Status"
              />
              <FilterSelect
                value={piiAccess}
                onValueChange={(value) => updateParams({ pii: value === 'all' ? null : value })}
                options={PII_OPTIONS}
                allLabel="No PII filter"
                ariaLabel="PII access"
              />
              <FilterDate
                value={dateFrom}
                onChange={(value) => updateParams({ from: value || null })}
                placeholder="From date"
              />
              <FilterDate
                value={dateTo}
                onChange={(value) => updateParams({ to: value || null })}
                placeholder="To date"
              />
              {/* A toggle filter chip (DS-CTL-03); pressed reads as the pill-rail active state. */}
              <Button
                type="button"
                variant="ghost"
                aria-pressed={hasError}
                onClick={() => updateParams({ error: hasError ? null : '1' })}
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
                {/* The table from `md`, rows one line tall and paged at 10, with
                    no scroll of its own (§5.3, §5.7). */}
                <Table variant="data" bounded={false} containerClassName="hidden md:block">
                  <TableHeader>
                    <TableRow>
                      <TableHead>When</TableHead>
                      <TableHead>What happened</TableHead>
                      <TableHead>Who</TableHead>
                      <TableHead className={LG_UP}>Organization</TableHead>
                      <TableHead className={XXL_UP}>Location</TableHead>
                      <TableHead className={XL_UP}>Category</TableHead>
                      <TableHead className={XL_UP}>Severity</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="w-12">
                        <span className="sr-only">Flag</span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {showSkeleton ? (
                      Array.from({ length: PAGE_SIZE }).map((_, rowIndex) => (
                        <TableRow key={`audit-loading-${rowIndex}`}>
                          {COLUMN_CLASSES.map((cellClass, cellIndex) => (
                            <TableCell key={`audit-loading-${rowIndex}-${cellIndex}`} className={cellClass}>
                              <Skeleton className="h-4 w-full" />
                            </TableCell>
                          ))}
                        </TableRow>
                      ))
                    ) : rows.length === 0 ? (
                      <TableEmptyRow colSpan={COLUMN_CLASSES.length} title={emptyTitle} hint={emptyHint} />
                    ) : (
                      rows.map((row) => {
                        const item = describeRow(row)
                        const organization = row.merchant_name || row.organization_name || inferOrgType(row)

                        return (
                          <TableRow key={row.id} className="cursor-pointer" onClick={() => router.push(item.href)}>
                            <TableCell
                              className="text-xs text-muted-foreground tabular-nums"
                              title={absoluteTime(row.created_at)}
                            >
                              {relativeTime(row.created_at)}
                            </TableCell>

                            {/* Takes the remaining width and truncates, so rows stay one line. */}
                            <TableCell className="w-full max-w-0">
                              <RowLink
                                href={item.href}
                                title={item.sentence}
                                className={cn('block truncate text-sm', item.needsAttention && 'font-medium')}
                              >
                                {item.marker && <span className="font-medium">{item.marker} · </span>}
                                {item.sentence}
                              </RowLink>
                            </TableCell>

                            <TableCell
                              className="max-w-40 truncate text-sm"
                              title={[row.actor_role, row.actor_email].filter(Boolean).join(' · ') || undefined}
                            >
                              {item.actor}
                            </TableCell>

                            <TableCell className={cn(LG_UP, 'max-w-44 truncate text-sm')} title={inferOrgType(row)}>
                              {organization}
                            </TableCell>

                            <TableCell className={cn(XXL_UP, 'max-w-40 truncate text-sm text-muted-foreground')}>
                              {row.location_name || '—'}
                            </TableCell>

                            <TableCell className={XL_UP}>
                              <Badge variant="outline" className="whitespace-nowrap">
                                {categoryLabel(row.action_category)}
                              </Badge>
                            </TableCell>

                            <TableCell className={XL_UP}>
                              <Badge variant="outline" className="capitalize">
                                {row.severity || 'info'}
                              </Badge>
                            </TableCell>

                            <TableCell>
                              <Badge variant="outline">{item.statusLabel}</Badge>
                            </TableCell>

                            <TableCell>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 rounded-full p-0"
                                aria-label={item.isFlagged ? 'Remove flag' : 'Flag for review'}
                                aria-pressed={item.isFlagged}
                                title={item.isFlagged ? 'Remove flag' : 'Flag for review'}
                                onClick={(event) => {
                                  // The row opens the entry; the flag must not.
                                  event.stopPropagation()
                                  toggleAuditLogFlag(row.id)
                                }}
                              >
                                {item.isFlagged
                                  ? <BookmarkCheck className="h-4 w-4" />
                                  : <Bookmark className="h-4 w-4" />}
                              </Button>
                            </TableCell>
                          </TableRow>
                        )
                      })
                    )}
                  </TableBody>
                </Table>

                {/* Phones (§5.3): what happened and its result, then who and when.
                    The card opens the entry's page, where it can also be flagged. */}
                <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 md:hidden">
                  {showSkeleton ? (
                    <RecordLinkCardSkeletons count={4} />
                  ) : rows.length === 0 ? (
                    <CardGridEmpty title={emptyTitle} hint={emptyHint} />
                  ) : (
                    rows.map((row) => {
                      const item = describeRow(row)
                      return (
                        <RecordLinkCard
                          key={row.id}
                          href={item.href}
                          title={item.marker ? `${item.marker} · ${item.sentence}` : item.sentence}
                          figure={item.statusLabel}
                          subtitle={item.actor}
                          status={relativeTime(row.created_at)}
                        />
                      )
                    })
                  )}
                </div>

                <PaginationBar
                  pagination={pagination}
                  onPageChange={setPage}
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
