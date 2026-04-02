"use client";

import { useQuery } from "@tanstack/react-query";
import { useLocationStore, useIsAllLocations } from "@/stores/location-store";
import { useUserInfo } from "@/app/manage/hooks/useUserInfo.";
import {
  GetCashDrawerSessions,
  GetCashDrawerOperations,
  GetNoSaleOperations,
  GetCashDrawerSummaryStats,
  GetVarianceTrend,
} from "../actions/cash-drawer-analytics";

function useClerkOrgId() {
  const { data: userInfo } = useUserInfo();
  return userInfo?.members?.[0]?.organizations?.id ?? "";
}

export function useCashDrawerSessions(dateFrom: Date, dateTo: Date) {
  const clerkOrgId = useClerkOrgId();
  const { selectedLocationId } = useLocationStore();
  const isAllLocations = useIsAllLocations();
  const locationId = isAllLocations ? null : selectedLocationId;

  return useQuery({
    queryKey: [
      "cash-drawer-sessions",
      clerkOrgId,
      locationId,
      dateFrom.toISOString(),
      dateTo.toISOString(),
    ],
    queryFn: () => GetCashDrawerSessions(clerkOrgId, locationId, dateFrom, dateTo),
    enabled: !!clerkOrgId,
    staleTime: 2 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}

export function useCashDrawerOperations(sessionId: string | null) {
  return useQuery({
    queryKey: ["cash-drawer-operations", sessionId],
    queryFn: () => GetCashDrawerOperations(sessionId!),
    enabled: !!sessionId,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}

export function useNoSaleOperations(dateFrom: Date, dateTo: Date) {
  const clerkOrgId = useClerkOrgId();
  const { selectedLocationId } = useLocationStore();
  const isAllLocations = useIsAllLocations();
  const locationId = isAllLocations ? null : selectedLocationId;

  return useQuery({
    queryKey: [
      "cash-drawer-no-sales",
      clerkOrgId,
      locationId,
      dateFrom.toISOString(),
      dateTo.toISOString(),
    ],
    queryFn: () => GetNoSaleOperations(clerkOrgId, locationId, dateFrom, dateTo),
    enabled: !!clerkOrgId,
    staleTime: 2 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}

export function useCashDrawerSummaryStats(dateFrom: Date, dateTo: Date) {
  const clerkOrgId = useClerkOrgId();
  const { selectedLocationId } = useLocationStore();
  const isAllLocations = useIsAllLocations();
  const locationId = isAllLocations ? null : selectedLocationId;

  return useQuery({
    queryKey: [
      "cash-drawer-stats",
      clerkOrgId,
      locationId,
      dateFrom.toISOString(),
      dateTo.toISOString(),
    ],
    queryFn: () => GetCashDrawerSummaryStats(clerkOrgId, locationId, dateFrom, dateTo),
    enabled: !!clerkOrgId,
    staleTime: 2 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}

export function useVarianceTrend(dateFrom: Date, dateTo: Date) {
  const clerkOrgId = useClerkOrgId();
  const { selectedLocationId } = useLocationStore();
  const isAllLocations = useIsAllLocations();
  const locationId = isAllLocations ? null : selectedLocationId;

  return useQuery({
    queryKey: [
      "cash-drawer-variance-trend",
      clerkOrgId,
      locationId,
      dateFrom.toISOString(),
      dateTo.toISOString(),
    ],
    queryFn: () => GetVarianceTrend(clerkOrgId, locationId, dateFrom, dateTo),
    enabled: !!clerkOrgId,
    staleTime: 2 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}
