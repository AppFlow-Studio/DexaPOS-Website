import { describe, it, expect } from 'vitest'

import { monthAwareDateTick, fillDateGaps } from '../analytics-primitives'

/**
 * The axis must always say which month it is showing.
 *
 * The regression these cover: `fillDateGaps` turned a 90-day range into ~91
 * points, Recharts thinned the axis to roughly every 7th tick, and the old
 * exact-date rule labelled month boundaries that were never drawn. The axis
 * then read `26 3 10 18 26 2 8` — June and September indistinguishable.
 */

/** Recharts calls the formatter once per DRAWN tick, with its drawn index. */
function drawnLabels(dates: string[], stride: number): string[] {
  const rows = dates.map((date) => ({ date }))
  const fmt = monthAwareDateTick(rows)
  const out: string[] = []
  for (let i = 0, d = 0; d < dates.length; d += stride, i++) {
    out.push(fmt(dates[d], i))
  }
  return out
}

const range = (from: string, days: number) => {
  const start = Date.UTC(+from.slice(0, 4), +from.slice(5, 7) - 1, +from.slice(8, 10))
  return Array.from({ length: days }, (_, i) => {
    const d = new Date(start + i * 86_400_000)
    const p = (n: number) => String(n).padStart(2, '0')
    return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`
  })
}

describe('monthAwareDateTick', () => {
  it('names every month the axis spans, even when ticks are thinned', () => {
    // The exact shape that broke: 91 contiguous days, every 7th tick drawn.
    const labels = drawnLabels(range('2026-06-25', 91), 7)
    const named = labels.filter((l) => /[A-Za-z]/.test(l))
    expect(named.length).toBeGreaterThanOrEqual(4) // Jun, Jul, Aug, Sep
    for (const month of ['Jun', 'Jul', 'Aug', 'Sep']) {
      expect(labels.some((l) => l.startsWith(month))).toBe(true)
    }
  })

  it('names each month exactly once', () => {
    const labels = drawnLabels(range('2026-06-25', 91), 7)
    const months = labels.filter((l) => /[A-Za-z]/.test(l)).map((l) => l.split(' ')[0])
    expect(new Set(months).size).toBe(months.length)
  })

  it('labels the very first tick with its month', () => {
    expect(drawnLabels(range('2026-06-25', 91), 7)[0]).toBe('Jun 25')
  })

  it('uses a month name, never an ambiguous numeric pair', () => {
    // `8/4` reads as both "8 April" and "August 4th"; that was the old bug.
    for (const l of drawnLabels(range('2026-06-25', 91), 7)) {
      expect(l).not.toMatch(/^\d+\/\d+$/)
    }
  })

  it('works at every plausible thinning stride', () => {
    for (const stride of [1, 2, 3, 5, 7, 10, 14]) {
      const labels = drawnLabels(range('2026-06-25', 91), stride)
      for (const month of ['Jul', 'Aug', 'Sep']) {
        expect(
          labels.some((l) => l.startsWith(month)),
          `stride ${stride} lost ${month}`
        ).toBe(true)
      }
    }
  })

  it('bare days carry no month, so the axis stays readable', () => {
    const labels = drawnLabels(range('2026-06-25', 91), 7)
    expect(labels.filter((l) => !/[A-Za-z]/.test(l)).length).toBeGreaterThan(0)
  })

  it('falls back to the exact-date rule when no index is supplied', () => {
    const rows = range('2026-06-25', 40).map((date) => ({ date }))
    const fmt = monthAwareDateTick(rows)
    expect(fmt('2026-06-25')).toBe('Jun 25')
    expect(fmt('2026-07-01')).toBe('Jul 1')
    expect(fmt('2026-07-09')).toBe('9')
  })

  it('survives a gap-filled series, which is how it is actually used', () => {
    const sparse = [
      { date: '2026-06-26', avg_minutes: 5 },
      { date: '2026-07-14', avg_minutes: 9 },
      { date: '2026-09-02', avg_minutes: 3 },
    ]
    const filled = fillDateGaps(sparse, ['avg_minutes'])
    const dates = filled.map((r) => r.date as string)
    const labels = drawnLabels(dates, 7)

    // Every month that HAS a drawn tick is named. September is deliberately
    // not asserted: the series ends 2026-09-02, so at stride 7 no tick falls
    // in September at all, and a formatter cannot label a tick that was never
    // rendered. Asserting otherwise would be demanding the impossible — the
    // first draft of this test did exactly that.
    const drawnMonths = new Set(
      dates.filter((_, i) => i % 7 === 0).map((d) => d.slice(0, 7))
    )
    for (const [key, abbr] of [
      ['2026-06', 'Jun'],
      ['2026-07', 'Jul'],
      ['2026-08', 'Aug'],
      ['2026-09', 'Sep'],
    ] as const) {
      if (!drawnMonths.has(key)) continue
      expect(labels.some((l) => l.startsWith(abbr)), `lost ${abbr}`).toBe(true)
    }
  })

  it('names a month whose only drawn tick is mid-month', () => {
    // A range starting mid-month must still name that month on its first tick,
    // rather than waiting for a 1st-of-month that may never be drawn.
    const labels = drawnLabels(range('2026-07-14', 40), 7)
    expect(labels[0]).toBe('Jul 14')
    expect(labels.some((l) => l.startsWith('Aug'))).toBe(true)
  })

  it('leaves unparseable values alone instead of rendering NaN', () => {
    const fmt = monthAwareDateTick([{ date: 'x' }, { date: 'y' }])
    expect(fmt('not-a-date', 0)).toBe('not-a-date')
  })
})
