"use client";

import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { useClerkOrgId } from "./usePayments";
import { useLocationStore, useIsAllLocations } from "@/stores/location-store";
import {
  GetMerchantChargebacks,
  MerchantChargebackFilters,
} from "../actions/chargebacks";

export function useChargebacks(
  filters?: Omit<MerchantChargebackFilters, "locationId">,
  limit: number = 50,
  offset: number = 0
) {
  const clerkOrgId = useClerkOrgId();
  const { selectedLocationId } = useLocationStore();
  const isAllLocations = useIsAllLocations();
  const effectiveLocationId = isAllLocations ? "all" : selectedLocationId;

  const combinedFilters: MerchantChargebackFilters = {
    ...filters,
    locationId: effectiveLocationId,
  };

  return useQuery({
    queryKey: ["merchant-chargebacks", clerkOrgId, effectiveLocationId, filters, limit, offset],
    queryFn: () => GetMerchantChargebacks(clerkOrgId, combinedFilters, limit, offset),
    enabled: !!clerkOrgId,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });
}

export function useInvalidateChargebacks() {
  const queryClient = useQueryClient();
  return () =>
    queryClient.invalidateQueries({ queryKey: ["merchant-chargebacks"] });
}
