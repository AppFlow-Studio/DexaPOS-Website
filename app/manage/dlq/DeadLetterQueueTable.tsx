'use client'

import { useEffect, useMemo, useState } from 'react'
import { format, formatDistanceToNow } from 'date-fns'
import {
  AlertOctagon,
  Ban,
  CheckCircle2,
  Eye,
  MoreHorizontal,
  RefreshCcwDot,
  RotateCcw,
  Search,
} from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
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
import { cn } from '@/lib/utils'

import {
  abandonDeadLetterEntry,
  listDeadLetterEntries,
  resolveDeadLetterEntry,
  retryDeadLetterEntry,
  type DlqFilters,
  type DlqRow,
  type DlqStatus,
} from '@/app/manage/actions/dead-letter-queue'

import { DeadLetterDetailSheet } from './DeadLetterDetailSheet'

const PAGE_SIZE = 50

interface Props {
  canMutate: boolean
}

function statusBadgeClass(status: string): string {
  switch (status) {
    case 'pending':
      return 'border-amber-300 bg-amber-100 text-amber-800 dark:bg-amber-950/30 dark:text-amber-300'
    case 'retrying':
      return 'border-blue-300 bg-blue-100 text-blue-800 dark:bg-blue-950/30 dark:text-blue-300'
    case 'resolved':
      return 'border-emerald-300 bg-emerald-100 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300'
    case 'abandoned':
      return 'border-slate-300 bg-slate-100 text-slate-700 dark:bg-slate-900 dark:text-slate-300'
    default:
      return 'border-slate-300 bg-slate-100 text-slate-700'
  }
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

  // ── Pagination ─────────────────────────────────────────────────────────────
  const [offset, setOffset] = useState(0)

  // Reset page when filters change.
  useEffect(() => {
    setOffset(0)
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
    queryKey: ['dlq', filters, PAGE_SIZE, offset],
    queryFn: () => listDeadLetterEntries(filters, PAGE_SIZE, offset),
    staleTime: 10_000,
    refetchInterval: isLiveTail ? 30_000 : false,
    placeholderData: (prev) => prev,
  })

  const rows = data?.data ?? []
  const total = data?.total ?? 0
  const facets = data?.facets ?? { sources: [], eventTypes: [] }

  // ── Status counts (separate lightweight query) ─────────────────────────────
  const { data: countsData } = useQuery({
    queryKey: ['dlq-counts', { source: filters.source, eventType: filters.eventType, search: filters.search }],
    queryFn: async () => {
      const [pending, retrying, abandoned, resolved] = await Promise.all([
        listDeadLetterEntries({ ...filters, status: 'pending' }, 1, 0),
        listDeadLetterEntries({ ...filters, status: 'retrying' }, 1, 0),
        listDeadLetterEntries({ ...filters, status: 'abandoned' }, 1, 0),
        listDeadLetterEntries({ ...filters, status: 'resolved' }, 1, 0),
      ])
      return {
        pending: pending.total,
        retrying: retrying.total,
        abandoned: abandoned.total,
        resolved: resolved.total,
      }
    },
    staleTime: 10_000,
    refetchInterval: isLiveTail ? 30_000 : false,
  })

  // ── Mutations ──────────────────────────────────────────────────────────────
  function invalidateAll() {
    queryClient.invalidateQueries({ queryKey: ['dlq'] })
    queryClient.invalidateQueries({ queryKey: ['dlq-counts'] })
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

  // ── Detail sheet ───────────────────────────────────────────────────────────
  const [detailId, setDetailId] = useState<string | null>(null)

  const from = total === 0 ? 0 : offset + 1
  const to = total === 0 ? 0 : Math.min(offset + rows.length, total)
  const canPrev = offset > 0
  const canNext = offset + PAGE_SIZE < total

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="grid gap-3 md:grid-cols-5">
            <label className="flex flex-col gap-1 text-sm md:col-span-2">
              <span className="text-muted-foreground">Search error message</span>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="pl-9"
                  placeholder="e.g. Restaurant not found"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                />
              </div>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-muted-foreground">Source</span>
              <select
                className="h-9 rounded-md border bg-background px-2 text-sm"
                value={source}
                onChange={(e) => setSource(e.target.value)}
              >
                <option value="all">All sources</option>
                {facets.sources.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-muted-foreground">Event type</span>
              <select
                className="h-9 rounded-md border bg-background px-2 text-sm"
                value={eventType}
                onChange={(e) => setEventType(e.target.value)}
              >
                <option value="all">All events</option>
                {facets.eventTypes.map((e) => (
                  <option key={e} value={e}>{e}</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-muted-foreground">Status</span>
              <select
                className="h-9 rounded-md border bg-background px-2 text-sm"
                value={status}
                onChange={(e) => setStatus(e.target.value as DlqStatus | 'all')}
              >
                <option value="all">All statuses</option>
                <option value="pending">Pending</option>
                <option value="retrying">Retrying</option>
                <option value="resolved">Resolved</option>
                <option value="abandoned">Abandoned</option>
              </select>
            </label>
          </div>
          <div className="flex items-center justify-between">
            {/* Status chips */}
            <div className="flex flex-wrap items-center gap-2">
              {(
                [
                  { key: 'pending', label: 'Pending', count: countsData?.pending ?? 0 },
                  { key: 'retrying', label: 'Retrying', count: countsData?.retrying ?? 0 },
                  { key: 'abandoned', label: 'Abandoned', count: countsData?.abandoned ?? 0 },
                  { key: 'resolved', label: 'Resolved', count: countsData?.resolved ?? 0 },
                ] as Array<{ key: DlqStatus; label: string; count: number }>
              ).map((chip) => (
                <button
                  key={chip.key}
                  type="button"
                  onClick={() =>
                    setStatus((current) => (current === chip.key ? 'all' : chip.key))
                  }
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
                    status === chip.key
                      ? statusBadgeClass(chip.key)
                      : 'border-border bg-muted/40 text-muted-foreground hover:bg-muted'
                  )}
                >
                  {chip.label}
                  <span className="rounded-full bg-background/60 px-1.5 py-0.5 text-[10px] font-semibold">
                    {chip.count}
                  </span>
                </button>
              ))}
            </div>
            <Button variant="outline" size="sm" onClick={() => void refetch()} disabled={isFetching}>
              <RefreshCcwDot className={cn('mr-2 h-4 w-4', isFetching && 'animate-spin')} />
              Refresh
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <div className="max-h-[62vh] overflow-auto">
            <Table>
              <TableHeader className="sticky top-0 z-20 bg-card">
                <TableRow>
                  <TableHead className="w-[140px]">Created</TableHead>
                  <TableHead className="w-[180px]">Source / Event</TableHead>
                  <TableHead className="w-[110px]">Status</TableHead>
                  <TableHead>Error</TableHead>
                  <TableHead className="w-[90px]">Retries</TableHead>
                  <TableHead className="w-[60px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 6 }).map((_, i) => (
                    <TableRow key={`loading-${i}`}>
                      <TableCell colSpan={6}>
                        <Skeleton className="h-8 w-full" />
                      </TableCell>
                    </TableRow>
                  ))
                ) : rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-12 text-center">
                      <AlertOctagon className="mx-auto h-10 w-10 text-muted-foreground/30 mb-2" />
                      <p className="text-sm text-muted-foreground">
                        No DLQ entries match these filters.
                      </p>
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((row) => {
                    const maxedOut = (row.retry_count ?? 0) >= (row.max_retries ?? 0)
                    const retryDisabled =
                      !canMutate ||
                      maxedOut ||
                      row.status === 'resolved' ||
                      row.status === 'retrying'
                    const isTerminal = row.status === 'resolved' || row.status === 'abandoned'
                    return (
                      <TableRow key={row.id}>
                        <TableCell className="text-xs">
                          <div
                            className="flex flex-col gap-0.5"
                            title={absoluteTime(row.created_at)}
                          >
                            <span className="font-medium">{relativeTime(row.created_at)}</span>
                            <span className="text-muted-foreground text-[10px]">
                              {format(new Date(row.created_at), 'MMM d, yyyy')}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-1">
                            <Badge variant="outline" className="w-fit font-mono text-[10px]">
                              {row.source}
                            </Badge>
                            <Badge variant="outline" className="w-fit font-mono text-[10px]">
                              {row.event_type || '—'}
                            </Badge>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={statusBadgeClass(row.status)}>
                            {row.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="max-w-[420px]">
                          <p
                            className="truncate text-sm"
                            title={row.error_message ?? ''}
                          >
                            {row.error_message || '—'}
                          </p>
                        </TableCell>
                        <TableCell className="text-sm">
                          <span
                            className={cn(
                              'font-mono',
                              maxedOut && 'text-red-600 dark:text-red-400'
                            )}
                          >
                            {row.retry_count ?? 0}/{row.max_retries ?? 0}
                          </span>
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-7 w-7">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-48">
                              <DropdownMenuItem onClick={() => setDetailId(row.id)}>
                                <Eye className="mr-2 h-4 w-4" />
                                View details
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                disabled={retryDisabled || retryMutation.isPending}
                                onClick={() => retryMutation.mutate(row.id)}
                              >
                                <RotateCcw className="mr-2 h-4 w-4" />
                                Retry
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                disabled={!canMutate || isTerminal || resolveMutation.isPending}
                                onClick={() => resolveMutation.mutate(row.id)}
                              >
                                <CheckCircle2 className="mr-2 h-4 w-4" />
                                Resolve
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                disabled={!canMutate || isTerminal}
                                onClick={() => openAbandon(row)}
                              >
                                <Ban className="mr-2 h-4 w-4" />
                                Abandon
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </div>
          {/* Pagination */}
          <div className="flex flex-col gap-2 border-t px-4 py-3 text-sm text-muted-foreground md:flex-row md:items-center md:justify-between">
            <span>
              Showing {from.toLocaleString()}–{to.toLocaleString()} of {total.toLocaleString()}
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={!canPrev}
                onClick={() => setOffset((o) => Math.max(0, o - PAGE_SIZE))}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={!canNext}
                onClick={() => setOffset((o) => o + PAGE_SIZE)}
              >
                Next
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Detail sheet */}
      <DeadLetterDetailSheet
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

      {/* Abandon dialog */}
      <Dialog open={!!abandonTarget} onOpenChange={(open) => !open && closeAbandon()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Abandon DLQ entry</DialogTitle>
            <DialogDescription>
              This marks the entry as permanently abandoned. The reason is appended
              to the error message for the audit trail.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <label className="text-sm font-medium">Reason</label>
            <Textarea
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
              Abandon entry
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
