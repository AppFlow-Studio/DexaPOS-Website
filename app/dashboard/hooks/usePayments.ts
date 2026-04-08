"use client";

import { useQuery } from "@tanstack/react-query";
import { useLocationStore, useIsAllLocations } from "@/stores/location-store";
import { useUserInfo } from "@/app/manage/hooks/useUserInfo.";
import { GetPayments } from "../actions/payments";
import { PaymentRecord, PaymentFilters } from "@/types/payment";

/**
 * Get clerk organization ID from user info
 */
export function useClerkOrgId() {
  const { data: userInfo } = useUserInfo();
  return userInfo?.members?.[0]?.organizations?.id || "";
}

/**
 * Get payments scoped to the current location selection
 */
export function usePayments(filters?: PaymentFilters) {
  const clerkOrgId = useClerkOrgId();
  const { selectedLocationId } = useLocationStore();
  const isAllLocations = useIsAllLocations();

  const effectiveLocationId = isAllLocations ? "all" : selectedLocationId;

  return useQuery<PaymentRecord[]>({
    queryKey: ["payments", clerkOrgId, effectiveLocationId, filters],
    queryFn: () =>
      GetPayments(
        clerkOrgId,
        effectiveLocationId === "all" ? null : effectiveLocationId,
        filters
      ),
    enabled: !!clerkOrgId,
    staleTime: 5000,
  });
}
