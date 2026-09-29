import { Skeleton } from "@/components/ui/skeleton";

/**
 * Loading shape for the KDS page: header, the scope pickers, the tab rail and
 * one panel. Used by the route's `loading.tsx` and the page's Suspense
 * fallback, so neither falls back to `/manage/support`'s inbox skeleton.
 *
 * Mirrors the phone trims (UI-DESIGN-SYSTEM §13.4, §5.4): no subtitle line
 * below `sm`, and the pickers stack full-width like the real controls.
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

      <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 space-y-2">
          <Skeleton className="h-8 w-24" />
          <Skeleton className="h-4 w-80 max-w-[80vw] max-sm:hidden" />
        </div>
        <Skeleton className="h-9 w-28 rounded-full" />
      </div>

      <div className="grid min-w-0 grid-cols-1 gap-2 sm:flex sm:flex-wrap">
        <Skeleton className="h-9 w-full rounded-full sm:w-60" />
        <Skeleton className="h-9 w-full rounded-full sm:w-52" />
        <Skeleton className="h-9 w-full rounded-full sm:w-60" />
      </div>

      <Skeleton className="h-11 w-full max-w-md rounded-full" />

      <div className="min-w-0 rounded-3xl border bg-card px-4 py-8 sm:px-6">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="mt-5 h-16 w-full rounded-2xl" />
        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-32 w-full rounded-2xl" />
          ))}
        </div>
      </div>
    </div>
  );
}
