'use client'

/**
 * Whether a chart has nothing to draw.
 *
 * An empty range still draws a full axis frame with no marks, which reads as a
 * broken chart rather than an honest "nothing happened". A row whose measures
 * are all zero is just as empty as no row at all, so both count — a feed that
 * always returns 24 hourly buckets never trips a bare `rows.length === 0`.
 */
export function isEmptySeries<T>(rows: readonly T[], ...measures: ((row: T) => number)[]) {
  return rows.length === 0 || rows.every((row) => measures.every((m) => !m(row)))
}

/**
 * What a chart renders instead of an empty frame (UI-DESIGN-SYSTEM §4.9).
 *
 * Takes the chart's own height so the panel does not jump when data arrives.
 * `title` says what is missing ("No orders in this period"); `hint` says what
 * will make data appear, or how to recover when filters caused it.
 */
export function ChartEmpty({
  height,
  title,
  hint,
}: {
  height: number
  title: string
  hint: string
}) {
  return (
    <div
      className="flex flex-col items-center justify-center gap-1 text-center"
      style={{ height }}
    >
      <p className="text-sm font-medium">{title}</p>
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  )
}
