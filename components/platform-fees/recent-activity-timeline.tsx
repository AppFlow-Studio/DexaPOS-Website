import { format } from 'date-fns'
import { Money } from './money'
import { PaymentStatusBadge, paymentStatusLabel } from './status-badge'
import type { RecentActivityEntry } from '@/app/manage/actions/hq-platform/platform-fees'

/**
 * The latest payments, newest first. A chronological feed capped at 10 on the
 * server (§5.7). Entries are separated by spacing, not a rail or rule (§5.5),
 * and the marker is neutral (§3.5).
 */
export function RecentActivityTimeline({ entries }: { entries: RecentActivityEntry[] }) {
  if (!entries || entries.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        No payments in this period — new card payments will appear here.
      </p>
    )
  }

  return (
    <ol className="space-y-4">
      {entries.map((e) => {
        const at = e.captured_at ? new Date(e.captured_at) : null
        // Phones: one line each side (where/when, fee/amount). The status word
        // only shows when it isn't the ordinary "Collected".
        const unusual = e.is_returned || e.status !== 'captured'
        return (
          <li key={e.payment_id} className="flex items-start gap-3">
            <span
              className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground/40 max-sm:hidden"
              aria-hidden
            />
            <div className="flex min-w-0 flex-1 items-start justify-between gap-x-4 gap-y-1 sm:flex-wrap">
              <div className="min-w-0 space-y-0.5">
                <p className="truncate text-sm font-medium">
                  {e.location_name ?? 'Unknown location'}
                </p>
                <p className="text-xs text-muted-foreground tabular-nums">
                  {at ? (
                    <>
                      <span className="sm:hidden">{format(at, 'MMM d, h:mm a')}</span>
                      <span className="max-sm:hidden">{format(at, 'MMM d, yyyy · h:mm a')}</span>
                    </>
                  ) : (
                    '—'
                  )}
                </p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1 max-sm:hidden">
                <PaymentStatusBadge status={e.status} isReturned={e.is_returned} />
                <span className="text-xs text-muted-foreground">
                  <Money value={e.amount} /> · fee <Money value={e.card_fee} />
                </span>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-0.5 sm:hidden">
                <Money value={e.card_fee} className="text-sm font-medium" />
                <span className="text-xs text-muted-foreground tabular-nums">
                  {unusual ? paymentStatusLabel(e.status, e.is_returned) : <Money value={e.amount} />}
                </span>
              </div>
            </div>
          </li>
        )
      })}
    </ol>
  )
}
