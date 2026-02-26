"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getOrderOutStatus,
  onboardOrderOut,
  pushMenuToOrderOut,
  type OnboardOrderOutParams,
  type PushMenuToOrderOutParams,
} from "@/app/dashboard/actions/orderout";
import { toast } from "sonner";

/**
 * Get OrderOut status for a specific location
 */
export function useOrderOutStatus(clerkOrgId: string, locationId: string) {
  return useQuery({
    queryKey: ["orderout-status", clerkOrgId, locationId],
    queryFn: () => getOrderOutStatus(clerkOrgId, locationId),
    enabled: !!clerkOrgId && !!locationId && locationId !== "all",
    staleTime: 30 * 1000,
  });
}

/**
 * Onboard a location to OrderOut (merchant)
 */
export function useOnboardOrderOut(clerkOrgId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: OnboardOrderOutParams) => onboardOrderOut(params),
    onSuccess: (result, variables) => {
      if (result.success) {
        toast.success("Location connected to OrderOut successfully");
        queryClient.invalidateQueries({
          queryKey: ["orderout-status", clerkOrgId, variables.locationId],
        });
      } else {
        toast.error(result.error || "Failed to connect to OrderOut");
      }
    },
    onError: () => {
      toast.error("Failed to connect to OrderOut");
    },
  });
}

/**
 * Push a menu to OrderOut
 */
export function usePushMenuToOrderOut(clerkOrgId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: PushMenuToOrderOutParams) =>
      pushMenuToOrderOut(params),
    onSuccess: (result, variables) => {
      if (result.success) {
        const isUpdate = result.data?.isUpdate;
        toast.success(isUpdate ? "Menu updated on OrderOut" : "Menu uploaded to OrderOut", {
          description: `${result.data?.itemsSynced} items synced successfully.`,
        });
        queryClient.invalidateQueries({
          queryKey: ["orderout-status", clerkOrgId, variables.locationId],
        });
        queryClient.invalidateQueries({
          queryKey: ["orderout-menu-sync"],
        });
        queryClient.invalidateQueries({
          queryKey: ["orderout-menu-link"],
        });
        queryClient.invalidateQueries({
          queryKey: ["orderout-payload-diff"],
        });
      } else {
        toast.error(result.error || "Failed to upload menu to OrderOut");
      }
    },
    onError: () => {
      toast.error("Failed to upload menu to OrderOut");
    },
  });
}
