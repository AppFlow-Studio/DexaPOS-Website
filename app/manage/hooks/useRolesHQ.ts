import { useQuery } from "@tanstack/react-query"
import { GetRolesHQ } from "../actions/get-roles-hq"

export function useRolesHQ(role_types?: string) {
    return useQuery({
        queryKey: ['rolesHQ'],
        queryFn: () => GetRolesHQ(role_types),
    })
}