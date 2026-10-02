'use client'

import Link from 'next/link'

import { cn } from '@/lib/utils'

import { useRailAutoScroll } from './useRailAutoScroll'

/**
 * The section rail above a workspace's pages (Financial, Team): one pill per
 * page, the current one raised. The §4.5 pill rail with links in place of
 * tab triggers, since each section is its own route.
 *
 * - Active is neutral (`bg-background … ring-border`), never brand text or a
 *   brand underline (§3.5, §4.5).
 * - No rule beneath it: the rail's own surface separates it (§5.5).
 * - Scrolls sideways when the pills outgrow a phone, keeping the current one
 *   in view (§13.2).
 */
export function WorkspaceNav({
  label,
  sections,
  activeHref,
}: {
  /** Accessible name, e.g. "Team sections". */
  label: string
  sections: ReadonlyArray<{ label: string; href: string }>
  activeHref: string | undefined
}) {
  const railRef = useRailAutoScroll<HTMLDivElement>(activeHref ?? '')

  return (
    <nav aria-label={label} className="mb-6">
      <div ref={railRef} className="no-scrollbar w-full min-w-0 overflow-x-auto pb-1">
        <div className="inline-flex h-auto w-max flex-nowrap gap-0.5 rounded-full bg-muted/70 p-1">
          {sections.map(({ label: sectionLabel, href }) => {
            const isActive = activeHref === href
            return (
              <Link
                key={href}
                href={href}
                data-tab-value={href}
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  'shrink-0 whitespace-nowrap rounded-full px-4 py-2 text-[0.8125rem] font-medium transition-colors',
                  isActive
                    ? 'bg-background text-foreground shadow-sm ring-1 ring-border'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {sectionLabel}
              </Link>
            )
          })}
        </div>
      </div>
    </nav>
  )
}
