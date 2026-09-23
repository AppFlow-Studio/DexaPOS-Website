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
 *
 * `right` is 24, not 16. A tick label is centred on its tick, so the last one
 * overhangs the plot by half its width and the margin has to cover that half.
 * 16px was sized when every label was two characters (`23` — 7px of overhang).
 * `monthAwareDateTick` now names the month on the first tick of each month, so
 * the final label can be `Sep 1` at ~35px wide, overhanging ~18px, and the
 * last date was being clipped by the card edge. 24 covers it with room to
 * spare and costs 8px of plot.
 */
export const CHART_MARGIN = { top: 4, right: 24, left: 0, bottom: 0 } as const

/**
 * Minimum horizontal gap between drawn ticks on a date axis.
 *
 * Recharts defaults `minTickGap` to **5px** and decides tick spacing from the
 * DATA, never from how wide the rendered labels turn out to be. That was
 * survivable while every tick read `26` (two characters), but
 * `monthAwareDateTick` now names the month on the first tick of each month, so
 * a 6-character `Jun 25` lands in a slot budgeted for two — and the labels
 * collide into `26Jul 310  18  26Aug 2`, which is worse than the ambiguity it
 * was meant to cure.
 *
 * 44px is measured, not guessed: the 12px tick font renders `Sep 23` at ~38px,
 * plus a 6px breathing gap. Erring wide costs a few dropped day labels; erring
 * narrow costs legibility on every tick at once. Sibling dashboards set 24-60
 * by the same reasoning (`minTickGap={32}` in SalesChart, `={60}` in
 * FinancialHeroChart, whose labels are wider still).
 *
 * Spread onto a date `<XAxis>` alongside `tickFormatter={monthAwareDateTick(…)}`.
 */
export const DATE_AXIS_TICK_GAP = 44

/**
 * Show a dot only where a datapoint has no neighbour to draw a line to.
 *
 * `dot={false}` is right for a dense series — a dot per day is noise. But on a
 * sparse one it silently HIDES data: a day whose neighbours are both null has
 * nothing to connect to, so Recharts draws a zero-length line, which is to say
 * nothing at all. The table-turn trend on staging has 10 days of data in a
 * 91-day window, of which 6 are isolated — so the chart was rendering two
 * short lines and dropping 60% of its own points on the floor.
 *
 * This keeps lines clean where the data is continuous and makes a lone reading
 * visible as a dot. Pass as `dot={<IsolatedPointDot dataKey="avg_minutes" />}`.
 *
 * `index` and the series `data` both arrive on the props Recharts spreads onto
 * a custom dot, which is what makes the neighbour test possible.
 */
export function IsolatedPointDot(props: {
  cx?: number
  cy?: number
  index?: number
  dataKey?: string
  stroke?: string
  // Recharts passes the full series through; typed loosely because its own
  // dot-prop type is `any` and varies by chart.
  points?: { payload?: Record<string, unknown> }[]
}) {
  const { cx, cy, index, dataKey, stroke, points } = props
  if (cx == null || cy == null || index == null || !points || !dataKey) return null

  const valueAt = (i: number) => points[i]?.payload?.[dataKey]
  const isolated = valueAt(index - 1) == null && valueAt(index + 1) == null
  if (!isolated) return null

  return <circle cx={cx} cy={cy} r={2.5} fill={stroke} stroke="none" />
}

/**
 * Tick formatter for a daily date axis, naming the month only on its first day.
 *
 * The axis used to print `MM-DD` on every tick, so a 90-day range repeated the
 * same month across a dozen labels ("06-26 07-01 07-06 07-11 …") — the two
 * most prominent characters on each tick were the two that hardly ever
 * changed. A label now carries only the day number, except on the earliest
 * rendered day of each month, which suffixes it: `26/6 · 1 · 6 … 1/7 · 6`.
 *
 * Numeric month (`26/6`), not a name: `26 Jun` is wider, and at three charts
 * per row on a phone the names collided. Day-first, so a low day number on a
 * boundary tick cannot be misread as the month.
 *
 * The decision is made up-front against the data, NOT from the `index`
 * Recharts passes the formatter. That index is the ordinal of the *visible*
 * tick, and Recharts drops ticks that would collide — so on a dense axis
 * `rows[index - 1]` points at an unrelated early row and the month reappears
 * on nearly every label. Instead the first calendar day present for each
 * month is resolved once here, and the formatter just asks whether this
 * value is one of them. That also makes the result independent of how many
 * ticks Recharts chooses to draw.
 *
 * Pass the same array the chart is given; `key` names the date field when it
 * is not `date`. Rows need not be sorted or gap-free — these series come from
 * `GROUP BY DATE(...)`, so days without data are simply absent, and the
 * earliest present day of a month is the one that gets named.
 *
 * Dates are compared as text, never through `new Date(…)`: these are
 * `YYYY-MM-DD` calendar days from SQL, and parsing them to a `Date` would
 * shift them a day backwards for anyone behind UTC.
 */
const MONTH_ABBR = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const

export function monthAwareDateTick<T extends Record<string, unknown>>(
  rows: readonly T[],
  key: keyof T = 'date' as keyof T
) {
  // The EARLIEST date each month, as `YYYY-MM` → `YYYY-MM-DD`. String
  // comparison is safe and sort-free on a zero-padded ISO date.
  const firstOfMonth = new Map<string, string>()
  for (const row of rows) {
    const raw = String(row[key] ?? '')
    const month = raw.slice(0, 7)
    if (raw.length < 10) continue
    const seen = firstOfMonth.get(month)
    if (seen === undefined || raw < seen) firstOfMonth.set(month, raw)
  }

  // Row order as drawn, so a tick's neighbours can be found by index.
  const dates = rows
    .map((r) => String(r[key] ?? ''))
    .filter((d) => d.length >= 10)
    .sort()

  return (value: string, index?: number): string => {
    const raw = String(value)
    const [, rawMonth, rawDay] = raw.split('-')

    // Guard on parseability, not just presence: a non-date string splits into
    // pieces that `Number()` turns into NaN, which would render as "a NaN".
    const month = Number(rawMonth)
    const day = Number(rawDay)
    if (!Number.isFinite(month) || !Number.isFinite(day)) return raw

    const monthKey = raw.slice(0, 7)

    // WHY NOT `firstOfMonth.get(monthKey) === raw`, WHICH IS WHAT THIS DID.
    //
    // That labelled exactly one date per month. It worked while the series
    // carried only days WITH DATA, because the chart drew nearly every point.
    // Once `fillDateGaps` began materialising every calendar day, a 90-day
    // range became ~91 points in a ~280px panel and Recharts thinned the axis
    // to roughly every 7th tick. The month boundaries then sat at indices
    // 0, 6, 37, 68 and only ONE of them fell on a drawn tick: every other
    // label was computed and discarded, leaving `26 3 10 18 26 2 8` — an axis
    // with no month on it at all, where June and September look identical.
    //
    // The rule now is "first DRAWN tick of its month". Recharts passes the
    // tick's index, and thins at a constant stride, so the previous drawn tick
    // is `index - stride` and a month change between the two is what earns a
    // label. Deriving the stride from the first two calls keeps this a PURE
    // function of (value, index): `tickFormatter` is invoked from more than one
    // place in CartesianAxis (measurement as well as render), so anything that
    // accumulated state across calls would label correctly on one pass and
    // blank on the next.
    if (index == null) {
      // No index (a caller outside Recharts, or a future version): fall back to
      // the exact-date rule. Labels at most one tick per month and never lies.
      return firstOfMonth.get(monthKey) === raw
        ? `${MONTH_ABBR[month - 1] ?? month} ${day}`
        : `${day}`
    }

    const here = dates.indexOf(raw)
    if (here <= 0) {
      // First drawn tick of the whole axis always carries its month.
      return `${MONTH_ABBR[month - 1] ?? month} ${day}`
    }

    // The tick drawn immediately before this one. `index` counts drawn ticks,
    // `here` counts data rows, so their ratio is the thinning stride.
    const stride = Math.max(1, Math.round(here / index))
    const prev = dates[here - stride]
    if (prev === undefined) return `${day}`

    // `Jun 26`, not `26/6`. The numeric form was ambiguous exactly where it
    // mattered: `8/4` reads as "8 April" as readily as "August 4th".
    return prev.slice(0, 7) !== monthKey
      ? `${MONTH_ABBR[month - 1] ?? month} ${day}`
      : `${day}`
  }
}

/**
 * Fill calendar gaps in a daily series with explicit `null` values.
 *
 * Analytics RPCs OMIT days that have no measurable sample — a kitchen day where
 * every ticket was abandoned has no median, and inventing a 0 for it would
 * claim food came out instantly. Omission is correct at the data layer, but it
 * lies at the chart layer: these `LineChart`s use a CATEGORICAL x-axis (no
 * `type="number"`), which spaces whatever rows it is given evenly and connects
 * them. A three-week hole then renders as one ordinary line segment between
 * neighbouring ticks, reading as continuous data that simply moved.
 *
 * Recharts breaks a line wherever the `dataKey` is `null`, so materialising the
 * missing days with a null value turns a silent compression into a visible gap.
 * The x-axis also regains a true time scale, so slopes mean what they look like.
 *
 * Dates are stepped as TEXT via UTC arithmetic and re-formatted by hand, never
 * through a local-time `Date`, matching `monthAwareDateTick` above: these are
 * `YYYY-MM-DD` calendar days, and a local parse shifts them a day backwards for
 * anyone behind UTC.
 *
 * Returns rows of `{ [key]: 'YYYY-MM-DD', ...valueKeys: null }` interleaved with
 * the originals, in ascending date order. A series of 0 or 1 rows is returned
 * untouched — there is nothing to bridge.
 */
export function fillDateGaps<T extends Record<string, unknown>>(
  rows: readonly T[],
  valueKeys: readonly (keyof T)[],
  key: keyof T = 'date' as keyof T
): T[] {
  if (rows.length < 2) return [...rows]

  const sorted = [...rows].sort((a, b) =>
    String(a[key]).localeCompare(String(b[key]))
  )

  // Guard: anything that is not a well-formed calendar day would make the step
  // loop below non-terminating, so bail out rather than hang the render.
  const isDay = (v: unknown) => /^\d{4}-\d{2}-\d{2}$/.test(String(v ?? ''))
  if (!sorted.every((r) => isDay(r[key]))) return sorted

  const toUTC = (d: string) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10))
  const fmt = (ms: number) => {
    const d = new Date(ms)
    const p = (n: number) => String(n).padStart(2, '0')
    return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`
  }

  const DAY = 86_400_000
  const blank = Object.fromEntries(valueKeys.map((k) => [k, null]))
  const out: T[] = []

  for (let i = 0; i < sorted.length; i++) {
    out.push(sorted[i])
    if (i === sorted.length - 1) break
    let cursor = toUTC(String(sorted[i][key])) + DAY
    const next = toUTC(String(sorted[i + 1][key]))
    while (cursor < next) {
      out.push({ ...blank, [key]: fmt(cursor) } as unknown as T)
      cursor += DAY
    }
  }

  return out
}

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
      <PanelSection
        icon={icon}
        label={title}
        // Captions are desktop-only. On a phone every one of these restates
        // its own title in more words ("Platform GMV Trend" / "Daily gross
        // merchandise value"), and that line plus its margin is vertical space
        // the chart itself needs — a stack of eight panels paid it eight
        // times. Hidden with CSS rather than a JS breakpoint so the server and
        // client render the same markup, and so the text stays available to
        // screen readers and to find-in-page at every width.
        //
        // `captionClassName` hides the whole `<p>`, not just its text: wrapping
        // the contents instead would leave the paragraph's own `mt-1` behind
        // as a phantom 4px gap.
        caption={caption}
        captionClassName="hidden sm:block"
        action={action}
      >
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
