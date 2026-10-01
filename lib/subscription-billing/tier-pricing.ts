/**
 * What a merchant tier actually costs per month.
 *
 * Since the 2026-09-10 pricing change
 * (`20260910130000_location_count_tier_and_fine_dining.sql`) every merchant
 * tier carries `monthly_price_cents = 0` by design:
 *
 *   * Single Location  — 1 location, free.
 *   * Multi-Location   — 1 included, then $60/mo per additional location,
 *                        with no cap. The retired 6+ "franchise" tier folds in.
 *
 * The charge is modelled through the overage machinery, where the "station"
 * count is the merchant's **active location count**. Reading
 * `monthly_price_cents` alone therefore reports $0 for every merchant on the
 * platform, which is how the subscription page came to show "$0.00" above real
 * invoices for ~$184.
 *
 * This mirrors `calculate_subscription_total()` for `plan_scope =
 * 'merchant_tier'`: base + overage, where overage is
 * `max(locations - included, 0) * per_extra_station_price`, and the per-extra
 * line is only added when that price is above zero.
 */

export interface TierPricingInput {
  monthly_price_cents: number
  included_stations: number
  per_extra_station_price: number
}

export interface TierCharge {
  /** Flat monthly fee, if the tier still has one. */
  base: number
  /** Locations being charged for beyond those included. */
  extraLocations: number
  /** Price applied to each of those locations. */
  perExtraLocation: number
  /** `extraLocations * perExtraLocation`. */
  extra: number
  /** `base + extra` — what the tier costs before any card surcharge. */
  total: number
}

export function monthlyTierCharge(
  plan: TierPricingInput | null | undefined,
  activeLocationCount: number,
): TierCharge {
  const empty: TierCharge = {
    base: 0,
    extraLocations: 0,
    perExtraLocation: 0,
    extra: 0,
    total: 0,
  }

  if (!plan) return empty

  const base = Math.max(0, plan.monthly_price_cents) / 100
  const included = Math.max(0, plan.included_stations ?? 0)
  const perExtraLocation = Math.max(0, plan.per_extra_station_price ?? 0)
  // `greatest(v_station_count - greatest(included, 0), 0)` in SQL.
  const extraLocations = Math.max(0, (activeLocationCount || 0) - included)
  // The SQL only emits the overage line when the price is above zero, so a
  // tier with a 0 per-extra price never charges for extra locations.
  const extra = perExtraLocation > 0 ? extraLocations * perExtraLocation : 0

  return {
    base,
    extraLocations: perExtraLocation > 0 ? extraLocations : 0,
    perExtraLocation,
    extra,
    total: base + extra,
  }
}

/**
 * A short human description of how a tier is priced, for a plan card or the
 * next-charge breakdown. Returns null when the tier is genuinely free.
 */
export function describeTierPricing(plan: TierPricingInput | null | undefined): string | null {
  if (!plan) return null

  const base = Math.max(0, plan.monthly_price_cents) / 100
  const perExtra = Math.max(0, plan.per_extra_station_price ?? 0)
  const included = Math.max(0, plan.included_stations ?? 0)

  const money = (value: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value)

  if (perExtra > 0) {
    const includedLabel =
      included === 0
        ? 'every location'
        : included === 1
          ? 'first location free, then each additional location'
          : `${included} locations included, then each additional location`
    const perExtraLabel = `${money(perExtra)}/mo — ${includedLabel}`
    return base > 0 ? `${money(base)}/mo + ${perExtraLabel}` : perExtraLabel
  }

  if (base > 0) return `${money(base)}/mo`

  return null
}

/* -------------------------------------------------------------------------- */
/* Eligibility                                                                */
/* -------------------------------------------------------------------------- */

export interface TierCoverage {
  min_locations: number | null
  max_locations: number | null
}

/**
 * Whether a tier can cover this merchant's location count. Offering
 * "Single Location" (max 1) to a merchant with four locations is a request
 * that can never be approved, so it must not be selectable — let alone the
 * default selection.
 */
export function planFitsLocationCount(plan: TierCoverage, locationCount: number): boolean {
  const min = plan.min_locations ?? 0
  const max = plan.max_locations
  return locationCount >= min && (max === null || locationCount <= max)
}

/** Why a tier does not fit, for the disabled row. Empty string when it fits. */
export function planFitLabel(plan: TierCoverage, locationCount: number): string {
  const min = plan.min_locations ?? 0
  const max = plan.max_locations

  if (max !== null && locationCount > max) {
    return `Covers up to ${max} location${max === 1 ? '' : 's'} — you have ${locationCount}`
  }
  if (locationCount < min) {
    return `Needs at least ${min} locations — you have ${locationCount}`
  }
  return ''
}
