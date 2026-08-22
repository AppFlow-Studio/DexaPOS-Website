import { describe, expect, it } from 'vitest'
import {
  deriveMonthlyPeriodEnd,
  resolveMonthlyBillingPeriod,
} from '../billing-period'

describe('merchant billing periods', () => {
  it('derives a calendar-month boundary from a first-of-month start', () => {
    expect(deriveMonthlyPeriodEnd('2026-09-01')).toBe('2026-09-30')
  })

  it('clamps month-end anniversaries without using local time', () => {
    expect(deriveMonthlyPeriodEnd('2027-01-31')).toBe('2027-02-27')
    expect(deriveMonthlyPeriodEnd('2028-01-31')).toBe('2028-02-28')
  })

  it('preserves an explicitly supplied valid end for existing callers', () => {
    expect(resolveMonthlyBillingPeriod('2026-09-01', '2026-09-15')).toEqual({
      startDate: '2026-09-01',
      endDate: '2026-09-15',
    })
  })

  it('rejects invalid and reversed date-only periods', () => {
    expect(() => resolveMonthlyBillingPeriod('2026-02-30')).toThrow(
      'Current period start must be a valid calendar date.',
    )
    expect(() => resolveMonthlyBillingPeriod('2026-09-02', '2026-09-01')).toThrow(
      'Current period end cannot be before the period start.',
    )
  })
})
