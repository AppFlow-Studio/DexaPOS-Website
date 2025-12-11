import { useMutation, useQuery } from "@tanstack/react-query"
import { AddCategoryToMenu, GetCategories, GetCategoriesWithItemsForLocation, GetCategoryWithItems } from "../actions/categories"
import { useLocationStore } from "./useLocationScoped"
import { CategoryWithItems } from "@/types/menu"

/**
 * Get basic categories list (without items)
 */
export function useCategories(clerkOrgId: string, menuId?: string | null) {
    return useQuery({
        queryKey: ['categories', clerkOrgId, menuId],
        queryFn: () => GetCategories(clerkOrgId, menuId),
        enabled: !!clerkOrgId,
    })
}


/**
 * Get categories with nested items for a location
 * This is the PRIMARY hook for category-centric display
 */
export function useCategoriesWithItems(clerkOrgId: string, locationId?: string | null) {
    const { selectedLocationId } = useLocationStore()
    const effectiveLocationId = locationId ?? selectedLocationId

    return useQuery<{ success: boolean; data: CategoryWithItems[]; error?: string }>({
        queryKey: ['categories-with-items', clerkOrgId, effectiveLocationId],
        queryFn: () => GetCategoriesWithItemsForLocation(clerkOrgId, effectiveLocationId),
        enabled: !!clerkOrgId,
    })
}

/**
 * Get a single category with its items
 */
export function useCategoryWithItems(categoryId: string, locationId?: string | null) {
    const { selectedLocationId } = useLocationStore()
    const effectiveLocationId = locationId ?? selectedLocationId

    return useQuery<CategoryWithItems | null>({
        queryKey: ['category-with-items', categoryId, effectiveLocationId],
        queryFn: () => GetCategoryWithItems(categoryId, effectiveLocationId),
        enabled: !!categoryId,
    })
}
