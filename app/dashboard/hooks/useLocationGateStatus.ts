import { useQuery } from "@tanstack/react-query"
import { getMerchantLocationGateStatus } from "../actions/subscription-billing"

/**
 * Resolved-tier + Add-Location headroom for the merchant-web paywall gate.
 * The server action resolves the merchant from the request context (Clerk /
 * impersonation), so clerkOrgId is used only to key the cache and gate the
 * fetch until auth is ready.
 */
export function useLocationGateStatus(clerkOrgId: string) {
  return useQuery({
    queryKey: ["location-gate-status", clerkOrgId],
    queryFn: () => getMerchantLocationGateStatus(),
    enabled: !!clerkOrgId,
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
  })
}
