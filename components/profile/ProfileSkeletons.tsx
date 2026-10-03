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
 * Clerk's `<UserProfile>` body while its script loads — what
 * `ClerkAccountPanel` shows under its (already rendered) section rail.
 *
 * `<UserProfile>` renders literally nothing until Clerk boots — measured at
 * ~2.9s on a cold load — so the surface holding it collapsed to an empty box
 * with no sign anything was coming. Route-level `loading.tsx` cannot cover
 * this: the gap is client-side, long after the server render has flushed.
 *
 * Shapes mirror the rendered widget: a "Profile details" heading over
 * read-only rows — not a form. From 62em (Clerk's own breakpoint) a row is a
 * 16.5rem title column beside a content column capped at 28rem (24rem from
 * `lg`), with the
 * row's control at the column's end; below that the title stacks on top.
 */
export function AccountBodySkeleton() {
  return (
    <div aria-hidden="true" className="min-w-0 space-y-5">
      <Block className="h-6 w-36 max-w-full" />
      {Array.from({ length: 3 }).map((_, index) => (
        <div
          key={index}
          className="flex min-w-0 flex-col gap-2 min-[62em]:flex-row min-[62em]:items-center min-[62em]:gap-6"
        >
          <div className="shrink-0 min-[62em]:w-[16.5rem]">
            <Block className="h-4 w-28 rounded-full" />
          </div>
          <div className="flex min-w-0 max-w-md flex-1 items-center justify-between gap-4 lg:max-w-sm">
            <Block className="h-4 w-48 min-w-0 rounded-full" />
            <Block className="h-4 w-20 shrink-0 rounded-full" />
          </div>
        </div>
      ))}
    </div>
  )
}

/**
 * The whole account panel for the route's `loading.tsx`: the Profile /
 * Security pill rail (one block its size — two 36px pills in a padded rail),
 * then the body.
 */
export function AccountPanelSkeleton() {
  return (
    <div aria-hidden="true" className="min-w-0 space-y-6">
      <Block className="h-11 w-44 max-w-full rounded-full" />
      <AccountBodySkeleton />
    </div>
  )
}
