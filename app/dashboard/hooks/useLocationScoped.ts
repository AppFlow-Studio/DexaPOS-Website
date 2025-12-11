/**
 * Location-scoped data hooks
 * 
 * These hooks automatically filter data based on the selected location from Zustand store.
 * When "all locations" is selected (selectedLocationId === 'all'), they return merchant-wide data.
 * When a specific location is selected, they filter to that location with pricing overrides.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useLocationStore, useIsAllLocations } from '@/stores/location-store'
import { useUserInfo } from '@/app/manage/hooks/useUserInfo.'
import { GetMenus, GetMenuWithLocationContext } from '../actions/menus'
import {
    GetMenuItems,
    GetMenuItemsWithCategories,
    GetMenuItemWithLocationContext,
    UpdateMenuItem,
    ResetMenuItemToGlobal
} from '../actions/menu-items'
import { GetCategories } from '../actions/categories'
import { GetSchedules, GetSchedulesWithTimeSlots } from '../actions/schedules'
import {
    UpsertLocationMenuItemOverride,
    DeleteLocationMenuItemOverride,
    OverrideData
} from '../actions/location-menu-overrides'
import { toast } from 'sonner'
import { getItemsForLocation } from '../actions/menu-items-rpc'

// ============================================================================
// Hook helpers
// ============================================================================

function useClerkOrgId() {
    const { data: userInfo } = useUserInfo()
    return userInfo?.members?.[0]?.organizations?.id || ''
}


function useEffectiveLocationId() {
    const { selectedLocationId } = useLocationStore()
    const isAllLocations = useIsAllLocations()

    // For queries that support location filtering:
    // - Return 'all' or undefined to get ALL data (merchant-wide)
    // - Return locationId to get location-specific data with overrides
    if (isAllLocations) {
        return 'all'
    }
    return selectedLocationId
}

// ============================================================================
// Location-Scoped Menu Hooks
// ============================================================================

/**
 * Get menus scoped to the current location selection
 * - All Locations: returns all merchant menus
 * - Specific Location: returns menus for that location with location status
 */
export function useLocationScopedMenus() {
    const clerkOrgId = useClerkOrgId()
    const locationId = useEffectiveLocationId()

    return useQuery({
        queryKey: ['menus', clerkOrgId, locationId, 'scoped'],
        queryFn: () => GetMenus(clerkOrgId, locationId),
        enabled: !!clerkOrgId,
    })
}

/**
 * Get a single menu with location context (item pricing overrides)
 */
export function useMenuWithLocationContext(menuId: string) {
    const locationId = useEffectiveLocationId()

    return useQuery({
        queryKey: ['menu', menuId, locationId, 'scoped'],
        queryFn: () => GetMenuWithLocationContext(menuId, locationId),
        enabled: !!menuId,
    })
}

/**
 * Get menu items scoped to the current location selection
 * Returns items with effective prices based on location overrides
 */
export function useLocationScopedMenuItems() {
    const clerkOrgId = useClerkOrgId()
    const locationId = useEffectiveLocationId()

    return useQuery({
        queryKey: ['menu-items', clerkOrgId, locationId, 'scoped'],
        queryFn: () => GetMenuItems(clerkOrgId, locationId),
        enabled: !!clerkOrgId,
    })
}

/**
 * Get a single menu item with location context
 */
export function useMenuItemWithLocationContext(itemId: string) {
    const locationId = useEffectiveLocationId()

    return useQuery({
        queryKey: ['menu-item', itemId, locationId, 'scoped'],
        queryFn: () => GetMenuItemWithLocationContext(itemId, locationId),
        enabled: !!itemId,
    })
}

/**
 * Get menu items with their categories, scoped to the current location
 * Returns items with effective prices based on location overrides
 */
export function useLocationScopedMenuItemsWithCategories() {
    // const clerkOrgId = useClerkOrgId()
    const { data: userInfo } = useUserInfo()
    const merchantId = userInfo?.members?.[0]?.organizations?.merchants?.id || ''
    const locationId = useEffectiveLocationId()
    console.log('merchantId', merchantId)
    return useQuery({
        queryKey: ['menu-items-with-categories', merchantId, locationId, 'scoped'],
        queryFn: () => getItemsForLocation(merchantId, locationId),
        enabled: !!merchantId,
    })
}

/**
 * Get categories scoped to the current location selection
 */
export function useLocationScopedCategories(menuId?: string) {
    const clerkOrgId = useClerkOrgId()
    const { selectedLocationId } = useLocationStore()

    return useQuery({
        queryKey: ['categories', clerkOrgId, menuId, selectedLocationId, 'scoped'],
        queryFn: () => GetCategories(clerkOrgId, menuId),
        enabled: !!clerkOrgId,
    })
}

/**
 * Get schedules scoped to the current location selection
 */
export function useLocationScopedSchedules() {
    const clerkOrgId = useClerkOrgId()
    const { selectedLocationId } = useLocationStore()

    return useQuery({
        queryKey: ['schedules', clerkOrgId, selectedLocationId, 'scoped'],
        queryFn: () => GetSchedules(clerkOrgId),
        enabled: !!clerkOrgId,
    })
}

/**
 * Get schedules with time slots scoped to the current location
 */
export function useLocationScopedSchedulesWithTimeSlots() {
    const clerkOrgId = useClerkOrgId()
    const { selectedLocationId } = useLocationStore()

    return useQuery({
        queryKey: ['schedules-with-slots', clerkOrgId, selectedLocationId, 'scoped'],
        queryFn: () => GetSchedulesWithTimeSlots(clerkOrgId),
        enabled: !!clerkOrgId,
    })
}

// ============================================================================
// Location-Scoped Mutation Hooks
// ============================================================================

/**
 * Smart mutation that routes to the correct action based on location scope:
 * - If location scoped → UpsertLocationMenuItemOverride for price/availability
 * - If all locations → UpdateMenuItem (global)
 */
export function useLocationAwareMenuItemMutation() {
    const queryClient = useQueryClient()
    const clerkOrgId = useClerkOrgId()
    const { selectedLocationId } = useLocationStore()
    const isAllLocations = useIsAllLocations()

    return useMutation({
        mutationFn: async ({
            itemId,
            data
        }: {
            itemId: string
            data: {
                name?: string
                description?: string
                price?: number
                cash_price?: number
                image?: string
                meal_types?: ("Lunch" | "Dinner" | "Brunch" | "Specials")[]
                allergens?: string[]
                card_bg_color?: string
                availability?: boolean
                stock_tracking_mode?: "in_stock" | "out_of_stock" | "quantity"
            }
        }) => {
            const locationId = isAllLocations ? undefined : selectedLocationId
            return UpdateMenuItem(itemId, data, locationId)
        },
        onSuccess: (result, variables) => {
            if (result.error) {
                toast.error('Update Failed', { description: result.error })
                return
            }

            const message = isAllLocations
                ? 'Item updated globally'
                : 'Item updated for this location'
            toast.success('Item Updated', { description: message })

            // Invalidate relevant queries
            queryClient.invalidateQueries({ queryKey: ['menu-items'] })
            queryClient.invalidateQueries({ queryKey: ['menu-item', variables.itemId] })
            queryClient.invalidateQueries({ queryKey: ['menus'] })
        },
        onError: (error) => {
            toast.error('Update Failed', { description: 'An unexpected error occurred' })
            console.error('Menu item update error:', error)
        }
    })
}

/**
 * Mutation specifically for updating location-specific price overrides
 */
export function useLocationMenuItemOverrideMutation() {
    const queryClient = useQueryClient()
    const { selectedLocationId } = useLocationStore()
    const isAllLocations = useIsAllLocations()

    return useMutation({
        mutationFn: async ({
            itemId,
            data
        }: {
            itemId: string
            data: OverrideData
        }) => {
            if (isAllLocations) {
                return { error: 'Cannot create location override when viewing all locations' }
            }
            return UpsertLocationMenuItemOverride(selectedLocationId, itemId, data)
        },
        onSuccess: (result, variables) => {
            if (result.error) {
                toast.error('Override Failed', { description: result.error })
                return
            }

            toast.success('Location Price Set', {
                description: 'Price override applied for this location'
            })

            // Invalidate relevant queries
            queryClient.invalidateQueries({ queryKey: ['menu-items'] })
            queryClient.invalidateQueries({ queryKey: ['menu-item', variables.itemId] })
            queryClient.invalidateQueries({ queryKey: ['menus'] })
        },
        onError: (error) => {
            toast.error('Override Failed', { description: 'An unexpected error occurred' })
            console.error('Location override error:', error)
        }
    })
}

/**
 * Mutation to reset a menu item to use global pricing at a location
 */
export function useResetToGlobalMutation() {
    const queryClient = useQueryClient()
    const { selectedLocationId } = useLocationStore()
    const isAllLocations = useIsAllLocations()

    return useMutation({
        mutationFn: async (itemId: string) => {
            if (isAllLocations) {
                return { error: 'Cannot reset override when viewing all locations' }
            }
            return ResetMenuItemToGlobal(itemId, selectedLocationId)
        },
        onSuccess: (result, itemId) => {
            if (result.error) {
                toast.error('Reset Failed', { description: result.error })
                return
            }

            toast.success('Reset to Global', {
                description: 'Item now uses global pricing at this location'
            })

            // Invalidate relevant queries
            queryClient.invalidateQueries({ queryKey: ['menu-items'] })
            queryClient.invalidateQueries({ queryKey: ['menu-item', itemId] })
            queryClient.invalidateQueries({ queryKey: ['menus'] })
        },
        onError: (error) => {
            toast.error('Reset Failed', { description: 'An unexpected error occurred' })
            console.error('Reset to global error:', error)
        }
    })
}

// ============================================================================
// Helper Hooks
// ============================================================================

/**
 * Get the current location context for display purposes
 */
export function useLocationContext() {
    const { selectedLocationId, locations } = useLocationStore()
    const isAllLocations = useIsAllLocations()

    const selectedLocation = isAllLocations
        ? null
        : locations.find(l => l.id === selectedLocationId)

    return {
        selectedLocationId,
        selectedLocation,
        isAllLocations,
        locationName: isAllLocations ? 'All Locations' : selectedLocation?.name || 'Unknown',
    }
}

// ============================================================================
// Export store hooks for convenience
// ============================================================================

export { useLocationStore, useSelectedLocation, useIsAllLocations } from '@/stores/location-store'
