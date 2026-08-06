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
        'px-6 py-8',
        divider && 'border-t border-border/60',
        className
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
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

        {action && <div className="shrink-0">{action}</div>}
      </div>

      {children && <div className="mt-5">{children}</div>}
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
    <div className={cn('min-w-0 px-6 empty:hidden', className)}>{children}</div>
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
