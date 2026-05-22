"use client";

import { useQuery } from "@tanstack/react-query";
import { useUserInfo } from "@/app/manage/hooks/useUserInfo.";
import { useLocationStore } from "@/stores/location-store";
import {
  GetCogsReport,
  GetFoodCostAnalysis,
  GetInventoryKpis,
  GetWasteAnalytics,
  CogsReport,
  FoodCostAnalysis,
  InventoryKpis,
  WasteAnalytics,
  DateRange,
} from "../../actions/inventory-reports";

// ============================================================================
// Phase 2 — Inventory Reporting & Analytics hooks
// Mirrors the org-context / query-key conventions in useWasteAndCounts.ts.
// ============================================================================

function useOrgContext() {
  const { data: userInfo } = useUserInfo();
  const { selectedLocationId } = useLocationStore();

  const clerkOrgId = userInfo?.members?.[0]?.organizations?.id || "";
  const locationId = selectedLocationId;
  const isGlobalView = selectedLocationId === "all" || !selectedLocationId;

  return { clerkOrgId, locationId, isGlobalView };
}

const scopedEnabled = (clerkOrgId: string, locationId: string | null) =>
  !!clerkOrgId && !!locationId && locationId !== "all";

// ----------------------------------------------------------------------------
// KPIs (Dashboard tab)
// ----------------------------------------------------------------------------

export function useInventoryKpis() {
  const { clerkOrgId, locationId } = useOrgContext();

  return useQuery<{ data?: InventoryKpis; error?: string }>({
    queryKey: ["inventory-kpis", clerkOrgId, locationId, "scoped"],
    queryFn: () => GetInventoryKpis(clerkOrgId, locationId),
    enabled: scopedEnabled(clerkOrgId, locationId),
  });
}

// ----------------------------------------------------------------------------
// COGS report (Reports tab)
// ----------------------------------------------------------------------------

export function useCogsReport(dateRange: DateRange) {
  const { clerkOrgId, locationId } = useOrgContext();

  return useQuery<{ data?: CogsReport; error?: string }>({
    queryKey: ["cogs-report", clerkOrgId, locationId, dateRange, "scoped"],
    queryFn: () => GetCogsReport(clerkOrgId, locationId, dateRange),
    enabled: scopedEnabled(clerkOrgId, locationId),
  });
}

// ----------------------------------------------------------------------------
// Food cost analysis (Reports tab)
// ----------------------------------------------------------------------------

export function useFoodCostAnalysis(dateRange: DateRange) {
  const { clerkOrgId, locationId } = useOrgContext();

  return useQuery<{ data?: FoodCostAnalysis; error?: string }>({
    queryKey: ["food-cost", clerkOrgId, locationId, dateRange, "scoped"],
    queryFn: () => GetFoodCostAnalysis(clerkOrgId, locationId, dateRange),
    enabled: scopedEnabled(clerkOrgId, locationId),
  });
}

// ----------------------------------------------------------------------------
// Waste analytics (Reports tab)
// ----------------------------------------------------------------------------

export function useWasteAnalytics(dateRange: DateRange) {
  const { clerkOrgId, locationId } = useOrgContext();

  return useQuery<{ data?: WasteAnalytics; error?: string }>({
    queryKey: ["waste-analytics", clerkOrgId, locationId, dateRange, "scoped"],
    queryFn: () => GetWasteAnalytics(clerkOrgId, locationId, dateRange),
    enabled: scopedEnabled(clerkOrgId, locationId),
  });
}
