'use client'

import { cn } from '@/lib/utils'

/**
 * Panel primitives for the station-detail tabs.
 *
 * These tabs were built from `@/components/ui/card` — a bordered, shadowed box
 * with `rounded-lg` corners and a ruled header. The design system asks for a
 * tier-1 `rounded-3xl border bg-card` panel with no dividing lines (§3.1,
 * §5.5), and for section headings in the brand accent (§3.2).
 *
 * The shape of the markup in those seven files matches `Card`/`CardHeader`/
 * `CardTitle`/`CardDescription`/`CardContent` almost exactly, so rather than
 * restructure ~70 blocks by hand this module re-implements that same vocabulary
 * on top of the correct surfaces. The call sites keep their structure; only the
 * import changes.
 *
 * ⚠️ Classes are literal strings, never pulled from `tokens.ts` — Tailwind does
 * not scan `.ts` files, so a class sourced only from there gets no CSS rule and
 * the element silently renders unstyled (C7).
 */

/** Tier-1 page panel (§3.1). */
export function StationPanel({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...props}
      className={cn(
        'min-w-0 overflow-hidden rounded-3xl border bg-card',
        className
      )}
    />
  )
}

/**
 * Heading block. Carries no `border-b` — sections are separated by spacing and
 * a change of surface, never by a rule drawn across a flat panel (§5.5).
 */
export function StationPanelHeader({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...props}
      className={cn('min-w-0 px-4 pb-4 pt-6 sm:px-6', className)}
    />
  )
}

/** Section heading in the brand accent (§3.2, C5). */
export function StationPanelTitle({
  className,
  ...props
}: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3
      {...props}
      className={cn(
        'flex min-w-0 items-center gap-2 text-[1.0625rem] font-semibold text-[#0C4FD1] dark:text-[#6CA0FF]',
        className
      )}
    />
  )
}

export function StationPanelDescription({
  className,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p {...props} className={cn('mt-1 text-sm text-muted-foreground', className)} />
  )
}

/**
 * Body. `px-4` below `sm` because 48px of horizontal padding is most of a
 * 320px viewport.
 */
export function StationPanelContent({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div {...props} className={cn('min-w-0 px-4 pb-6 sm:px-6', className)} />
  )
}
