import { Skeleton } from '@/components/ui/skeleton'

/**
 * The HQ ticket workspace while it loads: a back link and identity header over
 * the message thread, with the details rail beside it.
 *
 * Shared by the route loader and the page's own `isLoading` branch so the two
 * hand off without the layout moving. It mirrors the real page's responsive
 * split exactly — stacked below `lg`, thread + `w-72` rail from `lg` up — which
 * the previous skeleton did not: it drew both columns side by side at every
 * width, so a phone got a squeezed sliver of thread beside a squeezed sliver of
 * sidebar, then watched them stack the moment the ticket arrived.
 */
export function SupportTicketSkeleton() {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className="flex min-w-0 flex-col gap-6 lg:h-[calc(100vh-100px)] lg:flex-row"
    >
      <span className="sr-only">Loading the ticket</span>

      {/* Thread column */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="shrink-0 space-y-2 border-b pb-4">
          <div className="flex items-center gap-2">
            <Skeleton className="h-8 w-8 rounded-md" />
            <Skeleton className="h-4 w-28" />
          </div>
          <div className="min-w-0 px-1">
            <Skeleton className="mb-2 h-7 w-80 max-w-full" />
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-5 w-16 rounded-full" />
              <Skeleton className="h-5 w-14 rounded-full" />
              <Skeleton className="h-3 w-40 max-w-full" />
            </div>
          </div>
        </div>

        {/* Messages — alternating sides and widths, so the column reads as a
            conversation rather than a stack of identical slabs. Fixed per
            index, not random, so server and client markup agree. */}
        <div className="min-h-0 flex-1 space-y-4 px-1 py-4">
          {[
            { own: false, width: 'w-3/4', height: 'h-20' },
            { own: true, width: 'w-2/3', height: 'h-16' },
            { own: false, width: 'w-1/2', height: 'h-14' },
            { own: true, width: 'w-3/4', height: 'h-24' },
          ].map((bubble, i) => (
            <div
              key={i}
              className={`flex min-w-0 ${bubble.own ? 'justify-end' : ''}`}
            >
              <div className="flex min-w-0 max-w-[85%] items-start gap-2">
                {!bubble.own && (
                  <Skeleton className="h-8 w-8 shrink-0 rounded-full" />
                )}
                <Skeleton className={`${bubble.width} ${bubble.height}`} />
              </div>
            </div>
          ))}
        </div>

        {/* Composer */}
        <div className="shrink-0 space-y-2 border-t pt-3">
          <div className="flex items-center gap-2">
            <Skeleton className="h-5 w-9 rounded-full" />
            <Skeleton className="h-4 w-32" />
          </div>
          <Skeleton className="h-16 w-full rounded-lg" />
          <div className="flex min-w-0 items-end gap-2">
            <Skeleton className="h-20 min-w-0 flex-1 rounded-md" />
            <Skeleton className="h-20 w-10 shrink-0 rounded-md" />
          </div>
        </div>
      </div>

      {/* Details rail */}
      <div className="w-full min-w-0 shrink-0 space-y-5 border-t pt-5 lg:w-72 lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0">
        {[3, 3, 2].map((rows, section) => (
          <div key={section} className="min-w-0 space-y-2.5">
            <Skeleton className="h-4 w-28" />
            {Array.from({ length: rows }).map((_, i) => (
              <div key={i} className="min-w-0 space-y-1">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-8 w-full rounded-md" />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
