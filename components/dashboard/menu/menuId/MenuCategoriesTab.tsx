"use client";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Empty } from "@/components/ui/empty";
import {
  Tag,
  Wand2,
  List,
  Table as TableIcon,
  LayoutGrid,
  Info,
} from "lucide-react";
import { MenuCategory, MenuCategoryItem } from "@/types/menu";
import { CategoryTable } from "./CategoryTable";
import { CategoryGrid } from "./CategoryGrid";
import { HiddenCategoriesCard } from "./HiddenCategoriesCard";
import { DraggableCategoriesList } from "./DraggableCategoriesList";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface MenuCategoriesTabProps {
  visibleCategories: MenuCategory[];
  hiddenCategories: MenuCategory[];
  expandedCategories: Set<string>;
  selectedLocationId: string | null;
  menuId: string;
  isMenuLocationOwned?: boolean;
  onToggleCategory: (categoryId: string) => void;
  onExpandAll: () => void;
  onCollapseAll: () => void;
  onItemClick: (itemId: string) => void;
  onToggleVisibility: (categoryId: string, isActive: boolean) => Promise<void>;
  onResetOverride: (categoryId: string) => Promise<void>;
  onEditItem: (
    item: MenuCategoryItem,
    category: MenuCategory,
    menuId: string
  ) => void;
  onAddCategory: () => void;
  onNavigateToCategories: () => void;
  refetchMenu: () => void;
  categoryViewMode?: "list" | "grid" | "table";
  onViewModeChange?: (mode: "list" | "grid" | "table") => void;
  onMoveCategoryUp?: (index: number) => void;
  onMoveCategoryDown?: (index: number) => void;
  onSaveCategoryOrder?: () => Promise<void>;
  onCategoryOrderChange?: (categories: MenuCategory[]) => void;
  onResetCategoryOrder?: () => void;
  hasCategoryOrderChanges?: boolean;
  isSavingCategoryOrder?: boolean;
  onRemoveCategory?: (categoryId: string) => void;
  // Item ordering props
  onItemOrderChange?: (categoryId: string, items: MenuCategoryItem[]) => void;
  onSaveItemOrder?: (categoryId: string) => Promise<void>;
  onResetItemOrder?: (categoryId: string) => void;
  itemOrderChanges?: Map<string, boolean>;
  savingItemOrderFor?: string | null;
  reorderedItemsMap?: Map<string, MenuCategoryItem[]>;
}

export function MenuCategoriesTab({
  visibleCategories,
  hiddenCategories,
  expandedCategories,
  selectedLocationId,
  menuId,
  isMenuLocationOwned,
  onToggleCategory,
  onExpandAll,
  onCollapseAll,
  onItemClick,
  onToggleVisibility,
  onResetOverride,
  onEditItem,
  onAddCategory,
  onNavigateToCategories,
  refetchMenu,
  categoryViewMode = "list",
  onViewModeChange,
  onMoveCategoryUp,
  onMoveCategoryDown,
  onSaveCategoryOrder,
  onCategoryOrderChange,
  onResetCategoryOrder,
  hasCategoryOrderChanges = false,
  isSavingCategoryOrder = false,
  onRemoveCategory,
  // Item ordering
  onItemOrderChange,
  onSaveItemOrder,
  onResetItemOrder,
  itemOrderChanges,
  savingItemOrderFor,
  reorderedItemsMap,
}: MenuCategoriesTabProps) {
  const isAllLocations = !selectedLocationId || selectedLocationId === "all";
  // Cannot add/remove categories when location-scoped viewing a global menu
  const canModifyCategories = isAllLocations || isMenuLocationOwned;

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {categoryViewMode === "list" && (
            <>
              <Button variant="outline" size="sm" onClick={onExpandAll}>
                Expand All
              </Button>
              <Button variant="outline" size="sm" onClick={onCollapseAll}>
                Collapse All
              </Button>
            </>
          )}
          {onViewModeChange && (
            <div className="flex items-center border rounded-md overflow-hidden">
              <Button
                variant={categoryViewMode === "list" ? "default" : "ghost"}
                size="sm"
                className="rounded-none"
                onClick={() => onViewModeChange("list")}
                title="List view (drag to reorder)"
              >
                <List className="h-4 w-4" />
              </Button>
              <Button
                variant={categoryViewMode === "grid" ? "default" : "ghost"}
                size="sm"
                className={cn(
                  "rounded-none border-x",
                  categoryViewMode !== "grid" && "border-x-transparent",
                )}
                onClick={() => onViewModeChange("grid")}
                title="Grid view"
              >
                <LayoutGrid className="h-4 w-4" />
              </Button>
              <Button
                variant={categoryViewMode === "table" ? "default" : "ghost"}
                size="sm"
                className="rounded-none"
                onClick={() => onViewModeChange("table")}
                title="Table view"
              >
                <TableIcon className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          {canModifyCategories ? (
            <Button onClick={onAddCategory} className="gap-1">
              <Wand2 className="h-4 w-4" />
              Add Category
            </Button>
          ) : (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div>
                    <Button
                      onClick={onAddCategory}
                      className="gap-1"
                      disabled={true}
                    >
                      <Wand2 className="h-4 w-4" />
                      Add Category
                    </Button>
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p>
                    Cannot add or remove categories from global menus when
                    viewing a specific location. Switch to "All Locations" to
                    modify categories.
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
      </div>

      {/* Hidden Categories */}
      <HiddenCategoriesCard
        menuId={menuId}
        selectedLocationId={selectedLocationId}
        hiddenCategories={hiddenCategories}
        refetchMenu={refetchMenu}
      />

      {/* Category Sections */}
      {visibleCategories.length === 0 ? (
        <Empty
          icon={Tag}
          title="No categories"
          description={
            canModifyCategories
              ? "Add categories to organize your menu items. Items are displayed within their categories."
              : "This global menu's categories cannot be modified from a location view. Switch to 'All Locations' to add or remove categories."
          }
          action={
            canModifyCategories ? (
              <Button onClick={onAddCategory} className="gap-1">
                <Wand2 className="h-4 w-4" />
                Add Category
              </Button>
            ) : undefined
          }
        />
      ) : categoryViewMode === "table" ? (
        <>
          <CategoryTable
            categories={visibleCategories}
            menuId={menuId}
            selectedLocationId={selectedLocationId}
            isMenuLocationOwned={isMenuLocationOwned}
            onMoveUp={onMoveCategoryUp}
            onMoveDown={onMoveCategoryDown}
            onToggleVisibility={onToggleVisibility}
            onResetOverride={onResetOverride}
            onRemoveCategory={onRemoveCategory}
            hasOrderChanges={hasCategoryOrderChanges}
          />
          {visibleCategories.length > 0 && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Info className="h-4 w-4" />
              <span>
                This order determines how categories appear on the POS system
              </span>
            </div>
          )}
        </>
      ) : categoryViewMode === "grid" ? (
        <>
          <CategoryGrid
            categories={visibleCategories}
            menuId={menuId}
            selectedLocationId={selectedLocationId}
            isMenuLocationOwned={isMenuLocationOwned}
            onMoveUp={onMoveCategoryUp}
            onMoveDown={onMoveCategoryDown}
            onToggleVisibility={onToggleVisibility}
            onResetOverride={onResetOverride}
            onRemoveCategory={onRemoveCategory}
            onItemClick={onItemClick}
            onEditItem={onEditItem}
            hasOrderChanges={hasCategoryOrderChanges}
          />
          {visibleCategories.length > 0 && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Info className="h-4 w-4" />
              <span>
                Use the arrows on each card to reorder categories. Click any
                item chip to open it.
              </span>
            </div>
          )}
        </>
      ) : (
        <>
          {onCategoryOrderChange && onSaveCategoryOrder && (
            <DraggableCategoriesList
              categories={visibleCategories}
              expandedCategories={expandedCategories}
              selectedLocationId={selectedLocationId}
              menuId={menuId}
              isMenuLocationOwned={isMenuLocationOwned}
              onToggleCategory={onToggleCategory}
              onItemClick={onItemClick}
              onToggleVisibility={onToggleVisibility}
              onResetOverride={onResetOverride}
              onEditItem={onEditItem}
              refetchMenu={refetchMenu}
              canModifyCategories={canModifyCategories}
              onCategoryOrderChange={onCategoryOrderChange}
              onSaveCategoryOrder={onSaveCategoryOrder}
              onResetCategoryOrder={onResetCategoryOrder}
              hasCategoryOrderChanges={hasCategoryOrderChanges}
              isSavingCategoryOrder={isSavingCategoryOrder}
              // Item ordering
              onItemOrderChange={onItemOrderChange}
              onSaveItemOrder={onSaveItemOrder}
              onResetItemOrder={onResetItemOrder}
              itemOrderChanges={itemOrderChanges}
              savingItemOrderFor={savingItemOrderFor}
              reorderedItemsMap={reorderedItemsMap}
            />
          )}

          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Info className="h-4 w-4" />
            <span>
              Drag categories to reorder. Hover on the left edge to see the drag
              handle.
            </span>
          </div>
        </>
      )}
    </div>
  );
}
