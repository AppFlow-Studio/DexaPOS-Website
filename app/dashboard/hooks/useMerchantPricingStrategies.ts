import { useQuery } from "@tanstack/react-query";
import { GetMerchantPricingStrategies } from "../actions/get-merchant-pricing-strategies";

export function useMerchantPricingStrategies(
  clerkOrgId: string | undefined,
  enabled: boolean = true,
) {
  return useQuery({
    queryKey: ["merchant-pricing-strategies", clerkOrgId],
    queryFn: () => GetMerchantPricingStrategies(clerkOrgId!),
    enabled: !!clerkOrgId && enabled,
    staleTime: 5 * 60 * 1000,
  });
}
