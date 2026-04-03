"use client";

import { useQuery } from "@tanstack/react-query";
import { adminKeys } from "@/lib/queries/admin-keys";
import {
  GetHQCashDrawerSessions,
  GetHQCashDrawerOperations,
  GetHQNoSaleOperations,
  GetHQCashDrawerSummaryStats,
  GetHQVarianceTrend,
  type HQCashDrawerFilters,
} from "@/app/manage/actions/hq-platform/cash-drawer-analytics";

export function useHQCashDrawerSessions(
  filters: HQCashDrawerFilters,
  dateFrom: Date,
  dateTo: Date
) {
  const dateRange = { from: dateFrom.toISOString(), to: dateTo.toISOString() };
  return useQuery({
    queryKey: adminKeys.platformCashDrawerSessions(filters, dateRange),
    queryFn: () => GetHQCashDrawerSessions(filters, dateFrom, dateTo),
    staleTime: 2 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}

export function useHQCashDrawerOperations(sessionId: string | null) {
  return useQuery({
    queryKey: adminKeys.platformCashDrawerOperations(sessionId ?? ""),
    queryFn: () => GetHQCashDrawerOperations(sessionId!),
    enabled: !!sessionId,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}

export function useHQNoSaleOperations(
  filters: HQCashDrawerFilters,
  dateFrom: Date,
  dateTo: Date
) {
  const dateRange = { from: dateFrom.toISOString(), to: dateTo.toISOString() };
  return useQuery({
    queryKey: adminKeys.platformCashDrawerNoSales(filters, dateRange),
    queryFn: () => GetHQNoSaleOperations(filters, dateFrom, dateTo),
    staleTime: 2 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}

export function useHQCashDrawerSummaryStats(
  filters: HQCashDrawerFilters,
  dateFrom: Date,
  dateTo: Date
) {
  const dateRange = { from: dateFrom.toISOString(), to: dateTo.toISOString() };
  return useQuery({
    queryKey: adminKeys.platformCashDrawerStats(filters, dateRange),
    queryFn: () => GetHQCashDrawerSummaryStats(filters, dateFrom, dateTo),
    staleTime: 2 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}

export function useHQVarianceTrend(
  filters: HQCashDrawerFilters,
  dateFrom: Date,
  dateTo: Date
) {
  const dateRange = { from: dateFrom.toISOString(), to: dateTo.toISOString() };
  return useQuery({
    queryKey: adminKeys.platformCashDrawerVarianceTrend(filters, dateRange),
    queryFn: () => GetHQVarianceTrend(filters, dateFrom, dateTo),
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}
