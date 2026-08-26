import { describe, expect, it } from 'vitest'
import {
  getMerchantTierFallbackName,
  getMerchantTierPresentation,
} from '../merchant-tier-presentation'

describe('merchant tier presentation', () => {
  it('uses the requested customer-facing tier names', () => {
    expect(getMerchantTierFallbackName('basic')).toBe('Quick-Service (First Station)')
    expect(getMerchantTierFallbackName('multi_location')).toBe('Fine Dining (First Station)')
    expect(getMerchantTierFallbackName('franchise')).toBe('Additional Station')
  })

  it('does not expose the legacy franchise presentation', () => {
    const additionalStation = getMerchantTierPresentation('franchise')

    expect(additionalStation?.displayName).toBe('Additional Station')
    expect(additionalStation?.billingUnit).toBe('Each station after the first')
    expect(JSON.stringify(additionalStation)).not.toContain('Franchise')
  })

  it('leaves unknown plan codes available as a safe fallback', () => {
    expect(getMerchantTierPresentation('custom')).toBeNull()
    expect(getMerchantTierFallbackName('custom')).toBe('custom')
  })
})
