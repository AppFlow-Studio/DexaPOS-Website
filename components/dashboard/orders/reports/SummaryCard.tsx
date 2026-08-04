'use client'

import { cn } from '@/lib/utils'

/**
 * A headline figure at the top of a report.
 *
 * Previously a tinted, bordered Card. It now matches the `StatTile` used by
 * Orders → Analytics and the dashboard Overview: no fill and no border of its
 * own, a quiet caption above a large tabular figure. `SummaryCardRow` supplies
 * the hairlines so a row of these reads as one group rather than three boxes.
 */
interface SummaryCardProps {
  label: string
  value: string | number
  icon?: React.ReactNode
  description?: string
  className?: string
}

/**
 * Brand blue for section titles, matched to the Orders → Analytics headings
 * (`ANALYTICS_ACCENT`) so the two pages read as one product.
 */
export const REPORT_ACCENT = 'text-[#0C4FD1] dark:text-[#6CA0FF]'

export function SummaryCard({
  label,
  value,
  icon,
  description,
  className,
}: SummaryCardProps) {
  return (
    <div className={cn('min-w-0', className)}>
      <div className={cn('flex items-center gap-1.5 text-sm font-medium', REPORT_ACCENT)}>
        {icon && <span className="shrink-0 [&_svg]:h-4 [&_svg]:w-4">{icon}</span>}
        <span className="truncate">{label}</span>
      </div>
      <p className="mt-1 text-[1.75rem] font-medium leading-tight tracking-[-0.02em] tabular-nums">
        {value}
      </p>
      {description && (
        <p className="mt-1 text-xs text-muted-foreground">{description}</p>
      )}
    </div>
  )
}

/**
 * Row wrapper for SummaryCards: vertical hairlines between columns on wide
 * screens. Once the row stacks on a phone the rules are dropped entirely —
 * spacing alone separates the tiles, so the column reads as one clean group
 * instead of a ladder of horizontal lines.
 */
export function SummaryCardRow({
  children,
  columns = 3,
  className,
}: {
  children: React.ReactNode
  columns?: 2 | 3
  className?: string
}) {
  return (
    <div
      className={cn(
        'grid grid-cols-1 gap-y-6 sm:gap-x-10 sm:divide-x sm:divide-border/60',
        '[&>*]:sm:pl-10 [&>*:first-child]:sm:pl-0',
        columns === 2 ? 'sm:grid-cols-2' : 'sm:grid-cols-3',
        className
      )}
    >
      {children}
    </div>
  )
}

/**
 * A per-channel tile (POS / Kiosk / Online Store / OrderOut). These sit in a
 * grid of peers, so they take the same borderless tinted fill as the report
 * search field rather than an outline of their own — the tint alone separates
 * them from the page.
 *
 * `dimmed` is set on the tiles that are *not* the active channel filter, so
 * narrowing the filter visibly recedes the channels you excluded instead of
 * needing a highlight on the one you kept.
 */
export function ChannelCard({
  label,
  value,
  icon,
  description,
  dimmed,
}: SummaryCardProps & { dimmed?: boolean }) {
  return (
    <div
      className={cn(
        'min-w-0 rounded-2xl border-0 bg-muted/60 px-4 py-4 shadow-none transition-opacity',
        dimmed && 'opacity-40'
      )}
    >
      <div className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
        {icon && <span className="shrink-0 [&_svg]:h-4 [&_svg]:w-4">{icon}</span>}
        <span className="truncate">{label}</span>
      </div>
      <p className="mt-1 text-xl font-medium leading-tight tracking-[-0.02em] tabular-nums">
        {value}
      </p>
      {description && (
        <p className="mt-1 truncate text-xs text-muted-foreground">{description}</p>
      )}
    </div>
  )
}
