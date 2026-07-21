"use client";

import { useQuery, type QueryClient } from "@tanstack/react-query";
import {
  getOrderOutMenuSyncStatus,
  checkMenuPayloadDiff,
} from "@/app/dashboard/actions/orderout";

/**
 * Invalidate all OrderOut sync/diff caches after any menu-payload-affecting edit,
 * so the "out of sync" badge reflects the change immediately instead of serving the
 * pre-edit cached diff until staleTime lapses. Prefix (partial) match is intentional —
 * a base-price edit can affect the payload across multiple locations/menus.
 * Mirrors the key set invalidated by usePublishOnlineMenu (useOrderOutStatus.ts).
 */
export function invalidateOrderOutSync(queryClient: QueryClient) {
  for (const key of [
    ["orderout-payload-diff"],
    ["orderout-menu-sync"],
    ["orderout-online-menu"],
    ["orderout-menu-link"],
    ["orderout-synced-menus"],
  ]) {
    queryClient.invalidateQueries({ queryKey: key });
  }
}

/**
 * Get the OrderOut menu sync status for a location, optionally filtered by menuId
 */
export function useOrderOutMenuSync(
  clerkOrgId: string,
  locationId: string,
  menuId?: string
) {
  return useQuery({
    queryKey: ["orderout-menu-sync", clerkOrgId, locationId, menuId ?? "all"],
    queryFn: () => getOrderOutMenuSyncStatus(clerkOrgId, locationId, menuId),
    enabled: !!clerkOrgId && !!locationId && locationId !== "all",
    staleTime: 30 * 1000,
  });
}

/**
 * Check if the current menu payload differs from the last synced snapshot
 */
export function useMenuPayloadDiff(
  clerkOrgId: string,
  locationId: string,
  menuId: string
) {
  return useQuery({
    queryKey: ["orderout-payload-diff", clerkOrgId, locationId, menuId],
    queryFn: () => checkMenuPayloadDiff(clerkOrgId, locationId, menuId),
    enabled:
      !!clerkOrgId && !!locationId && locationId !== "all" && !!menuId,
    staleTime: 30_000,
  });
}
