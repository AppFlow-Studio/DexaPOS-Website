import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

/*
 * The profile page's loading shapes — the one skeleton §4.10 asks for. The
 * route's `loading.tsx` (via `DataPageSkeleton variant="profile"`) and both
 * panels' in-page states render these same blocks, so nothing changes colour,
 * radius or position when one hands off to the next. Shared by
 * `/dashboard/profile` and `/manage/profile`.
 *
 * Both are `aria-hidden`: the caller owns the one `role="status"` line.
 */

/** Neutral blocks, never the primitive's default `bg-accent`, which is violet. */
function Block({ className }: { className?: string }) {
  return (
    <Skeleton
      className={cn('rounded-2xl bg-muted/70 motion-reduce:animate-none', className)}
    />
  )
}

/** `ProfileIdentityPanel`'s contents: avatar, name, email and a label pill. */
export function ProfileIdentitySkeleton() {
  return (
    <div aria-hidden="true" className="flex items-center gap-4">
      {/* The panel drops its avatar below `sm` (§13.4), so no slot here either. */}
      <Block className="hidden h-16 w-16 shrink-0 rounded-full sm:block" />
      <div className="min-w-0 flex-1 space-y-2">
        <Block className="h-5 w-40 max-w-full" />
        <Block className="h-4 w-56 max-w-full rounded-full" />
        <Block className="h-5 w-28 max-w-full rounded-full" />
      </div>
    </div>
  )
}

/**
 * `ClerkAccountPanel`'s contents while Clerk's script loads.
 *
 * `<UserProfile>` renders literally nothing until Clerk boots — measured at
 * ~2.9s on a cold load — so the surface holding it collapsed to an empty box
 * with no sign anything was coming. Route-level `loading.tsx` cannot cover
 * this: the gap is client-side, long after the server render has flushed.
 *
 * Shapes mirror the rendered widget: a titled nav rail with exactly two items
 * (Profile, Security) beside a "Profile details" heading over read-only
 * label / value / action rows — not a form.
 */
export function AccountPanelSkeleton() {
  return (
    <div aria-hidden="true" className="flex min-w-0 flex-col gap-6 sm:flex-row">
      <div className="w-full shrink-0 space-y-4 sm:w-56">
        <div className="space-y-2">
          <Block className="h-6 w-28 max-w-full" />
          <Block className="h-3 w-40 max-w-full rounded-full" />
        </div>
        <div className="space-y-1.5">
          {Array.from({ length: 2 }).map((_, index) => (
            <Block key={index} className="h-8 w-full rounded-full" />
          ))}
        </div>
      </div>

      <div className="min-w-0 flex-1 space-y-5">
        <Block className="h-6 w-36 max-w-full" />
        {Array.from({ length: 3 }).map((_, index) => (
          <div
            key={index}
            className="flex min-w-0 items-center justify-between gap-4"
          >
            <Block className="h-4 w-28 shrink-0 rounded-full" />
            <Block className="h-4 min-w-0 flex-1 rounded-full" />
            <Block className="hidden h-4 w-20 shrink-0 rounded-full sm:block" />
          </div>
        ))}
      </div>
    </div>
  )
}
