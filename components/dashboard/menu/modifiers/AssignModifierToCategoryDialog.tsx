"use client";

import { useState, useEffect, useMemo } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Search, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { GetCategories } from "@/app/dashboard/actions/categories";
import {
  AssignModifierToCategory,
  RemoveModifierFromCategory,
  GetModifierGroupCategories,
} from "@/app/dashboard/actions/modifier-assignments";
import { CategoriesModel } from "@/types/db-modles";
import { invalidateOrderOutSync } from "@/app/dashboard/hooks/useOrderOutMenuSync";

interface ModifierGroupForAssignment {
  id: string;
  name: string;
  merchant_id: string;
}

interface AssignModifierToCategoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  modifierGroup: ModifierGroupForAssignment;
  clerkOrgId?: string;
  locationId: string | null;
  isAllLocations: boolean;
  onSuccess?: () => void;
}

interface CategoryAssignment {
  id: string;
  category_id: string;
  category_name: string;
  location_id: string | null;
  source: "global" | "location";
}

export function AssignModifierToCategoryDialog({
  open,
  onOpenChange,
  modifierGroup,
  clerkOrgId,
  locationId,
  isAllLocations,
  onSuccess,
}: AssignModifierToCategoryDialogProps) {
  const queryClient = useQueryClient();

  const [searchTerm, setSearchTerm] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [removedIds, setRemovedIds] = useState<Set<string>>(new Set());
  const [allCategories, setAllCategories] = useState<CategoriesModel[]>([]);
  const [existingAssignments, setExistingAssignments] = useState<CategoryAssignment[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const alreadyAssignedIds = useMemo(() => {
    return new Set(existingAssignments.map((a) => a.category_id));
  }, [existingAssignments]);

  // Load categories and existing assignments when dialog opens
  useEffect(() => {
    if (!open || !clerkOrgId) return;

    setIsLoading(true);
    setSelectedIds(new Set());
    setRemovedIds(new Set());
    setSearchTerm("");

    Promise.all([
      GetCategories(clerkOrgId),
      GetModifierGroupCategories(modifierGroup.id, isAllLocations ? null : locationId),
    ])
      .then(([categories, assignments]) => {
        setAllCategories(categories || []);
        setExistingAssignments(assignments || []);
      })
      .finally(() => setIsLoading(false));
  }, [open, clerkOrgId, modifierGroup.id]);

  const filteredCategories = useMemo(() => {
    const term = searchTerm.toLowerCase();
    return allCategories.filter((cat) =>
      cat.name.toLowerCase().includes(term),
    );
  }, [allCategories, searchTerm]);

  const toggleCategory = (categoryId: string) => {
    const isCurrentlyAssigned = alreadyAssignedIds.has(categoryId);

    if (isCurrentlyAssigned) {
      // Toggle removal of existing assignment
      setRemovedIds((prev) => {
        const next = new Set(prev);
        if (next.has(categoryId)) {
          next.delete(categoryId);
        } else {
          next.add(categoryId);
        }
        return next;
      });
    } else {
      // Toggle new selection
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (next.has(categoryId)) {
          next.delete(categoryId);
        } else {
          next.add(categoryId);
        }
        return next;
      });
    }
  };

  const handleSave = async () => {
    if (!selectedIds.size && !removedIds.size) return;

    setIsSaving(true);
    try {
      const results: string[] = [];
      const errors: string[] = [];

      // Process new assignments
      for (const categoryId of selectedIds) {
        const result = await AssignModifierToCategory(
          modifierGroup.id,
          categoryId,
          modifierGroup.merchant_id,
          isAllLocations ? null : locationId,
        );
        if (result.error) {
          errors.push(result.error);
        } else {
          const catName =
            allCategories.find((c) => c.id === categoryId)?.name || "category";
          results.push(
            `${catName} (${result.itemsAffected} items)`,
          );
        }
      }

      // Process removals
      for (const categoryId of removedIds) {
        const result = await RemoveModifierFromCategory(
          modifierGroup.id,
          categoryId,
          isAllLocations ? null : locationId,
        );
        if (result.error) {
          errors.push(result.error);
        }
      }

      if (errors.length > 0) {
        toast.error("Some operations failed", {
          description: errors.join("; "),
        });
      } else {
        const parts: string[] = [];
        if (selectedIds.size > 0) {
          parts.push(
            `Assigned to ${selectedIds.size} categor${selectedIds.size !== 1 ? "ies" : "y"}`,
          );
        }
        if (removedIds.size > 0) {
          parts.push(
            `Removed from ${removedIds.size} categor${removedIds.size !== 1 ? "ies" : "y"}`,
          );
        }
        toast.success(parts.join(". "));
      }

      queryClient.invalidateQueries({ queryKey: ["modifier-groups"] });
      queryClient.invalidateQueries({ queryKey: ["categories-with-items"] });
      queryClient.invalidateQueries({ queryKey: ["menu-items"] });
      invalidateOrderOutSync(queryClient);
      onSuccess?.();
    } catch (e: any) {
      toast.error("Operation failed", {
        description: e?.message || "Try again",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const hasChanges = selectedIds.size > 0 || removedIds.size > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-dvh max-h-dvh min-h-0 w-full max-w-none flex-col overflow-hidden sm:h-auto sm:max-h-[90vh] sm:max-w-xl">
        <DialogHeader className="shrink-0 pr-10 text-left">
          <DialogTitle className="text-left">
            Add &quot;{modifierGroup.name}&quot; to Categories
          </DialogTitle>
          <DialogDescription>
            Select categories to assign this modifier group to. Uncheck to
            remove.
          </DialogDescription>
        </DialogHeader>

        {/* Scope context banner — one neutral panel; the sentence names the
            scope, so it does not also need a colour. */}
        <div className="flex shrink-0 items-start gap-2 rounded-2xl border-0 bg-muted/60 p-3 text-xs text-muted-foreground">
          <span>
            {!isAllLocations ? (
              <>
                Assigning from this location view will apply modifiers{" "}
                <strong className="font-medium text-foreground">
                  only at this location
                </strong>
                . Items in the category get location-scoped assignments.
                Removing also cleans up location assignments.
              </>
            ) : (
              <>
                Assigning to a category applies this modifier to all current and
                future items{" "}
                <strong className="font-medium text-foreground">
                  at all locations
                </strong>
                . Removing also removes from items (unless covered by another
                category).
              </>
            )}
          </span>
        </div>

        <div className="relative shrink-0">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/50" />
          <Input
            placeholder="Search categories..."
            className="h-9 pl-9 text-[0.8125rem]"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-2 sm:max-h-[400px]">
          {isLoading ? (
            <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
              Loading categories...
            </div>
          ) : filteredCategories.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              {searchTerm
                ? "No categories match your search."
                : "No categories found."}
            </div>
          ) : (
            filteredCategories.map((category) => {
              const isAssigned = alreadyAssignedIds.has(category.id);
              const isMarkedForRemoval = removedIds.has(category.id);
              const isNewSelection = selectedIds.has(category.id);

              // Effective checked state: assigned and not removed, or newly selected
              const isChecked = isAssigned
                ? !isMarkedForRemoval
                : isNewSelection;

              return (
                <div
                  key={category.id}
                  className={cn(
                    "flex cursor-pointer items-center gap-3 rounded-2xl border-0 p-3 shadow-none transition-colors",
                    isMarkedForRemoval
                      ? "bg-destructive/10"
                      : isNewSelection
                        ? "bg-primary/10"
                        : "bg-muted/60 hover:bg-muted",
                  )}
                  onClick={() => toggleCategory(category.id)}
                >
                  <Checkbox
                    checked={isChecked}
                    onClick={(event) => event.stopPropagation()}
                    onCheckedChange={() => toggleCategory(category.id)}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm truncate">
                      {category.name}
                    </div>
                    {category.description && (
                      <div className="text-xs text-muted-foreground truncate">
                        {category.description}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {!category.menu_id && (
                      <Badge
                        variant="secondary"
                        className="border-0 bg-muted/60 text-[10px] font-medium text-muted-foreground"
                      >
                        Global
                      </Badge>
                    )}
                    {isAssigned && !isMarkedForRemoval && (() => {
                      const assignment = existingAssignments.find((a) => a.category_id === category.id);
                      const isGlobalAssignment = assignment?.source === "global";
                      return (
                        <Badge
                          variant="secondary"
                          className="gap-1 border-0 bg-muted/60 text-[10px] font-medium text-muted-foreground"
                        >
                          {isGlobalAssignment ? "Global" : "This Location"}
                        </Badge>
                      );
                    })()}
                    {isMarkedForRemoval && (
                      <Badge
                        variant="outline"
                        className="text-[10px] bg-destructive/10 text-destructive border-destructive/20"
                      >
                        Will remove
                      </Badge>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        <DialogFooter className="shrink-0 flex-col gap-2 sm:flex-row sm:items-center sm:gap-0">
          <div className="min-w-0 flex-1 text-sm text-muted-foreground">
            {selectedIds.size > 0 && (
              <span className="text-primary">
                +{selectedIds.size} to assign
              </span>
            )}
            {selectedIds.size > 0 && removedIds.size > 0 && (
              <span> &middot; </span>
            )}
            {removedIds.size > 0 && (
              <span className="text-destructive">
                -{removedIds.size} to remove
              </span>
            )}
            {!hasChanges && (
              <span>{alreadyAssignedIds.size} categories assigned</span>
            )}
          </div>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSaving}
            className="rounded-full"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={isSaving || !hasChanges}
            className="gap-2 rounded-full"
          >
            {isSaving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              "Save Changes"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
