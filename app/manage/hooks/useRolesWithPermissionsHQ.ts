import { useQuery } from "@tanstack/react-query"
import { GetRolesWithPermissionsHQ } from "../actions/get-roles-with-permissions-hq"

export function useRolesWithPermissionsHQ() {
    return useQuery({
        queryKey: ['rolesWithPermissionsHQ'],
        queryFn: GetRolesWithPermissionsHQ,
    })
}