import { useQuery } from "@tanstack/react-query"
import { GetCategories } from "../actions/categories"

export function useCategories(clerkOrgId: string, menuId?: string | null) {
    return useQuery({
        queryKey: ['categories', clerkOrgId, menuId],
        queryFn: () => GetCategories(clerkOrgId, menuId),
        enabled: !!clerkOrgId,
    })
}

