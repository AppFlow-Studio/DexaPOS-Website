import { describe, expect, it } from 'vitest'

import {
  MAX_RANGE_DAYS,
  bucketIndexForDate,
  bucketsForPeriod,
  canStepForward,
  clampCustomRange,
  formatPeriodLabel,
  formatRange,
  isValidDate,
  parsePeriod,
  periodContaining,
  startOfWeek,
  stepPeriod,
} from '@/lib/timesheets/period'

describe('weeks run Monday to Sunday', () => {
  it('snaps any day to its Monday', () => {
    expect(startOfWeek('2026-09-07')).toBe('2026-09-07') // Monday
    expect(startOfWeek('2026-09-13')).toBe('2026-09-07') // Sunday
    expect(startOfWeek('2026-09-01')).toBe('2026-08-31') // Tuesday
  })

  it('gives a week view seven day columns', () => {
    const buckets = bucketsForPeriod(periodContaining('week', '2026-09-10'))
    expect(buckets.map((b) => b.label)).toEqual(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'])
    expect(buckets[0].sublabel).toBe('Sep 7')
    expect(buckets[6].start).toBe('2026-09-13')
  })

  it('crosses daylight saving without losing or doubling a day', () => {
    // US clocks go back on 2026-11-01 (a Sunday) and forward on 2026-03-08.
    for (const date of ['2026-11-01', '2026-03-08']) {
      const days = bucketsForPeriod(periodContaining('week', date)).map((b) => b.start)
      expect(new Set(days).size).toBe(7)
      expect(days).toContain(date)
    }
  })
})

describe('month view', () => {
  it('uses six clipped week columns for August 2026, which starts on a Saturday', () => {
    const buckets = bucketsForPeriod(periodContaining('month', '2026-08-15'))
    expect(buckets.map((b) => [b.start, b.end])).toEqual([
      ['2026-08-01', '2026-08-02'],
      ['2026-08-03', '2026-08-09'],
      ['2026-08-10', '2026-08-16'],
      ['2026-08-17', '2026-08-23'],
      ['2026-08-24', '2026-08-30'],
      ['2026-08-31', '2026-08-31'],
    ])
    expect(buckets[0]).toMatchObject({ label: 'Aug 1–2', sublabel: 'Sat–Sun', isPartial: true })
    expect(buckets[2]).toMatchObject({ label: 'Aug 10–16', sublabel: 'Week 3', isPartial: false })
    expect(buckets[5]).toMatchObject({ label: 'Aug 31', sublabel: 'Mon', isPartial: true })
  })

  it('covers the calendar month exactly', () => {
    const buckets = bucketsForPeriod(periodContaining('month', '2026-02-10'))
    expect(buckets[0].start).toBe('2026-02-01')
    expect(buckets.at(-1)?.end).toBe('2026-02-28')
  })

  it('steps across a year boundary', () => {
    const dec = periodContaining('month', '2026-12-05')
    expect(stepPeriod(dec, 1)).toEqual({ kind: 'month', start: '2027-01-01', end: '2027-01-31' })
    expect(formatPeriodLabel(dec)).toBe('December 2026')
  })
})

describe('custom ranges', () => {
  it('shows days up to two weeks and weeks beyond', () => {
    expect(bucketsForPeriod({ kind: 'custom', start: '2026-09-01', end: '2026-09-14' })).toHaveLength(14)
    const long = bucketsForPeriod({ kind: 'custom', start: '2026-09-01', end: '2026-09-30' })
    expect(long.every((b) => b.kind === 'week')).toBe(true)
    expect(long[0]).toMatchObject({ start: '2026-09-01', end: '2026-09-06' })
  })

  it('clamps to what the RPC accepts and orders reversed picks', () => {
    const clamped = clampCustomRange('2026-01-01', '2026-12-31')
    expect(clamped.end).toBe('2026-04-03') // start + 92 days
    expect(clampCustomRange('2026-09-10', '2026-09-01')).toMatchObject({ start: '2026-09-01', end: '2026-09-10' })
  })
})

describe('parsePeriod', () => {
  const today = '2026-09-15'

  it('defaults to the current week', () => {
    expect(parsePeriod({}, today)).toEqual({ kind: 'week', start: '2026-09-14', end: '2026-09-20' })
  })

  it('re-snaps a hand-edited week start to Monday', () => {
    expect(parsePeriod({ period: 'week', start: '2026-09-09' }, today).start).toBe('2026-09-07')
  })

  it('rejects malformed and oversized custom ranges', () => {
    expect(parsePeriod({ period: 'custom', start: '2026-02-30', end: '2026-03-02' }, today).start).toBe('2026-09-14')
    expect(
      parsePeriod({ period: 'custom', start: '2026-01-01', end: '2026-06-01' }, today).kind
    ).toBe('custom')
    expect(parsePeriod({ period: 'custom', start: '2026-01-01', end: '2026-06-01' }, today).start).toBe('2026-09-14')
    expect(MAX_RANGE_DAYS).toBe(92)
  })

  it('validates real calendar dates only', () => {
    expect(isValidDate('2026-02-29')).toBe(false)
    expect(isValidDate('2028-02-29')).toBe(true)
    expect(isValidDate('2026-9-1')).toBe(false)
  })
})

describe('navigation and labels', () => {
  it('stops stepping forward past today', () => {
    const current = periodContaining('week', '2026-09-15')
    expect(canStepForward(current, '2026-09-15')).toBe(false)
    expect(canStepForward(stepPeriod(current, -1), '2026-09-15')).toBe(true)
  })

  it('formats ranges the way the stepper shows them', () => {
    expect(formatRange('2026-09-07', '2026-09-13')).toBe('Sep 7 – 13, 2026')
    expect(formatRange('2026-08-31', '2026-09-06')).toBe('Aug 31 – Sep 6, 2026')
    expect(formatRange('2026-12-28', '2027-01-03')).toBe('Dec 28, 2026 – Jan 3, 2027')
  })

  it('finds the bucket for a date', () => {
    const buckets = bucketsForPeriod(periodContaining('month', '2026-08-15'))
    expect(bucketIndexForDate(buckets, '2026-08-02')).toBe(0)
    expect(bucketIndexForDate(buckets, '2026-08-31')).toBe(5)
    expect(bucketIndexForDate(buckets, '2026-09-01')).toBe(-1)
  })
})
