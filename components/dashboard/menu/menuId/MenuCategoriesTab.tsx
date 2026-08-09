"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Empty } from "@/components/ui/empty";
import {
  Tag,
  FolderPlus,
  List,
  Table as TableIcon,
  LayoutGrid,
  Info,
  CheckSquare,
  ArrowUpDown,
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
  // Selection mode
  isSelectionMode?: boolean;
  selectedItemIds?: Set<string>;
  onToggleItem?: (itemId: string) => void;
  onToggleCategoryItems?: (categoryId: string, itemIds: string[]) => void;
  selectedCount?: number;
  onToggleSelectionMode?: () => void;
}

export function MenuCategoriesTab({
  visibleCategories,
  hiddenCategories,
  expandedCategories,
  selectedLocationId,
  menuId,
  isMenuLocationOwned,
  onToggleCategory,
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
  // Selection
  isSelectionMode = false,
  selectedItemIds,
  onToggleItem,
  onToggleCategoryItems,
  selectedCount = 0,
  onToggleSelectionMode,
}: MenuCategoriesTabProps) {
  const isAllLocations = !selectedLocationId || selectedLocationId === "all";
  const [isTableReorderMode, setIsTableReorderMode] = useState(false);
  const [isGridReorderMode, setIsGridReorderMode] = useState(false);
  const [isListReorderMode, setIsListReorderMode] = useState(false);
  // Cannot add/remove categories when location-scoped viewing a global menu
  const canModifyCategories = isAllLocations || isMenuLocationOwned;

  return (
    <div className="contents">
      {/* Controls */}
      <div className="order-1 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {onToggleSelectionMode && categoryViewMode === "list" && (
            <Button
              variant={isSelectionMode ? "secondary" : "outline"}
              size="sm"
              className="order-2 h-8 gap-1 px-3 text-xs"
              onClick={onToggleSelectionMode}
            >
              <CheckSquare className="h-3.5 w-3.5" />
              {isSelectionMode ? "Selecting" : "Select"}
              {isSelectionMode && selectedCount > 0 && (
                <Badge variant="secondary" className="ml-0.5 h-5 px-1.5 text-xs">
                  {selectedCount}
                </Badge>
              )}
            </Button>
          )}
          {onViewModeChange && (
            // One pill rail, matching the tab rail — no bordered segments.
            <div className="order-1 flex h-8 items-center gap-0.5 rounded-full bg-muted/70 p-1">
              <Button
                variant="ghost"
                size="sm"
                className={cn(
                  "h-6 rounded-full px-2.5 text-muted-foreground shadow-none hover:text-foreground",
                  categoryViewMode === "list" &&
                    "bg-background text-foreground shadow-sm ring-1 ring-border",
                )}
                onClick={() => {
                  onViewModeChange("list");
                }}
                title="List view (drag to reorder)"
              >
                <List className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className={cn(
                  "h-6 rounded-full px-2.5 text-muted-foreground shadow-none hover:text-foreground",
                  categoryViewMode === "grid" &&
                    "bg-background text-foreground shadow-sm ring-1 ring-border",
                )}
                onClick={() => {
                  if (isSelectionMode) onToggleSelectionMode?.();
                  onViewModeChange("grid");
                }}
                title="Grid view"
              >
                <LayoutGrid className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className={cn(
                  "h-6 rounded-full px-2.5 text-muted-foreground shadow-none hover:text-foreground",
                  categoryViewMode === "table" &&
                    "bg-background text-foreground shadow-sm ring-1 ring-border",
                )}
                onClick={() => {
                  if (isSelectionMode) onToggleSelectionMode?.();
                  onViewModeChange("table");
                }}
                title="Table view"
              >
                <TableIcon className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}
          {categoryViewMode === "table" && onViewModeChange && (
            <Button
              variant="outline"
              size="sm"
              className="order-3 h-8 gap-1.5 rounded-full px-3 text-xs"
              onClick={() => {
                setIsTableReorderMode((current) => !current);
              }}
              title="Show drag handles in the table"
            >
              <ArrowUpDown className="h-3.5 w-3.5" />
              {isTableReorderMode ? "Done" : "Reorder"}
            </Button>
          )}
          {categoryViewMode === "grid" && (
            <Button
              variant="outline"
              size="sm"
              className="order-3 h-8 gap-1.5 rounded-full px-3 text-xs"
              onClick={() => setIsGridReorderMode((current) => !current)}
            >
              <ArrowUpDown className="h-3.5 w-3.5" />
              {isGridReorderMode ? "Done" : "Reorder"}
            </Button>
          )}
          {categoryViewMode === "list" && (
            <Button
              variant="outline"
              size="sm"
              className="order-3 h-8 gap-1.5 rounded-full px-3 text-xs"
              onClick={() => setIsListReorderMode((current) => !current)}
            >
              <ArrowUpDown className="h-3.5 w-3.5" />
              {isListReorderMode ? "Done" : "Reorder"}
            </Button>
          )}
          {(categoryViewMode === "table" || categoryViewMode === "grid") && hasCategoryOrderChanges && (
            <>
              <Button
                variant="ghost"
                size="sm"
                className="order-3 h-8 text-xs"
                onClick={onResetCategoryOrder}
                disabled={isSavingCategoryOrder}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                className="order-3 h-8 text-xs"
                onClick={onSaveCategoryOrder}
                disabled={isSavingCategoryOrder}
              >
                {isSavingCategoryOrder ? "Saving…" : "Save order"}
              </Button>
            </>
          )}
          {canModifyCategories ? (
            <Button
              onClick={onAddCategory}
              size="sm"
              className="order-4 ml-1 h-8 w-8 gap-1 rounded-full px-0 text-xs sm:w-auto sm:px-3"
              aria-label="Add category"
            >
              <FolderPlus className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Add Category</span>
            </Button>
          ) : (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="order-4 ml-1">
                    <Button
                      onClick={onAddCategory}
                      size="sm"
                      className="h-8 w-8 gap-1 rounded-full px-0 text-xs sm:w-auto sm:px-3"
                      disabled={true}
                      aria-label="Add category"
                    >
                      <FolderPlus className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">Add Category</span>
                    </Button>
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p>
                    Cannot add or remove categories from global menus when
                    viewing a specific location. Switch to &ldquo;All Locations&rdquo; to
                    modify categories.
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
      </div>

      <div className="order-3 space-y-4">
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
                <FolderPlus className="h-4 w-4" />
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
            onToggleVisibility={onToggleVisibility}
            onResetOverride={onResetOverride}
            onRemoveCategory={onRemoveCategory}
            onEditItem={onEditItem}
            hasOrderChanges={hasCategoryOrderChanges}
            isReorderMode={isTableReorderMode}
            onCategoryOrderChange={onCategoryOrderChange}
          />
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
            onEditItem={onEditItem}
            hasOrderChanges={hasCategoryOrderChanges}
            showReorderControls={isGridReorderMode}
          />
          {visibleCategories.length > 0 && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Info className="h-4 w-4" />
              <span>
                Click Items to see the category items.
              </span>
            </div>
          )}
        </>
      ) : (
        <>
          {onCategoryOrderChange && onSaveCategoryOrder && (
            <DraggableCategoriesList
              isReorderMode={isListReorderMode}
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
              isSelectionMode={isSelectionMode}
              selectedItemIds={selectedItemIds}
              onToggleItem={onToggleItem}
              onToggleCategoryItems={onToggleCategoryItems}
            />
          )}

        </>
      )}
      </div>
    </div>
  );
}
