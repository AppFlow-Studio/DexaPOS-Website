import { useQuery } from "@tanstack/react-query"
import { GetItemStock } from "../actions/stock"

export function useItemStock(locationId: string, itemId?: string) {
    return useQuery({
        queryKey: ['item-stock', locationId, itemId],
        queryFn: () => GetItemStock(locationId, itemId),
        enabled: !!locationId,
    })
}

