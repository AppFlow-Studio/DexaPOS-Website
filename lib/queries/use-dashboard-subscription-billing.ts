'use client'

import { useQuery } from '@tanstack/react-query'
import {
  getMerchantServiceEntitlement,
  getMerchantSubscriptionOverview,
  getMerchantTierPlansForCurrentMerchant,
  type MerchantServiceEntitlement,
  type MerchantTierPlanViewRecord,
} from '@/app/dashboard/actions/subscription-billing'

export function useMerchantSubscriptionOverview() {
  return useQuery({
    queryKey: ['dashboard-subscriptions-overview'],
    queryFn: () => getMerchantSubscriptionOverview(),
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    networkMode: 'offlineFirst',
  })
}

export function useMerchantTierPlans() {
  return useQuery<MerchantTierPlanViewRecord[]>({
    queryKey: ['dashboard-subscriptions-tier-plans'],
    queryFn: () => getMerchantTierPlansForCurrentMerchant(),
    staleTime: 60 * 60 * 1000,
    gcTime: 2 * 60 * 60 * 1000,
    networkMode: 'offlineFirst',
  })
}

export const serviceEntitlementKey = (
  clerkOrgId: string | null | undefined,
  locationId: string | null | undefined,
  serviceCode: string,
) => ['service-entitlement', clerkOrgId ?? null, locationId ?? null, serviceCode] as const

/**
 * Reads whether a location has a paid feature ("feature flag") + the paywall
 * data (price, activation total, card setup). Disabled until a real location
 * UUID is selected. Invalidate `['service-entitlement']` after unlocking.
 */
export function useMerchantServiceEntitlement(
  serviceCode: string,
  locationId: string | null | undefined,
  clerkOrgId?: string | null,
) {
  const isRealLocation = !!locationId && locationId !== 'all'
  return useQuery<MerchantServiceEntitlement>({
    queryKey: serviceEntitlementKey(clerkOrgId, locationId, serviceCode),
    queryFn: () => getMerchantServiceEntitlement(locationId as string, serviceCode),
    enabled: isRealLocation,
    staleTime: 60 * 1000,
    gcTime: 10 * 60 * 1000,
  })
}
