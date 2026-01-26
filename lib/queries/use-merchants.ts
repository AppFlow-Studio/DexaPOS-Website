'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { adminKeys } from './admin-keys'
import {
  getMerchants,
  getMerchantDetails,
  getMerchantStats,
  updateMerchantSettings,
  toggleLocationStatus,
} from '@/app/manage/actions/merchants'
import type { MerchantFilters, MerchantSettingsUpdate } from '@/types/merchant'

// ============================================================================
// MERCHANT LIST QUERY
// ============================================================================

export function useMerchants(
  filters: MerchantFilters, 
  page: number = 1,
  accessibleMerchantIds?: string[] // Optional: filter to only these merchant IDs (for non-super-admins)
) {
  return useQuery({
    queryKey: [...adminKeys.merchantList(filters, page), accessibleMerchantIds],
    queryFn: () => getMerchants(filters, page, 20, accessibleMerchantIds),
    staleTime: 30 * 1000, // 30 seconds
  })
}

// ============================================================================
// MERCHANT DETAIL QUERY
// ============================================================================

export function useMerchantDetails(merchantId: string) {
  return useQuery({
    queryKey: adminKeys.merchantDetail(merchantId),
    queryFn: () => getMerchantDetails(merchantId),
    enabled: !!merchantId,
    staleTime: 60 * 1000, // 1 minute
  })
}

// ============================================================================
// MERCHANT STATS QUERY (for dashboard cards)
// ============================================================================

export function useMerchantStats() {
  return useQuery({
    queryKey: adminKeys.dashboardStats(),
    queryFn: () => getMerchantStats(),
    staleTime: 60 * 1000, // 1 minute
  })
}

// ============================================================================
// UPDATE MERCHANT MUTATION
// ============================================================================

export function useUpdateMerchant() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      merchantId,
      updates,
    }: {
      merchantId: string
      updates: MerchantSettingsUpdate
    }) => updateMerchantSettings(merchantId, updates),
    onSuccess: (_, variables) => {
      // Invalidate the specific merchant detail
      queryClient.invalidateQueries({
        queryKey: adminKeys.merchantDetail(variables.merchantId),
      })
      // Invalidate the merchant list
      queryClient.invalidateQueries({
        queryKey: adminKeys.merchants(),
      })
    },
  })
}

// ============================================================================
// TOGGLE LOCATION MUTATION
// ============================================================================

export function useToggleLocation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      merchantId,
      locationId,
      isActive,
    }: {
      merchantId: string
      locationId: string
      isActive: boolean
    }) => toggleLocationStatus(merchantId, locationId, isActive),
    onSuccess: (_, variables) => {
      // Invalidate the merchant detail to refresh location statuses
      queryClient.invalidateQueries({
        queryKey: adminKeys.merchantDetail(variables.merchantId),
      })
    },
  })
}
