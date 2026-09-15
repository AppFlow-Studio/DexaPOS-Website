'use client'

import { Panel } from '@/components/dashboard/shell/Panel'
import { PanelSection } from '@/components/dashboard/shell/PanelSection'
import { ChartTooltipPanel } from '@/components/dashboard/orders/analytics/AnalyticsPrimitives'

/**
 * Shared scaffolding for the four HQ analytics sections (Growth, Revenue,
 * Operations, Payments).
 *
 * Each of those files previously re-declared the same card chrome, the same
 * `CustomTooltip`, and the same hardcoded `#e5e7eb`/`#64748b` axis colours —
 * four near-identical copies that had drifted apart. This is the one
 * definition.
 *
 * ⚠️ Classes are literal strings here, never sourced from a `.ts` module:
 * Tailwind does not scan `.ts`, so a class that only exists there gets no CSS
 * rule and the element silently renders unstyled (C7). This file is `.tsx`.
 */

/**
 * Categorical series colours.
 *
 * §4.6b's second exception: on a chart the colour *is* the data — it maps a
 * series to its legend entry — so these are data encoding, not status tinting.
 */
export const SERIES = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444'] as const

/**
 * One analytics block: a titled panel wrapping a chart or a table.
 *
 * `flush` drops the section's own padding for a table, which brings its own
 * `rounded-2xl bg-muted/20` well — §5.2 says a table is not wrapped in a
 * panel's padding, or you get a box inside a box.
 */
export function AnalyticsPanel({
  title,
  caption,
  icon,
  action,
  children,
}: {
  title: React.ReactNode
  caption?: React.ReactNode
  icon?: React.ComponentType<{ className?: string }>
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <Panel>
      <PanelSection icon={icon} label={title} caption={caption} action={action}>
        {children}
      </PanelSection>
    </Panel>
  )
}

/**
 * The shared Recharts tooltip, wired to the themed panel.
 *
 * Replaces four hand-rolled copies built from `bg-white/90` + slate text,
 * which rendered as a white box on white text in dark mode.
 */
export function AnalyticsTooltip({ active, payload, label, formatter }: any) {
  if (!active || !payload?.length) return null

  return (
    <ChartTooltipPanel
      label={label}
      items={payload.map((entry: Record<string, unknown>) => ({
        name: entry.name as React.ReactNode,
        color: entry.color as string,
        value: formatter
          ? formatter(entry.value)
          : typeof entry.value === 'number'
            ? entry.value.toLocaleString()
            : (entry.value as React.ReactNode),
      }))}
    />
  )
}
