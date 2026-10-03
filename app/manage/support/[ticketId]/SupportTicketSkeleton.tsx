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
 * page's phone order (fields, thread, context); from `lg` the fields run as
 * one row across the top, and the thread sits beside the context rail.
 * No avatar bones on phones, where the page drops the plates (§13.4).
 */
export function SupportTicketSkeleton() {
  return (
    <div role="status" aria-live="polite" aria-busy="true" className="min-w-0">
      <span className="sr-only">Loading the ticket</span>

      <PageShell as="div">
        {/* PageHeader: back pill, title row (+ status pills from `sm`, then
            the three action pills), subtitle */}
        <div>
          <Skeleton className="h-8 w-36 rounded-full" />
          <div className="mt-2 flex min-w-0 flex-wrap items-center justify-between gap-3">
            <div className="flex h-[2.625rem] min-w-0 items-center gap-3">
              <Skeleton className="h-8 w-80 max-w-full" />
              <div className="hidden shrink-0 items-center gap-1.5 sm:flex">
                <Skeleton className="h-5 w-16 rounded-full" />
                <Skeleton className="h-5 w-14 rounded-full" />
              </div>
            </div>
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <Skeleton className="h-11 w-36 rounded-full sm:h-9" />
              <Skeleton className="h-11 w-32 rounded-full sm:h-9" />
              <Skeleton className="h-11 w-40 rounded-full sm:h-9" />
            </div>
          </div>
          <div className="mt-1 flex h-5 items-center">
            <Skeleton className="h-3.5 w-64 max-w-full" />
          </div>
        </div>

        <div className="grid min-w-0 grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
          {/* Ticket fields: one row of four from `lg` */}
          <Panel nested className="lg:col-span-full">
            <div className="grid min-w-0 grid-cols-1 gap-x-4 gap-y-3 px-4 py-4 sm:grid-cols-2 sm:px-6 lg:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="min-w-0 space-y-1">
                  <Skeleton className="h-3 w-16" />
                  <Skeleton className="h-11 w-full rounded-full sm:h-9" />
                </div>
              ))}
            </div>
          </Panel>

          {/* Thread + composer: screen-tall below `lg`; from `lg` the page's minimum, content out of flow */}
          <Panel
            nested
            className="max-sm:h-[calc(100svh-7.5rem-1px-max(0.5rem,env(safe-area-inset-bottom)))] sm:max-lg:h-[calc(100svh-4rem)] lg:relative lg:min-h-[max(26rem,calc(100svh-22.5rem))]"
          >
            <div className="flex h-full min-w-0 flex-col lg:absolute lg:inset-0 lg:h-auto">
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
                    <Skeleton className="size-8 rounded-full" />
                    <Skeleton className="size-8 rounded-full" />
                  </div>
                </div>
                {/* "Press Enter to send" line, shown from `sm` */}
                <div className="hidden h-4 items-center justify-center sm:flex">
                  <Skeleton className="h-3 w-56" />
                </div>
              </div>
            </div>
          </Panel>

          {/* Merchant and context — the rail from `lg` */}
          <Panel nested>
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
