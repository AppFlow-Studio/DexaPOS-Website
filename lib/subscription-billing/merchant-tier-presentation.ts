export type MerchantTierPresentation = {
  displayName: string
  billingUnit: string
  highlights: string[]
}

// Merchant tiers are the merchant-wide base subscription and are selected
// automatically by how many active locations a merchant runs. A single location
// is free; each additional location adds a flat multi-location fee to the
// merchant card. There is no separate 6+ tier — `franchise` is retired and folds
// into Multi-Location (kept here so any legacy plan reference still presents).
// Location device/add-on charges live on the per-location subscriptions.
const MULTI_LOCATION_PRESENTATION: MerchantTierPresentation = {
  displayName: 'Multi-Location',
  billingUnit: 'Per additional location',
  highlights: [
    'Two or more active locations',
    'Shared menu, staff, and reports',
    'Cross-location analytics',
    'No location cap',
  ],
}

const MERCHANT_TIER_PRESENTATION: Record<string, MerchantTierPresentation> = {
  basic: {
    displayName: 'Single Location',
    billingUnit: 'Single location · Free',
    highlights: [
      'One active location',
      'No merchant-tier fee',
      'Unlimited orders and transactions',
      'Full reporting and analytics',
    ],
  },
  multi_location: MULTI_LOCATION_PRESENTATION,
  franchise: MULTI_LOCATION_PRESENTATION,
}

export function getMerchantTierPresentation(
  planCode: string,
): MerchantTierPresentation | null {
  return MERCHANT_TIER_PRESENTATION[planCode] ?? null
}

export function getMerchantTierFallbackName(planCode: string): string {
  return getMerchantTierPresentation(planCode)?.displayName ?? planCode
}
