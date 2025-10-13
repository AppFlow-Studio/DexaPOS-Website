import { useQuery } from "@tanstack/react-query"
import { GetUserInfo } from "../actions/get-user-info"

export function useUserInfo() {
    return useQuery({
        queryKey: ['userInfo'],
        queryFn: GetUserInfo,
    })
}