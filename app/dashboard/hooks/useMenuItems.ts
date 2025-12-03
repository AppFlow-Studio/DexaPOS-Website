import { useQuery } from "@tanstack/react-query"
import { GetMenuItems } from "../actions/menu-items"

export function useMenuItems(clerkOrgId: string) {
    return useQuery({
        queryKey: ['menu-items', clerkOrgId],
        queryFn: () => GetMenuItems(clerkOrgId),
        enabled: !!clerkOrgId,
    })
}

