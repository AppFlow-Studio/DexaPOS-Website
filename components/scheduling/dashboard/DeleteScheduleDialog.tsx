"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertTriangle, Utensils } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { GetMenus } from "@/app/dashboard/actions/menus";
import { GetMenuSchedules } from "@/app/dashboard/actions/schedules";
import { useUserInfo } from "@/app/manage/hooks/useUserInfo.";
import { useSelectedLocation } from "@/stores/location-store";
import {
  SchedulesModel,
  MenusModel,
  ScheduleTimeSlotsModel,
} from "@/types/db-modles";

interface DeleteScheduleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  schedule:
    | (SchedulesModel & { schedule_time_slots?: ScheduleTimeSlotsModel[] })
    | null;
  onConfirm: () => void;
  isDeleting?: boolean;
}

export function DeleteScheduleDialog({
  open,
  onOpenChange,
  schedule,
  onConfirm,
  isDeleting = false,
}: DeleteScheduleDialogProps) {
  const { data: userInfo } = useUserInfo();
  const clerkOrgId = userInfo?.members?.[0]?.organizations?.id || "";
  const selectedLocation = useSelectedLocation();
  const locationId = selectedLocation?.id || null;

  // Fetch menus and check which ones have this schedule assigned
  const { data: assignedMenus, isLoading } = useQuery({
    queryKey: ["schedule-assigned-menus", schedule?.id],
    queryFn: async () => {
      if (!schedule?.id || !clerkOrgId) return [];

      // Get all menus
      const menus = await GetMenus(clerkOrgId, locationId);
      if (!menus || menus.length === 0) return [];

      // Check which menus have this schedule
      const assigned: MenusModel[] = [];
      for (const menu of menus) {
        const menuSchedules = await GetMenuSchedules(menu.id);
        if (menuSchedules.some((s: SchedulesModel) => s.id === schedule.id)) {
          assigned.push(menu);
        }
      }
      return assigned;
    },
    enabled: !!schedule?.id && open && !!clerkOrgId,
  });

  const hasAssignments = assignedMenus && assignedMenus.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            Delete Schedule
          </DialogTitle>
          <DialogDescription asChild>
            <div className="space-y-3">
              <p>Are you sure you want to delete "{schedule?.name}"?</p>

              {isLoading ? (
                <Skeleton className="h-16 w-full" />
              ) : hasAssignments ? (
                <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 dark:bg-amber-950/30 dark:border-amber-800">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                    <div className="space-y-2">
                      <p className="text-sm font-medium text-amber-700 dark:text-amber-300">
                        This schedule is assigned to {assignedMenus.length} menu
                        {assignedMenus.length !== 1 ? "s" : ""}:
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {assignedMenus.map((menu) => (
                          <Badge
                            key={menu.id}
                            variant="outline"
                            className="text-xs bg-amber-100 border-amber-300 text-amber-800 dark:bg-amber-900/50 dark:border-amber-700 dark:text-amber-200"
                          >
                            <Utensils className="h-3 w-3 mr-1" />
                            {menu.name}
                          </Badge>
                        ))}
                      </div>
                      <p className="text-xs text-amber-600 dark:text-amber-400">
                        Deleting this schedule will also remove it from these
                        menus.
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  This schedule is not assigned to any menus.
                </p>
              )}

              <p className="text-sm text-destructive font-medium">
                This action cannot be undone.
              </p>
            </div>
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isDeleting}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={onConfirm}
            disabled={isDeleting || isLoading}
          >
            {isDeleting ? (
              <>
                <svg
                  className="animate-spin -ml-1 mr-2 h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                Deleting...
              </>
            ) : (
              "Delete Schedule"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
