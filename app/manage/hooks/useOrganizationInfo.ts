import { useQuery } from "@tanstack/react-query"
import { GetOrganizationInfo } from "../actions/get-organization-info"

export function useOrganizationInfo(organizationId: string) {
    return useQuery({
        queryKey: ['organizationInfo', organizationId],
        queryFn: () => GetOrganizationInfo(organizationId),
        enabled: !!organizationId,
    })
}