'use client'

import { useMemo } from 'react'
import { format } from 'date-fns'
import { useQuery } from '@tanstack/react-query'
import { AlertOctagon, Ban, CheckCircle2, Copy, RotateCcw } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

import { getDeadLetterEntry, type DlqRow } from '@/app/manage/actions/dead-letter-queue'
import { LoadError } from '@/app/manage/transactions/components/ledger-primitives'

import { RetryFigure, STATUS_LABELS, dlqRowState } from './dlq-row'

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

/** One label/value pair on the muted summary well — plain text, no pills (§3.5). */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="mt-0.5 truncate text-sm font-medium tabular-nums">{children}</div>
    </div>
  )
}

/**
 * Detail for one dead-letter entry. A centred pop-up, full-screen on phones
 * (§12, §13.1): the dialog clips, the body is the only scroller.
 */
export function DeadLetterDetailDialog({
  id,
  canMutate,
  onClose,
  onRetry,
  onResolve,
  onAbandon,
  retryPending,
  resolvePending,
}: Props) {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['dlq-entry', id],
    queryFn: () => getDeadLetterEntry(id as string),
    enabled: !!id,
    staleTime: 5_000,
  })

  const entry = data?.data ?? null
  const loadError = data?.error ?? (data && !entry ? 'This entry no longer exists.' : null)

  const prettyPayload = useMemo(() => {
    if (!entry) return ''
    try {
      return JSON.stringify(entry.raw_payload, null, 2)
    } catch {
      return String(entry.raw_payload)
    }
  }, [entry])

  const state = entry ? dlqRowState(entry) : null
  const retryDisabled = !entry || !canMutate || !state?.canRetry || retryPending
  const terminalOrMissing = !entry || !canMutate || !!state?.isTerminal

  function copyId() {
    if (!entry) return
    void navigator.clipboard.writeText(entry.id).then(
      () => toast.success('Entry ID copied'),
      () => toast.error('Could not copy the ID')
    )
  }

  return (
    <Dialog open={!!id} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="h-dvh max-h-dvh w-screen max-w-none grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden rounded-none p-0 sm:h-auto sm:max-h-[85vh] sm:w-full sm:max-w-2xl sm:rounded-3xl">
        <DialogHeader className="shrink-0 px-6 pt-6">
          <DialogTitle>Dead-letter entry</DialogTitle>
          <DialogDescription>
            A webhook payload that failed processing. Inspect it, then retry once
            the underlying cause is fixed.
          </DialogDescription>
        </DialogHeader>

        <div className="thin-scrollbar min-h-0 space-y-4 overflow-y-auto px-6 py-2">
          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-28 w-full rounded-2xl" />
              <Skeleton className="h-20 w-full rounded-2xl" />
              <Skeleton className="h-60 w-full rounded-2xl" />
            </div>
          ) : loadError || !entry ? (
            <LoadError
              title="This entry failed to load"
              detail={loadError ?? undefined}
              onRetry={() => void refetch()}
            />
          ) : (
            <>
              {/* Summary: identity and status lead, then the timeline. */}
              <div className="space-y-4 rounded-2xl bg-muted/60 px-4 py-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">
                      {entry.source}
                      {entry.event_type && (
                        <span className="font-mono text-sm font-normal text-muted-foreground">
                          {' · '}
                          {entry.event_type}
                        </span>
                      )}
                    </p>
                    <p className="mt-0.5 truncate font-mono text-xs text-muted-foreground" title={entry.id}>
                      {entry.id}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 shrink-0 gap-1.5 px-3 text-xs text-muted-foreground"
                    onClick={copyId}
                  >
                    <Copy className="h-3.5 w-3.5" />
                    Copy ID
                  </Button>
                </div>
                {/* Values on a muted well are plain text, not pills (§4.6b). */}
                <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                  <Field label="Status">{STATUS_LABELS[entry.status] ?? entry.status}</Field>
                  <Field label="Retries">
                    <RetryFigure row={entry} />
                  </Field>
                  <Field label="Created">{absoluteTime(entry.created_at)}</Field>
                  <Field label="Updated">{absoluteTime(entry.updated_at)}</Field>
                  <Field label="Resolved">{absoluteTime(entry.resolved_at)}</Field>
                  <Field label="Next retry">{absoluteTime(entry.next_retry_at)}</Field>
                </div>
              </div>

              {/* The failure. Neutral well; on a live entry the glyph carries
                  the alarm and the heading says it in words (§3.5, HQ-2). */}
              <div className="rounded-2xl bg-muted/60 px-4 py-3">
                <p className="mb-1 flex items-center gap-1.5 text-sm text-muted-foreground">
                  {!state?.isTerminal && (
                    <AlertOctagon className="h-4 w-4 text-red-600 dark:text-red-400" aria-hidden />
                  )}
                  {state?.isTerminal ? 'Last error' : 'Failed — error message'}
                </p>
                <pre className="whitespace-pre-wrap break-words font-mono text-xs text-foreground">
                  {entry.error_message || '—'}
                </pre>
              </div>

              {state?.exhausted && (
                <p className="text-sm text-muted-foreground">
                  Retries are exhausted. Resolve the entry if the cause is fixed
                  elsewhere, or abandon it with a reason.
                </p>
              )}

              <div className="rounded-2xl bg-muted/60 px-4 py-3 text-xs text-muted-foreground">
                <p className="mb-1 text-sm font-medium text-foreground">On replay</p>
                <p>
                  These internal annotation keys are stripped from the payload before
                  re-POSTing to the receiver:{' '}
                  <code className="font-mono">{STRIPPED_KEY_PATTERNS.join(', ')}</code>
                </p>
              </div>

              <div>
                <p className="mb-2 text-sm text-muted-foreground">Raw payload</p>
                {/* No inner height cap: the dialog body already scrolls, and a
                    second scroll area inside it traps the wheel (§5.7). */}
                <pre className="thin-scrollbar overflow-x-auto rounded-2xl bg-muted/40 p-4 font-mono text-[11px] leading-relaxed">
                  {prettyPayload}
                </pre>
              </div>
            </>
          )}
        </div>

        {/* Stacked full-width on phones, so each is a 44px target (§13.6). */}
        <DialogFooter className="shrink-0 px-6 pb-6 pt-2">
          <Button
            variant="outline"
            className="h-11 sm:h-9"
            disabled={terminalOrMissing || resolvePending}
            onClick={() => entry && onResolve(entry.id)}
          >
            <CheckCircle2 className="mr-2 h-4 w-4" />
            Resolve
          </Button>
          <Button
            variant="outline"
            className="h-11 text-destructive hover:text-destructive sm:h-9"
            disabled={terminalOrMissing}
            onClick={() => entry && onAbandon(entry)}
          >
            <Ban className="mr-2 h-4 w-4" />
            Abandon
          </Button>
          <Button className="h-11 sm:h-9" disabled={retryDisabled} onClick={() => entry && onRetry(entry.id)}>
            <RotateCcw className="mr-2 h-4 w-4" />
            {retryPending ? 'Retrying…' : 'Retry'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
