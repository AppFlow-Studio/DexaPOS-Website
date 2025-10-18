import { useQuery } from "@tanstack/react-query"
import { GetInfoOfUser } from "../actions/get-info-of-user"

export function useGetInfoOfUser(userId: string) {
    return useQuery({
        queryKey: ['userInfo', userId],
        queryFn: () => GetInfoOfUser(userId),
    })
}