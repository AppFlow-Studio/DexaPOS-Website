"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useUserInfo } from "@/app/manage/hooks/useUserInfo.";
import { useLocationStore } from "@/stores/location-store";
import { toast } from "sonner";
import {
  GetWasteLogs,
  LogWaste,
  WasteLogWithItem,
  LogWasteInput,
} from "../../actions/waste";
import {
  GetInventoryCounts,
  GetInventoryCountDetail,
  CreateInventoryCount,
  SubmitInventoryCount,
  ApproveInventoryCount,
  InventoryCount,
  CountDetail,
  CreateCountInput,
} from "../../actions/inventory-counts";

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

export function useInventoryOrgContext() {
  return useOrgContext();
}

// ============================================================================
// WASTE
// ============================================================================

export function useWasteLogs(dateRange?: { from?: string; to?: string }) {
  const { clerkOrgId, locationId } = useOrgContext();

  return useQuery<WasteLogWithItem[]>({
    queryKey: ["waste-logs", clerkOrgId, locationId, dateRange ?? null, "scoped"],
    queryFn: () => GetWasteLogs(clerkOrgId, locationId, dateRange),
    enabled: !!clerkOrgId && locationId !== "all" && !!locationId,
  });
}

export function useLogWaste() {
  const queryClient = useQueryClient();
  const { clerkOrgId, locationId } = useOrgContext();

  return useMutation({
    mutationFn: (input: LogWasteInput) => {
      if (!locationId || locationId === "all") {
        return Promise.resolve({
          error: "Please select a specific location to log waste",
        });
      }
      return LogWaste(clerkOrgId, locationId, input);
    },
    onSuccess: (result) => {
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(
        `Waste logged — estimated cost $${(result.estimatedCost ?? 0).toFixed(2)}`,
      );
      queryClient.invalidateQueries({ queryKey: ["waste-logs"] });
      queryClient.invalidateQueries({ queryKey: ["inventory-items"] });
      queryClient.invalidateQueries({ queryKey: ["inventory-stats"] });
      queryClient.invalidateQueries({ queryKey: ["audit-logs"] });
    },
    onError: (error: Error) => {
      toast.error("Failed to log waste: " + error.message);
    },
  });
}

// ============================================================================
// INVENTORY COUNTS
// ============================================================================

export function useInventoryCounts() {
  const { clerkOrgId, locationId } = useOrgContext();

  return useQuery<InventoryCount[]>({
    queryKey: ["inventory-counts", clerkOrgId, locationId, "scoped"],
    queryFn: () => GetInventoryCounts(clerkOrgId, locationId),
    enabled: !!clerkOrgId && locationId !== "all" && !!locationId,
  });
}

export function useCountDetail(countId: string | null) {
  return useQuery<CountDetail | null>({
    queryKey: ["inventory-count-detail", countId],
    queryFn: () => (countId ? GetInventoryCountDetail(countId) : null),
    enabled: !!countId,
  });
}

export function useCreateInventoryCount() {
  const queryClient = useQueryClient();
  const { clerkOrgId, locationId } = useOrgContext();

  return useMutation({
    mutationFn: (input: CreateCountInput) => {
      if (!locationId || locationId === "all") {
        return Promise.resolve({
          error: "Please select a specific location to create a count",
        });
      }
      return CreateInventoryCount(clerkOrgId, locationId, input);
    },
    onSuccess: (result) => {
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(`Count created with ${result.itemsCount ?? 0} items`);
      queryClient.invalidateQueries({ queryKey: ["inventory-counts"] });
    },
    onError: (error: Error) => {
      toast.error("Failed to create count: " + error.message);
    },
  });
}

export function useSubmitInventoryCount() {
  const queryClient = useQueryClient();
  const { clerkOrgId } = useOrgContext();

  return useMutation({
    mutationFn: ({
      countId,
      countedItems,
      applyAdjustments,
    }: {
      countId: string;
      countedItems: { inventory_item_id: string; counted_quantity: number }[];
      applyAdjustments: boolean;
    }) =>
      SubmitInventoryCount(
        clerkOrgId,
        countId,
        countedItems,
        applyAdjustments,
      ),
    onSuccess: (result, variables) => {
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(
        result.adjustmentsApplied
          ? `Count submitted — ${result.adjustmentsApplied} stock adjustment(s) applied`
          : "Count submitted",
      );
      queryClient.invalidateQueries({ queryKey: ["inventory-counts"] });
      queryClient.invalidateQueries({
        queryKey: ["inventory-count-detail", variables.countId],
      });
      queryClient.invalidateQueries({ queryKey: ["inventory-items"] });
      queryClient.invalidateQueries({ queryKey: ["inventory-stats"] });
      queryClient.invalidateQueries({ queryKey: ["audit-logs"] });
    },
    onError: (error: Error) => {
      toast.error("Failed to submit count: " + error.message);
    },
  });
}

export function useApproveInventoryCount() {
  const queryClient = useQueryClient();
  const { clerkOrgId } = useOrgContext();

  return useMutation({
    mutationFn: (countId: string) => ApproveInventoryCount(clerkOrgId, countId),
    onSuccess: (result, countId) => {
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Count approved");
      queryClient.invalidateQueries({ queryKey: ["inventory-counts"] });
      queryClient.invalidateQueries({
        queryKey: ["inventory-count-detail", countId],
      });
    },
    onError: (error: Error) => {
      toast.error("Failed to approve count: " + error.message);
    },
  });
}
