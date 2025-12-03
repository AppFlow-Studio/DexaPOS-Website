import { useQuery } from "@tanstack/react-query"
import { GetMenuItem } from "../actions/menu-items"

export function useMenuItem(itemId: string) {
    return useQuery({
        queryKey: ['menu-item', itemId],
        queryFn: () => GetMenuItem(itemId),
        enabled: !!itemId,
    })
}

