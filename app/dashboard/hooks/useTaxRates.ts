'use client'

// ============================================================================
// Tax Rates React Query Hooks
// Description: Hooks for managing location-specific tax rates
// ============================================================================

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useLocationStore } from '@/stores/location-store'
import {
    getTaxRatesForLocation,
    getTaxRateById,
    getTaxRateForCategory,
    upsertTaxRate,
    deactivateTaxRate,
    deleteTaxRate,
    getEffectiveItemTax,
    calculateItemTax,
} from '../actions/tax-rates'
import { TaxCategory } from '@/types/tax'
import { toast } from 'sonner'

// ============================================================================
// QUERY HOOKS
// ============================================================================

/**
 * Get all active tax rates for the currently selected location
 * Note: Disabled when selectedLocationId === 'all' (tax rates are location-specific)
 */
export function useLocationTaxRates() {
    const { selectedLocationId } = useLocationStore()

    return useQuery({
        queryKey: ['tax-rates', selectedLocationId],
        queryFn: async () => {
            if (selectedLocationId === 'all' || !selectedLocationId) {
                return { success: false, error: 'Select a location to view tax rates', data: null }
            }
            return getTaxRatesForLocation(selectedLocationId)
        },
        enabled: !!selectedLocationId && selectedLocationId !== 'all',
        staleTime: 5 * 60 * 1000, // 5 minutes
    })
}

/**
 * Get a specific tax rate by ID
 */
export function useTaxRate(taxRateId: string | null) {
    return useQuery({
        queryKey: ['tax-rate', taxRateId],
        queryFn: () => {
            if (!taxRateId) {
                return Promise.resolve({ success: false, error: 'No tax rate ID provided', data: null })
            }
            return getTaxRateById(taxRateId)
        },
        enabled: !!taxRateId,
    })
}

/**
 * Get tax rate for a specific category at the current location
 */
export function useTaxRateForCategory(taxCategory: TaxCategory | null) {
    const { selectedLocationId } = useLocationStore()

    return useQuery({
        queryKey: ['tax-rate-for-category', selectedLocationId, taxCategory],
        queryFn: async () => {
            if (!selectedLocationId || selectedLocationId === 'all' || !taxCategory) {
                return { success: false, error: 'Invalid location or category', data: null }
            }
            return getTaxRateForCategory(selectedLocationId, taxCategory)
        },
        enabled: !!selectedLocationId && selectedLocationId !== 'all' && !!taxCategory,
    })
}

/**
 * Get effective tax settings for an item at the current location
 * Includes L2 > L1 inheritance logic
 */
export function useEffectiveItemTax(menuItemId: string | null) {
    const { selectedLocationId } = useLocationStore()

    return useQuery({
        queryKey: ['effective-item-tax', menuItemId, selectedLocationId],
        queryFn: async () => {
            if (!menuItemId || !selectedLocationId || selectedLocationId === 'all') {
                return { success: false, error: 'Invalid item or location', data: null }
            }
            return getEffectiveItemTax(menuItemId, selectedLocationId)
        },
        enabled: !!menuItemId && !!selectedLocationId && selectedLocationId !== 'all',
    })
}

/**
 * Calculate tax for an item (for UI preview)
 */
export function useCalculateItemTax(
    menuItemId: string | null,
    quantity: number,
    unitPrice: number,
    enabled = true
) {
    const { selectedLocationId } = useLocationStore()

    return useQuery({
        queryKey: ['calculate-item-tax', menuItemId, selectedLocationId, quantity, unitPrice],
        queryFn: async () => {
            if (!menuItemId || !selectedLocationId || selectedLocationId === 'all') {
                return { success: false, error: 'Invalid item or location', data: null }
            }
            return calculateItemTax(menuItemId, selectedLocationId, quantity, unitPrice)
        },
        enabled: enabled && !!menuItemId && !!selectedLocationId && selectedLocationId !== 'all',
    })
}

// ============================================================================
// MUTATION HOOKS
// ============================================================================

/**
 * Create or update a tax rate for the current location
 */
export function useUpsertTaxRate() {
    const queryClient = useQueryClient()
    const { selectedLocationId } = useLocationStore()

    return useMutation({
        mutationFn: async ({
            taxCategory,
            name,
            percentage,
        }: {
            taxCategory: TaxCategory
            name: string
            percentage: number
        }) => {
            if (!selectedLocationId || selectedLocationId === 'all') {
                throw new Error('Select a location to manage tax rates')
            }
            return upsertTaxRate(selectedLocationId, taxCategory, name, percentage)
        },
        onSuccess: (result, variables) => {
            if (result.success) {
                toast.success('Tax rate saved successfully')
                // Invalidate queries
                queryClient.invalidateQueries({ queryKey: ['tax-rates', selectedLocationId] })
                queryClient.invalidateQueries({ queryKey: ['tax-rate-for-category', selectedLocationId, variables.taxCategory] })
                queryClient.invalidateQueries({ queryKey: ['effective-item-tax'] })
            } else {
                toast.error(result.error || 'Failed to save tax rate')
            }
        },
        onError: (error: Error) => {
            toast.error(error.message || 'Failed to save tax rate')
        },
    })
}

/**
 * Deactivate a tax rate (soft delete)
 */
export function useDeactivateTaxRate() {
    const queryClient = useQueryClient()
    const { selectedLocationId } = useLocationStore()

    return useMutation({
        mutationFn: (taxRateId: string) => deactivateTaxRate(taxRateId),
        onSuccess: (result) => {
            if (result.success) {
                toast.success('Tax rate deactivated')
                // Invalidate all tax rate queries
                queryClient.invalidateQueries({ queryKey: ['tax-rates'] })
                queryClient.invalidateQueries({ queryKey: ['tax-rate'] })
                queryClient.invalidateQueries({ queryKey: ['effective-item-tax'] })
            } else {
                toast.error(result.error || 'Failed to deactivate tax rate')
            }
        },
        onError: (error: Error) => {
            toast.error(error.message || 'Failed to deactivate tax rate')
        },
    })
}

/**
 * Permanently delete a tax rate
 */
export function useDeleteTaxRate() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: (taxRateId: string) => deleteTaxRate(taxRateId),
        onSuccess: (result) => {
            if (result.success) {
                toast.success('Tax rate deleted')
                queryClient.invalidateQueries({ queryKey: ['tax-rates'] })
                queryClient.invalidateQueries({ queryKey: ['tax-rate'] })
                queryClient.invalidateQueries({ queryKey: ['effective-item-tax'] })
            } else {
                toast.error(result.error || 'Failed to delete tax rate')
            }
        },
        onError: (error: Error) => {
            toast.error(error.message || 'Failed to delete tax rate')
        },
    })
}

// ============================================================================
// HELPER HOOKS
// ============================================================================

/**
 * Check if tax rates are configured for the current location
 */
export function useHasTaxRates() {
    const { data } = useLocationTaxRates()
    return {
        hasTaxRates: !!data?.data && data.data.length > 0,
        taxRateCount: data?.data?.length || 0,
    }
}

/**
 * Get tax percentage for a specific category (convenience hook)
 */
export function useTaxPercentageForCategory(taxCategory: TaxCategory | null) {
    const { data } = useTaxRateForCategory(taxCategory)
    return data?.data?.percentage || 0
}
