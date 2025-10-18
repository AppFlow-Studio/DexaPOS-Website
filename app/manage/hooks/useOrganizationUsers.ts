import { useQuery } from "@tanstack/react-query"
import { getOrganizationUsers } from "../actions/get-organization-users"

export const useOrganizationUsers = (organizationId: string) => {
    return useQuery({
        queryKey: ['organization-users', organizationId],
        queryFn: () => getOrganizationUsers(organizationId),
    })
}