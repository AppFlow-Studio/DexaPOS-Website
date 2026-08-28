"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useLocationStore, useIsAllLocations } from "@/stores/location-store";
import { useUserInfo } from "@/app/manage/hooks/useUserInfo.";
import {
  GetOrderOverviewRecords,
  GetOrders,
  GetOrdersPage,
} from "../actions/order";
import {
  OrderFilters,
  OrderOverviewRecord,
  OrderPageOptions,
  OrderResponse,
} from "@/types/order-management";
import type { PaginatedResult } from "@/types/pagination";

/**
 * Get clerk organization ID from user info.
 * Must use clerk_org_id (Clerk org ID) for GetOrders merchant lookup, not organizations.id.
 */
function useClerkOrgId() {
  const { data: userInfo } = useUserInfo();
  return (
    userInfo?.members?.[0]?.organizations?.clerk_org_id ||
    userInfo?.members?.[0]?.organizations?.id ||
    ""
  );
}

/**
 * Get orders scoped to the current location selection
 * - All Locations: returns all merchant orders
 * - Specific Location: returns orders for that location
 */
export function useOrders(
  filters?: OrderFilters,
  orgIdOverride?: string,
  locationIdOverride?: string | null
) {
  const userOrgId = useClerkOrgId();
  const clerkOrgId = orgIdOverride || userOrgId;
  const { selectedLocationId } = useLocationStore();
  const isAllLocations = useIsAllLocations();

  // Determine effective location ID
  const storeLocationId = isAllLocations ? "all" : selectedLocationId;
  const effectiveLocationId =
    locationIdOverride !== undefined ? locationIdOverride : storeLocationId;

  return useQuery<OrderResponse[]>({
    queryKey: ["orders", clerkOrgId, effectiveLocationId, filters],
    queryFn: () =>
      GetOrders(
        clerkOrgId,
        effectiveLocationId === "all" ? null : effectiveLocationId,
        filters
      ) as Promise<OrderResponse[]>,
    enabled: !!clerkOrgId,
    staleTime: 5000, // 5 seconds
  });
}

export function useOrdersPage(
  filters: OrderFilters | undefined,
  pagination: OrderPageOptions,
  orgIdOverride?: string,
  locationIdOverride?: string | null,
) {
  const userOrgId = useClerkOrgId();
  const clerkOrgId = orgIdOverride || userOrgId;
  const { selectedLocationId } = useLocationStore();
  const isAllLocations = useIsAllLocations();
  const storeLocationId = isAllLocations ? "all" : selectedLocationId;
  const effectiveLocationId =
    locationIdOverride !== undefined ? locationIdOverride : storeLocationId;

  return useQuery<PaginatedResult<OrderResponse>>({
    queryKey: [
      "orders",
      "page",
      clerkOrgId,
      effectiveLocationId,
      filters,
      pagination,
    ],
    queryFn: () =>
      GetOrdersPage(
        clerkOrgId,
        effectiveLocationId === "all" ? null : effectiveLocationId,
        filters,
        pagination,
      ),
    enabled: !!clerkOrgId,
    staleTime: 5000,
    placeholderData: keepPreviousData,
  });
}

export function useOrderOverview(dateRange?: OrderFilters["dateRange"]) {
  const clerkOrgId = useClerkOrgId();
  const { selectedLocationId } = useLocationStore();
  const isAllLocations = useIsAllLocations();
  const effectiveLocationId = isAllLocations ? null : selectedLocationId;

  return useQuery<OrderOverviewRecord[]>({
    queryKey: ["orders", "overview", clerkOrgId, effectiveLocationId, dateRange],
    queryFn: () =>
      GetOrderOverviewRecords(clerkOrgId, effectiveLocationId, dateRange),
    enabled: !!clerkOrgId,
    staleTime: 5000,
  });
}
