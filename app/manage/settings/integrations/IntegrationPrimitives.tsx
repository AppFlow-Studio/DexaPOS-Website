'use client'

import { useRouter } from 'next/navigation'
import { Info } from 'lucide-react'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Panel, PanelSection } from '@/components/dashboard/shell'
import { LoadError } from '@/app/manage/transactions/components/ledger-primitives'
import { cn } from '@/lib/utils'

/**
 * Shared pieces of the HQ integration panels (/manage/settings/integrations,
 * /manage/nmi-integration).
 *
 * Status is words in a muted well, never coloured pills: on a muted surface a
 * pill is a box inside a box, and a state is not an alarm (§3.5, §4.6b).
 */

/** The muted well that holds a panel's `StatusItem`s. */
export function StatusWell({
  children,
  className,
}: {
  children: React.ReactNode
  /** Column overrides, e.g. `sm:grid-cols-3` for a three-item well. */
  className?: string
}) {
  return (
    <dl
      className={cn(
        'grid grid-cols-2 gap-x-6 gap-y-4 rounded-2xl bg-muted/60 px-4 py-4 sm:grid-cols-4',
        className
      )}
    >
      {children}
    </dl>
  )
}

export function StatusItem({
  term,
  value,
  note,
  hideNoteOnMobile = false,
  mono = false,
  className,
}: {
  term: string
  value: React.ReactNode
  /** Why the value reads as it does. Kept on phones unless `hideNoteOnMobile`. */
  note?: React.ReactNode
  /** Drop the note below `sm` when the value already says enough (§13.4). */
  hideNoteOnMobile?: boolean
  mono?: boolean
  className?: string
}) {
  return (
    <div className={cn('min-w-0', className)}>
      <dt className="text-sm text-muted-foreground">{term}</dt>
      {/* Dates are formatted in the viewer's locale, which the server render
          cannot know. */}
      <dd
        className={cn(
          'mt-1 text-sm font-medium tabular-nums',
          mono && 'break-all font-mono'
        )}
        suppressHydrationWarning
      >
        {value}
      </dd>
      {note && (
        <dd
          className={cn(
            'mt-0.5 text-[0.8125rem] text-muted-foreground',
            hideNoteOnMobile && 'max-sm:hidden'
          )}
        >
          {note}
        </dd>
      )}
    </div>
  )
}

/**
 * A section heading whose caption moves behind an info icon on phones (§13.4:
 * move, don't delete). Pass the same text as the `PanelSection` caption and
 * leave that caption at its default, hidden below `sm`: phones get the icon,
 * `sm` and up read the caption inline. The icon sits after the last word, so a
 * heading that wraps keeps it beside the title.
 */
export function LabelWithNote({ label, note }: { label: string; note: React.ReactNode }) {
  return (
    <span>
      {label}
      <Popover>
        <PopoverTrigger asChild>
          {/* 32px target (§13.6); the negative margin keeps it from
              stretching the heading's line. */}
          <button
            type="button"
            aria-label={`About ${label}`}
            className="-my-2 ml-0.5 inline-flex size-8 items-center justify-center rounded-full align-middle text-muted-foreground transition-colors hover:text-foreground sm:hidden"
          >
            <Info className="h-4 w-4" />
          </button>
        </PopoverTrigger>
        {/* Centred on the icon, 16px off the screen edges, never wider than
            the viewport (the StaffLaborAnalytics recipe). */}
        <PopoverContent
          align="center"
          collisionPadding={16}
          className="w-[min(18rem,calc(100vw-2rem))] rounded-2xl text-sm leading-relaxed"
        >
          {note}
        </PopoverContent>
      </Popover>
    </span>
  )
}

/**
 * An integration whose configuration failed to load. Its panel keeps its place
 * and says so, with Retry (§4.9), instead of the failure taking the whole page
 * down to the root error screen.
 */
export function IntegrationLoadError({
  label,
  title,
  detail,
}: {
  label: string
  title: string
  detail?: string
}) {
  const router = useRouter()
  return (
    <Panel>
      <PanelSection label={label}>
        <LoadError title={title} detail={detail} onRetry={() => router.refresh()} />
      </PanelSection>
    </Panel>
  )
}

/** A labelled form field with an optional hint beneath. */
export function Field({
  id,
  label,
  hint,
  hideHintOnMobile = false,
  className,
  children,
}: {
  id: string
  label: string
  hint?: React.ReactNode
  /** Drop the hint below `sm`; the label and placeholder carry the field (§13.4). */
  hideHintOnMobile?: boolean
  className?: string
  children: React.ReactNode
}) {
  return (
    <div className={cn('min-w-0 space-y-2', className)}>
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint && (
        <p className={cn('text-xs text-muted-foreground', hideHintOnMobile && 'max-sm:hidden')}>
          {hint}
        </p>
      )}
    </div>
  )
}

/** "Sep 29, 2026, 3:04 PM", or `fallback` when there is no timestamp (§4.9). */
export function formatTimestamp(value: string | null | undefined, fallback: string): string {
  if (!value) return fallback
  return new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}
