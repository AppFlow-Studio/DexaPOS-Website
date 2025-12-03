import { useQuery } from "@tanstack/react-query"
import { GetMenus } from "../actions/menus"

export function useMenus(clerkOrgId: string, locationId?: string | null) {
    return useQuery({
        queryKey: ['menus', clerkOrgId, locationId],
        queryFn: () => GetMenus(clerkOrgId, locationId),
        enabled: !!clerkOrgId,
    })
}

