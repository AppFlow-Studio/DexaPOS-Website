'use client'

import Link from 'next/link'
import { ArrowLeft, Globe, MapPin } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'


interface PageHeaderProps {
  title: string
  subtitle?: string
  /** Renders a ghost "Back to X" pill above the title (D-04). */
  backHref?: string
  backLabel?: string
  /** Right-aligned chip beside the title — usually `<LocationIndicator />`. */
  indicator?: React.ReactNode
  /** Right-aligned buttons. Sits after `indicator` on the same row. */
  actions?: React.ReactNode
  className?: string
}

/**
 * The standard page header: an optional back pill, the page title, an optional
 * right-aligned indicator and actions, and a subtitle beneath.
 *
 * This is the single enforcement point for three rules that had drifted across
 * the six restructured pages:
 *
 * - **D-01** — one `<h1>` treatment. Previously written three ways.
 * - **D-04** — the back control is a ghost pill with a label whenever there is
 *   a parent list page. Never bordered.
 * - **D-05** — the entrance fade is scoped to the header block, never the page
 *   root, because `animate-in` animates `transform` and any `sticky`
 *   descendant then breaks.
 *
 * The back pill is inside the animated wrapper on purpose: on reports and
 * analytics it sat outside, so it popped in un-faded while the header beneath
 * it faded.
 */
export function PageHeader({
  title,
  subtitle,
  backHref,
  backLabel = 'Back',
  indicator,
  actions,
  className,
}: PageHeaderProps) {
  return (
    <div className={cn('animate-in fade-in duration-500', className)}>
      {backHref && (
        <Button variant="ghost" size="sm" className="-ml-2 h-8 gap-1.5 rounded-full text-muted-foreground" asChild>
          <Link href={backHref}>
            <ArrowLeft className="h-4 w-4" />
            {backLabel}
          </Link>
        </Button>
      )}

      <div
        className={cn(
          'flex flex-wrap items-center justify-between gap-3',
          backHref && 'mt-2'
        )}
      >
        <h1 className="min-w-0 text-[1.75rem] font-semibold tracking-[-0.02em]">{title}</h1>

        {/* `flex-wrap` + `min-w-0`, NOT `shrink-0`: a non-shrinking, non-wrapping
            action row overflows the viewport on narrow screens (two buttons here
            pushed "Add Items to Categories" off the right edge at ~360px). Wrapping
            onto a second line is the correct narrow-screen behaviour. */}
        {(indicator || actions) && (
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            {indicator}
            {actions}
          </div>
        )}
      </div>

      {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
    </div>
  )
}

/**
 * The "All Locations" / location-name chip that sits beside a page title.
 *
 * Pass the values from `useIsAllLocations()` and `useSelectedLocation()`; this
 * component deliberately reads no store of its own so it stays usable in the
 * HQ `/manage` surface, where location scoping works differently.
 */
export function LocationIndicator({
  isAllLocations,
  locationName,
}: {
  isAllLocations: boolean
  locationName?: string | null
}) {
  return (
    <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
      {isAllLocations ? (
        <>
          <Globe className="h-4 w-4" />
          All Locations
        </>
      ) : (
        <>
          <MapPin className="h-4 w-4" />
          {locationName}
        </>
      )}
    </p>
  )
}
