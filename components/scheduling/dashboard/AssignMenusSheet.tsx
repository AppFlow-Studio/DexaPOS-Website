"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { GetMenus } from "@/app/dashboard/actions/menus";
import {
  AssignScheduleToMenu,
  RemoveScheduleFromMenu,
  GetMenuSchedules,
} from "@/app/dashboard/actions/schedules";
import { useUserInfo } from "@/app/manage/hooks/useUserInfo.";
import { useSelectedLocation } from "@/stores/location-store";
import { SchedulesModel, MenusModel } from "@/types/db-modles";
import { invalidateOrderOutSync } from "@/app/dashboard/hooks/useOrderOutMenuSync";
import { ScheduleAssignDialog } from "./ScheduleAssignDialog";

interface AssignMenusSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  schedule: SchedulesModel | null;
}

export function AssignMenusSheet({
  open,
  onOpenChange,
  schedule,
}: AssignMenusSheetProps) {
  const queryClient = useQueryClient();
  const { data: userInfo } = useUserInfo();
  const clerkOrgId = userInfo?.members?.[0]?.organizations?.id || "";
  const selectedLocation = useSelectedLocation();
  const locationId = selectedLocation?.id || null;

  const [selectedMenuIds, setSelectedMenuIds] = useState<Set<string>>(
    new Set()
  );
  const [initialMenuIds, setInitialMenuIds] = useState<Set<string>>(new Set());
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Fetch menus for the current location context
  const { data: menus, isLoading: isLoadingMenus } = useQuery({
    queryKey: ["menus", clerkOrgId, locationId, "for-schedule-assignment"],
    queryFn: () => GetMenus(clerkOrgId, locationId),
    enabled: !!clerkOrgId && open,
  });

  // Fetch schedules already assigned to this schedule (via menu_schedules)
  const { data: assignedSchedules, isLoading: isLoadingAssigned } = useQuery({
    queryKey: ["schedule-menus", schedule?.id],
    queryFn: async () => {
      if (!schedule?.id) return [];
      // We need to find which menus have this schedule assigned
      // Since GetMenuSchedules gives us schedules for a menu, we need a different approach
      // Let's check each menu if this schedule is assigned
      const menuList = menus || [];
      const assignments: string[] = [];

      for (const menu of menuList) {
        const menuSchedules = await GetMenuSchedules(menu.id);
        if (menuSchedules.some((s: any) => s.id === schedule.id)) {
          assignments.push(menu.id);
        }
      }
      return assignments;
    },
    enabled: !!schedule?.id && open && !!menus,
  });

  // Initialize selection when data loads
  useEffect(() => {
    if (assignedSchedules) {
      const ids = new Set(assignedSchedules);
      setSelectedMenuIds(ids);
      setInitialMenuIds(ids);
    }
  }, [assignedSchedules]);

  // Reset state when sheet closes
  useEffect(() => {
    if (!open) {
      setSelectedMenuIds(new Set());
      setInitialMenuIds(new Set());
    }
  }, [open]);

  const toggleMenu = (menuId: string) => {
    setSelectedMenuIds((prev) => {
      const next = new Set(prev);
      if (next.has(menuId)) {
        next.delete(menuId);
      } else {
        next.add(menuId);
      }
      return next;
    });
  };


  const handleSave = async () => {
    if (!schedule || !clerkOrgId) return;

    setIsSubmitting(true);
    try {
      // Find menus to add and remove
      const toAdd = [...selectedMenuIds].filter(
        (id) => !initialMenuIds.has(id)
      );
      const toRemove = [...initialMenuIds].filter(
        (id) => !selectedMenuIds.has(id)
      );

      // Process additions
      for (const menuId of toAdd) {
        const result = await AssignScheduleToMenu(
          menuId,
          schedule.id,
          clerkOrgId
        );
        if (result.error) {
          toast.error("Failed to assign schedule", {
            description: result.error,
          });
          setIsSubmitting(false);
          return;
        }
      }

      // Process removals
      for (const menuId of toRemove) {
        const result = await RemoveScheduleFromMenu(menuId, schedule.id);
        if (result.error) {
          toast.error("Failed to remove schedule", {
            description: result.error,
          });
          setIsSubmitting(false);
          return;
        }
      }

      toast.success("Menu assignments updated", {
        description: `${toAdd.length} added, ${toRemove.length} removed`,
      });

      // Invalidate queries
      queryClient.invalidateQueries({ queryKey: ["schedule-menus"] });
      queryClient.invalidateQueries({ queryKey: ["menu-schedules"] });
      queryClient.invalidateQueries({ queryKey: ["schedules"] });
      invalidateOrderOutSync(queryClient);

      onOpenChange(false);
    } catch (error) {
      toast.error("An error occurred", { description: "Please try again." });
    } finally {
      setIsSubmitting(false);
    }
  };

  const isLoading = isLoadingMenus || isLoadingAssigned;
  const menuList = menus || [];

  const toAdd = [...selectedMenuIds].filter((id) => !initialMenuIds.has(id));
  const toRemove = [...initialMenuIds].filter((id) => !selectedMenuIds.has(id));

  return (
    <ScheduleAssignDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Assign “${schedule?.name ?? "schedule"}” to menus`}
      description="A menu with a schedule is only available during the schedule's hours."
      options={menuList}
      selectedIds={selectedMenuIds}
      onToggle={toggleMenu}
      isLoading={isLoading}
      emptyTitle="No menus yet"
      emptyHint="Create a menu first, then assign it to this schedule here."
      added={toAdd.length}
      removed={toRemove.length}
      isSaving={isSubmitting}
      onSave={handleSave}
    />
  );
}
