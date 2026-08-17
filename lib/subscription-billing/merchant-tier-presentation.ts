export type MerchantTierPresentation = {
  displayName: string
  billingUnit: string
  highlights: string[]
}

const MERCHANT_TIER_PRESENTATION: Record<string, MerchantTierPresentation> = {
  basic: {
    displayName: 'Quick-Service (First Station)',
    billingUnit: 'First quick-service station',
    highlights: [
      'Unlimited orders and transactions',
      'Full reporting and analytics',
      'Menu management and modifiers',
      '24/7 support included',
    ],
  },
  multi_location: {
    displayName: 'Fine Dining (First Station)',
    billingUnit: 'First fine-dining station',
    highlights: [
      'Table mapping and reservations',
      'Waitlist and guest seating',
      'Complete tableside service',
      'No feature limits',
    ],
  },
  franchise: {
    displayName: 'Additional Station',
    billingUnit: 'Each station after the first',
    highlights: [
      'Shared menu, staff, and reports',
      'Works on iPad or Android',
      'Auto-fires to Kitchen Display',
      'Bluetooth printer support',
    ],
  },
}

export function getMerchantTierPresentation(
  planCode: string,
): MerchantTierPresentation | null {
  return MERCHANT_TIER_PRESENTATION[planCode] ?? null
}

export function getMerchantTierFallbackName(planCode: string): string {
  return getMerchantTierPresentation(planCode)?.displayName ?? planCode
}
