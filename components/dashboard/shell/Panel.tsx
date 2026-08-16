'use client'

import { cn } from '@/lib/utils'

/**
 * The rounded container one page section lives inside (D-02 tier 1).
 *
 * Replaces the old pattern of a bordered, shadowed, tinted `<Card>` per
 * metric. Content inside is separated by vertical rhythm and hairlines rather
 * than by each piece owning its own box.
 *
 * `padded` is the common case (a panel wrapping free-form content). Leave it
 * off when the panel holds `PanelSection`s, which bring their own padding.
 *
 * ⚠️ Classes are literal strings, never pulled from `tokens.ts` — Tailwind
 * does not scan `.ts` files, so a class sourced only from there gets no CSS
 * rule and the element silently renders unstyled. See `tokens.ts`.
 */
export function Panel({
  children,
  className,
  nested = false,
  padded = false,
  ...divProps
}: React.HTMLAttributes<HTMLDivElement> & {
  /** Renders at tier 2 (`rounded-2xl`) for a card nested inside a panel. */
  nested?: boolean
  padded?: boolean
}) {
  return (
    <div
      {...divProps}
      className={cn(
        'min-w-0 overflow-hidden border bg-card',
        nested ? 'rounded-2xl' : 'rounded-3xl',
        // Matches PanelSection: 48px of padding is most of a 320px viewport.
        padded && 'px-4 py-6 sm:px-6',
        className
      )}
    >
      {children}
    </div>
  )
}

/**
 * A row of panels or tiles laid out as a grid. Thin convenience wrapper — use
 * a plain grid when the layout is unusual.
 */
export function PanelGrid({
  children,
  className,
  columns = 2,
}: {
  children: React.ReactNode
  className?: string
  columns?: 2 | 3 | 4
}) {
  return (
    <div
      className={cn(
        'grid min-w-0 grid-cols-1 gap-6',
        columns === 2 && 'md:grid-cols-2',
        columns === 3 && 'md:grid-cols-2 lg:grid-cols-3',
        columns === 4 && 'sm:grid-cols-2 lg:grid-cols-4',
        className
      )}
    >
      {children}
    </div>
  )
}

/**
 * A hairline-separated divider between sibling blocks inside a panel, for the
 * cases where `PanelSection`'s own top rule doesn't apply.
 */
export function PanelDivider({ className }: { className?: string }) {
  return <div className={cn('border-t border-border/60', className)} />
}
