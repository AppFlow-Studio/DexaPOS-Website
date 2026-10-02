import { PageShell, Panel } from '@/components/dashboard/shell'
import { Skeleton } from '@/components/ui/skeleton'

/** One rail section's bones: a heading, then its rows (§14.4). */
function RailSectionBones({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-w-0 px-4 py-8 sm:px-6">
      <Skeleton className="h-5 w-28" />
      <div className="mt-5 min-w-0">{children}</div>
    </div>
  )
}

/**
 * The HQ ticket workspace while it loads, drawn on the same skeleton C as the
 * page (§14.4): the `PageHeader` bones, then the ticket-controls panel, the
 * thread panel and the context panel in the page's own grid.
 *
 * Shared by the route loader and the page's own `isLoading` branch so the two
 * hand off without the layout moving. Below `lg` the three panels stack in the
 * page's phone order (controls, thread, context); from `lg` the thread takes
 * the left column at the page's fixed height and the other two form the rail.
 * No avatar bones on phones, where the page drops the plates (§13.4).
 */
export function SupportTicketSkeleton() {
  return (
    <div role="status" aria-live="polite" aria-busy="true" className="min-w-0">
      <span className="sr-only">Loading the ticket</span>

      <PageShell as="div">
        {/* PageHeader: back pill, title row (+ status pills from `sm`), subtitle */}
        <div>
          <Skeleton className="h-8 w-36 rounded-full" />
          <div className="mt-2 flex h-[2.625rem] min-w-0 items-center gap-3">
            <Skeleton className="h-8 w-80 max-w-full" />
            <div className="hidden shrink-0 items-center gap-1.5 sm:flex">
              <Skeleton className="h-5 w-16 rounded-full" />
              <Skeleton className="h-5 w-14 rounded-full" />
            </div>
          </div>
          <div className="mt-1 flex h-5 items-center">
            <Skeleton className="h-3.5 w-64 max-w-full" />
          </div>
        </div>

        <div className="grid min-w-0 grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_18rem] lg:grid-rows-[auto_1fr]">
          {/* Ticket controls: four fields, then three actions */}
          <Panel nested className="lg:col-start-2 lg:row-start-1">
            <RailSectionBones>
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="min-w-0 space-y-1">
                    <Skeleton className="h-3 w-16" />
                    <Skeleton className="h-11 w-full rounded-full sm:h-9" />
                  </div>
                ))}
              </div>
            </RailSectionBones>
            <RailSectionBones>
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-11 w-full rounded-full sm:h-9" />
                ))}
              </div>
            </RailSectionBones>
          </Panel>

          {/* Thread + composer, at the page's `lg` height */}
          <Panel
            nested
            className="flex flex-col lg:col-start-1 lg:row-span-2 lg:row-start-1 lg:h-[calc(100svh-15.5rem)] lg:min-h-[30rem]"
          >
            {/* Alternating sides and widths, so the column reads as a
                conversation rather than a stack of identical slabs. Fixed per
                index, not random, so server and client markup agree. */}
            <div className="min-h-0 flex-1 space-y-4 overflow-hidden px-4 py-5 sm:px-6">
              {[
                { own: false, width: 'w-3/4', height: 'h-20' },
                { own: true, width: 'w-2/3', height: 'h-16' },
                { own: false, width: 'w-1/2', height: 'h-14' },
                { own: true, width: 'w-3/4', height: 'h-24' },
              ].map((bubble, i) => (
                <div key={i} className={`flex min-w-0 ${bubble.own ? 'justify-end' : ''}`}>
                  <div className="flex min-w-0 max-w-[85%] flex-1 items-start gap-3 sm:max-w-[70%]">
                    {!bubble.own && (
                      <Skeleton className="hidden h-8 w-8 shrink-0 rounded-full sm:block" />
                    )}
                    <Skeleton
                      className={`${bubble.width} ${bubble.height} rounded-2xl ${bubble.own ? 'ml-auto' : ''}`}
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className="shrink-0 space-y-2 px-4 pb-4 pt-2 sm:px-6 sm:pb-5">
              <div className="flex items-center gap-2">
                <Skeleton className="h-5 w-9 rounded-full" />
                <Skeleton className="h-4 w-32" />
              </div>
              <div className="flex min-w-0 items-end gap-2">
                <Skeleton className="h-20 min-w-0 flex-1 rounded-2xl" />
                <div className="flex shrink-0 flex-col items-center gap-2">
                  <Skeleton className="size-11 rounded-full sm:size-9" />
                  <Skeleton className="size-9 rounded-full" />
                </div>
              </div>
              {/* "Press Enter to send" line, shown from `sm` */}
              <div className="hidden h-4 items-center justify-center sm:flex">
                <Skeleton className="h-3 w-56" />
              </div>
            </div>
          </Panel>

          {/* Merchant and context */}
          <Panel nested className="lg:col-start-2 lg:row-start-2">
            <RailSectionBones>
              <div className="space-y-2">
                <Skeleton className="h-3.5 w-36" />
                <Skeleton className="h-3.5 w-28" />
                <Skeleton className="h-3.5 w-32" />
              </div>
            </RailSectionBones>
            <RailSectionBones>
              <div className="space-y-1.5">
                <Skeleton className="h-3.5 w-full" />
                <Skeleton className="h-3.5 w-full" />
              </div>
            </RailSectionBones>
          </Panel>
        </div>
      </PageShell>
    </div>
  )
}
