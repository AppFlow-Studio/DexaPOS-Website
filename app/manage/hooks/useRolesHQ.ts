import { useQuery } from "@tanstack/react-query"
import { GetRolesHQ } from "../actions/get-roles-hq"

export function useRolesHQ() {
    return useQuery({
        queryKey: ['rolesHQ'],
        queryFn: GetRolesHQ,
    })
}