import { useQuery } from "@tanstack/react-query"
import { GetMenuItems, GetMenuItem } from "../actions/menu-items"
import { getItemsForLocation, getItemWithPriceLevels } from "../actions/menu-items-rpc"
import { useLocationStore } from "./useLocationScoped"

/**
 * Get all menu items for a merchant (basic list)
 */
export function useMenuItems(clerkOrgId: string, locationId?: string | null) {
    const { selectedLocationId } = useLocationStore()
    const effectiveLocationId = locationId ?? selectedLocationId

    return useQuery({
        queryKey: ['menu-items', clerkOrgId, effectiveLocationId],
        queryFn: () => GetMenuItems(clerkOrgId, effectiveLocationId),
        enabled: !!clerkOrgId,
    })
}

/**
 * Get items for a location using the RPC function
 * Includes location override data
 */
export function useItemsForLocation(merchantId: string, locationId?: string | null) {
    const { selectedLocationId } = useLocationStore()
    const effectiveLocationId = locationId ?? selectedLocationId

    return useQuery({
        queryKey: ['items-for-location', merchantId, effectiveLocationId],
        queryFn: () => getItemsForLocation(merchantId, effectiveLocationId),
        enabled: !!merchantId,
    })
}

/**
 * Get a single menu item with location context
 */
export function useMenuItem(itemId: string, locationId?: string | null) {
    const { selectedLocationId } = useLocationStore()
    const effectiveLocationId = locationId ?? selectedLocationId

    return useQuery({
        queryKey: ['menu-item', itemId, effectiveLocationId],
        queryFn: () => GetMenuItem(itemId, effectiveLocationId),
        enabled: !!itemId,
    })
}

/**
 * Get menu item with all 5 price levels for editing/display
 */
export function useItemWithPriceLevels(
    itemId: string,
    options?: {
        categoryId?: string | null
        menuId?: string | null
        locationId?: string | null
    }
) {
    const { selectedLocationId } = useLocationStore()
    const effectiveLocationId = options?.locationId ?? selectedLocationId

    return useQuery({
        queryKey: ['item-price-levels', itemId, options?.categoryId, options?.menuId, effectiveLocationId],
        queryFn: () => getItemWithPriceLevels(itemId, {
            categoryId: options?.categoryId,
            menuId: options?.menuId,
            locationId: effectiveLocationId
        }),
        enabled: !!itemId,
    })
}
