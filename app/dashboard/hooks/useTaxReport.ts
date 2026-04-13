"use client";

import { useQuery } from "@tanstack/react-query";
import { useLocationStore, useIsAllLocations } from "@/stores/location-store";
import { useUserInfo } from "@/app/manage/hooks/useUserInfo.";
import {
  GetTaxSummary,
  GetTaxBreakdown,
  GetTaxByCategory,
  GetTaxByLocation,
} from "../actions/tax-reporting";

function useClerkOrgId() {
  const { data: userInfo } = useUserInfo();
  return userInfo?.members?.[0]?.organizations?.id ?? "";
}

export function useTaxSummary(dateFrom: Date, dateTo: Date) {
  const clerkOrgId = useClerkOrgId();
  const { selectedLocationId } = useLocationStore();
  const isAllLocations = useIsAllLocations();
  const locationId = isAllLocations ? null : selectedLocationId;

  return useQuery({
    queryKey: [
      "tax-summary",
      clerkOrgId,
      locationId,
      dateFrom.toISOString(),
      dateTo.toISOString(),
    ],
    queryFn: () => GetTaxSummary(clerkOrgId, locationId, dateFrom, dateTo),
    enabled: !!clerkOrgId,
    staleTime: 2 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}

export function useTaxBreakdown(
  dateFrom: Date,
  dateTo: Date,
  page: number,
  pageSize: number,
  filters?: { orderType?: string; paymentMethod?: string },
  sortBy = "createdAt",
  sortDir: "asc" | "desc" = "desc"
) {
  const clerkOrgId = useClerkOrgId();
  const { selectedLocationId } = useLocationStore();
  const isAllLocations = useIsAllLocations();
  const locationId = isAllLocations ? null : selectedLocationId;

  return useQuery({
    queryKey: [
      "tax-breakdown",
      clerkOrgId,
      locationId,
      dateFrom.toISOString(),
      dateTo.toISOString(),
      page,
      pageSize,
      filters?.orderType ?? null,
      filters?.paymentMethod ?? null,
      sortBy,
      sortDir,
    ],
    queryFn: () =>
      GetTaxBreakdown(
        clerkOrgId,
        locationId,
        dateFrom,
        dateTo,
        page,
        pageSize,
        filters,
        sortBy,
        sortDir
      ),
    enabled: !!clerkOrgId,
    staleTime: 2 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}

export function useTaxByCategory(dateFrom: Date, dateTo: Date) {
  const clerkOrgId = useClerkOrgId();
  const { selectedLocationId } = useLocationStore();
  const isAllLocations = useIsAllLocations();
  const locationId = isAllLocations ? null : selectedLocationId;

  return useQuery({
    queryKey: [
      "tax-by-category",
      clerkOrgId,
      locationId,
      dateFrom.toISOString(),
      dateTo.toISOString(),
    ],
    queryFn: () => GetTaxByCategory(clerkOrgId, locationId, dateFrom, dateTo),
    enabled: !!clerkOrgId,
    staleTime: 2 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}

export function useTaxByLocation(dateFrom: Date, dateTo: Date) {
  const clerkOrgId = useClerkOrgId();

  return useQuery({
    queryKey: [
      "tax-by-location",
      clerkOrgId,
      dateFrom.toISOString(),
      dateTo.toISOString(),
    ],
    queryFn: () => GetTaxByLocation(clerkOrgId, dateFrom, dateTo),
    enabled: !!clerkOrgId,
    staleTime: 2 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}
