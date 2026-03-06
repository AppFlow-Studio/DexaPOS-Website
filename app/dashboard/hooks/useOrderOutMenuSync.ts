"use client";

import { useQuery } from "@tanstack/react-query";
import {
  getOrderOutMenuSyncStatus,
  checkMenuPayloadDiff,
} from "@/app/dashboard/actions/orderout";

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
