"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  GetTimesheets,
  GetTimesheetResources,
  GetShiftById,
  UpdateShiftStatus,
  AdjustShiftTimes,
  DeleteShift,
  BulkApproveShifts,
} from "@/app/dashboard/actions/timesheets";
import { StaffShift } from "@/types/staff";
import { DateRange } from "react-day-picker";
import { toast } from "sonner";

// ============================================================================
// TYPES
// ============================================================================

interface TimesheetFilters {
  clerkOrgId: string;
  dateRange: DateRange | undefined;
  locationIds: string[];
  employeeIds: string[];
}

// ============================================================================
// GET TIMESHEETS
// ============================================================================

export function useTimesheets(filters: TimesheetFilters) {
  const hasDateRange = !!filters.dateRange?.from && !!filters.clerkOrgId;

  return useQuery({
    queryKey: ["timesheets", filters],
    queryFn: async () => {
      if (!filters.dateRange?.from || !filters.clerkOrgId) return [];

      const dateFrom = filters.dateRange.from.toISOString();
      const dateTo =
        filters.dateRange.to?.toISOString() ||
        filters.dateRange.from.toISOString();

      const result = await GetTimesheets(filters.clerkOrgId, {
        dateFrom,
        dateTo,
        locationIds:
          filters.locationIds.length > 0 ? filters.locationIds : undefined,
        employeeIds:
          filters.employeeIds.length > 0 ? filters.employeeIds : undefined,
      });

      if (!result.success) {
        throw new Error(result.error);
      }

      return result.data;
    },
    enabled: hasDateRange,
  });
}

// ============================================================================
// GET TIMESHEET RESOURCES (for filters)
// ============================================================================

export function useTimesheetResources(clerkOrgId: string) {
  return useQuery({
    queryKey: ["timesheet-resources", clerkOrgId],
    queryFn: async () => {
      const result = await GetTimesheetResources(clerkOrgId);

      if (!result.success) {
        throw new Error(result.error);
      }

      return result.data;
    },
    enabled: !!clerkOrgId,
  });
}

// ============================================================================
// GET SINGLE SHIFT
// ============================================================================

export function useShift(clerkOrgId: string, shiftId: string | null) {
  return useQuery({
    queryKey: ["shift", clerkOrgId, shiftId],
    queryFn: async () => {
      if (!shiftId || !clerkOrgId) return null;

      const result = await GetShiftById(clerkOrgId, shiftId);

      if (!result.success) {
        throw new Error(result.error);
      }

      return result.data;
    },
    enabled: !!shiftId && !!clerkOrgId,
  });
}

// ============================================================================
// UPDATE SHIFT STATUS
// ============================================================================

export function useUpdateShiftStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      clerkOrgId,
      shiftId,
      status,
    }: {
      clerkOrgId: string;
      shiftId: string;
      status: "active" | "completed" | "approved" | "rejected";
    }) => {
      return UpdateShiftStatus(clerkOrgId, shiftId, status);
    },
    onSuccess: (result) => {
      if (result.success) {
        toast.success("Shift status updated");
        queryClient.invalidateQueries({ queryKey: ["timesheets"] });
        queryClient.invalidateQueries({ queryKey: ["shift", result.data.id] });
      } else {
        toast.error(result.error || "Failed to update shift status");
      }
    },
    onError: () => {
      toast.error("Failed to update shift status");
    },
  });
}

// ============================================================================
// ADJUST SHIFT TIMES
// ============================================================================

export function useAdjustShiftTimes() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      clerkOrgId,
      shiftId,
      clockInTime,
      clockOutTime,
    }: {
      clerkOrgId: string;
      shiftId: string;
      clockInTime: string;
      clockOutTime: string | null;
    }) => {
      return AdjustShiftTimes(clerkOrgId, shiftId, clockInTime, clockOutTime);
    },
    onSuccess: (result) => {
      if (result.success) {
        toast.success("Shift times adjusted");
        queryClient.invalidateQueries({ queryKey: ["timesheets"] });
        queryClient.invalidateQueries({ queryKey: ["shift", result.data.id] });
      } else {
        toast.error(result.error || "Failed to adjust shift times");
      }
    },
    onError: () => {
      toast.error("Failed to adjust shift times");
    },
  });
}

// ============================================================================
// DELETE SHIFT
// ============================================================================

export function useDeleteShift() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      clerkOrgId,
      shiftId,
    }: {
      clerkOrgId: string;
      shiftId: string;
    }) => {
      return DeleteShift(clerkOrgId, shiftId);
    },
    onSuccess: (result) => {
      if (result.success) {
        toast.success("Shift deleted");
        queryClient.invalidateQueries({ queryKey: ["timesheets"] });
      } else {
        toast.error(result.error || "Failed to delete shift");
      }
    },
    onError: () => {
      toast.error("Failed to delete shift");
    },
  });
}

// ============================================================================
// BULK APPROVE SHIFTS
// ============================================================================

export function useBulkApproveShifts() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      clerkOrgId,
      shiftIds,
    }: {
      clerkOrgId: string;
      shiftIds: string[];
    }) => {
      return BulkApproveShifts(clerkOrgId, shiftIds);
    },
    onSuccess: (result) => {
      if (result.success) {
        toast.success(`${result.data} shift(s) approved`);
        queryClient.invalidateQueries({ queryKey: ["timesheets"] });
      } else {
        toast.error(result.error || "Failed to approve shifts");
      }
    },
    onError: () => {
      toast.error("Failed to approve shifts");
    },
  });
}
