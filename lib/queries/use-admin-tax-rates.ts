'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { adminKeys } from './admin-keys'
import {
  getAdminMerchantTaxRates,
  getAdminLocationTaxRates,
  adminUpsertTaxRate,
  adminDeactivateTaxRate,
  adminDeleteTaxRate,
} from '@/app/manage/actions/admin-merchant/tax-rates'
import type { TaxCategory } from '@/types/tax'

// ============================================================================
// QUERY HOOKS
// ============================================================================

/**
 * Get all tax rates for a merchant (admin)
 */
export function useAdminMerchantTaxRates(merchantId: string, locationId?: string | null) {
  return useQuery({
    queryKey: adminKeys.merchantTaxRates(merchantId, locationId),
    queryFn: () => getAdminMerchantTaxRates(merchantId, locationId),
    enabled: !!merchantId,
    staleTime: 30 * 1000,
  })
}

/**
 * Get tax rates for a specific location (admin)
 */
export function useAdminLocationTaxRates(locationId: string) {
  return useQuery({
    queryKey: ['admin', 'location-tax-rates', locationId],
    queryFn: () => getAdminLocationTaxRates(locationId),
    enabled: !!locationId,
    staleTime: 30 * 1000,
  })
}

// ============================================================================
// MUTATION HOOKS
// ============================================================================

/**
 * Create or update a tax rate (admin)
 */
export function useAdminUpsertTaxRate() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      merchantId,
      locationId,
      taxCategory,
      name,
      percentage,
    }: {
      merchantId: string
      locationId: string
      taxCategory: TaxCategory
      name: string
      percentage: number
    }) => adminUpsertTaxRate(merchantId, locationId, taxCategory, name, percentage),
    onSuccess: (_, variables) => {
      // Invalidate all tax rates for this merchant (regardless of location)
      const key = adminKeys.merchantTaxRates(variables.merchantId)
      queryClient.invalidateQueries({
        queryKey: key.slice(0, -1),
      })
    },
  })
}

/**
 * Deactivate a tax rate (admin)
 */
export function useAdminDeactivateTaxRate() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      merchantId,
      taxRateId,
    }: {
      merchantId: string
      taxRateId: string
    }) => adminDeactivateTaxRate(merchantId, taxRateId),
    onSuccess: (_, variables) => {
      // Invalidate all tax rates for this merchant (regardless of location)
      const key = adminKeys.merchantTaxRates(variables.merchantId)
      queryClient.invalidateQueries({
        queryKey: key.slice(0, -1),
      })
    },
  })
}

/**
 * Delete a tax rate (admin)
 */
export function useAdminDeleteTaxRate() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      merchantId,
      taxRateId,
    }: {
      merchantId: string
      taxRateId: string
    }) => adminDeleteTaxRate(merchantId, taxRateId),
    onSuccess: (_, variables) => {
      // Invalidate all tax rates for this merchant (regardless of location)
      const key = adminKeys.merchantTaxRates(variables.merchantId)
      queryClient.invalidateQueries({
        queryKey: key.slice(0, -1),
      })
    },
  })
}
