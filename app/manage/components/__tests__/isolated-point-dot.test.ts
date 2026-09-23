import { describe, it, expect } from 'vitest'

import { IsolatedPointDot, fillDateGaps } from '../analytics-primitives'

/**
 * A sparse series must not hide its own data.
 *
 * With `dot={false}`, a reading whose neighbours are both null has nothing to
 * draw a line to and renders as nothing at all. The staging table-turn trend
 * has 10 readings in 91 days, 6 of them isolated — so the chart showed two
 * short lines and silently dropped 60% of its points.
 */
const REAL: [string, number][] = [
  ['2026-06-26', 2.8], ['2026-06-27', 58.0],   // a pair
  ['2026-07-01', 1.3], ['2026-07-09', 4.1],    // lone
  ['2026-07-13', 8.9], ['2026-07-14', 25.8],   // a pair
  ['2026-07-28', 85.6], ['2026-08-27', 0.8],   // lone
  ['2026-09-10', 3.5], ['2026-09-21', 36.9],   // lone
]

function dotted(rows: { date: string; avg_minutes: number | null }[]) {
  const points = rows.map((payload) => ({ payload }))
  return rows
    .map((row, index) =>
      row.avg_minutes != null &&
      IsolatedPointDot({ cx: 1, cy: 1, index, dataKey: 'avg_minutes', stroke: '#000', points })
        ? row.date
        : null
    )
    .filter(Boolean)
}

describe('IsolatedPointDot', () => {
  it('draws a dot on lone readings and not on ones joined by a line', () => {
    const filled = fillDateGaps(
      REAL.map(([date, avg_minutes]) => ({ date, avg_minutes })),
      ['avg_minutes']
    ) as { date: string; avg_minutes: number | null }[]

    expect(dotted(filled)).toEqual([
      '2026-07-01', '2026-07-09', '2026-07-28',
      '2026-08-27', '2026-09-10', '2026-09-21',
    ])
  })

  it('draws nothing on a fully contiguous series', () => {
    const rows = [
      { date: '2026-06-01', avg_minutes: 1 },
      { date: '2026-06-02', avg_minutes: 2 },
      { date: '2026-06-03', avg_minutes: 3 },
    ]
    expect(dotted(rows)).toEqual([])
  })

  it('dots a single-reading series, which would otherwise be invisible', () => {
    expect(dotted([{ date: '2026-06-01', avg_minutes: 5 }])).toEqual(['2026-06-01'])
  })

  it('returns null rather than throwing when Recharts omits props', () => {
    expect(IsolatedPointDot({})).toBeNull()
    expect(IsolatedPointDot({ cx: 1, cy: 1 })).toBeNull()
  })
})
