import { useQuery } from "@tanstack/react-query"
import { GetUserInfo } from "../actions/get-user-info"

export function useUserInfo() {
    return useQuery({
        queryKey: ['userInfo'],
        queryFn: GetUserInfo,
        staleTime: 5 * 60 * 1000, // 5 minutes - User info doesn't change frequently
        refetchOnWindowFocus: false, // Don't refetch on focus
        refetchOnMount: true, // Refetch if stale when component mounts
    })
}