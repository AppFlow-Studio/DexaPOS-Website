"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  useLocationStore,
  useIsAllLocations,
} from "@/stores/location-store";
import { useUserInfo } from "@/app/manage/hooks/useUserInfo.";
import {
  GetMenuSchedules,
  AssignScheduleToMenu,
  RemoveScheduleFromMenu,
} from "../actions/schedules";
import { invalidateOrderOutSync } from "@/app/dashboard/hooks/useOrderOutMenuSync";

function useClerkOrgId() {
  const { data: userInfo } = useUserInfo();
  return userInfo?.members?.[0]?.organizations?.id || "";
}

function useEffectiveLocationId() {
  const { selectedLocationId } = useLocationStore();
  const isAllLocations = useIsAllLocations();
  return isAllLocations ? "all" : selectedLocationId;
}

/**
 * Get menu schedule assignments scoped to the current location selection.
 * - All Locations: returns every assignment row for the menu (global + all per-location).
 * - Specific Location: returns global assignments (inherited) + this location's own.
 */
export function useMenuSchedulesScoped(menuId: string) {
  const locationId = useEffectiveLocationId();

  return useQuery({
    queryKey: ["menu-schedules", menuId, locationId, "scoped"],
    queryFn: () => GetMenuSchedules(menuId, locationId),
    enabled: !!menuId,
    staleTime: 30_000,
  });
}

/**
 * Assign a schedule to a menu, routing by current location context.
 * - All Locations: assignment is global (location_id=NULL).
 * - Specific Location: assignment is scoped to that location.
 */
export function useAssignScheduleToMenuMutation(menuId: string) {
  const queryClient = useQueryClient();
  const clerkOrgId = useClerkOrgId();
  const { selectedLocationId } = useLocationStore();
  const isAllLocations = useIsAllLocations();

  return useMutation({
    mutationFn: async (scheduleId: string) => {
      const locationId = isAllLocations ? null : selectedLocationId;
      return AssignScheduleToMenu(
        menuId,
        scheduleId,
        clerkOrgId,
        locationId || undefined,
      );
    },
    onSuccess: (result) => {
      if ((result as any)?.error) {
        toast.error("Add Failed", {
          description: (result as any).error,
        });
        return;
      }
      const scope = isAllLocations ? "globally" : "for this location";
      toast.success("Schedule Added", {
        description: `Schedule attached to this menu ${scope}.`,
      });
      queryClient.invalidateQueries({ queryKey: ["menu-schedules", menuId] });
      queryClient.invalidateQueries({
        queryKey: ["menu-with-categories", menuId],
      });
      invalidateOrderOutSync(queryClient);
    },
    onError: () => {
      toast.error("Add Failed", { description: "Unable to add schedule" });
    },
  });
}

/**
 * Remove a menu-schedule assignment. The caller must pass the row's
 * `assignment_location_id` so we remove the correct scoped row.
 */
export function useRemoveScheduleFromMenuMutation(menuId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      scheduleId,
      assignmentLocationId,
    }: {
      scheduleId: string;
      assignmentLocationId: string | null;
    }) => {
      return RemoveScheduleFromMenu(
        menuId,
        scheduleId,
        assignmentLocationId || undefined,
      );
    },
    onSuccess: (result) => {
      if ((result as any)?.error) {
        toast.error("Remove Failed", {
          description: (result as any).error,
        });
        return;
      }
      toast.success("Schedule Removed", {
        description: "The schedule has been removed from this menu.",
      });
      queryClient.invalidateQueries({ queryKey: ["menu-schedules", menuId] });
      queryClient.invalidateQueries({
        queryKey: ["menu-with-categories", menuId],
      });
      invalidateOrderOutSync(queryClient);
    },
    onError: () => {
      toast.error("Remove Failed", {
        description: "Unable to remove the schedule. Please try again.",
      });
    },
  });
}
