"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  CalculateTipDistribution,
  ApproveTipDistribution,
  GetTipDistributionSession,
  GetTipDistributionHistory,
  UpdateManualAdjustment,
  MarkTipDistributionExported,
  GetMyTipHistory,
} from "@/app/dashboard/actions/tips";

// =====================================================
// DISTRIBUTION SESSION
// =====================================================

export function useTipDistributionSession(
  clerkOrgId: string | undefined,
  locationId: string | undefined,
  sessionDate: string | undefined,
  shiftPeriod: string = "full_day"
) {
  return useQuery({
    queryKey: ["tip-distribution-session", clerkOrgId, locationId, sessionDate, shiftPeriod],
    queryFn: async () => {
      if (!clerkOrgId || !locationId || !sessionDate) {
        return null;
      }
      const result = await GetTipDistributionSession(
        clerkOrgId,
        locationId,
        sessionDate,
        shiftPeriod
      );
      if (!result.success) throw new Error(result.error || "Failed to fetch distribution session");
      return result.data;
    },
    enabled: !!clerkOrgId && !!locationId && !!sessionDate && locationId !== "all",
    staleTime: 10 * 1000,
  });
}

// =====================================================
// DISTRIBUTION HISTORY
// =====================================================

export function useTipDistributionHistory(
  clerkOrgId: string | undefined,
  locationId: string | undefined
) {
  return useQuery({
    queryKey: ["tip-distribution-history", clerkOrgId, locationId],
    queryFn: async () => {
      if (!clerkOrgId || !locationId) throw new Error("Missing required parameters");
      const result = await GetTipDistributionHistory(clerkOrgId, locationId);
      if (!result.success) throw new Error(result.error || "Failed to fetch history");
      return result.data || [];
    },
    enabled: !!clerkOrgId && !!locationId && locationId !== "all",
    staleTime: 30 * 1000,
  });
}

// =====================================================
// CALCULATE TIPS
// =====================================================

export function useCalculateTipDistribution() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      clerkOrgId,
      locationId,
      sessionDate,
      shiftPeriod,
      staffProfileId,
    }: {
      clerkOrgId: string;
      locationId: string;
      sessionDate: string;
      shiftPeriod: string;
      staffProfileId: string | null;
    }) => {
      const result = await CalculateTipDistribution(
        clerkOrgId,
        locationId,
        sessionDate,
        shiftPeriod,
        staffProfileId
      );
      if (!result.success) throw new Error(result.error || "Failed to calculate tips");
      return result.data;
    },
    onSuccess: async (_data, variables) => {
      await queryClient.invalidateQueries({
        queryKey: [
          "tip-distribution-session",
          variables.clerkOrgId,
          variables.locationId,
          variables.sessionDate,
          variables.shiftPeriod,
        ],
        refetchType: "active",
      });
      await queryClient.invalidateQueries({
        queryKey: ["tip-distribution-history", variables.clerkOrgId, variables.locationId],
        refetchType: "active",
      });
      toast.success("Tips calculated successfully");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to calculate tips");
    },
  });
}

// =====================================================
// APPROVE DISTRIBUTION
// =====================================================

export function useApproveTipDistribution() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      clerkOrgId,
      sessionId,
      staffProfileId,
    }: {
      clerkOrgId: string;
      sessionId: string;
      staffProfileId: string | null;
    }) => {
      const result = await ApproveTipDistribution(clerkOrgId, sessionId, staffProfileId);
      if (!result.success) throw new Error(result.error || "Failed to approve distribution");
      return result;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["tip-distribution-session"],
        refetchType: "active",
      });
      await queryClient.invalidateQueries({
        queryKey: ["tip-distribution-history"],
        refetchType: "active",
      });
      toast.success("Distribution approved successfully");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to approve distribution");
    },
  });
}

// =====================================================
// MARK AS EXPORTED
// =====================================================

export function useExportTipDistribution() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      clerkOrgId,
      sessionId,
      exportFormat,
    }: {
      clerkOrgId: string;
      sessionId: string;
      exportFormat: "csv" | "pdf";
    }) => {
      const result = await MarkTipDistributionExported(clerkOrgId, sessionId, exportFormat);
      if (!result.success) throw new Error(result.error || "Failed to mark as exported");
      return result;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["tip-distribution-session"],
        refetchType: "active",
      });
      await queryClient.invalidateQueries({
        queryKey: ["tip-distribution-history"],
        refetchType: "active",
      });
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to record export");
    },
  });
}

// =====================================================
// MY TIP HISTORY (Employee Self-Service)
// =====================================================

export function useMyTipHistory(
  clerkOrgId: string | undefined,
  locationId: string | undefined,
  limitDays: number = 30
) {
  return useQuery({
    queryKey: ["my-tip-history", clerkOrgId, locationId, limitDays],
    queryFn: async () => {
      if (!clerkOrgId) throw new Error("Missing clerkOrgId");
      const result = await GetMyTipHistory(
        clerkOrgId,
        locationId !== "all" ? locationId : undefined,
        limitDays
      );
      if (!result.success) throw new Error(result.error || "Failed to fetch tip history");
      return result.data || [];
    },
    enabled: !!clerkOrgId,
    staleTime: 60 * 1000,
  });
}

// =====================================================
// MANUAL ADJUSTMENT
// =====================================================

export function useManualAdjustment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      clerkOrgId,
      detailId,
      amount,
      reason,
    }: {
      clerkOrgId: string;
      detailId: string;
      amount: number;
      reason?: string;
    }) => {
      const result = await UpdateManualAdjustment(clerkOrgId, detailId, amount, reason);
      if (!result.success) throw new Error(result.error || "Failed to update adjustment");
      return result;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["tip-distribution-session"],
        refetchType: "active",
      });
      toast.success("Adjustment saved");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to save adjustment");
    },
  });
}
