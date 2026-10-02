import { Panel } from '@/components/dashboard/shell'
import { Skeleton } from '@/components/ui/skeleton'

/**
 * `/manage/support`: header, the KPI panel, then one panel holding the status
 * rail, the filter toolbar and the ticket table (cards below `md`).
 *
 * Hand-rolled rather than `DataPageSkeleton variant="table"`: that variant
 * has no status rail and reserves an avatar slot in each row, so the page
 * would shift on arrival (§14.4, §5.4). The breakpoints below mirror the page
 * exactly — `hidden md:block` table with its tiered columns (priority and
 * assignee from `lg`, merchant from `xl`), `md:hidden` cards, `grid-cols-2
 * sm:flex` filters. The page also renders this as its Suspense fallback.
 */
export default function RouteLoading() {
  return (
    <div role="status" aria-live="polite" aria-busy="true" className="min-w-0 space-y-6">
      <span className="sr-only">Loading the support inbox</span>

      {/* Header — title, subtitle (hidden below `sm`, as on the page), actions. */}
      <div className="min-w-0">
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
          <Skeleton className="h-9 w-52 max-w-[70vw]" />
          <div className="flex min-w-0 flex-wrap gap-2">
            <Skeleton className="h-11 w-28 rounded-full sm:h-9" />
            <Skeleton className="h-11 w-52 rounded-full sm:h-9" />
          </div>
        </div>
        <Skeleton className="mt-2 h-4 w-80 max-w-[80vw] max-sm:hidden" />
      </div>

      {/* KPI panel — StatRow columns={4}: two-up on phones, four at `lg`. */}
      <Panel>
        <div className="grid min-w-0 grid-cols-2 gap-x-4 gap-y-6 px-4 py-6 sm:gap-x-10 sm:px-6 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="min-w-0">
              <Skeleton className="h-4 w-24 max-w-full" />
              <Skeleton className="mt-2 h-8 w-16 max-w-full" />
            </div>
          ))}
        </div>
      </Panel>

      <Panel padded>
        {/* Status rail — scrolls rather than clips, like the real one. */}
        <div className="w-full min-w-0 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className="inline-flex w-max gap-0.5 rounded-full bg-muted/70 p-1">
            {['w-16', 'w-24', 'w-20', 'w-20', 'w-12'].map((w, i) => (
              <Skeleton key={i} className={`h-8 shrink-0 rounded-full ${w}`} />
            ))}
          </div>
        </div>

        {/* Toolbar */}
        <div className="mt-4 flex min-w-0 flex-col gap-2 lg:flex-row lg:flex-wrap lg:items-center">
          <Skeleton className="h-9 w-full rounded-full lg:w-72" />
          <div className="grid min-w-0 grid-cols-2 gap-2 sm:flex sm:flex-wrap">
            <Skeleton className="h-9 w-full rounded-full sm:w-40" />
            <Skeleton className="h-9 w-full rounded-full sm:w-44" />
            <Skeleton className="h-9 w-full rounded-full sm:w-36" />
            <Skeleton className="h-9 w-full rounded-full sm:w-40" />
          </div>
        </div>

        <div className="mt-5 min-w-0">
          {/* Table well, `md` and up. Rows touch, as the real ones do; the
              column widths follow the page's tiers. */}
          <div className="hidden overflow-hidden rounded-2xl bg-muted/20 md:block">
            <div className="flex min-w-0 items-center bg-muted/50 py-3">
              <div className="min-w-0 flex-1 px-3"><Skeleton className="h-3 w-14" /></div>
              <div className="hidden w-44 shrink-0 px-3 xl:block"><Skeleton className="h-3 w-16" /></div>
              <div className="w-32 shrink-0 px-3"><Skeleton className="h-3 w-12" /></div>
              <div className="hidden w-24 shrink-0 px-3 lg:block"><Skeleton className="h-3 w-12" /></div>
              <div className="hidden w-32 shrink-0 px-3 lg:block xl:w-40"><Skeleton className="h-3 w-14" /></div>
              <div className="w-32 shrink-0 px-3"><Skeleton className="ml-auto h-3 w-20" /></div>
            </div>
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex min-w-0 items-center bg-card/70 py-3">
                <div className="min-w-0 flex-1 px-3"><Skeleton className="h-4 w-3/4" /></div>
                <div className="hidden w-44 shrink-0 px-3 xl:block"><Skeleton className="h-4 w-24" /></div>
                <div className="w-32 shrink-0 px-3"><Skeleton className="h-5 w-16 rounded-full" /></div>
                <div className="hidden w-24 shrink-0 px-3 lg:block"><Skeleton className="h-5 w-14 rounded-full" /></div>
                <div className="hidden w-32 shrink-0 px-3 lg:block xl:w-40"><Skeleton className="h-4 w-20" /></div>
                <div className="w-32 shrink-0 px-3"><Skeleton className="ml-auto h-4 w-20" /></div>
              </div>
            ))}
          </div>

          {/* Record cards below `md`: subject and status, then four pairs. */}
          <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 md:hidden">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="min-w-0 rounded-2xl bg-muted/45 p-4">
                <div className="flex h-6 items-center justify-between gap-3">
                  <Skeleton className="h-4 w-2/3" />
                  <Skeleton className="h-3 w-14" />
                </div>
                <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2">
                  {Array.from({ length: 4 }).map((_, j) => (
                    <div key={j} className="min-w-0">
                      <Skeleton className="my-0.5 h-3 w-14" />
                      <Skeleton className="my-0.5 h-4 w-20 max-w-full" />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </Panel>
    </div>
  )
}
