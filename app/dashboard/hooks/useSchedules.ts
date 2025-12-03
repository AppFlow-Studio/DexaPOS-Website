import { useQuery } from "@tanstack/react-query"
import { GetSchedules } from "../actions/schedules"

export function useSchedules(clerkOrgId: string) {
    return useQuery({
        queryKey: ['schedules', clerkOrgId],
        queryFn: () => GetSchedules(clerkOrgId),
        enabled: !!clerkOrgId,
    })
}

