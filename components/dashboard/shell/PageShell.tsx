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
}: {
  children: React.ReactNode
  className?: string
  /** `narrow` centres the page at 64rem — use for settings and form pages. */
  width?: 'full' | 'narrow'
}) {
  return (
    <main
      className={cn(
        'min-w-0 space-y-6',
        width === 'narrow' && 'mx-auto w-full max-w-5xl',
        className
      )}
    >
      {children}
    </main>
  )
}
