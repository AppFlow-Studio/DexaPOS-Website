import { useQuery } from "@tanstack/react-query"
import { getMenuForLocation, GetMenus, GetMenuWithCategories } from "../actions/menus"
import { useLocationStore } from "./useLocationScoped"
import { MenuWithCategories } from "@/types/menu"

export function useMenus(clerkOrgId: string, locationId?: string | null) {
    console.log('locationId', locationId)
    return useQuery({
        queryKey: ['menus', clerkOrgId, locationId],
        queryFn: () => GetMenus(clerkOrgId, locationId),
        enabled: !!clerkOrgId,
    })
}

/**
 * Get menu with categories and nested items (category-centric structure)
 * This is the PRIMARY hook for menu display
 */
export function useMenuWithCategories(menuId: string, locationId?: string | null) {
    const { selectedLocationId } = useLocationStore()
    const effectiveLocationId = locationId ?? selectedLocationId

    return useQuery<MenuWithCategories | null>({
        queryKey: ['menu-with-categories', menuId, effectiveLocationId],
        queryFn: () => GetMenuWithCategories(menuId, effectiveLocationId),
        enabled: !!menuId,
    })
}

/**
 * @deprecated Use useMenuWithCategories instead
 * Legacy hook for backwards compatibility
 */
export function useMenuForLocation(menuId: string, locationId?: string | null) {
    const { selectedLocationId } = useLocationStore()
    const effectiveLocationId = locationId ?? selectedLocationId

    return useQuery({
        queryKey: ['menu', menuId, effectiveLocationId],
        queryFn: () => getMenuForLocation(menuId, effectiveLocationId),
        enabled: !!menuId,
    })
}
