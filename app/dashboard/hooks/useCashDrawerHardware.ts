"use client";

import { useQuery } from "@tanstack/react-query";
import { useLocationStore, useIsAllLocations } from "@/stores/location-store";
import { useUserInfo } from "@/app/manage/hooks/useUserInfo.";
import {
  GetCashDrawerHardwareStatus,
  GetCashDrawerKickEvents,
  GetKickHealthSummary,
  GetMovementKickCorrelation,
  type KickOutcome,
} from "../actions/cash-drawer-hardware";

function useClerkOrgId() {
  const { data: userInfo } = useUserInfo();
  return userInfo?.members?.[0]?.organizations?.id ?? "";
}

function useScopedLocationId() {
  const { selectedLocationId } = useLocationStore();
  const isAllLocations = useIsAllLocations();
  return isAllLocations ? null : selectedLocationId;
}

export function useCashDrawerHardwareStatus() {
  const clerkOrgId = useClerkOrgId();
  const locationId = useScopedLocationId();

  return useQuery({
    queryKey: ["cash-drawer-hardware-status", clerkOrgId, locationId],
    queryFn: () => GetCashDrawerHardwareStatus(clerkOrgId, locationId),
    enabled: !!clerkOrgId,
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
  });
}

export function useCashDrawerKickEvents(
  dateFrom: Date,
  dateTo: Date,
  opts?: { drawerId?: string | null; outcome?: KickOutcome | null }
) {
  const clerkOrgId = useClerkOrgId();
  const locationId = useScopedLocationId();

  return useQuery({
    queryKey: [
      "cash-drawer-kick-events",
      clerkOrgId,
      locationId,
      dateFrom.toISOString(),
      dateTo.toISOString(),
      opts?.drawerId ?? null,
      opts?.outcome ?? null,
    ],
    queryFn: () =>
      GetCashDrawerKickEvents(clerkOrgId, locationId, dateFrom, dateTo, {
        drawerId: opts?.drawerId ?? null,
        outcome: opts?.outcome ?? null,
      }),
    enabled: !!clerkOrgId,
    staleTime: 2 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}

export function useKickHealthSummary(dateFrom: Date, dateTo: Date) {
  const clerkOrgId = useClerkOrgId();
  const locationId = useScopedLocationId();

  return useQuery({
    queryKey: [
      "cash-drawer-kick-summary",
      clerkOrgId,
      locationId,
      dateFrom.toISOString(),
      dateTo.toISOString(),
    ],
    queryFn: () => GetKickHealthSummary(clerkOrgId, locationId, dateFrom, dateTo),
    enabled: !!clerkOrgId,
    staleTime: 2 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}

export function useMovementKickCorrelation(dateFrom: Date, dateTo: Date) {
  const clerkOrgId = useClerkOrgId();
  const locationId = useScopedLocationId();

  return useQuery({
    queryKey: [
      "cash-drawer-movement-correlation",
      clerkOrgId,
      locationId,
      dateFrom.toISOString(),
      dateTo.toISOString(),
    ],
    queryFn: () => GetMovementKickCorrelation(clerkOrgId, locationId, dateFrom, dateTo),
    enabled: !!clerkOrgId,
    staleTime: 2 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}
