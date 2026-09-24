"use client";

import { useMemo, useState } from "react";
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
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { Calendar, Check, Loader2, Tag } from "lucide-react";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AssignScheduleToCategory,
  GetScheduleCategoryIds,
  RemoveScheduleFromCategory,
} from "@/app/dashboard/actions/schedules";
import { useLocationScopedCategories } from "@/app/dashboard/hooks/useLocationScoped";
import { useSelectedLocation } from "@/stores/location-store";
import { invalidateOrderOutSync } from "@/app/dashboard/hooks/useOrderOutMenuSync";
import { CategoriesModel, SchedulesModel } from "@/types/db-modles";

interface AssignCategoriesSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  schedule: SchedulesModel | null;
}

/**
 * Category counterpart of AssignMenusSheet: pick which categories a schedule
 * controls. A category with a schedule is hidden on the POS and kiosk outside
 * that schedule's hours.
 */
export function AssignCategoriesSheet({
  open,
  onOpenChange,
  schedule,
}: AssignCategoriesSheetProps) {
  const queryClient = useQueryClient();
  const selectedLocation = useSelectedLocation();
  const locationId = selectedLocation?.id || null;

  // null = untouched, so the selection is simply what is assigned today.
  const [edits, setEdits] = useState<Set<string> | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { data: allCategories, isLoading: isLoadingCategories } =
    useLocationScopedCategories();

  // Global categories plus this location's own; every category when viewing
  // all locations.
  const categories = useMemo(
    () =>
      ((allCategories ?? []) as (CategoriesModel & {
        location_id?: string | null;
      })[]).filter(
        (category) =>
          !locationId ||
          !category.location_id ||
          category.location_id === locationId,
      ),
    [allCategories, locationId],
  );

  const { data: assignedIds, isLoading: isLoadingAssigned } = useQuery({
    queryKey: ["schedule-categories", schedule?.id],
    queryFn: () => GetScheduleCategoryIds(schedule!.id),
    enabled: !!schedule?.id && open,
  });

  const initialIds = useMemo(() => new Set(assignedIds ?? []), [assignedIds]);
  const selectedIds = edits ?? initialIds;

  // Every close path drops unsaved edits, so reopening starts fresh.
  const handleOpenChange = (next: boolean) => {
    if (!next) setEdits(null);
    onOpenChange(next);
  };

  const toggle = (categoryId: string) => {
    setEdits((prev) => {
      const next = new Set(prev ?? initialIds);
      if (next.has(categoryId)) next.delete(categoryId);
      else next.add(categoryId);
      return next;
    });
  };

  const toAdd = [...selectedIds].filter((id) => !initialIds.has(id));
  const toRemove = [...initialIds].filter((id) => !selectedIds.has(id));
  const hasChanges = toAdd.length > 0 || toRemove.length > 0;

  const handleSave = async () => {
    if (!schedule) return;

    setIsSubmitting(true);
    try {
      for (const categoryId of toAdd) {
        const result = await AssignScheduleToCategory(
          categoryId,
          schedule.id,
          locationId,
        );
        if ("error" in result && result.error) {
          toast.error("Failed to assign schedule", {
            description: result.error,
          });
          return;
        }
      }

      for (const categoryId of toRemove) {
        const result = await RemoveScheduleFromCategory(
          categoryId,
          schedule.id,
          locationId,
        );
        if ("error" in result && result.error) {
          toast.error("Failed to remove schedule", {
            description: result.error,
          });
          return;
        }
      }

      toast.success("Category assignments updated", {
        description: `${toAdd.length} added, ${toRemove.length} removed`,
      });

      queryClient.invalidateQueries({ queryKey: ["schedule-categories"] });
      queryClient.invalidateQueries({ queryKey: ["category-schedules"] });
      queryClient.invalidateQueries({ queryKey: ["schedules"] });
      invalidateOrderOutSync(queryClient);

      handleOpenChange(false);
    } catch {
      toast.error("An error occurred", { description: "Please try again." });
    } finally {
      setIsSubmitting(false);
    }
  };

  const isLoading = isLoadingCategories || isLoadingAssigned;

  return (
    <BottomSheet open={open} onOpenChange={handleOpenChange}>
      <BottomSheetContent height="95">
        <BottomSheetHeader>
          <BottomSheetTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Assign to Categories
          </BottomSheetTitle>
          <BottomSheetDescription>
            Select which categories should use the &quot;{schedule?.name}&quot;
            schedule
          </BottomSheetDescription>
        </BottomSheetHeader>

        <BottomSheetBody>
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : categories.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Tag className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>No categories available</p>
              <p className="text-sm">Create a category first to assign schedules</p>
            </div>
          ) : (
            <div className="space-y-2">
              {categories.map((category, index) => {
                const isSelected = selectedIds.has(category.id);
                return (
                  <button
                    key={category.id}
                    type="button"
                    onClick={() => toggle(category.id)}
                    className={cn(
                      "w-full p-4 rounded-xl border transition-all duration-200",
                      "flex items-center gap-3 text-left",
                      "hover:shadow-sm",
                      "animate-in fade-in slide-in-from-bottom-2",
                      isSelected
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-primary/30",
                    )}
                    style={{ animationDelay: `${index * 30}ms` }}
                  >
                    <div
                      className={cn(
                        "h-5 w-5 rounded border-2 flex items-center justify-center transition-colors",
                        isSelected
                          ? "bg-primary border-primary text-primary-foreground"
                          : "border-muted-foreground/30",
                      )}
                    >
                      {isSelected && <Check className="h-3 w-3" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <Tag className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium truncate">
                          {category.name}
                        </span>
                      </div>
                      {category.description && (
                        <p className="text-sm text-muted-foreground truncate mt-0.5">
                          {category.description}
                        </p>
                      )}
                    </div>
                    <Badge variant={category.is_active ? "default" : "secondary"}>
                      {category.is_active ? "Active" : "Inactive"}
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
            onClick={() => handleOpenChange(false)}
            disabled={isSubmitting}
            className="flex-1"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={!hasChanges || isSubmitting}
            className="flex-1"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
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
