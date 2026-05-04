import { format } from 'date-fns'
import { Money } from './money'
import { PaymentStatusBadge } from './status-badge'
import type { RecentActivityEntry } from '@/app/manage/actions/hq-platform/platform-fees'

export function RecentActivityTimeline({ entries }: { entries: RecentActivityEntry[] }) {
  if (!entries || entries.length === 0) {
    return (
      <div className="text-sm text-muted-foreground py-6 text-center">
        No recent activity in this period.
      </div>
    )
  }

  return (
    <ol className="relative space-y-4 border-l border-border pl-4">
      {entries.map((e) => (
        <li key={e.payment_id} className="relative">
          <span className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full bg-primary ring-2 ring-background" />
          <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
            <div className="space-y-0.5">
              <div className="text-sm font-medium">
                {e.location_name ?? 'Unknown location'}
              </div>
              <div className="text-xs text-muted-foreground">
                {e.captured_at
                  ? format(new Date(e.captured_at), 'MMM d, yyyy · h:mm a')
                  : '—'}
              </div>
            </div>
            <div className="flex flex-col items-end gap-1">
              <PaymentStatusBadge status={e.status} isReturned={e.is_returned} />
              <span className="text-xs text-muted-foreground">
                <Money value={e.amount} /> · fee{' '}
                <Money value={e.card_fee} zeroAsDash />
              </span>
            </div>
          </div>
        </li>
      ))}
    </ol>
  )
}
