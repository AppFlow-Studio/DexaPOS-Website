"use client";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Panel } from "@/components/dashboard/shell";
import {
  ChevronUp,
  ChevronDown,
  Eye,
  EyeOff,
  Globe,
  MapPin,
  Trash2,
  RotateCcw,
  Utensils,
} from "lucide-react";
import { MenuCategory, MenuCategoryItem } from "@/types/menu";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { CategoryItemsSheet } from "./CategoryItemsSheet";

interface CategoryGridProps {
  categories: MenuCategory[];
  menuId: string;
  selectedLocationId: string | null;
  isMenuLocationOwned?: boolean;
  onMoveUp?: (index: number) => void;
  onMoveDown?: (index: number) => void;
  onToggleVisibility: (categoryId: string, isActive: boolean) => Promise<void>;
  onResetOverride?: (categoryId: string) => Promise<void>;
  onRemoveCategory?: (categoryId: string) => void;
  onEditItem?: (
    item: MenuCategoryItem,
    category: MenuCategory,
    menuId: string,
  ) => void;
  hasOrderChanges?: boolean;
  showReorderControls?: boolean;
}

export function CategoryGrid({
  categories,
  menuId,
  selectedLocationId,
  isMenuLocationOwned,
  onMoveUp,
  onMoveDown,
  onToggleVisibility,
  onResetOverride,
  onRemoveCategory,
  onEditItem,
  hasOrderChanges = false,
  showReorderControls = false,
}: CategoryGridProps) {
  const isAllLocations = !selectedLocationId || selectedLocationId === "all";
  const canModifyCategories = isAllLocations || isMenuLocationOwned;
  // Which category's item list is open, if any.
  const [itemsForCategory, setItemsForCategory] =
    useState<MenuCategory | null>(null);

  return (
    <>
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 animate-in fade-in duration-300">
      {categories.map((category, index) => {
        const categoryLocationId = category.category?.location_id;
        const isGlobal = !categoryLocationId;
        const isActive = category.is_active;
        const showResetButton =
          !isAllLocations &&
          category.category?.location_id === null &&
          !!onResetOverride;

        return (
          /* A repeating grid tile, not a page section — tier 2 (`nested`). */
          <Panel
            nested
            key={category.id}
            role="button"
            tabIndex={0}
            onClick={() => setItemsForCategory(category)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                setItemsForCategory(category);
              }
            }}
            className={cn(
              "group flex min-h-0 cursor-pointer flex-col overflow-hidden transition-all duration-200",
              "border-0 bg-card shadow-sm hover:shadow-md",
              !isActive && "opacity-70 bg-muted/30",
            )}
          >
            {/* Header strip */}
            <div className="flex items-start justify-between gap-2 px-4 pt-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-semibold text-base truncate">
                    {category.category?.name || "Unknown"}
                  </h3>
                  {(category as any).custom_title && (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                      {(category as any).custom_title}
                    </Badge>
                  )}
                </div>
                {!isActive && (
                  <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
                    <Badge
                      variant="outline"
                      className="gap-1 rounded-full border-0 px-2 py-0 text-[10px] bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400"
                    >
                      <EyeOff className="h-2.5 w-2.5" />
                      Hidden
                    </Badge>
                  </div>
                )}
              </div>

              <div className="flex shrink-0 items-start gap-1">
                {isGlobal ? (
                  <Badge
                    variant="outline"
                    className="gap-1 rounded-full border-0 bg-emerald-50 px-2 py-0 text-[10px] text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400"
                  >
                    <Globe className="h-2.5 w-2.5" />
                    Global
                  </Badge>
                ) : (
                  <Badge
                    variant="outline"
                    className="gap-1 rounded-full border-0 bg-blue-50 px-2 py-0 text-[10px] text-blue-700 dark:bg-blue-900/20 dark:text-blue-400"
                  >
                    <MapPin className="h-2.5 w-2.5" />
                    {category.category?.location_name || "Location"}
                  </Badge>
                )}
              {showReorderControls && (
              <div className="-mr-1 -mt-1 flex flex-col opacity-60 transition-opacity group-hover:opacity-100">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={(e) => {
                    e.stopPropagation();
                    onMoveUp?.(index);
                  }}
                  disabled={index === 0 || !onMoveUp}
                  title="Move up"
                >
                  <ChevronUp className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={(e) => {
                    e.stopPropagation();
                    onMoveDown?.(index);
                  }}
                  disabled={index === categories.length - 1 || !onMoveDown}
                  title="Move down"
                >
                  <ChevronDown className="h-3.5 w-3.5" />
                </Button>
              </div>
              )}
              </div>
            </div>

            <div className="flex flex-1 flex-col gap-2 px-4 pb-3 pt-2">
              {/* Footer actions */}
              <div
                className="relative mt-auto flex items-center gap-1 pt-2"
                onClick={(event) => event.stopPropagation()}
              >
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1 px-2 text-xs"
                  onClick={() => setItemsForCategory(category)}
                  title="See items in this category"
                >
                  <Utensils className="h-3.5 w-3.5" />
                  Items
                </Button>

                <Button
                  variant="ghost"
                  size="sm"
                  className="absolute left-1/2 h-7 -translate-x-1/2 gap-1 px-2 text-xs"
                  onClick={() =>
                    onToggleVisibility(category.category_id, !isActive)
                  }
                  title={isActive ? "Hide from menu" : "Show in menu"}
                >
                  {isActive ? (
                    <EyeOff className="h-3.5 w-3.5" />
                  ) : (
                    <Eye className="h-3.5 w-3.5" />
                  )}
                  {isActive ? "Hide" : "Show"}
                </Button>

                {showResetButton && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs gap-1"
                    onClick={() => onResetOverride?.(category.category_id)}
                    title="Reset to global"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    Reset
                  </Button>
                )}

                {canModifyCategories && onRemoveCategory && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs gap-1 ml-auto text-destructive hover:text-destructive hover:bg-destructive/10"
                    onClick={() => onRemoveCategory(category.category_id)}
                    title="Remove category from menu"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            </div>
          </Panel>
        );
      })}
    </div>

    <CategoryItemsSheet
      category={itemsForCategory}
      open={!!itemsForCategory}
      onOpenChange={(open) => !open && setItemsForCategory(null)}
      onEditItem={(item, category) => {
        // Hand off to the normal edit flow, closing this panel first so the
        // two overlays never stack.
        setItemsForCategory(null);
        onEditItem?.(item, category, menuId);
      }}
    />
    </>
  );
}
