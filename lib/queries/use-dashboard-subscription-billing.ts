'use client'

import { useQuery } from '@tanstack/react-query'
import {
  getMerchantSubscriptionOverview,
  getMerchantTierPlansForCurrentMerchant,
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
