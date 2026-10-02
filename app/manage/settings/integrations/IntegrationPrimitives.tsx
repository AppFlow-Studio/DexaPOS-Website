'use client'

import { useRouter } from 'next/navigation'
import { Label } from '@/components/ui/label'
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
  mono = false,
  className,
}: {
  term: string
  value: React.ReactNode
  /** Why the value reads as it does. Kept on phones (§13.4). */
  note?: React.ReactNode
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
      {note && <dd className="mt-0.5 text-[0.8125rem] text-muted-foreground">{note}</dd>}
    </div>
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
  className,
  children,
}: {
  id: string
  label: string
  hint?: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <div className={cn('min-w-0 space-y-2', className)}>
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

/** "Sep 29, 2026, 3:04 PM", or `fallback` when there is no timestamp (§4.9). */
export function formatTimestamp(value: string | null | undefined, fallback: string): string {
  if (!value) return fallback
  return new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}
