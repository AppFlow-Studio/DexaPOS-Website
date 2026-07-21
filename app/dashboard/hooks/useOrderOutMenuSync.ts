"use client";

import { useEffect, useRef } from "react";
import { useQuery, type QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
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
 * Poll the OrderOut sync status on an interval and toast when a NEW sync fails.
 *
 * Because 86ing now propagates to OrderOut asynchronously (after() + the DB
 * resync trigger), a delivery-app push can fail out-of-band with no direct
 * mutation error. This surfaces those failures: it watches getOrderOutMenuSyncStatus,
 * and fires one toast.error per failed sync record it hasn't already reported.
 * A failure that predates mount is suppressed (we only alert on failures that
 * happen while the user is on the page). No UI — call it once near the top of a
 * menu/OrderOut screen.
 */
export function useOrderOutSyncAlerts(
  clerkOrgId: string | null | undefined,
  locationId: string | null | undefined,
) {
  const alertedFor = useRef<string | null>(null);
  const mounted = useRef(false);

  const { data } = useQuery({
    queryKey: ["orderout-sync-alerts", clerkOrgId ?? null, locationId ?? null],
    queryFn: () => getOrderOutMenuSyncStatus(clerkOrgId!, locationId!),
    enabled: !!clerkOrgId && !!locationId && locationId !== "all",
    refetchInterval: 20_000,
    refetchIntervalInBackground: false,
    staleTime: 15_000,
  });

  useEffect(() => {
    const last = data?.data?.lastSync;
    if (!last) return;

    // First observation: adopt current state without alerting on a stale failure.
    if (!mounted.current) {
      mounted.current = true;
      if (last.status === "failed") alertedFor.current = last.id;
      return;
    }

    if (last.status === "failed" && alertedFor.current !== last.id) {
      alertedFor.current = last.id;
      toast.error(
        last.errorDetails
          ? `Delivery-app sync failed: ${last.errorDetails}`
          : "A menu change failed to sync to your delivery apps. Open the OrderOut tab to retry.",
      );
    }
  }, [data]);
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
