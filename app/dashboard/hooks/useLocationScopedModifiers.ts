'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useLocationStore, useIsAllLocations, useSelectedLocation } from '@/stores/location-store'
import { useUserInfo } from '@/app/manage/hooks/useUserInfo.'
import {
    GetModifierGroups,
    GetModifierGroup,
    CreateModifierGroup,
    UpdateModifierGroup,
    DeleteModifierGroup,
} from '../actions/modifier-groups'
import {
    UpsertLocationModifierGroupOverride,
    UpsertLocationModifierItemOverride,
    DeleteLocationModifierGroupOverride,
    DeleteLocationModifierItemOverride,
} from '../actions/location-modifier-overrides'
import type {
    ModifierGroupOverrideData,
    ModifierItemOverrideData,
} from '../actions/location-modifier-overrides.types'
import { toast } from 'sonner'

// ============================================================================
// Helper Hooks
// ============================================================================

function useClerkOrgId() {
    const { data: userInfo } = useUserInfo()
    return userInfo?.members?.[0]?.organizations?.id || ''
}

export function useMerchantId() {
    const { data: userInfo } = useUserInfo()
    console.log('userInfo', userInfo?.members?.[0]?.organizations?.merchants?.id)
    return userInfo?.members?.[0]?.organizations?.merchants?.id || ''
}

function useEffectiveLocationId() {
    const { selectedLocationId } = useLocationStore()
    const isAllLocations = useIsAllLocations()
    return isAllLocations ? 'all' : selectedLocationId
}

// ============================================================================
// Query Hooks
// ============================================================================

/**
 * Get modifier groups scoped to current location selection
 * - All Locations: returns all groups (global + all location-specific)
 * - Specific Location: returns global groups + that location's specific groups with overrides
 */
export function useLocationScopedModifierGroups() {
    const clerkOrgId = useClerkOrgId()
    const locationId = useEffectiveLocationId()

    return useQuery({
        queryKey: ['modifier-groups', clerkOrgId, locationId, 'scoped'],
        queryFn: () => GetModifierGroups(clerkOrgId, locationId),
        enabled: !!clerkOrgId,
        staleTime: 30000,
    })
}

/**
 * Get single modifier group with location context
 */
export function useModifierGroupWithLocationContext(modifierGroupId: string) {
    const locationId = useEffectiveLocationId()

    return useQuery({
        queryKey: ['modifier-group', modifierGroupId, locationId, 'scoped'],
        queryFn: () => GetModifierGroup(modifierGroupId),
        enabled: !!modifierGroupId,
        staleTime: 30000,
    })
}

// ============================================================================
// Mutation Hooks - Smart Routing
// ============================================================================

/**
 * Create modifier group - routes based on location context
 * - All Locations: creates global group
 * - Specific Location: creates location-specific group
 */
export function useCreateModifierGroupMutation() {
    const queryClient = useQueryClient()
    const clerkOrgId = useClerkOrgId()
    const { selectedLocationId } = useLocationStore()
    const isAllLocations = useIsAllLocations()

    return useMutation({
        mutationFn: async (data: Parameters<typeof CreateModifierGroup>[1]) => {
            const locationId = isAllLocations ? null : selectedLocationId
            return CreateModifierGroup(clerkOrgId, {
                ...data,
                location_id: locationId,
            })
        },
        onSuccess: (result) => {
            if (result.error) {
                toast.error('Creation Failed', { description: result.error })
                return
            }

            const scope = isAllLocations ? 'global' : 'location-specific'
            toast.success('Modifier Group Created', {
                description: `Created ${scope} modifier group`
            })

            queryClient.invalidateQueries({ queryKey: ['modifier-groups'] })
        },
        onError: (error) => {
            toast.error('Creation Failed', { description: 'An unexpected error occurred' })
            console.error('Modifier group creation error:', error)
        }
    })
}

/**
 * Update modifier group - only allows editing if appropriate permissions
 * - Global groups: can edit in "All Locations" view
 * - Location-specific: can edit when that location is selected
 */
export function useUpdateModifierGroupMutation() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async ({
            id,
            data
        }: {
            id: string
            data: Parameters<typeof UpdateModifierGroup>[1]
        }) => {
            return UpdateModifierGroup(id, data)
        },
        onSuccess: (result, variables) => {
            if (result.error) {
                toast.error('Update Failed', { description: result.error })
                return
            }

            toast.success('Modifier Group Updated')
            queryClient.invalidateQueries({ queryKey: ['modifier-groups'] })
            queryClient.invalidateQueries({ queryKey: ['modifier-group', variables.id] })
        },
        onError: (error) => {
            toast.error('Update Failed', { description: 'An unexpected error occurred' })
            console.error('Modifier group update error:', error)
        }
    })
}

/**
 * Delete modifier group with validation
 */
export function useDeleteModifierGroupMutation() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: (modifierGroupId: string) => DeleteModifierGroup(modifierGroupId),
        onSuccess: (result) => {
            if (result.error) {
                toast.error('Deletion Failed', { description: result.error })
                return
            }

            toast.success('Modifier Group Deleted')
            queryClient.invalidateQueries({ queryKey: ['modifier-groups'] })
        },
        onError: (error) => {
            toast.error('Deletion Failed', { description: 'An unexpected error occurred' })
            console.error('Modifier group deletion error:', error)
        }
    })
}

// ============================================================================
// Override Mutation Hooks
// ============================================================================

/**
 * Toggle modifier group visibility at location
 */
export function useModifierGroupVisibilityMutation() {
    const queryClient = useQueryClient()
    const { selectedLocationId } = useLocationStore()
    const merchantId = useMerchantId()
    const isAllLocations = useIsAllLocations()

    return useMutation({
        mutationFn: async ({
            modifierGroupId,
            isActive,
        }: {
            modifierGroupId: string
            isActive: boolean
        }) => {
            if (isAllLocations) {
                return { error: 'Cannot set location override when viewing all locations' }
            }

            return UpsertLocationModifierGroupOverride(
                selectedLocationId,
                modifierGroupId,
                merchantId,
                { is_active: isActive }
            )
        },
        onSuccess: (result) => {
            if (result.error) {
                toast.error('Override Failed', { description: result.error })
                return
            }

            toast.success('Visibility Updated', {
                description: 'Modifier group visibility set for this location'
            })
            queryClient.invalidateQueries({ queryKey: ['modifier-groups'] })
        }
    })
}

/**
 * Update modifier item at location (visibility, order, price, stock)
 */
export function useModifierItemOverrideMutation() {
    const queryClient = useQueryClient()
    const { selectedLocationId } = useLocationStore()
    const merchantId = useMerchantId()
    const isAllLocations = useIsAllLocations()

    return useMutation({
        mutationFn: async ({
            modifierItemId,
            data,
        }: {
            modifierItemId: string
            data: ModifierItemOverrideData
        }) => {
            if (isAllLocations) {
                return { error: 'Cannot set location override when viewing all locations' }
            }

            return UpsertLocationModifierItemOverride(
                selectedLocationId,
                modifierItemId,
                merchantId,
                data
            )
        },
        onSuccess: (result) => {
            if (result.error) {
                toast.error('Override Failed', { description: result.error })
                return
            }

            toast.success('Item Updated', {
                description: 'Modifier item settings updated for this location'
            })
            queryClient.invalidateQueries({ queryKey: ['modifier-groups'] })
        }
    })
}

/**
 * Reset modifier item to global settings at location
 */
export function useResetModifierItemMutation() {
    const queryClient = useQueryClient()
    const { selectedLocationId } = useLocationStore()
    const isAllLocations = useIsAllLocations()

    return useMutation({
        mutationFn: async (modifierItemId: string) => {
            if (isAllLocations) {
                return { error: 'Cannot reset when viewing all locations' }
            }

            return DeleteLocationModifierItemOverride(selectedLocationId, modifierItemId)
        },
        onSuccess: (result) => {
            if (result.error) {
                toast.error('Reset Failed', { description: result.error })
                return
            }

            toast.success('Reset to Global', {
                description: 'Modifier item now uses global settings'
            })
            queryClient.invalidateQueries({ queryKey: ['modifier-groups'] })
        }
    })
}

/**
 * Reset modifier group to global visibility at location
 */
export function useResetModifierGroupMutation() {
    const queryClient = useQueryClient()
    const { selectedLocationId } = useLocationStore()
    const isAllLocations = useIsAllLocations()

    return useMutation({
        mutationFn: async (modifierGroupId: string) => {
            if (isAllLocations) {
                return { error: 'Cannot reset when viewing all locations' }
            }

            return DeleteLocationModifierGroupOverride(selectedLocationId, modifierGroupId)
        },
        onSuccess: (result) => {
            if (result.error) {
                toast.error('Reset Failed', { description: result.error })
                return
            }

            toast.success('Reset to Global', {
                description: 'Modifier group now uses global visibility'
            })
            queryClient.invalidateQueries({ queryKey: ['modifier-groups'] })
        }
    })
}

// ============================================================================
// Export convenience hooks
// ============================================================================

export { useLocationStore, useSelectedLocation, useIsAllLocations } from '@/stores/location-store'
