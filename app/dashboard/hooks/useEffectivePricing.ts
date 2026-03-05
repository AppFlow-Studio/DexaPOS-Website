"use client";

import { useQuery } from "@tanstack/react-query";
import { useClerkOrgId } from "./useLocationScoped";
import { useSelectedLocation, useIsAllLocations } from "@/stores/location-store";
import { GetMerchantPricingDefaults } from "@/app/dashboard/actions/locations";

interface EffectivePricing {
  pricingStrategy: "manual" | "dual";
  dualPricingPercentage: number;
  source: "merchant" | "location";
}

export function useEffectivePricing(): EffectivePricing & { isLoading: boolean } {
  const clerkOrgId = useClerkOrgId();
  const selectedLocation = useSelectedLocation();
  const isAllLocations = useIsAllLocations();

  const { data: merchantDefaults, isLoading } = useQuery({
    queryKey: ["merchant-pricing-defaults", clerkOrgId],
    queryFn: () => GetMerchantPricingDefaults(clerkOrgId),
    enabled: !!clerkOrgId,
    staleTime: 30 * 1000,
  });

  // If all locations selected, return merchant defaults
  if (isAllLocations || !selectedLocation) {
    return {
      pricingStrategy: merchantDefaults?.data?.pricing_strategy ?? "manual",
      dualPricingPercentage: merchantDefaults?.data?.dual_pricing_percentage ?? 4.0,
      source: "merchant",
      isLoading,
    };
  }

  // If location uses merchant defaults, return merchant values
  const loc = selectedLocation as any;
  const useMerchantDefaults = loc?.use_merchant_pricing_defaults ?? true;

  if (useMerchantDefaults) {
    return {
      pricingStrategy: merchantDefaults?.data?.pricing_strategy ?? "manual",
      dualPricingPercentage: merchantDefaults?.data?.dual_pricing_percentage ?? 4.0,
      source: "merchant",
      isLoading,
    };
  }

  // Location has its own pricing config
  return {
    pricingStrategy: loc?.pricing_strategy ?? "manual",
    dualPricingPercentage: loc?.dual_pricing_percentage ?? 4.0,
    source: "location",
    isLoading: false,
  };
}
