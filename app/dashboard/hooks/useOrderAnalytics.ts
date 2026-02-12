"use client";

import { useQuery } from "@tanstack/react-query";
import { useLocationStore, useIsAllLocations } from "@/stores/location-store";
import { useUserInfo } from "@/app/manage/hooks/useUserInfo.";
import {
  GetOrderAnalytics,
  GetSalesByDateRange,
  GetBestSellingItems,
  GetOrderTypeBreakdown,
  GetOrderStats,
  GetVoidsReport,
  GetSalesByItemReport,
  GetCashFlowReport,
  GetFinancialKPIs,
  GetRevenueByCategoryReport,
  GetTransactionVolumeReport,
  OrderAnalytics,
  SalesByDateRange,
  BestSellingItem,
  OrderTypeBreakdown,
  OrderStats,
  FinancialKPIs,
  RevenueByCategoryReport,
  TransactionVolumeReport,
} from "../actions/order-analytics";
import {
  GetWaterfallReport,
  WaterfallReport,
} from "../actions/waterfall-report";

/**
 * Get clerk organization ID from user info
 */
function useClerkOrgId() {
  const { data: userInfo } = useUserInfo();
  return userInfo?.members?.[0]?.organizations?.id || "";
}

/**
 * Main analytics hook
 */
export function useOrderAnalytics(
  dateFrom: Date,
  dateTo: Date,
  orgIdOverride?: string,
  locationIdOverride?: string | null
) {
  const userOrgId = useClerkOrgId();
  const clerkOrgId = orgIdOverride || userOrgId;
  const { selectedLocationId } = useLocationStore();
  const isAllLocations = useIsAllLocations();

  const storeLocationId = isAllLocations ? null : selectedLocationId;
  const effectiveLocationId = locationIdOverride !== undefined ? locationIdOverride : storeLocationId;

  return useQuery<OrderAnalytics>({
    queryKey: [
      "order-analytics",
      clerkOrgId,
      effectiveLocationId,
      dateFrom.toISOString(),
      dateTo.toISOString(),
    ],
    queryFn: () =>
      GetOrderAnalytics(clerkOrgId, effectiveLocationId, dateFrom, dateTo),
    enabled: !!clerkOrgId,
    staleTime: 2 * 60 * 1000, // 2 minutes
    refetchOnWindowFocus: false,
  });
}

/**
 * Sales by date range hook
 */
export function useSalesByDateRange(
  dateFrom: Date,
  dateTo: Date,
  orgIdOverride?: string,
  locationIdOverride?: string | null
) {
  const userOrgId = useClerkOrgId();
  const clerkOrgId = orgIdOverride || userOrgId;
  const { selectedLocationId } = useLocationStore();
  const isAllLocations = useIsAllLocations();

  const storeLocationId = isAllLocations ? null : selectedLocationId;
  const effectiveLocationId = locationIdOverride !== undefined ? locationIdOverride : storeLocationId;

  return useQuery<SalesByDateRange[]>({
    queryKey: [
      "sales-by-date-range",
      clerkOrgId,
      effectiveLocationId,
      dateFrom.toISOString(),
      dateTo.toISOString(),
    ],
    queryFn: () =>
      GetSalesByDateRange(clerkOrgId, effectiveLocationId, dateFrom, dateTo),
    enabled: !!clerkOrgId,
    staleTime: 2 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}

/**
 * Best selling items hook
 */
export function useBestSellingItems(
  dateFrom: Date,
  dateTo: Date,
  limit: number = 10,
  orgIdOverride?: string,
  locationIdOverride?: string | null
) {
  const userOrgId = useClerkOrgId();
  const clerkOrgId = orgIdOverride || userOrgId;
  const { selectedLocationId } = useLocationStore();
  const isAllLocations = useIsAllLocations();

  const storeLocationId = isAllLocations ? null : selectedLocationId;
  const effectiveLocationId = locationIdOverride !== undefined ? locationIdOverride : storeLocationId;

  return useQuery<BestSellingItem[]>({
    queryKey: [
      "best-selling-items",
      clerkOrgId,
      effectiveLocationId,
      dateFrom.toISOString(),
      dateTo.toISOString(),
      limit,
    ],
    queryFn: () =>
      GetBestSellingItems(
        clerkOrgId,
        effectiveLocationId,
        dateFrom,
        dateTo,
        limit
      ),
    enabled: !!clerkOrgId,
    staleTime: 2 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}

/**
 * Order type breakdown hook
 */
export function useOrderTypeBreakdown(
  dateFrom: Date,
  dateTo: Date,
  orgIdOverride?: string,
  locationIdOverride?: string | null
) {
  const userOrgId = useClerkOrgId();
  const clerkOrgId = orgIdOverride || userOrgId;
  const { selectedLocationId } = useLocationStore();
  const isAllLocations = useIsAllLocations();

  const storeLocationId = isAllLocations ? null : selectedLocationId;
  const effectiveLocationId = locationIdOverride !== undefined ? locationIdOverride : storeLocationId;

  return useQuery<OrderTypeBreakdown>({
    queryKey: [
      "order-type-breakdown",
      clerkOrgId,
      effectiveLocationId,
      dateFrom.toISOString(),
      dateTo.toISOString(),
    ],
    queryFn: () =>
      GetOrderTypeBreakdown(clerkOrgId, effectiveLocationId, dateFrom, dateTo),
    enabled: !!clerkOrgId,
    staleTime: 2 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}

/**
 * Order stats hook
 */
export function useOrderStats(
  dateFrom: Date,
  dateTo: Date,
  orgIdOverride?: string,
  locationIdOverride?: string | null
) {
  const userOrgId = useClerkOrgId();
  const clerkOrgId = orgIdOverride || userOrgId;
  const { selectedLocationId } = useLocationStore();
  const isAllLocations = useIsAllLocations();

  const storeLocationId = isAllLocations ? null : selectedLocationId;
  const effectiveLocationId = locationIdOverride !== undefined ? locationIdOverride : storeLocationId;

  return useQuery<OrderStats>({
    queryKey: [
      "order-stats",
      clerkOrgId,
      effectiveLocationId,
      dateFrom.toISOString(),
      dateTo.toISOString(),
    ],
    queryFn: () =>
      GetOrderStats(clerkOrgId, effectiveLocationId, dateFrom, dateTo),
    enabled: !!clerkOrgId,
    staleTime: 2 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}

/**
 * Voids Report Hook
 */
export function useVoidsReport(
  dateFrom: Date,
  dateTo: Date,
  orgIdOverride?: string,
  locationIdOverride?: string | null
) {
  const userOrgId = useClerkOrgId();
  const clerkOrgId = orgIdOverride || userOrgId;
  const { selectedLocationId } = useLocationStore();
  const isAllLocations = useIsAllLocations();

  const storeLocationId = isAllLocations ? null : selectedLocationId;
  const effectiveLocationId = locationIdOverride !== undefined ? locationIdOverride : storeLocationId;

  return useQuery({
    queryKey: [
      "voids-report",
      clerkOrgId,
      effectiveLocationId,
      dateFrom.toISOString(),
      dateTo.toISOString(),
    ],
    queryFn: () =>
      GetVoidsReport(clerkOrgId, effectiveLocationId, dateFrom, dateTo),
    enabled: !!clerkOrgId,
    staleTime: 2 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}

/**
 * Sales By Item Report Hook
 */
export function useSalesByItemReport(
  dateFrom: Date,
  dateTo: Date,
  orgIdOverride?: string,
  locationIdOverride?: string | null
) {
  const userOrgId = useClerkOrgId();
  const clerkOrgId = orgIdOverride || userOrgId;
  const { selectedLocationId } = useLocationStore();
  const isAllLocations = useIsAllLocations();

  const storeLocationId = isAllLocations ? null : selectedLocationId;
  const effectiveLocationId = locationIdOverride !== undefined ? locationIdOverride : storeLocationId;

  return useQuery({
    queryKey: [
      "sales-by-item-report",
      clerkOrgId,
      effectiveLocationId,
      dateFrom.toISOString(),
      dateTo.toISOString(),
    ],
    queryFn: () =>
      GetSalesByItemReport(clerkOrgId, effectiveLocationId, dateFrom, dateTo),
    enabled: !!clerkOrgId,
    staleTime: 2 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}

/**
 * Cash Flow Report Hook
 */
export function useCashFlowReport(
  dateFrom: Date,
  dateTo: Date,
  orgIdOverride?: string,
  locationIdOverride?: string | null
) {
  const userOrgId = useClerkOrgId();
  const clerkOrgId = orgIdOverride || userOrgId;
  const { selectedLocationId } = useLocationStore();
  const isAllLocations = useIsAllLocations();

  const storeLocationId = isAllLocations ? null : selectedLocationId;
  const effectiveLocationId = locationIdOverride !== undefined ? locationIdOverride : storeLocationId;

  return useQuery({
    queryKey: [
      "cash-flow-report",
      clerkOrgId,
      effectiveLocationId,
      dateFrom.toISOString(),
      dateTo.toISOString(),
    ],
    queryFn: () =>
      GetCashFlowReport(clerkOrgId, effectiveLocationId, dateFrom, dateTo),
    enabled: !!clerkOrgId,
    staleTime: 2 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}
/**
 * Financial KPIs Hook
 */
export function useFinancialKPIs(
  dateFrom: Date,
  dateTo: Date,
  orgIdOverride?: string,
  locationIdOverride?: string | null
) {
  const userOrgId = useClerkOrgId();
  const clerkOrgId = orgIdOverride || userOrgId;
  const { selectedLocationId } = useLocationStore();
  const isAllLocations = useIsAllLocations();

  const storeLocationId = isAllLocations ? null : selectedLocationId;
  const effectiveLocationId = locationIdOverride !== undefined ? locationIdOverride : storeLocationId;

  return useQuery({
    queryKey: [
      "financial-kpis",
      clerkOrgId,
      effectiveLocationId,
      dateFrom.toISOString(),
      dateTo.toISOString(),
    ],
    queryFn: () =>
      GetFinancialKPIs(clerkOrgId!, effectiveLocationId, dateFrom, dateTo),
    enabled: !!clerkOrgId,
    staleTime: 2 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}

/**
 * Waterfall Report Hook
 */
export function useWaterfallReport(
  dateFrom: Date,
  dateTo: Date,
  orgIdOverride?: string,
  locationIdOverride?: string | null
) {
  const userOrgId = useClerkOrgId();
  const clerkOrgId = orgIdOverride || userOrgId;
  const { selectedLocationId } = useLocationStore();
  const isAllLocations = useIsAllLocations();

  const storeLocationId = isAllLocations ? null : selectedLocationId;
  const effectiveLocationId = locationIdOverride !== undefined ? locationIdOverride : storeLocationId;

  return useQuery<WaterfallReport>({
    queryKey: [
      "waterfall-report",
      clerkOrgId,
      effectiveLocationId,
      dateFrom.toISOString(),
      dateTo.toISOString(),
    ],
    queryFn: () =>
      GetWaterfallReport(clerkOrgId!, effectiveLocationId, dateFrom, dateTo),
    enabled: !!clerkOrgId,
    staleTime: 2 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}

/**
 * Revenue By Category Report Hook — powers the Tree Map component
 */
export function useRevenueByCategoryReport(
  dateFrom: Date,
  dateTo: Date,
  orgIdOverride?: string,
  locationIdOverride?: string | null
) {
  const userOrgId = useClerkOrgId();
  const clerkOrgId = orgIdOverride || userOrgId;
  const { selectedLocationId } = useLocationStore();
  const isAllLocations = useIsAllLocations();

  const storeLocationId = isAllLocations ? null : selectedLocationId;
  const effectiveLocationId =
    locationIdOverride !== undefined ? locationIdOverride : storeLocationId;

  return useQuery<RevenueByCategoryReport>({
    queryKey: [
      "revenue-by-category-report",
      clerkOrgId,
      effectiveLocationId,
      dateFrom.toISOString(),
      dateTo.toISOString(),
    ],
    queryFn: () =>
      GetRevenueByCategoryReport(
        clerkOrgId,
        effectiveLocationId,
        dateFrom,
        dateTo
      ),
    enabled: !!clerkOrgId,
    staleTime: 2 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}

/**
 * Transaction Volume Report Hook — Credits vs Debits by payment type
 */
export function useTransactionVolumeReport(
  dateFrom: Date,
  dateTo: Date,
  orgIdOverride?: string,
  locationIdOverride?: string | null
) {
  const userOrgId = useClerkOrgId();
  const clerkOrgId = orgIdOverride || userOrgId;
  const { selectedLocationId } = useLocationStore();
  const isAllLocations = useIsAllLocations();

  const storeLocationId = isAllLocations ? null : selectedLocationId;
  const effectiveLocationId =
    locationIdOverride !== undefined ? locationIdOverride : storeLocationId;

  return useQuery<TransactionVolumeReport>({
    queryKey: [
      "transaction-volume-report",
      clerkOrgId,
      effectiveLocationId,
      dateFrom.toISOString(),
      dateTo.toISOString(),
    ],
    queryFn: () =>
      GetTransactionVolumeReport(
        clerkOrgId,
        effectiveLocationId,
        dateFrom,
        dateTo
      ),
    enabled: !!clerkOrgId,
    staleTime: 2 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}
