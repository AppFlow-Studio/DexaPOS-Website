'use client'

import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'


/**
 * A figure inside a section: a quiet caption above a large tabular number.
 *
 * No fill and no border of its own — `StatRow` supplies the hairlines so a row
 * of these reads as one group rather than three boxes.
 *
 * The label is `text-muted-foreground`, deliberately not brand blue (D-03).
 * Blue marks a section heading; if every tile label is blue too, the accent
 * stops signalling anything and the page reads as noise.
 */
export function StatTile({
  label,
  value,
  meta,
  icon,
  isLoading,
  className,
}: {
  label: React.ReactNode
  value: React.ReactNode
  /** A small line beneath the figure — a comparison, a count, a share. */
  meta?: React.ReactNode
  icon?: React.ReactNode
  isLoading?: boolean
  className?: string
}) {
  return (
    <div className={cn('min-w-0', className)}>
      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
        {icon && (
          <span className="shrink-0 [&_svg]:h-4 [&_svg]:w-4">{icon}</span>
        )}
        <span className="truncate">{label}</span>
      </div>

      {isLoading ? (
        <Skeleton className="mt-2 h-8 w-28" />
      ) : (
        <p className="mt-1 text-[1.75rem] font-medium leading-tight tracking-[-0.02em] tabular-nums">
          {value}
        </p>
      )}

      {meta && (
        <p className="mt-0.5 truncate text-[0.8125rem] text-muted-foreground">
          {meta}
        </p>
      )}
    </div>
  )
}

/**
 * A row of `StatTile`s, separated by vertical hairlines on wide screens.
 *
 * Once the row stacks on a phone the rules are dropped entirely — spacing
 * alone separates the tiles, so the column reads as one clean group instead of
 * a ladder of horizontal lines.
 */
export function StatRow({
  children,
  columns = 3,
  className,
}: {
  children: React.ReactNode
  columns?: 2 | 3 | 4
  className?: string
}) {
  return (
    <div
      className={cn(
        'grid min-w-0 grid-cols-1 gap-y-6 sm:gap-x-10',
        // Rules and indents are applied per *column position*, not per child.
        // `divide-x` + `:first-child` only clears the very first tile, so the
        // tile that starts each wrapped row kept a stray rule and a 40px
        // indent — which is what left a 3-up row's last tile hanging.
        columns === 2 &&
          'sm:grid-cols-2 [&>*:nth-child(2n+1)]:sm:pl-0 [&>*:nth-child(2n+1)]:sm:border-l-0 [&>*]:sm:border-l [&>*]:sm:border-border/60 [&>*]:sm:pl-10',
        columns === 3 &&
          'sm:grid-cols-2 lg:grid-cols-3 [&>*]:sm:border-l [&>*]:sm:border-border/60 [&>*]:sm:pl-10 [&>*:nth-child(2n+1)]:sm:pl-0 [&>*:nth-child(2n+1)]:sm:border-l-0 [&>*:nth-child(3n+1)]:lg:pl-0 [&>*:nth-child(3n+1)]:lg:border-l-0 [&>*:nth-child(3n+2)]:lg:pl-10 [&>*:nth-child(3n+2)]:lg:border-l',
        columns === 4 &&
          'sm:grid-cols-2 lg:grid-cols-4 [&>*]:sm:border-l [&>*]:sm:border-border/60 [&>*]:sm:pl-10 [&>*:nth-child(2n+1)]:sm:pl-0 [&>*:nth-child(2n+1)]:sm:border-l-0 [&>*:nth-child(4n+1)]:lg:pl-0 [&>*:nth-child(4n+1)]:lg:border-l-0 [&>*:nth-child(4n+2)]:lg:pl-10 [&>*:nth-child(4n+2)]:lg:border-l [&>*:nth-child(4n+3)]:lg:pl-10 [&>*:nth-child(4n+3)]:lg:border-l',
        className
      )}
    >
      {children}
    </div>
  )
}

/**
 * A tile that stands alone in a grid of peers rather than in a `StatRow` —
 * per-channel or per-platform breakdowns, say.
 *
 * Unlike `StatTile` these need their own quiet surface to be countable, so
 * they take the same borderless tinted fill as the search field. `dimmed`
 * recedes the tiles excluded by an active filter.
 */
export function InsetTile({
  label,
  value,
  meta,
  icon,
  dimmed,
  className,
}: {
  label: React.ReactNode
  value: React.ReactNode
  meta?: React.ReactNode
  icon?: React.ReactNode
  dimmed?: boolean
  className?: string
}) {
  return (
    <div
      className={cn(
        'min-w-0 px-4 py-4 transition-opacity',
        'rounded-2xl border-0 bg-muted/60 shadow-none',
        dimmed && 'opacity-40',
        className
      )}
    >
      <div className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
        {icon && (
          <span className="shrink-0 [&_svg]:h-4 [&_svg]:w-4">{icon}</span>
        )}
        <span className="truncate">{label}</span>
      </div>
      <p className="mt-1 text-xl font-medium leading-tight tracking-[-0.02em] tabular-nums">
        {value}
      </p>
      {meta && (
        <p className="mt-1 truncate text-xs text-muted-foreground">{meta}</p>
      )}
    </div>
  )
}
