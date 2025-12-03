import { useQuery } from "@tanstack/react-query"
import { GetMenu } from "../actions/menus"

export function useMenu(menuId: string) {
    return useQuery({
        queryKey: ['menu', menuId],
        queryFn: () => GetMenu(menuId),
        enabled: !!menuId,
    })
}

