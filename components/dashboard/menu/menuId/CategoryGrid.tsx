"use client";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  ChevronUp,
  ChevronDown,
  Eye,
  EyeOff,
  Globe,
  MapPin,
  Trash2,
  RotateCcw,
  Tag,
  Hash,
  ArrowUpDown,
  Utensils,
} from "lucide-react";
import { MenuCategory, MenuCategoryItem } from "@/types/menu";
import { cn, isValidImageUrl } from "@/lib/utils";

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
  onItemClick?: (itemId: string) => void;
  onEditItem?: (
    item: MenuCategoryItem,
    category: MenuCategory,
    menuId: string,
  ) => void;
  hasOrderChanges?: boolean;
}

const PREVIEW_LIMIT = 6;

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
  onItemClick,
  hasOrderChanges = false,
}: CategoryGridProps) {
  const isAllLocations = !selectedLocationId || selectedLocationId === "all";
  const canModifyCategories = isAllLocations || isMenuLocationOwned;

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 animate-in fade-in duration-300">
      {categories.map((category, index) => {
        const items = category.items ?? [];
        const itemCount = items.length;
        const categoryLocationId = category.category?.location_id;
        const isGlobal = !categoryLocationId;
        const isActive = category.is_active;
        const previewItems = items.slice(0, PREVIEW_LIMIT);
        const overflow = Math.max(0, itemCount - PREVIEW_LIMIT);
        const showResetButton =
          !isAllLocations &&
          category.category?.location_id === null &&
          !!onResetOverride;

        return (
          <Card
            key={category.id}
            className={cn(
              "group flex flex-col overflow-hidden transition-all duration-200",
              "hover:shadow-md hover:border-primary/40",
              !isActive && "opacity-70 bg-muted/30",
            )}
          >
            {/* Header strip */}
            <div className="flex items-start justify-between gap-2 px-4 pt-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <Tag className="h-4 w-4 text-primary shrink-0" />
                  <h3 className="font-semibold text-base truncate">
                    {category.category?.name || "Unknown"}
                  </h3>
                  {(category as any).custom_title && (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                      {(category as any).custom_title}
                    </Badge>
                  )}
                </div>
                <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
                  {isGlobal ? (
                    <Badge
                      variant="outline"
                      className="gap-1 text-[10px] px-1.5 py-0 bg-emerald-50 text-emerald-700 border-emerald-200"
                    >
                      <Globe className="h-2.5 w-2.5" />
                      Global
                    </Badge>
                  ) : (
                    <Badge
                      variant="outline"
                      className="gap-1 text-[10px] px-1.5 py-0 bg-blue-50 text-blue-700 border-blue-200"
                    >
                      <MapPin className="h-2.5 w-2.5" />
                      {category.category?.location_name || "Location"}
                    </Badge>
                  )}
                  <Badge
                    variant="outline"
                    className={cn(
                      "gap-1 text-[10px] px-1.5 py-0",
                      isActive
                        ? "bg-green-50 text-green-700 border-green-200"
                        : "bg-amber-50 text-amber-700 border-amber-200",
                    )}
                  >
                    {isActive ? (
                      <Eye className="h-2.5 w-2.5" />
                    ) : (
                      <EyeOff className="h-2.5 w-2.5" />
                    )}
                    {isActive ? "Active" : "Hidden"}
                  </Badge>
                </div>
              </div>

              {/* Reorder controls */}
              <div className="flex flex-col -mr-1 -mt-1 opacity-60 group-hover:opacity-100 transition-opacity">
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
            </div>

            <CardContent className="flex-1 px-4 pt-3 pb-4 flex flex-col gap-3">
              {/* Description */}
              {category.category?.description ? (
                <p className="text-sm text-muted-foreground line-clamp-2">
                  {category.category.description}
                </p>
              ) : (
                <p className="text-sm text-muted-foreground/60 italic">
                  No description
                </p>
              )}

              {/* Stat row */}
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <Hash className="h-3 w-3" />
                  Order {category.display_order ?? "—"}
                </span>
                <span className="inline-flex items-center gap-1">
                  <ArrowUpDown className="h-3 w-3" />
                  {itemCount} {itemCount === 1 ? "item" : "items"}
                </span>
              </div>

              {/* Item preview */}
              <div className="rounded-md border bg-muted/20 p-2">
                {previewItems.length === 0 ? (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground py-1.5 px-1">
                    <Utensils className="h-3.5 w-3.5 opacity-60" />
                    No items in this category
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {previewItems.map((it) => {
                      const itemName =
                        (it as any).menu_item?.name ??
                        (it as any).name ??
                        "Item";
                      const itemId =
                        (it as any).menu_item?.id ??
                        (it as any).menu_item_id ??
                        (it as any).id;
                      const img =
                        (it as any).menu_item?.image ?? (it as any).image;
                      return (
                        <button
                          key={itemId}
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (itemId) onItemClick?.(itemId);
                          }}
                          className="inline-flex items-center gap-1.5 rounded-md border bg-background px-2 py-1 text-xs transition-colors hover:border-primary/40 hover:bg-primary/5 max-w-40"
                          title={itemName}
                        >
                          {isValidImageUrl(img) ? (
                            <img
                              src={img}
                              alt=""
                              className="h-4 w-4 rounded object-cover shrink-0"
                            />
                          ) : (
                            <Utensils className="h-3 w-3 text-muted-foreground shrink-0" />
                          )}
                          <span className="truncate">{itemName}</span>
                        </button>
                      );
                    })}
                    {overflow > 0 && (
                      <span className="inline-flex items-center rounded-md border border-dashed bg-background px-2 py-1 text-xs text-muted-foreground">
                        +{overflow} more
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Footer actions */}
              <div className="mt-auto flex items-center gap-1 flex-wrap pt-1 border-t">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs gap-1"
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
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
