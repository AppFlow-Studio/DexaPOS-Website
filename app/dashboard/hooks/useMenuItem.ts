import { useQuery } from "@tanstack/react-query"
import { GetMenuItem } from "../actions/menu-items"
import { useLocationStore } from "@/stores/location-store"

export function useMenuItem(itemId: string) {
    const { selectedLocationId } = useLocationStore()
    return useQuery({
        queryKey: ['menu-item', itemId],
        queryFn: () => GetMenuItem(itemId, selectedLocationId),
        enabled: !!itemId,
    })
}

