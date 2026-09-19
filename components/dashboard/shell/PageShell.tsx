'use client'

import { cn } from '@/lib/utils'

/**
 * The root of a dashboard page: a `<main>` with the standard vertical rhythm
 * between top-level blocks.
 *
 * Deliberately carries no entrance animation — `animate-in` here would create
 * a containing block and break `sticky` descendants. The fade belongs on the
 * header block, which `PageHeader` handles (D-05).
 */
export function PageShell({
  children,
  className,
  width = 'full',
  as: Tag = 'main',
}: {
  children: React.ReactNode
  className?: string
  /** `narrow` centres the page at 64rem — use for settings and form pages. */
  width?: 'full' | 'narrow'
  /**
   * The element to render. Defaults to `main`, which is correct for merchant
   * dashboard pages.
   *
   * HQ (`/manage/*`) pages pass `div`: `app/manage/layout.tsx` already renders
   * the surface's `<main>`, so a second one here would nest landmarks and
   * confuse assistive navigation. `DataPageSkeleton` solves the same problem
   * for HQ loading states with `shell="plain"` — this is the page-level half
   * of that contract, so a route and its skeleton now follow one rule.
   *
   * Deliberately a closed union rather than `React.ElementType`: HQ has
   * exactly one need, and a closed set keeps the invariant checkable.
   */
  as?: 'main' | 'div'
}) {
  return (
    <Tag
      className={cn(
        'min-w-0 space-y-6',
        width === 'narrow' && 'mx-auto w-full max-w-5xl',
        className
      )}
    >
      {children}
    </Tag>
  )
}
