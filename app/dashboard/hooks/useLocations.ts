import { useQuery } from "@tanstack/react-query"
import { GetLocations } from "../actions/get-locations"

export function useLocations(clerkOrgId: string) {
    return useQuery({
        queryKey: ['locations', clerkOrgId],
        queryFn: () => GetLocations(clerkOrgId),
        enabled: !!clerkOrgId,
    })
}
