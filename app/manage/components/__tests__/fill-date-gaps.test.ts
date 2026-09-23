import { describe, it, expect } from 'vitest'

import { fillDateGaps } from '../analytics-primitives'

/**
 * `fillDateGaps` exists because the analytics RPCs OMIT days with no measurable
 * sample, and the charts use a categorical x-axis that would close those holes
 * up silently — drawing a straight line across a three-week gap as though the
 * data were continuous. These tests pin the two properties that matter:
 * a gap becomes an explicit null row, and the helper never hangs.
 */
describe('fillDateGaps', () => {
  it('inserts a null row for each missing calendar day', () => {
    const rows = [
      { date: '2026-06-25', avg_minutes: 5 },
      { date: '2026-06-28', avg_minutes: 9 },
    ]

    expect(fillDateGaps(rows, ['avg_minutes'])).toEqual([
      { date: '2026-06-25', avg_minutes: 5 },
      { date: '2026-06-26', avg_minutes: null },
      { date: '2026-06-27', avg_minutes: null },
      { date: '2026-06-28', avg_minutes: 9 },
    ])
  })

  it('leaves a contiguous series untouched', () => {
    const rows = [
      { date: '2026-06-25', avg_minutes: 5 },
      { date: '2026-06-26', avg_minutes: 6 },
    ]
    expect(fillDateGaps(rows, ['avg_minutes'])).toEqual(rows)
  })

  it('sorts before filling, so unordered input still bridges correctly', () => {
    const rows = [
      { date: '2026-06-28', avg_minutes: 9 },
      { date: '2026-06-26', avg_minutes: 5 },
    ]
    expect(fillDateGaps(rows, ['avg_minutes']).map((r) => r.date)).toEqual([
      '2026-06-26',
      '2026-06-27',
      '2026-06-28',
    ])
  })

  it('crosses month and year boundaries by calendar, not by 30-day arithmetic', () => {
    expect(
      fillDateGaps(
        [
          { date: '2026-02-27', v: 1 },
          { date: '2026-03-02', v: 2 },
        ],
        ['v']
      ).map((r) => r.date)
    ).toEqual(['2026-02-27', '2026-02-28', '2026-03-01', '2026-03-02'])

    expect(
      fillDateGaps(
        [
          { date: '2025-12-30', v: 1 },
          { date: '2026-01-02', v: 2 },
        ],
        ['v']
      ).map((r) => r.date)
    ).toEqual(['2025-12-30', '2025-12-31', '2026-01-01', '2026-01-02'])
  })

  it('handles a leap day', () => {
    expect(
      fillDateGaps(
        [
          { date: '2028-02-28', v: 1 },
          { date: '2028-03-01', v: 2 },
        ],
        ['v']
      ).map((r) => r.date)
    ).toEqual(['2028-02-28', '2028-02-29', '2028-03-01'])
  })

  it('nulls every requested value key, not just the first', () => {
    const [, gap] = fillDateGaps(
      [
        { date: '2026-06-25', a: 1, b: 2 },
        { date: '2026-06-27', a: 3, b: 4 },
      ],
      ['a', 'b']
    )
    expect(gap).toEqual({ date: '2026-06-26', a: null, b: null })
  })

  it('returns short series unchanged', () => {
    expect(fillDateGaps([], ['v'])).toEqual([])
    expect(fillDateGaps([{ date: '2026-06-25', v: 1 }], ['v'])).toEqual([
      { date: '2026-06-25', v: 1 },
    ])
  })

  it('bails out on malformed dates instead of looping forever', () => {
    const rows = [
      { date: 'not-a-date', v: 1 },
      { date: '2026-06-28', v: 2 },
    ]
    // Sorted, but never expanded — the guard is what stops the step loop from
    // running against a NaN bound.
    expect(fillDateGaps(rows, ['v'])).toHaveLength(2)
  })

  it('respects a custom date key', () => {
    expect(
      fillDateGaps(
        [
          { period: '2026-06-25', v: 1 },
          { period: '2026-06-27', v: 2 },
        ],
        ['v'],
        'period'
      ).map((r) => r.period)
    ).toEqual(['2026-06-25', '2026-06-26', '2026-06-27'])
  })
})
