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
  metaClassName,
  icon,
  isLoading,
  className,
  onClick,
  isActive,
}: {
  label: React.ReactNode
  value: React.ReactNode
  /** A small line beneath the figure — a comparison, a count, a share. */
  meta?: React.ReactNode
  /**
   * Extra classes for the meta line. Mainly a responsive escape hatch: a tile
   * whose meta is noise on a phone can drop it with `hidden sm:block` without
   * the caller having to branch on viewport width in JS.
   */
  metaClassName?: string
  icon?: React.ReactNode
  isLoading?: boolean
  className?: string
  /**
   * Makes the tile a control. A figure that states a count is the most direct
   * way to ask for the rows behind it, so a tile may double as the filter that
   * selects them.
   */
  onClick?: () => void
  /** Whether this tile's filter is the one currently applied. */
  isActive?: boolean
}) {
  const body = (
    <>
      <div
        className={cn(
          'flex items-center gap-1.5 text-sm',
          // Emphasis, not colour: the accent marks section headings (D-03), and
          // status is never colour-coded, so an applied filter reads as weight.
          isActive ? 'font-medium text-foreground' : 'text-muted-foreground'
        )}
      >
        {/* Decorative on a phone and expensive: the glyph plus its gap costs
            ~22px of a ~147px tile, which is the difference between "Avg. Order
            Value" reading in full and truncating to "Avg. Order Va…". The
            label already names the metric, so the icon is what gives way. */}
        {icon && (
          <span className="hidden shrink-0 sm:inline [&_svg]:h-4 [&_svg]:w-4">
            {icon}
          </span>
        )}
        <span className="truncate">{label}</span>
      </div>

      {isLoading ? (
        <Skeleton className="mt-2 h-8 w-28" />
      ) : (
        // A phone tile is half-width (~147px at 375px), and the widest
        // realistic figure — "$123,456.78" — measures exactly that at the full
        // 1.75rem. Rather than let a seven-figure total wrap to two lines and
        // knock the row out of alignment, the figure steps down one size on
        // phones and takes its authored size from `sm` up, where the tile is
        // wide enough for it.
        <p className="mt-1 text-2xl font-medium leading-tight tracking-[-0.02em] tabular-nums sm:text-[1.75rem]">
          {value}
        </p>
      )}

      {meta && (
        <p
          className={cn(
            'mt-0.5 truncate text-[0.8125rem] text-muted-foreground',
            metaClassName
          )}
        >
          {meta}
        </p>
      )}
    </>
  )

  if (!onClick) {
    return <div className={cn('min-w-0', className)}>{body}</div>
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={isActive}
      className={cn(
        'min-w-0 rounded-2xl text-left transition-opacity hover:opacity-80',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        !isActive && 'opacity-70',
        className
      )}
    >
      {body}
    </button>
  )
}

/**
 * A row of `StatTile`s, separated by vertical hairlines on wide screens.
 *
 * Once the row stacks on a phone the rules are dropped entirely — spacing
 * alone separates the tiles, so the column reads as one clean group instead of
 * a ladder of horizontal lines.
 *
 * Phones get two columns, not one. A single column turned an eight-tile row
 * into two full screens of scrolling before any actionable content — the
 * figures are short and `tabular-nums`, so they pair comfortably at half
 * width. `columns={2}` is the exception: those rows carry the longest values
 * (currency with cents, "x of y" counts) and are already only two tiles, so
 * stacking them costs one screen-row and buys the value room to breathe.
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
        'grid min-w-0 gap-y-6 sm:gap-x-10',
        // Base column count. The `sm:` rules below re-establish the wide
        // layout, so this only governs phones.
        columns === 2 ? 'grid-cols-1' : 'grid-cols-2 gap-x-4',
        // Rules and indents are applied per *column position*, not per child.
        // `divide-x` + `:first-child` only clears the very first tile, so the
        // tile that starts each wrapped row kept a stray rule and a 40px
        // indent — which is what left a 3-up row's last tile hanging.
        columns === 2 &&
          'sm:grid-cols-2 [&>*:nth-child(2n+1)]:sm:pl-0 [&>*:nth-child(2n+1)]:sm:border-l-0 [&>*]:sm:border-l [&>*]:sm:border-border/60 [&>*]:sm:pl-10',
        // At `lg` every tile except the one starting a row must regain the rule
        // the `sm` two-up layout cleared. Restoring only `3n+2` left the last
        // column with no divider — the missing line between a 3-up row's 2nd
        // and 3rd tiles.
        columns === 3 &&
          'sm:grid-cols-2 lg:grid-cols-3 [&>*]:sm:border-l [&>*]:sm:border-border/60 [&>*]:sm:pl-10 [&>*:nth-child(2n+1)]:sm:pl-0 [&>*:nth-child(2n+1)]:sm:border-l-0 [&>*:nth-child(3n+1)]:lg:pl-0 [&>*:nth-child(3n+1)]:lg:border-l-0 [&>*:nth-child(3n+2)]:lg:pl-10 [&>*:nth-child(3n+2)]:lg:border-l [&>*:nth-child(3n+3)]:lg:pl-10 [&>*:nth-child(3n+3)]:lg:border-l',
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
