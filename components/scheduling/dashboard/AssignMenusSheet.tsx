"use client";

import { useState, useEffect } from "react";
import {
  BottomSheet,
  BottomSheetContent,
  BottomSheetHeader,
  BottomSheetBody,
  BottomSheetFooter,
  BottomSheetTitle,
  BottomSheetDescription,
} from "@/components/ui/bottom-sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { Utensils, Calendar, Check, X } from "lucide-react";
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

  const hasChanges = () => {
    if (selectedMenuIds.size !== initialMenuIds.size) return true;
    for (const id of selectedMenuIds) {
      if (!initialMenuIds.has(id)) return true;
    }
    return false;
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

  return (
    <BottomSheet open={open} onOpenChange={onOpenChange}>
      <BottomSheetContent height="95">
        <BottomSheetHeader>
          <BottomSheetTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Assign to Menus
          </BottomSheetTitle>
          <BottomSheetDescription>
            Select which menus should use the "{schedule?.name}" schedule
          </BottomSheetDescription>
        </BottomSheetHeader>

        <BottomSheetBody>
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : menuList.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Utensils className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>No menus available</p>
              <p className="text-sm">Create a menu first to assign schedules</p>
            </div>
          ) : (
            <div className="space-y-2">
              {menuList.map((menu: MenusModel, index: number) => {
                const isSelected = selectedMenuIds.has(menu.id);
                return (
                  <button
                    key={menu.id}
                    type="button"
                    onClick={() => toggleMenu(menu.id)}
                    className={cn(
                      "w-full p-4 rounded-xl border transition-all duration-200",
                      "flex items-center gap-3 text-left",
                      "hover:shadow-sm",
                      "animate-in fade-in slide-in-from-bottom-2",
                      isSelected
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-primary/30"
                    )}
                    style={{ animationDelay: `${index * 30}ms` }}
                  >
                    <div
                      className={cn(
                        "h-5 w-5 rounded border-2 flex items-center justify-center transition-colors",
                        isSelected
                          ? "bg-primary border-primary text-primary-foreground"
                          : "border-muted-foreground/30"
                      )}
                    >
                      {isSelected && <Check className="h-3 w-3" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <Utensils className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium truncate">
                          {menu.name}
                        </span>
                      </div>
                      {menu.description && (
                        <p className="text-sm text-muted-foreground truncate mt-0.5">
                          {menu.description}
                        </p>
                      )}
                    </div>
                    <Badge variant={menu.is_active ? "default" : "secondary"}>
                      {menu.is_active ? "Active" : "Inactive"}
                    </Badge>
                  </button>
                );
              })}
            </div>
          )}
        </BottomSheetBody>

        <BottomSheetFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
            className="flex-1"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={!hasChanges() || isSubmitting}
            className="flex-1"
          >
            {isSubmitting ? (
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
                Saving...
              </>
            ) : (
              <>
                <Check className="h-4 w-4 mr-2" />
                Save Changes
              </>
            )}
          </Button>
        </BottomSheetFooter>
      </BottomSheetContent>
    </BottomSheet>
  );
}
