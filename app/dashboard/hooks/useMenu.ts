import { useQuery } from "@tanstack/react-query"
import { GetMenu, GetMenuWithCategories } from "../actions/menus"
import { useLocationStore } from "./useLocationScoped"
import { MenuWithCategories } from "@/types/menu"

/**
 * Get basic menu data (without location context)
 */
export function useMenu(menuId: string) {
    return useQuery({
        queryKey: ['menu-basic', menuId],
        queryFn: () => GetMenu(menuId),
        enabled: !!menuId,
    })
}

/**
 * Get menu with categories and items (category-centric structure)
 * This is the PRIMARY hook for displaying a menu
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
