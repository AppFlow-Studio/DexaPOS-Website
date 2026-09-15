import { describe, expect, it } from 'vitest'
import {
  getMerchantTierFallbackName,
  getMerchantTierPresentation,
} from '../merchant-tier-presentation'

describe('merchant tier presentation', () => {
  it('uses the location-count tier names', () => {
    expect(getMerchantTierFallbackName('basic')).toBe('Single Location')
    expect(getMerchantTierFallbackName('multi_location')).toBe('Multi-Location')
    // franchise is retired and folds into Multi-Location.
    expect(getMerchantTierFallbackName('franchise')).toBe('Multi-Location')
  })

  it('folds the retired franchise tier into Multi-Location', () => {
    const franchise = getMerchantTierPresentation('franchise')

    expect(franchise?.displayName).toBe('Multi-Location')
    expect(JSON.stringify(franchise)).not.toContain('Franchise')
  })

  it('leaves unknown plan codes available as a safe fallback', () => {
    expect(getMerchantTierPresentation('custom')).toBeNull()
    expect(getMerchantTierFallbackName('custom')).toBe('custom')
  })
})
