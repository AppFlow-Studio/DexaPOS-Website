"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  useLocationStore,
  useIsAllLocations,
  useSelectedLocation,
} from "@/stores/location-store";
import { useUserInfo } from "@/app/manage/hooks/useUserInfo.";
import {
  GetSchedules,
  GetSchedule,
  CreateSchedule,
  UpdateSchedule,
  UpdateScheduleWithTimeSlots,
  DeleteSchedule,
  ToggleScheduleActive,
  GetCategorySchedules,
  AssignScheduleToCategory,
  RemoveScheduleFromCategory,
} from "../actions/schedules";
import {
  UpsertLocationScheduleOverride,
  DeleteLocationScheduleOverride,
  ScheduleOverrideData,
} from "../actions/location-schedule-overrides";
import { toast } from "sonner";

// ============================================================================
// Helper Hooks
// ============================================================================

function useClerkOrgId() {
  const { data: userInfo } = useUserInfo();
  return userInfo?.members?.[0]?.organizations?.id || "";
}

function useMerchantId() {
  const { data: userInfo } = useUserInfo();
  return userInfo?.members?.[0]?.organizations?.merchants?.id || "";
}

function useEffectiveLocationId() {
  const { selectedLocationId } = useLocationStore();
  const isAllLocations = useIsAllLocations();
  return isAllLocations ? "all" : selectedLocationId;
}

// ============================================================================
// Query Hooks
// ============================================================================

/**
 * Get schedules scoped to current location selection
 * - All Locations: returns all schedules (global + all location-specific)
 * - Specific Location: returns global schedules + that location's specific schedules with overrides
 */
export function useLocationScopedSchedules() {
  const clerkOrgId = useClerkOrgId();
  const locationId = useEffectiveLocationId();

  return useQuery({
    queryKey: ["schedules", clerkOrgId, locationId, "scoped"],
    queryFn: () => GetSchedules(clerkOrgId, locationId),
    enabled: !!clerkOrgId,
    staleTime: 30000,
  });
}

/**
 * Get single schedule with location context
 */
export function useScheduleWithLocationContext(scheduleId: string) {
  const locationId = useEffectiveLocationId();

  return useQuery({
    queryKey: ["schedule", scheduleId, locationId, "scoped"],
    queryFn: () => GetSchedule(scheduleId),
    enabled: !!scheduleId,
    staleTime: 30000,
  });
}

/**
 * Get category schedules with location context
 */
export function useCategorySchedules(categoryId: string) {
  const locationId = useEffectiveLocationId();

  return useQuery({
    queryKey: ["category-schedules", categoryId, locationId, "scoped"],
    queryFn: () => GetCategorySchedules(categoryId, locationId),
    enabled: !!categoryId,
    staleTime: 30000,
  });
}

// ============================================================================
// Mutation Hooks - Smart Routing
// ============================================================================

/**
 * Create schedule - routes based on location context
 * - All Locations: creates global schedule
 * - Specific Location: creates location-specific schedule
 */
export function useCreateScheduleMutation() {
  const queryClient = useQueryClient();
  const clerkOrgId = useClerkOrgId();
  const { selectedLocationId } = useLocationStore();
  const isAllLocations = useIsAllLocations();

  return useMutation({
    mutationFn: async (data: Parameters<typeof CreateSchedule>[1]) => {
      const locationId = isAllLocations ? null : selectedLocationId;
      return CreateSchedule(clerkOrgId, {
        ...data,
        location_id: locationId,
      });
    },
    onSuccess: (result) => {
      if (result.error) {
        toast.error("Creation Failed", { description: result.error });
        return;
      }

      const scope = isAllLocations ? "global" : "location-specific";
      toast.success("Schedule Created", {
        description: `Created ${scope} schedule`,
      });

      queryClient.invalidateQueries({ queryKey: ["schedules"] });
      queryClient.invalidateQueries({ queryKey: ["schedules-with-slots"] });
    },
    onError: (error) => {
      toast.error("Creation Failed", {
        description: "An unexpected error occurred",
      });
      console.error("Schedule creation error:", error);
    },
  });
}

/**
 * Update schedule - only allows editing if appropriate permissions
 * - Global schedules: can edit in "All Locations" view
 * - Location-specific: can edit when that location is selected
 * - Supports updating time slots
 */
export function useUpdateScheduleMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      scheduleId,
      data,
    }: {
      scheduleId: string;
      data: Parameters<typeof UpdateScheduleWithTimeSlots>[1];
    }) => {
      return UpdateScheduleWithTimeSlots(scheduleId, data);
    },
    onSuccess: (result, variables) => {
      if (result.error) {
        toast.error("Update Failed", { description: result.error });
        return;
      }

      toast.success("Schedule Updated");
      queryClient.invalidateQueries({ queryKey: ["schedules"] });
      queryClient.invalidateQueries({ queryKey: ["schedules-with-slots"] });
      queryClient.invalidateQueries({
        queryKey: ["schedule", variables.scheduleId],
      });
    },
    onError: (error) => {
      toast.error("Update Failed", {
        description: "An unexpected error occurred",
      });
      console.error("Schedule update error:", error);
    },
  });
}

/**
 * Delete schedule with validation
 */
export function useDeleteScheduleMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (scheduleId: string) => DeleteSchedule(scheduleId),
    onSuccess: (result) => {
      if (result.error) {
        toast.error("Deletion Failed", { description: result.error });
        return;
      }

      toast.success("Schedule Deleted");
      queryClient.invalidateQueries({ queryKey: ["schedules"] });
      queryClient.invalidateQueries({ queryKey: ["schedules-with-slots"] });
    },
    onError: (error) => {
      toast.error("Deletion Failed", {
        description: "An unexpected error occurred",
      });
      console.error("Schedule deletion error:", error);
    },
  });
}

/**
 * Toggle schedule active status
 */
export function useToggleScheduleActiveMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (scheduleId: string) => ToggleScheduleActive(scheduleId),
    onSuccess: (result) => {
      if (result.error) {
        toast.error("Failed to toggle schedule", { description: result.error });
        return;
      }

      queryClient.invalidateQueries({ queryKey: ["schedules"] });
      queryClient.invalidateQueries({ queryKey: ["schedules-with-slots"] });
    },
    onError: (error) => {
      toast.error("Toggle Failed", {
        description: "An unexpected error occurred",
      });
      console.error("Schedule toggle error:", error);
    },
  });
}

// ============================================================================
// Override Mutation Hooks
// ============================================================================

/**
 * Toggle schedule visibility at location
 */
export function useScheduleVisibilityMutation() {
  const queryClient = useQueryClient();
  const { selectedLocationId } = useLocationStore();
  const merchantId = useMerchantId();
  const isAllLocations = useIsAllLocations();

  return useMutation({
    mutationFn: async ({
      scheduleId,
      isActive,
    }: {
      scheduleId: string;
      isActive: boolean;
    }) => {
      if (isAllLocations) {
        return {
          error: "Cannot set location override when viewing all locations",
        };
      }

      return UpsertLocationScheduleOverride(
        selectedLocationId,
        scheduleId,
        merchantId,
        { is_active: isActive }
      );
    },
    onSuccess: (result) => {
      if (result.error) {
        toast.error("Override Failed", { description: result.error });
        return;
      }

      toast.success("Visibility Updated", {
        description: "Schedule visibility set for this location",
      });
      queryClient.invalidateQueries({ queryKey: ["schedules"] });
      queryClient.invalidateQueries({ queryKey: ["category-schedules"] });
    },
  });
}

/**
 * Reset schedule to global visibility at location
 */
export function useResetScheduleMutation() {
  const queryClient = useQueryClient();
  const { selectedLocationId } = useLocationStore();
  const isAllLocations = useIsAllLocations();

  return useMutation({
    mutationFn: async (scheduleId: string) => {
      if (isAllLocations) {
        return { error: "Cannot reset when viewing all locations" };
      }

      return DeleteLocationScheduleOverride(selectedLocationId, scheduleId);
    },
    onSuccess: (result) => {
      if (result.error) {
        toast.error("Reset Failed", { description: result.error });
        return;
      }

      toast.success("Reset to Global", {
        description: "Schedule now uses global visibility",
      });
      queryClient.invalidateQueries({ queryKey: ["schedules"] });
      queryClient.invalidateQueries({ queryKey: ["category-schedules"] });
    },
  });
}

/**
 * Assign schedule to category
 */
export function useAssignScheduleToCategoryMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      categoryId,
      scheduleId,
    }: {
      categoryId: string;
      scheduleId: string;
    }) => AssignScheduleToCategory(categoryId, scheduleId),
    onSuccess: (result) => {
      if (result.error) {
        toast.error("Assignment Failed", { description: result.error });
        return;
      }

      toast.success("Schedule Assigned");
      queryClient.invalidateQueries({ queryKey: ["category-schedules"] });
    },
  });
}

/**
 * Remove schedule from category
 */
export function useRemoveScheduleFromCategoryMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      categoryId,
      scheduleId,
    }: {
      categoryId: string;
      scheduleId: string;
    }) => RemoveScheduleFromCategory(categoryId, scheduleId),
    onSuccess: (result) => {
      if (result.error) {
        toast.error("Removal Failed", { description: result.error });
        return;
      }

      toast.success("Schedule Removed");
      queryClient.invalidateQueries({ queryKey: ["category-schedules"] });
    },
  });
}

// ============================================================================
// Export convenience hooks
// ============================================================================

export {
  useLocationStore,
  useSelectedLocation,
  useIsAllLocations,
} from "@/stores/location-store";
