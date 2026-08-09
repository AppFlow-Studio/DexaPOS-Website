'use client'

import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

/**
 * One section inside a `Panel`: a brand-blue heading, an optional headline
 * figure, an optional trailing control, and free-form content beneath.
 *
 * Sections are separated by vertical rhythm rather than by each drawing a
 * rule, so a panel reads as one continuous surface. Pass `divider` when a
 * hairline genuinely helps — a dense list of short sections, say — rather
 * than as a default.
 *
 * ⚠️ Classes are written as literal strings, never pulled from `tokens.ts`.
 * Tailwind does not scan `.ts` files, so a class sourced only from there gets
 * no CSS rule and the element silently renders unstyled. See `tokens.ts`.
 */
export function PanelSection({
  icon: Icon,
  label,
  value,
  caption,
  isLoading,
  action,
  children,
  className,
  divider = false,
}: {
  icon?: React.ComponentType<{ className?: string }>
  label: React.ReactNode
  value?: React.ReactNode
  caption?: React.ReactNode
  isLoading?: boolean
  /** Right-aligned control on the heading row. */
  action?: React.ReactNode
  children?: React.ReactNode
  className?: string
  /** Draws a hairline above the section. Off by default. */
  divider?: boolean
}) {
  return (
    <section
      className={cn(
        // 48px of horizontal padding is most of a 320px viewport — ease off
        // below `sm` so content keeps its width.
        'min-w-0 px-4 py-8 sm:px-6',
        divider && 'border-t border-border/60',
        className
      )}
    >
      {/* Wraps rather than squeezing: a `shrink-0` action beside a non-wrapping
          row forces the title column to collapse to one word per line on a
          phone. The action drops beneath the heading instead. */}
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="min-w-0 flex-1 basis-64">
          <div className="flex items-center gap-2 text-[1.0625rem] font-semibold text-[#0C4FD1] dark:text-[#6CA0FF]">
            {Icon && <Icon className="h-[1.125rem] w-[1.125rem] shrink-0" />}
            <span className="min-w-0">{label}</span>
          </div>

          {isLoading ? (
            <Skeleton className="mt-2 h-10 w-36" />
          ) : (
            value !== undefined && (
              <div className="mt-1 text-[2rem] font-medium leading-tight tracking-[-0.02em] tabular-nums">
                {value}
              </div>
            )
          )}

          {caption && (
            <p className="mt-1 text-sm text-muted-foreground">{caption}</p>
          )}
        </div>

        {/* `min-w-0` + `max-w-full`, never `shrink-0`: a rigid action wrapper
            overflows its own row once the controls inside exceed the width
            left over on a phone. */}
        {action && <div className="min-w-0 max-w-full">{action}</div>}
      </div>

      {/* `min-w-0`: a block child takes an automatic minimum width from its
          content, so without this a wide descendant (a long row, a table)
          pushes past the section box and clips at the viewport edge on a
          phone — the section's own `min-w-0` does not cover this wrapper. */}
      {children && <div className="mt-5 min-w-0">{children}</div>}
    </section>
  )
}

/**
 * A full-bleed row inside a panel that isn't a full section — a table, a
 * chart, a toolbar. Keeps the horizontal padding consistent with
 * `PanelSection` without adding the vertical block spacing.
 */
export function PanelRow({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('min-w-0 px-4 empty:hidden sm:px-6', className)}>
      {children}
    </div>
  )
}

/** A quiet label introducing a group inside a section. */
export function PanelSubLabel({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <p className={cn('mb-3 text-sm text-muted-foreground', className)}>
      {children}
    </p>
  )
}
