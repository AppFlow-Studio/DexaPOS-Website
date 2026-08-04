'use client'

import { cn } from '@/lib/utils'

/**
 * The section shell used across the location detail sheet's tabs, matching the
 * dashboard Overview container: one rounded-2xl card, a brand-blue heading, and
 * no internal hairlines. Replaces the Shadcn Card stack the tabs used to build
 * each section from.
 */
export function LocationPanelSection({
  icon: Icon,
  title,
  description,
  action,
  children,
  className,
  tone = 'default',
}: {
  icon?: React.ComponentType<{ className?: string }>
  title: React.ReactNode
  description?: React.ReactNode
  /** Right-aligned control in the header (Edit button, badge, count…). */
  action?: React.ReactNode
  children?: React.ReactNode
  className?: string
  /** "destructive" tints the heading and border for the Danger Zone. */
  tone?: 'default' | 'destructive'
}) {
  return (
    <div
      className={cn(
        'overflow-hidden rounded-2xl bg-card px-6 py-6 ring-1 ring-border/50',
        tone === 'destructive' && 'ring-destructive/30',
        className
      )}
    >
      {/* Heading and action stack on narrow screens and share a line from sm
          up. Side by side at 320px the action squeezed the heading — clipping a
          trailing count badge passed inside `title`. */}
      <div className="sm:flex sm:items-start sm:justify-between sm:gap-3">
        <div className="min-w-0">
          <div
            className={cn(
              'flex items-center gap-2 flex-wrap text-[1.0625rem] font-semibold',
              tone === 'destructive'
                ? 'text-destructive'
                : 'text-[#0C4FD1] dark:text-[#6CA0FF]'
            )}
          >
            {Icon && <Icon className="h-[1.125rem] w-[1.125rem] shrink-0" />}
            <span className="min-w-0">{title}</span>
          </div>
          {description && (
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          )}
        </div>
        {action && <div className="shrink-0 mt-3 sm:mt-0">{action}</div>}
      </div>

      {children && <div className="mt-5">{children}</div>}
    </div>
  )
}

/**
 * Field styling inside a panel: rounder, taller, and filled instead of outlined
 * — the border and drop shadow are dropped so fields read as soft wells rather
 * than boxes. Applied on a wrapper so the shared Input/Select/Textarea
 * primitives stay untouched everywhere else. The focus ring is kept: it is the
 * only remaining affordance for which field is active.
 */
export const roundedFields = cn(
  '[&_[data-slot=input]]:h-10 [&_[data-slot=input]]:rounded-xl',
  '[&_[data-slot=input]]:border-transparent [&_[data-slot=input]]:shadow-none [&_[data-slot=input]]:bg-muted/50',
  '[&_[data-slot=select-trigger]]:h-10 [&_[data-slot=select-trigger]]:rounded-xl',
  '[&_[data-slot=select-trigger]]:border-transparent [&_[data-slot=select-trigger]]:shadow-none [&_[data-slot=select-trigger]]:bg-muted/50',
  '[&_textarea]:rounded-xl [&_textarea]:border-transparent [&_textarea]:shadow-none [&_textarea]:bg-muted/50'
)

/**
 * Select dropdowns render in a portal, so `roundedFields` can't reach them —
 * this goes on the SelectContent itself.
 */
export const roundedSelectContent = cn(
  'rounded-xl p-1.5',
  '[&_[data-slot=select-item]]:rounded-lg [&_[data-slot=select-item]]:py-2'
)

/** Pill action button sizing shared by the panels' Save/Edit/Cancel rows. */
export const pillButton = 'gap-2 rounded-full px-4'

/**
 * PhoneInput is a third-party component whose borders come from its own CSS
 * variable (--react-international-phone-border-color), which wins over utility
 * classes — so the border has to be cleared through the variable itself. The
 * rest matches the filled wells `roundedFields` produces.
 *
 * Spread onto the element as `style`, paired with `roundedPhoneInput`.
 */
export const phoneInputFilledVars = {
  '--react-international-phone-border-color': 'transparent',
  '--react-international-phone-background-color': 'transparent',
  '--react-international-phone-height': '40px',
} as React.CSSProperties

export const roundedPhoneInput = cn(
  'rounded-xl bg-muted/50',
  '[&_.react-international-phone-input]:h-10 [&_.react-international-phone-input]:rounded-r-xl',
  '[&_.react-international-phone-input]:border-transparent [&_.react-international-phone-input]:bg-transparent',
  '[&_.react-international-phone-country-selector-button]:h-10 [&_.react-international-phone-country-selector-button]:rounded-l-xl',
  '[&_.react-international-phone-country-selector-button]:border-transparent [&_.react-international-phone-country-selector-button]:bg-transparent'
)
