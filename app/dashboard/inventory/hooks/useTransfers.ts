"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useUserInfo } from "@/app/manage/hooks/useUserInfo.";
import { useLocationStore } from "@/stores/location-store";
import { toast } from "sonner";
import {
  GetMerchantLocations,
  GetTransfers,
  GetTransferDetail,
  InitiateTransfer,
  ReceiveTransfer,
  CancelTransfer,
  GetParLevelShortfalls,
  GenerateParLevelPurchaseOrders,
  TransferLocation,
  InventoryTransfer,
  TransferDetail,
  InitiateTransferInput,
  ParShortfallItem,
} from "../../actions/transfers";

// ============================================================================
// SHARED ORG CONTEXT
// ============================================================================

function useOrgContext() {
  const { data: userInfo } = useUserInfo();
  const { selectedLocationId } = useLocationStore();

  const clerkOrgId = userInfo?.members?.[0]?.organizations?.id || "";
  const locationId = selectedLocationId;
  const isGlobalView = selectedLocationId === "all" || !selectedLocationId;

  return { clerkOrgId, locationId, isGlobalView };
}

// ============================================================================
// QUERIES
// ============================================================================

export function useMerchantLocations() {
  const { clerkOrgId } = useOrgContext();

  return useQuery<TransferLocation[]>({
    queryKey: ["merchant-locations", clerkOrgId, "scoped"],
    queryFn: () => GetMerchantLocations(clerkOrgId),
    enabled: !!clerkOrgId,
    staleTime: 5 * 60 * 1000,
  });
}

export function useTransfers() {
  const { clerkOrgId, locationId } = useOrgContext();

  return useQuery<InventoryTransfer[]>({
    queryKey: ["inventory-transfers", clerkOrgId, locationId, "scoped"],
    queryFn: () => GetTransfers(clerkOrgId, locationId),
    enabled: !!clerkOrgId && locationId !== "all" && !!locationId,
  });
}

export function useTransferDetail(transferId: string | null) {
  return useQuery<TransferDetail | null>({
    queryKey: ["inventory-transfer-detail", transferId],
    queryFn: () => (transferId ? GetTransferDetail(transferId) : null),
    enabled: !!transferId,
  });
}

export function useParLevelShortfalls() {
  const { clerkOrgId, locationId } = useOrgContext();

  return useQuery<ParShortfallItem[]>({
    queryKey: ["par-shortfalls", clerkOrgId, locationId, "scoped"],
    queryFn: () => GetParLevelShortfalls(clerkOrgId, locationId),
    enabled: !!clerkOrgId && locationId !== "all" && !!locationId,
  });
}

// ============================================================================
// MUTATIONS
// ============================================================================

function useInvalidateTransferQueries() {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: ["inventory-transfers"] });
    queryClient.invalidateQueries({ queryKey: ["inventory-items"] });
    queryClient.invalidateQueries({ queryKey: ["inventory-stats"] });
    queryClient.invalidateQueries({ queryKey: ["par-shortfalls"] });
    queryClient.invalidateQueries({ queryKey: ["audit-logs"] });
  };
}

export function useInitiateTransfer() {
  const { clerkOrgId } = useOrgContext();
  const invalidate = useInvalidateTransferQueries();

  return useMutation({
    mutationFn: (input: InitiateTransferInput) =>
      InitiateTransfer(clerkOrgId, input),
    onSuccess: (result) => {
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(`Transfer ${result.transferNumber ?? ""} initiated`);
      invalidate();
    },
    onError: (error: Error) => {
      toast.error("Failed to initiate transfer: " + error.message);
    },
  });
}

export function useReceiveTransfer() {
  const queryClient = useQueryClient();
  const { clerkOrgId } = useOrgContext();
  const invalidate = useInvalidateTransferQueries();

  return useMutation({
    mutationFn: ({
      transferId,
      receivedItems,
    }: {
      transferId: string;
      receivedItems: {
        inventory_item_id: string;
        quantity_received: number;
      }[];
    }) => ReceiveTransfer(clerkOrgId, transferId, receivedItems),
    onSuccess: (result, variables) => {
      if (result.error) {
        toast.error(result.error);
        return;
      }
      const discrepancies = result.discrepancies ?? [];
      toast.success(
        discrepancies.length > 0
          ? `Transfer received — ${discrepancies.length} discrepancy(ies) logged`
          : "Transfer received",
      );
      invalidate();
      queryClient.invalidateQueries({
        queryKey: ["inventory-transfer-detail", variables.transferId],
      });
    },
    onError: (error: Error) => {
      toast.error("Failed to receive transfer: " + error.message);
    },
  });
}

export function useCancelTransfer() {
  const queryClient = useQueryClient();
  const { clerkOrgId } = useOrgContext();
  const invalidate = useInvalidateTransferQueries();

  return useMutation({
    mutationFn: (transferId: string) => CancelTransfer(clerkOrgId, transferId),
    onSuccess: (result, transferId) => {
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Transfer cancelled — stock returned to source");
      invalidate();
      queryClient.invalidateQueries({
        queryKey: ["inventory-transfer-detail", transferId],
      });
    },
    onError: (error: Error) => {
      toast.error("Failed to cancel transfer: " + error.message);
    },
  });
}

export function useGenerateParLevelPOs() {
  const queryClient = useQueryClient();
  const { clerkOrgId, locationId } = useOrgContext();

  return useMutation({
    mutationFn: () => {
      if (!locationId || locationId === "all") {
        return Promise.resolve({
          error: "Select a specific location to generate purchase orders",
        });
      }
      return GenerateParLevelPurchaseOrders(clerkOrgId, locationId);
    },
    onSuccess: (result) => {
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(
        `${result.ordersCreated ?? 0} draft PO(s) created for ${
          result.itemsOrdered ?? 0
        } item(s)`,
      );
      queryClient.invalidateQueries({ queryKey: ["purchase-orders"] });
      queryClient.invalidateQueries({ queryKey: ["par-shortfalls"] });
      queryClient.invalidateQueries({ queryKey: ["audit-logs"] });
    },
    onError: (error: Error) => {
      toast.error("Failed to generate purchase orders: " + error.message);
    },
  });
}
