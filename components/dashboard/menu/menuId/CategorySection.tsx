"use client";

import { useState } from "react";
import { Panel } from "@/components/dashboard/shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Checkbox } from "@/components/ui/checkbox";
import {
  ChevronDown,
  ChevronRight,
  MapPin,
  Eye,
  EyeOff,
  RotateCcw,
  Globe,
  Trash2,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { MenuCategory, MenuCategoryItem } from "@/types/menu";
import { DraggableItemsList } from "./DraggableItemsList";
import { RemoveCategoryFromMenu } from "@/app/dashboard/actions/categories";
import { toast } from "sonner";

interface CategorySectionProps {
  category: MenuCategory;
  menuId: string;
  isExpanded: boolean;
  onToggle: () => void;
  onItemClick: (itemId: string) => void;
  showLocationPricing: boolean;
  locationId?: string | null;
  isMenuLocationOwned?: boolean;
  canModifyCategories?: boolean;
  onToggleVisibility: (categoryId: string, isActive: boolean) => Promise<void>;
  onResetOverride: (categoryId: string) => Promise<void>;
  onEditItem: (
    item: MenuCategoryItem,
    category: MenuCategory,
    menuId: string,
  ) => void;
  onCategoryRemoved?: () => void;
  // Item ordering props
  reorderedItems?: MenuCategoryItem[];
  onItemOrderChange?: (categoryId: string, items: MenuCategoryItem[]) => void;
  onSaveItemOrder?: (categoryId: string) => Promise<void>;
  onResetItemOrder?: (categoryId: string) => void;
  hasItemOrderChanges?: boolean;
  isSavingItemOrder?: boolean;
  // Selection mode
  isSelectionMode?: boolean;
  selectedItemIds?: Set<string>;
  onToggleItem?: (itemId: string) => void;
  onToggleCategoryItems?: (itemIds: string[]) => void;
}

export function CategorySection({
  category,
  menuId,
  isExpanded,
  onToggle,
  onItemClick,
  showLocationPricing,
  locationId,
  isMenuLocationOwned,
  canModifyCategories = true,
  onToggleVisibility,
  onResetOverride,
  onEditItem,
  onCategoryRemoved,
  // Item ordering
  reorderedItems,
  onItemOrderChange,
  onSaveItemOrder,
  onResetItemOrder,
  hasItemOrderChanges = false,
  isSavingItemOrder = false,
  // Selection
  isSelectionMode = false,
  selectedItemIds,
  onToggleItem,
  onToggleCategoryItems,
}: CategorySectionProps) {
  const itemCount = category.items?.length || 0;
  const [isToggling, setIsToggling] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const isAllLocations = !locationId || locationId === "all";

  // Selection helpers for the category-level checkbox
  const categoryItemIds = (category.items ?? []).map((i) => i.menu_item_id);
  const selectedCount = categoryItemIds.filter((id) => selectedItemIds?.has(id)).length;
  const categoryCheckState: boolean | "indeterminate" =
    selectedCount === 0
      ? false
      : selectedCount === categoryItemIds.length
        ? true
        : "indeterminate";

  function handleCategoryCheckbox(e: React.MouseEvent) {
    e.stopPropagation();
    if (!onToggleCategoryItems) return;
    if (categoryCheckState === true) {
      // deselect all
      onToggleCategoryItems([]);
    } else {
      // select all
      onToggleCategoryItems(categoryItemIds);
    }
  }

  // Check if this category has a location-specific override
  const hasLocationOverride =
    category.category?.has_menu_category_override || false;

  const handleToggleVisibility = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsToggling(true);
    try {
      await onToggleVisibility(category.category_id, !category.is_active);
    } finally {
      setIsToggling(false);
    }
  };

  const handleResetOverride = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsToggling(true);
    try {
      await onResetOverride(category.category_id);
    } finally {
      setIsToggling(false);
    }
  };

  const handleRemoveCategory = async () => {
    setIsDeleting(true);
    try {
      const result = await RemoveCategoryFromMenu(
        menuId,
        category.category_id,
        locationId,
      );

      if (result.error) {
        toast.error("Failed to remove category", {
          description: result.error,
        });
        return;
      }

      toast.success("Category removed", {
        description: `"${
          category.category?.name || "Category"
        }" has been removed from this menu.`,
      });

      setIsDeleteDialogOpen(false);
      onCategoryRemoved?.();
    } catch (error) {
      toast.error("Failed to remove category", {
        description:
          error instanceof Error
            ? error.message
            : "An unexpected error occurred.",
      });
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <Collapsible open={isExpanded} onOpenChange={onToggle}>
      {/* A repeating list row, not a page section — tier 2 (`nested`). */}
      <Panel
        nested
        className={cn(
          "overflow-hidden rounded-3xl transition-all",
          !category.is_active && "opacity-60",
        )}
      >
        <div className="min-h-20 cursor-pointer px-3 py-3 transition-colors hover:bg-muted/50 sm:min-h-0 sm:px-6">
          <div className="flex items-center justify-between gap-2">
            {/* Category-level selection checkbox */}
            {isSelectionMode && categoryItemIds.length > 0 && (
              <div
                className="flex-shrink-0 mr-2"
                onClick={handleCategoryCheckbox}
              >
                <Checkbox checked={categoryCheckState} />
              </div>
            )}
            <CollapsibleTrigger asChild>
              <div className="flex min-w-0 items-center gap-2 flex-1 cursor-pointer sm:gap-3">
                {isExpanded ? (
                  <ChevronDown className="h-5 w-5 shrink-0 text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
                )}
                {/* Fixed height: the name/badge row wraps at narrow widths while
                    the description sits below, so without a floor the two
                    combinations produce different row heights. */}
                <div className="flex min-w-0 flex-col justify-center min-h-[3.25rem] sm:min-h-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="truncate text-base font-semibold sm:text-lg">
                      {category.category?.name || "Unnamed Category"}
                    </h3>
                    {/* Location-scoped category badge */}
                    {category.category?.location_id &&
                      category.category?.location_name && (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger>
                              <Badge
                                variant="outline"
                                className="text-xs bg-purple-50 text-purple-600 border-purple-200"
                              >
                                <MapPin className="h-3 w-3 mr-1" />
                                {category.category.location_name}
                              </Badge>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>
                                This category is scoped to{" "}
                                {category.category.location_name}
                              </p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                    {/* Global category indicator */}
                    {!category.category?.location_id && (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger>
                            <Badge
                              variant="outline"
                              className="text-xs bg-emerald-50 text-emerald-600 border-emerald-200"
                            >
                              <Globe className="h-3 w-3 mr-1" />
                              Global
                            </Badge>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>
                              This is a global category available to all
                              locations
                            </p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}
                    {hasLocationOverride && (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger>
                            <Badge
                              variant="outline"
                              className="text-xs bg-blue-50 text-blue-600 border-blue-200"
                            >
                              <MapPin className="h-3 w-3 mr-1" />
                              Override
                            </Badge>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>This category has location-specific settings</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}
                  </div>
                </div>
              </div>
            </CollapsibleTrigger>

            {/* Controls */}
            <div className="flex flex-shrink-0 items-center gap-2 sm:gap-3">
              {/* Reset override button */}
              {hasLocationOverride && !isAllLocations && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={handleResetOverride}
                        disabled={isToggling}
                      >
                        <RotateCcw className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Reset to global settings</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}

              {/* Visibility toggle */}
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={category.is_active}
                        onCheckedChange={() => {}}
                        onClick={handleToggleVisibility}
                        disabled={isToggling}
                      />
                      {category.is_active ? (
                        <Eye className="h-4 w-4 text-green-500" />
                      ) : (
                        <EyeOff className="h-4 w-4 text-muted-foreground" />
                      )}
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>
                      {category.is_active ? "Hide" : "Show"} this category{" "}
                      {showLocationPricing ? "at this location" : "globally"}
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>

            </div>
          </div>
        </div>
        <CollapsibleContent>
          <div className="px-2 pb-4 pt-0 sm:px-6">
            {itemCount === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No items in this category
              </div>
            ) : onItemOrderChange && onSaveItemOrder ? (
              <DraggableItemsList
                items={reorderedItems || category.items || []}
                categoryId={category.category_id}
                onItemClick={onItemClick}
                showLocationPricing={showLocationPricing}
                onEditItem={(item) => onEditItem(item, category, menuId)}
                onItemOrderChange={(items) =>
                  onItemOrderChange(category.category_id, items)
                }
                onSaveItemOrder={() => onSaveItemOrder(category.category_id)}
                onResetItemOrder={
                  onResetItemOrder
                    ? () => onResetItemOrder(category.category_id)
                    : undefined
                }
                hasItemOrderChanges={hasItemOrderChanges}
                isSavingItemOrder={isSavingItemOrder}
                locationId={locationId || null}
                isSelectionMode={isSelectionMode}
                selectedItemIds={selectedItemIds}
                onToggleItem={onToggleItem}
              />
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                Item ordering not available
              </div>
            )}

            {canModifyCategories && (
              <div className="mt-2 flex flex-row items-center justify-center sm:justify-end">
                <Button
                  variant="ghost"
                  className="text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsDeleteDialogOpen(true);
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                  Remove category
                </Button>
              </div>
            )}
          </div>
        </CollapsibleContent>
      </Panel>

      {/* Delete Confirmation Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="h-5 w-5" />
              Remove Category from Menu
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to remove &quot;
              {category.category?.name || "this category"}&quot; from this menu?
              {itemCount > 0 && (
                <span className="block mt-2 text-muted-foreground">
                  This category contains {itemCount} item
                  {itemCount !== 1 ? "s" : ""} that will no longer appear in
                  this menu.
                </span>
              )}
              <span className="block mt-2 font-medium text-foreground">
                This action cannot be undone.
              </span>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsDeleteDialogOpen(false)}
              disabled={isDeleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleRemoveCategory}
              disabled={isDeleting}
            >
              {isDeleting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Removing...
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Remove Category
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Collapsible>
  );
}
