"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getOrderOutStatus,
  onboardOrderOut,
  pushMenuToOrderOut,
  getOrderOutSyncedMenus,
  getRecentOrderOutOrders,
  pushMenuToConnectedChannels,
  getPushChannelsHistory,
  getPushChannelsLiveStatus,
  getOrderOutWebhookHealth,
  setOrderOutChannelsConfirmed,
  setPrimaryOnlineMenu,
  type OnboardOrderOutParams,
  type PushMenuToOrderOutParams,
  type PushMenuToChannelsParams,
  type SetOrderOutChannelsConfirmedParams,
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
 * Designate a menu as the location's canonical online-ordering menu — the single
 * OrderOut push target for availability/86 re-pushes.
 */
export function useSetPrimaryOnlineMenu(clerkOrgId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      locationId,
      menuId,
    }: {
      locationId: string;
      menuId: string;
    }) => setPrimaryOnlineMenu(clerkOrgId, locationId, menuId),
    onSuccess: (result) => {
      if (result.success) {
        toast.success("Set as the online ordering menu");
        queryClient.invalidateQueries({ queryKey: ["orderout-menu-sync"] });
        queryClient.invalidateQueries({ queryKey: ["orderout-synced-menus"] });
      } else {
        toast.error(result.error || "Failed to set online menu");
      }
    },
    onError: (e: Error) =>
      toast.error(e.message || "Failed to set online menu"),
  });
}

/**
 * Merchant self-confirms which delivery channels they've connected inside the
 * OrderOut dashboard. This unblocks Push-to-Channels on fresh installs before
 * any webhook has fired.
 */
export function useSetOrderOutChannelsConfirmed(clerkOrgId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: SetOrderOutChannelsConfirmedParams) =>
      setOrderOutChannelsConfirmed(params),
    onSuccess: (result, variables) => {
      if (result.success) {
        toast.success("Delivery channels updated");
        queryClient.invalidateQueries({
          queryKey: ["orderout-status", clerkOrgId, variables.locationId],
        });
      } else {
        toast.error(result.error || "Failed to update channels");
      }
    },
    onError: () => {
      toast.error("Failed to update channels");
    },
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
        queryClient.invalidateQueries({
          queryKey: ["orderout-synced-menus"],
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

/**
 * Get synced menus for the OrderOut tab
 */
export function useOrderOutSyncedMenus(clerkOrgId: string, locationId: string) {
  return useQuery({
    queryKey: ["orderout-synced-menus", clerkOrgId, locationId],
    queryFn: () => getOrderOutSyncedMenus(clerkOrgId, locationId),
    enabled: !!clerkOrgId && !!locationId && locationId !== "all",
    staleTime: 30 * 1000,
  });
}

/**
 * Get recent delivery orders for the OrderOut tab
 */
export function useRecentOrderOutOrders(clerkOrgId: string, locationId: string) {
  return useQuery({
    queryKey: ["orderout-recent-orders", clerkOrgId, locationId],
    queryFn: () => getRecentOrderOutOrders(clerkOrgId, locationId),
    enabled: !!clerkOrgId && !!locationId && locationId !== "all",
    staleTime: 30 * 1000,
  });
}

// ============================================================================
// Push Menu to Connected Channels
// ============================================================================

/**
 * Push a menu to all connected delivery channels via OrderOut's fan-out endpoint.
 * Results arrive asynchronously via the orderout-push-menu-webhook and surface
 * through usePushChannelsHistory / usePushChannelsLiveStatus.
 */
export function usePushMenuToChannels(clerkOrgId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: PushMenuToChannelsParams) =>
      pushMenuToConnectedChannels(params),
    onSuccess: (result, variables) => {
      if (result.success) {
        const expected = result.data?.expectedChannels.length ?? 0;
        toast.success(
          `Menu push started — waiting on ${expected} channel${expected === 1 ? "" : "s"}…`
        );
        queryClient.invalidateQueries({
          queryKey: [
            "orderout-push-channels-history",
            clerkOrgId,
            variables.locationId,
          ],
        });
        queryClient.invalidateQueries({
          queryKey: ["orderout-status", clerkOrgId, variables.locationId],
        });
        queryClient.invalidateQueries({
          queryKey: ["orderout-synced-menus", clerkOrgId, variables.locationId],
        });
        queryClient.invalidateQueries({
          queryKey: ["orderout-menu-sync"],
        });
      } else {
        toast.error(result.error || "Failed to push menu to channels");
      }
    },
    onError: () => {
      toast.error("Failed to push menu to channels");
    },
  });
}

/**
 * History of push_channels syncs for a location, with optional menu filter.
 * Auto-refreshes while any row is pending/syncing.
 */
export function usePushChannelsHistory(
  clerkOrgId: string,
  locationId: string,
  opts?: { menuId?: string; limit?: number }
) {
  return useQuery({
    queryKey: [
      "orderout-push-channels-history",
      clerkOrgId,
      locationId,
      opts?.menuId ?? "all",
      opts?.limit ?? 25,
    ],
    queryFn: () => getPushChannelsHistory(clerkOrgId, locationId, opts),
    enabled: !!clerkOrgId && !!locationId && locationId !== "all",
    staleTime: 10 * 1000,
    refetchInterval: (query) => {
      const data = query.state.data;
      const rows = data?.data ?? [];
      const hasActive = rows.some(
        (r) => r.syncStatus === "pending" || r.syncStatus === "syncing"
      );
      return hasActive ? 4000 : false;
    },
  });
}

/**
 * Live-poll a single push_channels sync until it reaches a terminal state.
 */
export function usePushChannelsLiveStatus(
  clerkOrgId: string,
  syncId: string | null
) {
  return useQuery({
    queryKey: ["orderout-push-channels-live", clerkOrgId, syncId ?? "none"],
    queryFn: () =>
      syncId
        ? getPushChannelsLiveStatus(clerkOrgId, syncId)
        : Promise.resolve({ success: true, data: null, error: null }),
    enabled: !!clerkOrgId && !!syncId,
    staleTime: 2 * 1000,
    refetchInterval: (query) => {
      const data = query.state.data?.data;
      if (!data) return false;
      const active =
        data.syncStatus === "pending" || data.syncStatus === "syncing";
      return active ? 3000 : false;
    },
  });
}

/**
 * Merchant-scoped health of the push_menu webhook for a location: whether
 * OrderOut is delivering results, when the last one arrived, and any failing
 * callbacks in the dead-letter queue.
 */
export function useOrderOutWebhookHealth(
  clerkOrgId: string,
  locationId: string
) {
  return useQuery({
    queryKey: ["orderout-webhook-health", clerkOrgId, locationId],
    queryFn: () => getOrderOutWebhookHealth(clerkOrgId, locationId),
    enabled: !!clerkOrgId && !!locationId && locationId !== "all",
    staleTime: 30 * 1000,
  });
}
