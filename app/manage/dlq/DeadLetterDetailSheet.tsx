'use client'

import { useMemo } from 'react'
import { format } from 'date-fns'
import { useQuery } from '@tanstack/react-query'
import { Ban, CheckCircle2, Copy, RotateCcw } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'

import { getDeadLetterEntry, type DlqRow } from '@/app/manage/actions/dead-letter-queue'

interface Props {
  id: string | null
  canMutate: boolean
  onClose: () => void
  onRetry: (id: string) => void
  onResolve: (id: string) => void
  onAbandon: (row: DlqRow) => void
  retryPending: boolean
  resolvePending: boolean
}

const STRIPPED_KEY_PATTERNS = ['_matched_*', '_rpc_error', '_error', '_raw']

function absoluteTime(dateStr: string | null): string {
  if (!dateStr) return '—'
  return format(new Date(dateStr), 'MMM d, yyyy h:mm:ss a')
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

export function DeadLetterDetailSheet({
  id,
  canMutate,
  onClose,
  onRetry,
  onResolve,
  onAbandon,
  retryPending,
  resolvePending,
}: Props) {
  const { data, isLoading } = useQuery({
    queryKey: ['dlq-entry', id],
    queryFn: () => getDeadLetterEntry(id as string),
    enabled: !!id,
    staleTime: 5_000,
  })

  const entry = data?.data ?? null

  const prettyPayload = useMemo(() => {
    if (!entry) return ''
    try {
      return JSON.stringify(entry.raw_payload, null, 2)
    } catch {
      return String(entry.raw_payload)
    }
  }, [entry])

  const maxedOut = entry ? (entry.retry_count ?? 0) >= (entry.max_retries ?? 0) : false
  const isTerminal = entry?.status === 'resolved' || entry?.status === 'abandoned'
  const retryDisabled =
    !entry || !canMutate || maxedOut || isTerminal || entry.status === 'retrying' || retryPending

  function copyId() {
    if (!entry) return
    void navigator.clipboard.writeText(entry.id)
  }

  return (
    <Sheet open={!!id} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>DLQ Entry</SheetTitle>
          <SheetDescription>
            Webhook payload that failed processing. Inspect below and retry once the
            underlying cause is resolved.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-4 px-4">
          {isLoading || !entry ? (
            <div className="space-y-3">
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-40 w-full" />
              <Skeleton className="h-60 w-full" />
            </div>
          ) : (
            <>
              {/* Summary grid */}
              <div className="rounded-lg border p-3 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className={statusBadgeClass(entry.status)}>
                      {entry.status}
                    </Badge>
                    <Badge variant="outline" className="font-mono text-[10px]">
                      {entry.source}
                    </Badge>
                    <Badge variant="outline" className="font-mono text-[10px]">
                      {entry.event_type || '—'}
                    </Badge>
                  </div>
                  <button
                    onClick={copyId}
                    className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                    title={entry.id}
                  >
                    <Copy className="h-3 w-3" />
                    Copy ID
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="space-y-0.5">
                    <p className="text-muted-foreground">Created</p>
                    <p className="font-medium">{absoluteTime(entry.created_at)}</p>
                  </div>
                  <div className="space-y-0.5">
                    <p className="text-muted-foreground">Updated</p>
                    <p className="font-medium">{absoluteTime(entry.updated_at)}</p>
                  </div>
                  <div className="space-y-0.5">
                    <p className="text-muted-foreground">Resolved</p>
                    <p className="font-medium">{absoluteTime(entry.resolved_at)}</p>
                  </div>
                  <div className="space-y-0.5">
                    <p className="text-muted-foreground">Retries</p>
                    <p className={`font-mono ${maxedOut ? 'text-red-600 dark:text-red-400' : ''}`}>
                      {entry.retry_count ?? 0}/{entry.max_retries ?? 0}
                    </p>
                  </div>
                </div>
              </div>

              {/* Error */}
              <div className="rounded-md border border-red-300 bg-red-50 p-3 dark:bg-red-950/20">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-red-700 dark:text-red-300 mb-1">
                  Error message
                </p>
                <pre className="whitespace-pre-wrap break-words font-mono text-xs text-red-800 dark:text-red-300">
                  {entry.error_message || '—'}
                </pre>
              </div>

              {/* Enrichment note */}
              <div className="rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground">
                <p className="font-medium text-foreground mb-1">On replay</p>
                <p>
                  These internal annotation keys are stripped from the payload before
                  re-POSTing to the receiver:{' '}
                  <code className="font-mono text-[10px]">
                    {STRIPPED_KEY_PATTERNS.join(', ')}
                  </code>
                </p>
              </div>

              {/* Raw payload */}
              <div className="space-y-1">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Raw payload
                </p>
                <pre className="max-h-[40vh] overflow-auto rounded-md border bg-background p-3 text-[11px] leading-relaxed">
                  {prettyPayload}
                </pre>
              </div>
            </>
          )}
        </div>

        <SheetFooter>
          <div className="flex w-full flex-wrap items-center justify-end gap-2">
            <Button
              variant="outline"
              disabled={!entry || !canMutate || isTerminal || resolvePending}
              onClick={() => entry && onResolve(entry.id)}
            >
              <CheckCircle2 className="mr-2 h-4 w-4" />
              Resolve
            </Button>
            <Button
              variant="outline"
              disabled={!entry || !canMutate || isTerminal}
              onClick={() => entry && onAbandon(entry)}
            >
              <Ban className="mr-2 h-4 w-4" />
              Abandon
            </Button>
            <Button disabled={retryDisabled} onClick={() => entry && onRetry(entry.id)}>
              <RotateCcw className="mr-2 h-4 w-4" />
              Retry
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
