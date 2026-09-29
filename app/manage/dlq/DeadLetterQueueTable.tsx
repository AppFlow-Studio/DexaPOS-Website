'use client'

import { useEffect, useMemo, useState } from 'react'
import { format, formatDistanceToNow } from 'date-fns'
import {
  Ban,
  CheckCircle2,
  Eye,
  MoreHorizontal,
  RefreshCcwDot,
  RotateCcw,
  Search,
  X,
} from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { Panel, PanelSection, StatRow, StatTile } from '@/components/dashboard/shell'
import { PaginationBar } from '@/components/dashboard/PaginationBar'
import type { PaginationMeta } from '@/types/pagination'
import { cn } from '@/lib/utils'
import {
  CardField,
  CardFields,
  CardGridEmpty,
  FilterSelect,
  LoadError,
  RecordCard,
  RecordCardSkeletons,
  TableEmptyRow,
} from '@/app/manage/transactions/components/ledger-primitives'

import {
  abandonDeadLetterEntry,
  listDeadLetterEntries,
  resolveDeadLetterEntry,
  retryDeadLetterEntry,
  type DlqFilters,
  type DlqRow,
  type DlqStatus,
} from '@/app/manage/actions/dead-letter-queue'

import { DeadLetterDetailDialog } from './DeadLetterDetailDialog'
import { RetryFigure, STATUS_LABELS, dlqRowState } from './dlq-row'

/** Every table pages 10 at a time, server-paged lists included (§5.7). */
const PAGE_SIZE = 10
const TABLE_COLUMNS = 6

interface Props {
  canMutate: boolean
}

function absoluteTime(dateStr: string): string {
  return format(new Date(dateStr), 'MMM d, yyyy h:mm:ss a')
}

function relativeTime(dateStr: string): string {
  return formatDistanceToNow(new Date(dateStr), { addSuffix: true })
}

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(t)
  }, [value, delayMs])
  return debounced
}

export function DeadLetterQueueTable({ canMutate }: Props) {
  // ── Filters ────────────────────────────────────────────────────────────────
  const [source, setSource] = useState<string>('all')
  const [eventType, setEventType] = useState<string>('all')
  const [status, setStatus] = useState<DlqStatus | 'all'>('all')
  const [searchInput, setSearchInput] = useState('')
  const search = useDebouncedValue(searchInput, 300)

  const hasActiveFilters =
    source !== 'all' || eventType !== 'all' || status !== 'all' || searchInput.trim() !== ''

  function clearFilters() {
    setSource('all')
    setEventType('all')
    setStatus('all')
    setSearchInput('')
  }

  // ── Pagination ─────────────────────────────────────────────────────────────
  const [page, setPage] = useState(1)

  // Reset page when filters change.
  useEffect(() => {
    setPage(1)
  }, [source, eventType, status, search])

  const filters: DlqFilters = useMemo(
    () => ({
      source: source === 'all' ? undefined : source,
      eventType: eventType === 'all' ? undefined : eventType,
      status: status === 'all' ? undefined : status,
      search: search.trim() || undefined,
    }),
    [source, eventType, status, search]
  )

  // ── Live tail when viewing pending/retrying ────────────────────────────────
  const isLiveTail = status === 'pending' || status === 'retrying'

  const queryClient = useQueryClient()

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['dlq', filters, PAGE_SIZE, page],
    queryFn: () => listDeadLetterEntries(filters, PAGE_SIZE, (page - 1) * PAGE_SIZE),
    staleTime: 10_000,
    refetchInterval: isLiveTail ? 30_000 : false,
    placeholderData: (prev) => prev,
  })

  const rows = data?.data ?? []
  const total = data?.total ?? 0
  const facets = data?.facets ?? { sources: [], eventTypes: [] }
  const loadError = data?.error ?? null

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const pagination: PaginationMeta = {
    page,
    pageSize: PAGE_SIZE,
    total,
    totalPages,
    hasNextPage: page < totalPages,
    hasPreviousPage: page > 1,
  }

  // Clamp: resolving the last entry on a page must not strand the user on an
  // empty one (§5.7).
  useEffect(() => {
    if (!isFetching && page > totalPages) setPage(totalPages)
  }, [isFetching, page, totalPages])

  // ── Status counts (separate lightweight query) ─────────────────────────────
  const { data: countsData, isLoading: countsLoading } = useQuery({
    queryKey: ['dlq-counts', { source: filters.source, eventType: filters.eventType, search: filters.search }],
    queryFn: async () => {
      const [pending, retrying, abandoned, resolved] = await Promise.all([
        listDeadLetterEntries({ ...filters, status: 'pending' }, 1, 0),
        listDeadLetterEntries({ ...filters, status: 'retrying' }, 1, 0),
        listDeadLetterEntries({ ...filters, status: 'abandoned' }, 1, 0),
        listDeadLetterEntries({ ...filters, status: 'resolved' }, 1, 0),
      ])
      // A count that failed to load is unknown, not zero (§4.9).
      const count = (r: { total: number; error: string | null }) => (r.error ? null : r.total)
      return {
        pending: count(pending),
        retrying: count(retrying),
        abandoned: count(abandoned),
        resolved: count(resolved),
      }
    },
    staleTime: 10_000,
    refetchInterval: isLiveTail ? 30_000 : false,
  })

  // ── Mutations ──────────────────────────────────────────────────────────────
  function invalidateAll() {
    queryClient.invalidateQueries({ queryKey: ['dlq'] })
    queryClient.invalidateQueries({ queryKey: ['dlq-counts'] })
    // The open detail panel reads its own query; refresh it too.
    queryClient.invalidateQueries({ queryKey: ['dlq-entry'] })
  }

  const retryMutation = useMutation({
    mutationFn: (id: string) => retryDeadLetterEntry(id),
    onSuccess: (result) => {
      if (!result.success) {
        toast.error(result.error || 'Retry refused')
        return
      }
      if (result.resolved) {
        toast.success('Retry succeeded, entry resolved')
      } else {
        toast.warning(`Retry did not resolve${result.error ? ` (${result.error})` : ''}`)
      }
      invalidateAll()
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Retry failed'),
  })

  const resolveMutation = useMutation({
    mutationFn: (id: string) => resolveDeadLetterEntry(id),
    onSuccess: (result) => {
      if (!result.success) {
        toast.error(result.error || 'Resolve failed')
        return
      }
      toast.success('Marked as resolved')
      invalidateAll()
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Resolve failed'),
  })

  const abandonMutation = useMutation({
    mutationFn: (args: { id: string; reason: string }) => abandonDeadLetterEntry(args.id, args.reason),
    onSuccess: (result) => {
      if (!result.success) {
        toast.error(result.error || 'Abandon failed')
        return
      }
      toast.success('Marked as abandoned')
      invalidateAll()
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Abandon failed'),
  })

  // ── Abandon dialog ─────────────────────────────────────────────────────────
  const [abandonTarget, setAbandonTarget] = useState<DlqRow | null>(null)
  const [abandonReason, setAbandonReason] = useState('')

  function openAbandon(row: DlqRow) {
    setAbandonTarget(row)
    setAbandonReason('')
  }
  function closeAbandon() {
    setAbandonTarget(null)
    setAbandonReason('')
  }
  function submitAbandon() {
    if (!abandonTarget) return
    if (!abandonReason.trim()) {
      toast.error('Reason is required')
      return
    }
    abandonMutation.mutate(
      { id: abandonTarget.id, reason: abandonReason.trim() },
      { onSettled: () => closeAbandon() }
    )
  }

  // ── Detail panel ───────────────────────────────────────────────────────────
  const [detailId, setDetailId] = useState<string | null>(null)

  // ── Presentation ───────────────────────────────────────────────────────────
  const statusTiles: { key: DlqStatus; label: string; meta: string }[] = [
    {
      key: 'pending',
      label: 'Pending',
      meta: countsData?.pending ? 'Failed, awaiting retry or triage' : 'All clear',
    },
    { key: 'retrying', label: 'Retrying', meta: 'Replay in flight' },
    { key: 'abandoned', label: 'Abandoned', meta: 'Given up, reason recorded' },
    { key: 'resolved', label: 'Resolved', meta: 'Replayed or marked fixed' },
  ]

  const emptyTitle = hasActiveFilters
    ? 'No failed deliveries match these filters'
    : 'All clear — no failed webhook deliveries'
  const emptyHint = hasActiveFilters
    ? 'Clear the search or filters to widen the results.'
    : 'Payloads that fail processing will appear here for retry or triage.'

  /** Row actions, shared by the table row and the phone card. */
  const renderRowActions = (row: DlqRow) => {
    const { isTerminal, canRetry } = dlqRowState(row)
    const label = `${row.source}${row.event_type ? ` ${row.event_type}` : ''}`
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            aria-label={`Actions for ${label} entry`}
            className="h-8 w-8 rounded-full p-0"
          >
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem onSelect={() => setDetailId(row.id)}>
            <Eye className="mr-2 h-4 w-4" />
            View details
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            disabled={!canMutate || !canRetry || retryMutation.isPending}
            onSelect={() => retryMutation.mutate(row.id)}
          >
            <RotateCcw className="mr-2 h-4 w-4" />
            Retry
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={!canMutate || isTerminal || resolveMutation.isPending}
            onSelect={() => resolveMutation.mutate(row.id)}
          >
            <CheckCircle2 className="mr-2 h-4 w-4" />
            Resolve
          </DropdownMenuItem>
          <DropdownMenuItem
            variant="destructive"
            disabled={!canMutate || isTerminal}
            onSelect={() => openAbandon(row)}
          >
            <Ban className="mr-2 h-4 w-4" />
            Abandon
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    )
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <>
      {/* Queue status — the figures double as the status filter. */}
      <Panel>
        <PanelSection
          label="Queue status"
          caption="Follows the source, event, and search filters. Select a figure to filter by it."
        >
          <StatRow columns={4}>
            {statusTiles.map((tile) => {
              const count = countsData?.[tile.key]
              const alarm = tile.key === 'pending' && !!count
              return (
                <StatTile
                  key={tile.key}
                  label={tile.label}
                  value={
                    count == null ? (
                      '—'
                    ) : (
                      // Pending entries are failed deliveries an operator must
                      // act on: the figure carries the alarm, the meta says it
                      // in words (§3.5, §14.3 HQ-2).
                      <span className={cn(alarm && 'text-red-600 dark:text-red-400')}>
                        {count.toLocaleString()}
                      </span>
                    )
                  }
                  meta={countsLoading ? undefined : count == null ? 'Count unavailable' : tile.meta}
                  // Alarm text and the reason for a "—" are not detail a phone drops.
                  showMetaOnMobile={alarm || (count == null && !countsLoading)}
                  isLoading={countsLoading}
                  onClick={() => setStatus((current) => (current === tile.key ? 'all' : tile.key))}
                  isActive={status === 'all' || status === tile.key}
                />
              )
            })}
          </StatRow>
        </PanelSection>
      </Panel>

      {/* The queue: toolbar, table from `lg`, record cards below (§5.3). */}
      <Panel>
        <PanelSection
          label="Failed deliveries"
          caption="Newest first. Pending and retrying views refresh every 30 seconds."
          action={
            <Button
              variant="outline"
              className="h-9 px-4 text-[0.8125rem] font-medium"
              onClick={() => void refetch()}
              disabled={isFetching}
            >
              <RefreshCcwDot className={cn('mr-2 h-4 w-4', isFetching && 'animate-spin')} />
              Refresh
            </Button>
          }
        >
          {/* Toolbar (§5.2): search left, muted filter pills right. */}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative w-full min-w-0 sm:flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/50" />
              <Input
                aria-label="Search error messages"
                className="h-9 pl-9 text-[0.8125rem]"
                placeholder="Search error messages, e.g. Restaurant not found"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <FilterSelect
                value={source}
                onValueChange={setSource}
                options={facets.sources.map((s) => ({ value: s, label: s }))}
                allLabel="All sources"
                ariaLabel="Source"
              />
              <FilterSelect
                value={eventType}
                onValueChange={setEventType}
                options={facets.eventTypes.map((e) => ({ value: e, label: e }))}
                allLabel="All events"
                ariaLabel="Event type"
              />
              {hasActiveFilters && (
                <Button
                  variant="ghost"
                  className="h-9 gap-1.5 px-4 text-[0.8125rem] text-muted-foreground"
                  onClick={clearFilters}
                >
                  <X className="h-3.5 w-3.5" />
                  Clear filters
                </Button>
              )}
            </div>
          </div>

          <div className="mt-4 min-w-0">
            {loadError ? (
              <LoadError
                title="The dead letter queue failed to load"
                detail={loadError}
                onRetry={() => void refetch()}
              />
            ) : (
              <>
                <Table variant="data" containerClassName="hidden lg:block" className="min-w-[680px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[140px]">Created</TableHead>
                      <TableHead className="w-[170px]">Source / event</TableHead>
                      <TableHead className="w-[110px]">Status</TableHead>
                      <TableHead>Error</TableHead>
                      <TableHead className="w-[90px] text-right">Retries</TableHead>
                      <TableHead className="w-[56px]">
                        <span className="sr-only">Actions</span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoading ? (
                      Array.from({ length: 6 }).map((_, i) => (
                        <TableRow key={`loading-${i}`}>
                          {Array.from({ length: TABLE_COLUMNS }).map((_, j) => (
                            <TableCell key={j}>
                              <Skeleton className="h-4 w-full" />
                            </TableCell>
                          ))}
                        </TableRow>
                      ))
                    ) : rows.length === 0 ? (
                      <TableEmptyRow colSpan={TABLE_COLUMNS} title={emptyTitle} hint={emptyHint} />
                    ) : (
                      rows.map((row) => {
                        const { isTerminal } = dlqRowState(row)
                        return (
                          <TableRow key={row.id}>
                            <TableCell>
                              <div className="flex flex-col gap-0.5 tabular-nums" title={absoluteTime(row.created_at)}>
                                <span className="text-sm font-medium">{relativeTime(row.created_at)}</span>
                                <span className="text-xs text-muted-foreground">
                                  {format(new Date(row.created_at), 'MMM d, yyyy')}
                                </span>
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex min-w-0 flex-col gap-0.5">
                                <span className="truncate text-sm font-medium">{row.source}</span>
                                <span className="truncate font-mono text-xs text-muted-foreground">
                                  {row.event_type || '—'}
                                </span>
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className="text-xs">
                                {STATUS_LABELS[row.status] ?? row.status}
                              </Badge>
                            </TableCell>
                            <TableCell className="max-w-[420px]">
                              {/* A live entry needs attention: marked by weight, not colour (§3.5). */}
                              <p
                                className={cn(
                                  'truncate text-sm',
                                  isTerminal ? 'text-muted-foreground' : 'font-medium text-foreground'
                                )}
                                title={row.error_message ?? ''}
                              >
                                {row.error_message || '—'}
                              </p>
                            </TableCell>
                            <TableCell className="text-right text-sm">
                              <RetryFigure row={row} />
                            </TableCell>
                            <TableCell>{renderRowActions(row)}</TableCell>
                          </TableRow>
                        )
                      })
                    )}
                  </TableBody>
                </Table>

                {/* Below `lg` each entry is a card (§5.3). Card and row open the
                    same detail panel. */}
                <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 lg:hidden">
                  {isLoading ? (
                    <RecordCardSkeletons count={4} />
                  ) : rows.length === 0 ? (
                    <CardGridEmpty title={emptyTitle} hint={emptyHint} />
                  ) : (
                    rows.map((row) => {
                      const { isTerminal } = dlqRowState(row)
                      const label = `${row.source}${row.event_type ? ` · ${row.event_type}` : ''}`
                      return (
                        <RecordCard key={row.id}>
                          {/* A stretched button makes the summary the control,
                              while the actions menu stays its own button above
                              it — never a div with onClick. */}
                          <div className="relative">
                            <button
                              type="button"
                              aria-label={`View details for ${label} entry`}
                              onClick={() => setDetailId(row.id)}
                              className="absolute inset-0 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            />
                            <div className="pointer-events-none relative flex items-start gap-2">
                              <div className="min-w-0 flex-1">
                                <p className="truncate font-semibold">{label}</p>
                                <p
                                  className="mt-0.5 truncate text-xs text-muted-foreground tabular-nums"
                                  title={absoluteTime(row.created_at)}
                                >
                                  {relativeTime(row.created_at)}
                                </p>
                                <p
                                  className={cn(
                                    'mt-3 line-clamp-2 break-words text-sm',
                                    isTerminal ? 'text-muted-foreground' : 'font-medium text-foreground'
                                  )}
                                >
                                  {row.error_message || '—'}
                                </p>
                                <CardFields>
                                  <CardField label="Status" value={STATUS_LABELS[row.status] ?? row.status} />
                                  <CardField label="Retries" value={<RetryFigure row={row} />} />
                                </CardFields>
                              </div>
                              <div className="pointer-events-auto -mr-1 -mt-1 shrink-0">
                                {renderRowActions(row)}
                              </div>
                            </div>
                          </div>
                        </RecordCard>
                      )
                    })
                  )}
                </div>

                <PaginationBar
                  pagination={pagination}
                  onPageChange={setPage}
                  isLoading={isFetching}
                  itemLabel="entries"
                />
                {!isLoading && total > 0 && total <= PAGE_SIZE && (
                  <p className="mt-3 text-xs text-muted-foreground tabular-nums sm:text-sm">
                    {total.toLocaleString()} {total === 1 ? 'entry' : 'entries'}
                  </p>
                )}
              </>
            )}
          </div>
        </PanelSection>
      </Panel>

      <DeadLetterDetailDialog
        id={detailId}
        canMutate={canMutate}
        onClose={() => setDetailId(null)}
        onRetry={(id) => retryMutation.mutate(id)}
        onResolve={(id) => resolveMutation.mutate(id)}
        onAbandon={(row) => {
          setDetailId(null)
          openAbandon(row)
        }}
        retryPending={retryMutation.isPending}
        resolvePending={resolveMutation.isPending}
      />

      {/* A short question with one field stays a centred card at every width (§13.1). */}
      <Dialog open={!!abandonTarget} onOpenChange={(open) => !open && closeAbandon()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Abandon this entry?</DialogTitle>
            <DialogDescription>
              The entry is marked as permanently abandoned. The reason is appended
              to its error message for the audit trail.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="dlq-abandon-reason">Reason</Label>
            <Textarea
              id="dlq-abandon-reason"
              placeholder="Why is this entry being abandoned?"
              value={abandonReason}
              onChange={(e) => setAbandonReason(e.target.value)}
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeAbandon}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={!abandonReason.trim() || abandonMutation.isPending}
              onClick={submitAbandon}
            >
              {abandonMutation.isPending ? 'Abandoning…' : 'Abandon entry'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
