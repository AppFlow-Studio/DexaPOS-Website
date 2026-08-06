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
        'grid min-w-0 grid-cols-1 gap-y-6 sm:gap-x-10 sm:divide-x sm:divide-border/60',
        '[&>*]:sm:pl-10 [&>*:first-child]:sm:pl-0',
        // 3-up goes 2-wide at `sm` before 3-wide at `lg`: three tiles in a
        // 640px row leaves each figure too narrow to stay on one line.
        columns === 2 && 'sm:grid-cols-2',
        columns === 3 && 'sm:grid-cols-2 lg:grid-cols-3',
        columns === 4 && 'sm:grid-cols-2 lg:grid-cols-4',
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
