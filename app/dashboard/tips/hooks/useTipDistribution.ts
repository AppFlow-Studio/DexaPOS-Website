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
  GetTodayTipSummary,
  GetTodayShifts,
  VoidTipDistribution,
  GetNeedsApprovalSessions,
  GetTipDistributionSessionById,
  ExportTipDistribution,
  GetSessionExports,
} from "@/app/dashboard/actions/tips";

// =====================================================
// DISTRIBUTION SESSION (by location + date + shift)
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
// DISTRIBUTION SESSION (by ID — for review screen)
// =====================================================

export function useTipDistributionSessionById(
  clerkOrgId: string | undefined,
  sessionId: string | undefined
) {
  return useQuery({
    queryKey: ["tip-distribution-session-by-id", clerkOrgId, sessionId],
    queryFn: async () => {
      if (!clerkOrgId || !sessionId) return null;
      const result = await GetTipDistributionSessionById(clerkOrgId, sessionId);
      if (!result.success) throw new Error(result.error || "Failed to fetch session");
      return result.data;
    },
    enabled: !!clerkOrgId && !!sessionId,
    staleTime: 10 * 1000,
  });
}

// =====================================================
// DISTRIBUTION HISTORY
// =====================================================

export function useTipDistributionHistory(
  clerkOrgId: string | undefined,
  locationId: string | undefined,
  limit?: number,
  statusFilter?: string[],
  dateFrom?: string,
  dateTo?: string
) {
  return useQuery({
    queryKey: ["tip-distribution-history", clerkOrgId, locationId, statusFilter, dateFrom, dateTo],
    queryFn: async () => {
      if (!clerkOrgId || !locationId) throw new Error("Missing required parameters");
      const result = await GetTipDistributionHistory(
        clerkOrgId,
        locationId,
        limit,
        statusFilter,
        dateFrom,
        dateTo
      );
      if (!result.success) throw new Error(result.error || "Failed to fetch history");
      return result.data || [];
    },
    enabled: !!clerkOrgId && !!locationId && locationId !== "all",
    staleTime: 30 * 1000,
  });
}

// =====================================================
// NEEDS APPROVAL SESSIONS
// =====================================================

export function useNeedsApprovalSessions(
  clerkOrgId: string | undefined,
  locationId: string | undefined
) {
  return useQuery({
    queryKey: ["needs-approval-sessions", clerkOrgId, locationId],
    queryFn: async () => {
      if (!clerkOrgId || !locationId) throw new Error("Missing required parameters");
      const result = await GetNeedsApprovalSessions(clerkOrgId, locationId);
      if (!result.success) throw new Error(result.error || "Failed to fetch sessions");
      return result.data || [];
    },
    enabled: !!clerkOrgId && !!locationId && locationId !== "all",
    staleTime: 30 * 1000,
  });
}

// =====================================================
// TODAY TAB — LIVE DATA (30s polling)
// =====================================================

export function useTodayTipSummary(
  clerkOrgId: string | undefined,
  locationId: string | undefined,
  date: string
) {
  return useQuery({
    queryKey: ["today-tip-summary", clerkOrgId, locationId, date],
    queryFn: async () => {
      if (!clerkOrgId || !locationId) throw new Error("Missing required parameters");
      const result = await GetTodayTipSummary(clerkOrgId, locationId, date);
      if (!result.success) throw new Error(result.error || "Failed to fetch today summary");
      return result.data;
    },
    enabled: !!clerkOrgId && !!locationId && locationId !== "all",
    staleTime: 10 * 1000,
    refetchInterval: 30 * 1000,
    refetchIntervalInBackground: false,
  });
}

export function useTodayShifts(
  clerkOrgId: string | undefined,
  locationId: string | undefined,
  date: string
) {
  return useQuery({
    queryKey: ["today-shifts", clerkOrgId, locationId, date],
    queryFn: async () => {
      if (!clerkOrgId || !locationId) throw new Error("Missing required parameters");
      const result = await GetTodayShifts(clerkOrgId, locationId, date);
      if (!result.success) throw new Error(result.error || "Failed to fetch today shifts");
      return result.data || [];
    },
    enabled: !!clerkOrgId && !!locationId && locationId !== "all",
    staleTime: 10 * 1000,
    refetchInterval: 30 * 1000,
    refetchIntervalInBackground: false,
  });
}

// =====================================================
// SESSION EXPORTS (payroll export history)
// =====================================================

export function useSessionExports(
  clerkOrgId: string | undefined,
  sessionId: string | undefined
) {
  return useQuery({
    queryKey: ["session-exports", clerkOrgId, sessionId],
    queryFn: async () => {
      if (!clerkOrgId || !sessionId) throw new Error("Missing required parameters");
      const result = await GetSessionExports(clerkOrgId, sessionId);
      if (!result.success) throw new Error(result.error || "Failed to fetch exports");
      return result.data || [];
    },
    enabled: !!clerkOrgId && !!sessionId,
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
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["tip-distribution-session", variables.clerkOrgId, variables.locationId, variables.sessionDate, variables.shiftPeriod],
          refetchType: "active",
        }),
        queryClient.invalidateQueries({
          queryKey: ["tip-distribution-history", variables.clerkOrgId, variables.locationId],
          refetchType: "active",
        }),
        queryClient.invalidateQueries({
          queryKey: ["needs-approval-sessions", variables.clerkOrgId, variables.locationId],
          refetchType: "active",
        }),
        queryClient.invalidateQueries({
          queryKey: ["today-tip-summary", variables.clerkOrgId, variables.locationId],
          refetchType: "active",
        }),
      ]);
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
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["tip-distribution-session"], refetchType: "active" }),
        queryClient.invalidateQueries({ queryKey: ["tip-distribution-session-by-id"], refetchType: "active" }),
        queryClient.invalidateQueries({ queryKey: ["tip-distribution-history"], refetchType: "active" }),
        queryClient.invalidateQueries({ queryKey: ["needs-approval-sessions"], refetchType: "active" }),
      ]);
      toast.success("Distribution approved successfully");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to approve distribution");
    },
  });
}

// =====================================================
// VOID DISTRIBUTION
// =====================================================

export function useVoidTipDistribution() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      clerkOrgId,
      sessionId,
      reason,
      voidedBy,
    }: {
      clerkOrgId: string;
      sessionId: string;
      reason: string;
      voidedBy: string | null;
    }) => {
      const result = await VoidTipDistribution(clerkOrgId, sessionId, reason, voidedBy);
      if (!result.success) throw new Error(result.error || "Failed to void distribution");
      return result;
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["tip-distribution-session-by-id"], refetchType: "active" }),
        queryClient.invalidateQueries({ queryKey: ["tip-distribution-session"], refetchType: "active" }),
        queryClient.invalidateQueries({ queryKey: ["needs-approval-sessions"], refetchType: "active" }),
        queryClient.invalidateQueries({ queryKey: ["tip-distribution-history"], refetchType: "active" }),
      ]);
      toast.success("Distribution voided");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to void distribution");
    },
  });
}

// =====================================================
// EXPORT DISTRIBUTION (via RPC + tip_payroll_exports)
// =====================================================

export function useExportTipDistributionV2() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      clerkOrgId,
      sessionId,
      destination,
      exportedBy,
    }: {
      clerkOrgId: string;
      sessionId: string;
      destination: "gusto" | "adp" | "csv";
      exportedBy: string | null;
    }) => {
      const result = await ExportTipDistribution(clerkOrgId, sessionId, destination, exportedBy);
      if (!result.success) throw new Error(result.error || "Failed to export distribution");
      return result.data;
    },
    onSuccess: async (_data, variables) => {
      await queryClient.invalidateQueries({
        queryKey: ["session-exports", variables.clerkOrgId, variables.sessionId],
        refetchType: "active",
      });
      toast.success(`Export to ${variables.destination} initiated`);
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to export distribution");
    },
  });
}

// =====================================================
// LEGACY EXPORT (kept for current page.tsx until PR4 cleanup)
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
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["tip-distribution-session"], refetchType: "active" }),
        queryClient.invalidateQueries({ queryKey: ["tip-distribution-session-by-id"], refetchType: "active" }),
      ]);
      toast.success("Adjustment saved");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to save adjustment");
    },
  });
}
