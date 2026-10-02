"use client";

import { useMemo, useState } from "react";
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
import { ScheduleAssignDialog } from "./ScheduleAssignDialog";

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
    <ScheduleAssignDialog
      open={open}
      onOpenChange={handleOpenChange}
      title={`Assign “${schedule?.name ?? "schedule"}” to categories`}
      description="A category with a schedule is hidden on the POS and kiosk outside the schedule's hours."
      options={categories}
      selectedIds={selectedIds}
      onToggle={toggle}
      isLoading={isLoading}
      emptyTitle="No categories yet"
      emptyHint="Create a category first, then assign it to this schedule here."
      added={toAdd.length}
      removed={toRemove.length}
      isSaving={isSubmitting}
      onSave={handleSave}
    />
  );
}
