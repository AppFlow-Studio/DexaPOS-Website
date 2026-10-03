import { Skeleton } from "@/components/ui/skeleton";

/**
 * Loading shape for the KDS page: header, the scope pickers, the tab rail and
 * the Board tab's panel. Used by the route's `loading.tsx` and the page's
 * Suspense fallback, so neither falls back to `/manage/support`'s inbox
 * skeleton.
 *
 * It is always board-shaped, even for a `?tab=` deep link: `loading.tsx`
 * receives no search params, and the Suspense fallback exists precisely
 * because the page is waiting on `useSearchParams`, so neither can read the
 * tab without suspending itself.
 *
 * Mirrors the phone trims (UI-DESIGN-SYSTEM §13.4, §5.4): no subtitle or
 * panel caption below `sm`, the pickers stack full-width like the real
 * controls, and the board is table rows from `md` and cards below, as
 * `KdsStationBoard` renders it.
 */
export function KdsMirrorSkeleton() {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className="min-w-0 space-y-6"
    >
      <span className="sr-only">Loading KDS support</span>

      <div className="min-w-0">
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
          {/* The h1 is text-[1.75rem] at the inherited 1.5 line height: a
              42px line box. The bone sits in that box, text-sized. */}
          <div className="flex h-[2.625rem] items-center">
            <Skeleton className="h-8 w-24" />
          </div>
          <Skeleton className="h-9 w-28 rounded-full" />
        </div>
        <Skeleton className="mt-1 h-5 w-80 max-w-[80vw] max-sm:hidden" />
      </div>

      <div className="grid min-w-0 grid-cols-1 gap-2 sm:flex sm:flex-wrap">
        <Skeleton className="h-11 w-full rounded-full sm:h-9 sm:w-60" />
        <Skeleton className="h-11 w-full rounded-full sm:h-9 sm:w-52" />
        <Skeleton className="h-11 w-full rounded-full sm:h-9 sm:w-60" />
      </div>

      <Skeleton className="h-11 w-full max-w-md rounded-full" />

      <div className="min-w-0 rounded-3xl border bg-card px-4 py-8 sm:px-6">
        <Skeleton className="h-6 w-36" />
        <Skeleton className="mt-1 h-5 w-96 max-w-full max-sm:hidden" />

        <div className="mt-5 space-y-5">
          <Skeleton className="h-16 w-full rounded-2xl" />

          <div className="min-w-0 space-y-4">
            {/* The board's filters: on phones the status segments and the
                order-type dropdown; from `sm` the two pill rails. */}
            <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
              <Skeleton className="h-[3.25rem] w-full rounded-2xl sm:hidden" />
              <Skeleton className="h-11 w-full rounded-full sm:hidden" />
              <Skeleton className="h-10 w-80 max-w-full rounded-full max-sm:hidden" />
              <Skeleton className="h-10 w-72 max-w-full rounded-full max-sm:hidden" />
            </div>

            <div className="hidden space-y-2 md:block">
              {[0, 1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-12 w-full rounded-2xl" />
              ))}
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:hidden">
              <Skeleton className="h-32 w-full rounded-2xl" />
              <Skeleton className="h-24 w-full rounded-2xl" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
