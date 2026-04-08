"use client";

import { useQuery } from "@tanstack/react-query";
import { useLocationStore, useIsAllLocations } from "@/stores/location-store";
import { useClerkOrgId } from "./usePayments";
import { GetSettlementBatches, GetBatchPayments } from "../actions/settlement-batches";
import { SettlementBatchRecord, BatchFilters, PaymentRecord } from "@/types/payment";

export function useSettlementBatches(filters?: BatchFilters) {
  const clerkOrgId = useClerkOrgId();
  const { selectedLocationId } = useLocationStore();
  const isAllLocations = useIsAllLocations();

  const effectiveLocationId = isAllLocations ? "all" : selectedLocationId;

  return useQuery<SettlementBatchRecord[]>({
    queryKey: ["settlement-batches", clerkOrgId, effectiveLocationId, filters],
    queryFn: () =>
      GetSettlementBatches(
        clerkOrgId,
        effectiveLocationId === "all" ? null : effectiveLocationId,
        filters
      ),
    enabled: !!clerkOrgId,
    staleTime: 30_000,
  });
}

export function useBatchPayments(batchId: string | null, enabled: boolean) {
  const clerkOrgId = useClerkOrgId();
  const { selectedLocationId } = useLocationStore();
  const isAllLocations = useIsAllLocations();

  const effectiveLocationId = isAllLocations ? "all" : selectedLocationId;

  return useQuery<PaymentRecord[]>({
    queryKey: ["batch-payments", clerkOrgId, effectiveLocationId, batchId],
    queryFn: () =>
      GetBatchPayments(
        clerkOrgId,
        batchId!,
        effectiveLocationId === "all" ? null : effectiveLocationId
      ),
    enabled: !!clerkOrgId && !!batchId && enabled,
    staleTime: 30_000,
  });
}
