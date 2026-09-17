import { describe, expect, it } from 'vitest'

import {
  formatHours,
  formatHoursPlain,
  formatMoney,
  formatMoneyPlain,
  formatStampAt,
  fromZonedInput,
  isoWithOffset,
  toZonedInput,
  zoneOffsetMinutes,
} from '@/lib/timesheets/format'

const NY = 'America/New_York'
const PHOENIX = 'America/Phoenix'

describe('hours from integer minutes', () => {
  it('always shows two decimals', () => {
    expect(formatHours(480)).toBe('8.00')
    expect(formatHours(555)).toBe('9.25')
    expect(formatHours(440)).toBe('7.33') // 7h20m
    expect(formatHours(0)).toBe('0.00')
  })

  it('groups thousands on screen but not in CSV', () => {
    expect(formatHours(103_245)).toBe('1,720.75')
    expect(formatHoursPlain(103_245)).toBe('1720.75')
  })
})

describe('money from integer cents', () => {
  it('never lets a float decide a digit', () => {
    expect(formatMoney(101_649)).toBe('$1,016.49')
    expect(formatMoney(5)).toBe('$0.05')
    expect(formatMoneyPlain(662_848)).toBe('6628.48')
  })
})

describe('times at the location, not the machine', () => {
  it('renders the location wall clock with its date', () => {
    // 21:02Z on Sep 8 is 5:02 PM in New York.
    expect(formatStampAt('2026-09-08T21:02:00Z', NY)).toBe('Tue, Sep 8 · 5:02 PM')
    // 06:47Z on Sep 9 is still Sep 8 in Phoenix (UTC-7, no DST).
    expect(formatStampAt('2026-09-09T06:47:00Z', PHOENIX)).toBe('Tue, Sep 8 · 11:47 PM')
  })

  it('writes CSV timestamps with the offset in force at that moment', () => {
    expect(isoWithOffset('2026-09-08T21:02:30Z', NY)).toBe('2026-09-08T17:02:30-04:00')
    expect(isoWithOffset('2026-12-08T22:02:00Z', NY)).toBe('2026-12-08T17:02:00-05:00')
    expect(zoneOffsetMinutes(PHOENIX, new Date('2026-07-01T12:00:00Z'))).toBe(-420)
  })

  it('round-trips a datetime input through the location zone', () => {
    const iso = '2026-09-08T21:02:00.000Z'
    expect(toZonedInput(iso, NY)).toBe('2026-09-08T17:02')
    expect(fromZonedInput('2026-09-08T17:02', NY)).toBe(iso)
  })

  it('resolves wall times on both sides of a DST switch', () => {
    // 2026-03-08 02:00 NY jumps to 03:00. 01:30 is EST, 03:30 is EDT.
    expect(fromZonedInput('2026-03-08T01:30', NY)).toBe('2026-03-08T06:30:00.000Z')
    expect(fromZonedInput('2026-03-08T03:30', NY)).toBe('2026-03-08T07:30:00.000Z')
    // 2026-11-01 back to EST: 12:30 is still EDT.
    expect(fromZonedInput('2026-11-01T00:30', NY)).toBe('2026-11-01T04:30:00.000Z')
    expect(fromZonedInput('2026-11-01T03:00', NY)).toBe('2026-11-01T08:00:00.000Z')
  })
})
