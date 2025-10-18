import { useQuery } from "@tanstack/react-query"
import { GetMerchantInfo } from "../actions/get-merchant-info"

export function useMerchantInfo(clerkOrgId: string) {
    return useQuery({
        queryKey: ['merchantInfo', clerkOrgId],
        queryFn: () => GetMerchantInfo(clerkOrgId),
    })
}