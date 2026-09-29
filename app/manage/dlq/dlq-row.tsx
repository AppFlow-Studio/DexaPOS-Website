import { cn } from '@/lib/utils'
import type { DlqRow } from '@/app/manage/actions/dead-letter-queue'

export const STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  retrying: 'Retrying',
  resolved: 'Resolved',
  abandoned: 'Abandoned',
}

/** What an entry allows — shared by the table row, the phone card and the detail panel. */
export function dlqRowState(row: Pick<DlqRow, 'status' | 'retry_count' | 'max_retries'>) {
  const maxedOut = (row.retry_count ?? 0) >= (row.max_retries ?? 0)
  const isTerminal = row.status === 'resolved' || row.status === 'abandoned'
  return {
    isTerminal,
    // A live entry that can no longer retry is the failure an operator must
    // act on — the one per-row alarm on this page (§14.3 HQ-2).
    exhausted: maxedOut && !isTerminal,
    canRetry: !maxedOut && !isTerminal && row.status !== 'retrying',
  }
}

/**
 * Retry count. When retries are exhausted on a live entry the figure takes the
 * alarm colour and the word says it too — colour is never the only channel (§3.5).
 * Classes are literal in this .tsx on purpose (C7).
 */
export function RetryFigure({ row }: { row: DlqRow }) {
  const { exhausted } = dlqRowState(row)
  return (
    <span className="inline-flex flex-col">
      <span className={cn('font-mono tabular-nums', exhausted && 'text-red-600 dark:text-red-400')}>
        {row.retry_count ?? 0}/{row.max_retries ?? 0}
      </span>
      {exhausted && <span className="text-xs text-muted-foreground">Exhausted</span>}
    </span>
  )
}
