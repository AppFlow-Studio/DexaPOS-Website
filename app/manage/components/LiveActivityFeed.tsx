'use client'

import Link from 'next/link'
import { formatDistanceToNow } from 'date-fns'
import { Activity } from 'lucide-react'

import { Panel } from '@/components/dashboard/shell/Panel'
import { PanelSection } from '@/components/dashboard/shell/PanelSection'
import { Skeleton } from '@/components/ui/skeleton'
import { usePlatformActivityFeed } from '@/lib/queries/use-platform-dashboard'

/** The live/loading indicator on the section heading row. */
function FeedStatus({ isLoading }: { isLoading?: boolean }) {
  return (
    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
      {isLoading ? 'Loading' : 'Live'}
    </span>
  )
}

export function LiveActivityFeed() {
  const { data: events, isLoading, error } = usePlatformActivityFeed()

  // One panel and one heading for every state, so the three branches differ
  // only in their body. Previously each state re-declared the card chrome and
  // they had drifted apart.
  return (
    <Panel className="h-full">
      <PanelSection
        icon={Activity}
        label="Live Activity Feed"
        action={!error && <FeedStatus isLoading={isLoading} />}
      >
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full rounded-2xl" />
            ))}
          </div>
        ) : error ? (
          <div className="py-8 text-center">
            <p className="text-sm font-medium text-red-600 dark:text-red-400">
              Error loading activity feed
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {(error as Error).message}
            </p>
          </div>
        ) : !events || events.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            Waiting for activity…
          </div>
        ) : (
          <div className="max-h-[500px] min-w-0 space-y-1 overflow-y-auto">
            {events.map((event) => (
              <div
                key={event.id}
                className="flex min-w-0 gap-3 rounded-2xl p-2 transition-colors hover:bg-muted/60"
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-muted/60 text-lg">
                  {event.emoji}
                </div>
                <div className="min-w-0 flex-1 space-y-0.5">
                  {event.link ? (
                    <Link
                      href={event.link}
                      className="text-sm font-medium text-[#0C4FD1] hover:underline dark:text-[#6CA0FF]"
                    >
                      <span dangerouslySetInnerHTML={{ __html: event.message }} />
                    </Link>
                  ) : (
                    <p
                      className="text-sm"
                      dangerouslySetInnerHTML={{ __html: event.message }}
                    />
                  )}
                  <p className="text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(event.timestamp), { addSuffix: true })}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </PanelSection>
    </Panel>
  )
}
