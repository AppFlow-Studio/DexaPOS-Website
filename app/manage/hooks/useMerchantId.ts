import { useQuery } from "@tanstack/react-query"
import { getMerchantIdFromClerkOrgId } from "../actions/get-merchant-id"

/**
 * Hook to get merchant UUID from clerk_org_id
 * Lightweight alternative to useMerchantInfo when only the ID is needed
 */
export function useMerchantId(clerkOrgId: string) {
    return useQuery({
        queryKey: ['merchantId', clerkOrgId],
        queryFn: () => getMerchantIdFromClerkOrgId(clerkOrgId),
        enabled: !!clerkOrgId,
        staleTime: 10 * 60 * 1000, // 10 minutes - merchant ID rarely changes
    })
}
