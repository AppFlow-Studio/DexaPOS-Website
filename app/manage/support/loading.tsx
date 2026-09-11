import { Skeleton } from '@/components/ui/skeleton'

/**
 * `/manage/support`: header, a 2-up KPI grid that goes 4-up at `xl`, the
 * status tab strip, the filter row, then the ticket list.
 *
 * Hand-rolled rather than `DataPageSkeleton`: this page is built from raw
 * cards and a bordered tab strip rather than the dashboard shell primitives,
 * so a shared variant would promise panel chrome that never arrives. The
 * breakpoints below mirror the real page exactly — `grid-cols-2
 * xl:grid-cols-4` for the tiles, and the same `w-40`/`w-36` filter widths.
 */
export default function RouteLoading() {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className="min-w-0 space-y-6 overflow-x-hidden"
    >
      <span className="sr-only">Loading the support inbox</span>

      {/* Header — title/subtitle over the Refresh + New Ticket pair. */}
      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 space-y-2">
          <Skeleton className="h-8 w-52 max-w-[70vw]" />
          <Skeleton className="h-4 w-72 max-w-[80vw]" />
        </div>
        <div className="flex min-w-0 flex-wrap gap-2">
          <Skeleton className="h-8 w-24" />
          <Skeleton className="h-8 w-44" />
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid min-w-0 grid-cols-2 gap-3 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="min-w-0 overflow-hidden rounded-xl border bg-card p-4 shadow-sm"
          >
            <Skeleton className="mb-3 h-8 w-8 rounded-lg" />
            <Skeleton className="h-7 w-16 max-w-full" />
            <Skeleton className="mt-1.5 h-3 w-24 max-w-full" />
          </div>
        ))}
      </div>

      {/* Status tabs — scrolls rather than clips, like the real strip. */}
      <div className="flex min-w-0 gap-6 overflow-x-auto border-b pb-2.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {['w-12', 'w-20', 'w-16', 'w-20', 'w-8'].map((w, i) => (
          <Skeleton key={i} className={`h-4 shrink-0 ${w}`} />
        ))}
      </div>

      {/* Filters */}
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <Skeleton className="h-9 w-full min-w-0 max-w-sm flex-1" />
        <Skeleton className="h-9 w-40" />
        <Skeleton className="h-9 w-40" />
        <Skeleton className="h-9 w-36" />
        <Skeleton className="h-9 w-40" />
      </div>

      {/* Ticket list — a count bar over the rows, matching the real card. */}
      <div className="min-w-0 overflow-hidden rounded-xl border bg-card shadow-sm">
        <div className="border-b bg-muted/30 px-4 py-2.5">
          <Skeleton className="h-3 w-20" />
        </div>
        <div className="divide-y divide-border/50">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex min-w-0 items-center gap-3 px-4 py-3.5">
              <div className="min-w-0 flex-1 space-y-2">
                {/* The badge row: ticket number, status, priority, scope. */}
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-5 w-16 rounded-full" />
                  <Skeleton className="h-5 w-14 rounded-full" />
                </div>
                <Skeleton className="h-4 w-64 max-w-full" />
                <Skeleton className="h-3 w-48 max-w-full" />
              </div>
              <div className="hidden shrink-0 space-y-1.5 text-right sm:block">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-3 w-16" />
              </div>
              <Skeleton className="h-4 w-4 shrink-0" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
