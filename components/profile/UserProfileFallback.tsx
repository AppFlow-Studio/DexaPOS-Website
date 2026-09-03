'use client'

import { Skeleton } from '@/components/ui/skeleton'

/**
 * Placeholder for Clerk's `<UserProfile>` while its script loads.
 *
 * `<UserProfile>` renders literally nothing until Clerk boots — measured at
 * ~2.9s on a cold load — so the surface holding it collapsed to an empty box
 * with no sign anything was coming. Route-level `loading.tsx` cannot cover
 * this: the gap is client-side, long after the server render has flushed.
 *
 * Shapes mirror the rendered widget: a titled nav rail with exactly two items
 * (Profile, Security) beside a "Profile details" heading over read-only
 * label / value / action rows.
 */
export function UserProfileFallback() {
  return (
    <div
      aria-busy="true"
      aria-live="polite"
      className="flex min-w-0 flex-col gap-6 sm:flex-row"
    >
      <span className="sr-only">Loading your account details</span>

      <div className="w-full shrink-0 space-y-4 sm:w-56">
        <div className="space-y-2">
          <Skeleton className="h-6 w-28 max-w-full rounded-2xl" />
          <Skeleton className="h-3 w-40 max-w-full rounded-full" />
        </div>
        <div className="space-y-1.5">
          {Array.from({ length: 2 }).map((_, index) => (
            <Skeleton key={index} className="h-8 w-full rounded-full" />
          ))}
        </div>
      </div>

      <div className="min-w-0 flex-1 space-y-5">
        <Skeleton className="h-6 w-36 max-w-full rounded-2xl" />
        {Array.from({ length: 3 }).map((_, index) => (
          <div
            key={index}
            className="flex min-w-0 items-center justify-between gap-4"
          >
            <Skeleton className="h-4 w-28 shrink-0 rounded-full" />
            <Skeleton className="h-4 min-w-0 flex-1 rounded-full" />
            <Skeleton className="hidden h-4 w-20 shrink-0 rounded-full sm:block" />
          </div>
        ))}
      </div>
    </div>
  )
}
