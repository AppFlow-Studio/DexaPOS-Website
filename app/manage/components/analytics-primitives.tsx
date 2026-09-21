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
 * Y-axis gutter for horizontal (`layout="vertical"`) bar charts.
 *
 * These charts used a fixed 80-120px label gutter. That is fine at desktop
 * width but on a 320-390px phone it ate a third to a half of the chart, so the
 * bars were squeezed into what was left and the labels still wrapped. Mobile
 * gets a narrow gutter and `CategoryTick` below wraps the label into it.
 */
export const CATEGORY_AXIS_WIDTH = { mobile: 88, desktop: 120 } as const

/**
 * Y-axis gutter for vertical (value-axis) cartesian charts on a phone.
 *
 * Recharts reserves ~60px for a numeric Y axis regardless of how short the
 * labels are. Inside a 309px panel body that leaves the plot shoved right,
 * with the space beside a short tick like `8` unused.
 *
 * This is deliberately a function of the longest tick rather than one fixed
 * number: a single width cannot serve both `8` and `240`. A previous fixed
 * 38px was too wide for single-digit counts and too narrow for three-digit
 * ones, which clipped them.
 *
 * `chars` is the longest formatted tick the chart will render — count the
 * characters, including `$`, `%` or `k`. Sized at ~7px per character (the 11px
 * tick font) plus 10px for the tick mark and its gap, floored at 22px.
 */
export function valueAxisWidthMobile(chars: number): number {
    return Math.max(22, Math.round(chars * 7) + 10)
}

/**
 * Balanced plot margins for a value-axis chart.
 *
 * Pair with `VALUE_AXIS_WIDTH_MOBILE`. The y-axis gutter is asymmetric by
 * nature — it holds the tick labels — so the right margin is set to roughly
 * half of it: enough that the plot reads as centred in its card and the last
 * x tick is not clipped, without wasting the width the axis already paid for.
 * Spread it as `margin={CHART_MARGIN}`.
 */
export const CHART_MARGIN = { top: 4, right: 16, left: 0, bottom: 0 } as const

/**
 * Wrapping tick for a category axis.
 *
 * Recharts renders a tick as a single `<text>` that it will happily let
 * overflow or clip — there is no wrapping. This splits the label on word
 * boundaries into at most `maxLines` rows sized to the axis gutter, so a
 * narrow gutter stays readable instead of truncating to "Merchant…".
 */
export function CategoryTick({
  x,
  y,
  payload,
  width = CATEGORY_AXIS_WIDTH.mobile,
  // Two lines, not three: a 3-line stack is 22px tall and overflowed its row in
  // a 10-bar chart, so neighbouring labels visually collided. Anything longer
  // is ellipsised, and the full name is still in the tooltip.
  maxLines = 2,
}: {
  x?: number
  y?: number
  payload?: { value?: string | number }
  width?: number
  maxLines?: number
}) {
  const label = String(payload?.value ?? '')
  // ~7px per character at the 12px tick size, minus a 4px breathing gap before
  // the plot. Erring wide matters more than packing tightly: underestimating
  // overflows the gutter and the label gets clipped at the panel edge.
  const perLine = Math.max(5, Math.floor((width - 4) / 7))

  const words = label.split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let current = ''
  let truncated = false

  for (let i = 0; i < words.length; i++) {
    if (lines.length === maxLines) {
      truncated = true
      break
    }
    const word = words[i]
    const candidate = current ? `${current} ${word}` : word
    if (candidate.length <= perLine) {
      current = candidate
      continue
    }
    if (current) {
      lines.push(current)
      current = ''
      if (lines.length === maxLines) {
        truncated = true
        break
      }
    }
    // A single word wider than the gutter has no break point of its own, so
    // split it hard rather than letting it bleed past the axis.
    let rest = word
    while (rest.length > perLine && lines.length < maxLines) {
      lines.push(rest.slice(0, perLine))
      rest = rest.slice(perLine)
    }
    if (lines.length === maxLines) {
      if (rest) truncated = true
      break
    }
    current = rest
  }

  if (current) {
    if (lines.length < maxLines) lines.push(current)
    else truncated = true
  }

  // Signal dropped text rather than losing it silently.
  if (truncated && lines.length) {
    const last = lines[lines.length - 1]
    lines[lines.length - 1] =
      last.length >= perLine ? `${last.slice(0, Math.max(1, perLine - 1))}…` : `${last}…`
  }

  // Centre the block on the tick: shift up by half the stack's extra height.
  const lineHeight = 11
  const dyStart = -(((lines.length - 1) * lineHeight) / 2)

  return (
    <text
      x={x}
      y={y}
      textAnchor="end"
      fill="var(--muted-foreground)"
      fontSize={12}
      dominantBaseline="middle"
    >
      {lines.map((line, i) => (
        <tspan key={i} x={x} dy={i === 0 ? dyStart : lineHeight}>
          {line}
        </tspan>
      ))}
    </text>
  )
}

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
