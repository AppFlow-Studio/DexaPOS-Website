import { useQuery } from "@tanstack/react-query"
import { GetLocations } from "../actions/get-locations"

export function useLocations(clerkOrgId: string, user_id: string) {
    return useQuery({
        queryKey: ['locations', clerkOrgId],
        queryFn: () => GetLocations(clerkOrgId, user_id),
        enabled: !!clerkOrgId,
        staleTime: 5 * 60 * 1000, // 5 minutes - Locations don't change frequently
        refetchOnWindowFocus: false, // Don't refetch on window focus
    })
}
