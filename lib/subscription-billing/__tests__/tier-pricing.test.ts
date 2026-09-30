import { describe, expect, it } from 'vitest'
import {
  describeTierPricing,
  monthlyTierCharge,
  planFitLabel,
  planFitsLocationCount,
} from '../tier-pricing'

/**
 * These mirror `calculate_subscription_total()` for `plan_scope =
 * 'merchant_tier'` as rewritten by
 * `20260910130000_location_count_tier_and_fine_dining.sql`.
 */

const SINGLE_LOCATION = {
  monthly_price_cents: 0,
  included_stations: 0,
  per_extra_station_price: 0,
}

const MULTI_LOCATION = {
  monthly_price_cents: 0,
  included_stations: 1,
  per_extra_station_price: 60,
}

describe('monthlyTierCharge', () => {
  it('charges nothing for the free single-location tier', () => {
    expect(monthlyTierCharge(SINGLE_LOCATION, 1).total).toBe(0)
  })

  it('charges per location beyond the first on multi-location', () => {
    // 4 active locations, 1 included, $60 each => $180.
    const charge = monthlyTierCharge(MULTI_LOCATION, 4)
    expect(charge.extraLocations).toBe(3)
    expect(charge.perExtraLocation).toBe(60)
    expect(charge.total).toBe(180)
  })

  it('charges nothing when the location count is within the included allowance', () => {
    expect(monthlyTierCharge(MULTI_LOCATION, 1).total).toBe(0)
    expect(monthlyTierCharge(MULTI_LOCATION, 0).total).toBe(0)
  })

  it('never returns a negative overage', () => {
    expect(monthlyTierCharge({ ...MULTI_LOCATION, included_stations: 10 }, 2).total).toBe(0)
  })

  it('adds a flat base to the overage when a tier still has one', () => {
    const charge = monthlyTierCharge(
      { monthly_price_cents: 9900, included_stations: 1, per_extra_station_price: 60 },
      3,
    )
    expect(charge.base).toBe(99)
    expect(charge.extra).toBe(120)
    expect(charge.total).toBe(219)
  })

  it('ignores the overage when the per-extra price is zero, as the SQL does', () => {
    const charge = monthlyTierCharge(
      { monthly_price_cents: 0, included_stations: 1, per_extra_station_price: 0 },
      9,
    )
    expect(charge.extraLocations).toBe(0)
    expect(charge.total).toBe(0)
  })

  it('is safe with no plan', () => {
    expect(monthlyTierCharge(null, 5).total).toBe(0)
    expect(monthlyTierCharge(undefined, 5).total).toBe(0)
  })
})

describe('describeTierPricing', () => {
  it('describes the per-location model rather than reporting $0.00', () => {
    expect(describeTierPricing(MULTI_LOCATION)).toBe(
      '$60.00/mo — first location free, then each additional location',
    )
  })

  it('returns null for a genuinely free tier', () => {
    expect(describeTierPricing(SINGLE_LOCATION)).toBeNull()
  })

  it('combines a flat base with the per-location price', () => {
    expect(
      describeTierPricing({
        monthly_price_cents: 9900,
        included_stations: 2,
        per_extra_station_price: 60,
      }),
    ).toBe('$99.00/mo + $60.00/mo — 2 locations included, then each additional location')
  })
})

describe('planFitsLocationCount', () => {
  const SINGLE = { min_locations: 1, max_locations: 1 }
  const MULTI = { min_locations: 2, max_locations: null }

  it('rejects a capped tier for a merchant above the cap', () => {
    // The live case: Joes Coffee Shop has 4 locations; Single Location caps at 1.
    expect(planFitsLocationCount(SINGLE, 4)).toBe(false)
    expect(planFitLabel(SINGLE, 4)).toBe('Covers up to 1 location — you have 4')
  })

  it('accepts a capped tier at exactly the cap', () => {
    expect(planFitsLocationCount(SINGLE, 1)).toBe(true)
    expect(planFitLabel(SINGLE, 1)).toBe('')
  })

  it('rejects a tier whose minimum is not met', () => {
    expect(planFitsLocationCount(MULTI, 1)).toBe(false)
    expect(planFitLabel(MULTI, 1)).toBe('Needs at least 2 locations — you have 1')
  })

  it('treats a null maximum as unlimited', () => {
    expect(planFitsLocationCount(MULTI, 2)).toBe(true)
    expect(planFitsLocationCount(MULTI, 400)).toBe(true)
  })

  it('treats a null minimum as zero', () => {
    expect(planFitsLocationCount({ min_locations: null, max_locations: null }, 0)).toBe(true)
  })
})
