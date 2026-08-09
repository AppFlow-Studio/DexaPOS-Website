"use client";

import React, { useState } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Save, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { MenuCategory, MenuCategoryItem } from "@/types/menu";
import { CategorySection } from "./CategorySection";

interface SortableCategoryWrapperProps {
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
    menuId: string
  ) => void;
  onCategoryRemoved?: () => void;
  // Item ordering
  onItemOrderChange?: (categoryId: string, items: MenuCategoryItem[]) => void;
  onSaveItemOrder?: (categoryId: string) => Promise<void>;
  onResetItemOrder?: (categoryId: string) => void;
  hasItemOrderChanges?: boolean;
  isSavingItemOrder?: boolean;
  reorderedItems?: MenuCategoryItem[]; // The reordered items for this category
  // Selection mode
  isSelectionMode?: boolean;
  selectedItemIds?: Set<string>;
  onToggleItem?: (itemId: string) => void;
  onToggleCategoryItems?: (categoryId: string, itemIds: string[]) => void;
}

function SortableCategoryWrapper({
  category,
  menuId,
  isExpanded,
  onToggle,
  onItemClick,
  showLocationPricing,
  locationId,
  isMenuLocationOwned,
  canModifyCategories,
  onToggleVisibility,
  onResetOverride,
  onEditItem,
  onCategoryRemoved,
  // Item ordering
  onItemOrderChange,
  onSaveItemOrder,
  onResetItemOrder,
  hasItemOrderChanges,
  isSavingItemOrder,
  reorderedItems,
  // Selection
  isSelectionMode = false,
  selectedItemIds,
  onToggleItem,
  onToggleCategoryItems,
}: SortableCategoryWrapperProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: category.category_id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "group relative flex items-stretch gap-0",
        isDragging && "opacity-50 z-50"
      )}
    >
      {/* Drag handle — hidden until the row is hovered, matching the hint text
          below the list. Kept mounted (not conditionally rendered) so the row
          never reflows, and revealed on keyboard focus for a11y. */}
      <div
        {...attributes}
        {...listeners}
        className={cn(
          "flex-shrink-0 w-10 flex items-center justify-center cursor-grab active:cursor-grabbing",
          // Borderless: the handle reads as part of the card, not a separate
          // gutter. Hover alone carries the affordance.
          "rounded-l-2xl bg-transparent text-muted-foreground/40 hover:bg-muted/60 hover:text-muted-foreground",
          "touch-none opacity-0 transition-[opacity,background-color,color] focus-visible:opacity-100 group-hover:opacity-100",
          isDragging && "opacity-100"
        )}
      >
        <GripVertical className="h-5 w-5 text-muted-foreground" />
      </div>

      <div className="flex-1 min-w-0">
        <CategorySection
          category={category}
          menuId={menuId}
          isExpanded={isExpanded}
          onToggle={onToggle}
          onItemClick={onItemClick}
          showLocationPricing={showLocationPricing}
          locationId={locationId}
          isMenuLocationOwned={isMenuLocationOwned}
          canModifyCategories={canModifyCategories}
          onToggleVisibility={onToggleVisibility}
          onResetOverride={onResetOverride}
          onEditItem={onEditItem}
          onCategoryRemoved={onCategoryRemoved}
          // Pass item ordering props
          reorderedItems={reorderedItems}
          onItemOrderChange={onItemOrderChange}
          onSaveItemOrder={onSaveItemOrder}
          onResetItemOrder={onResetItemOrder}
          hasItemOrderChanges={hasItemOrderChanges}
          isSavingItemOrder={isSavingItemOrder}
          // Selection
          isSelectionMode={isSelectionMode}
          selectedItemIds={selectedItemIds}
          onToggleItem={onToggleItem}
          onToggleCategoryItems={
            onToggleCategoryItems
              ? (itemIds) => onToggleCategoryItems(category.category_id, itemIds)
              : undefined
          }
        />
      </div>
    </div>
  );
}

// Overlay for dragging
function DragOverlayCategory({ category }: { category: MenuCategory }) {
  return (
    <div className="bg-card border rounded-lg shadow-xl p-4 opacity-90">
      <div className="flex items-center gap-3">
        <GripVertical className="h-5 w-5 text-muted-foreground" />
        <span className="font-medium">
          {category.category?.name || "Category"}
        </span>
        <span className="text-sm text-muted-foreground">
          ({category.items?.length || 0} items)
        </span>
      </div>
    </div>
  );
}

interface DraggableCategoriesListProps {
  categories: MenuCategory[];
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
  refetchMenu: () => void;
  canModifyCategories?: boolean;
  // Category ordering
  onCategoryOrderChange: (categories: MenuCategory[]) => void;
  onSaveCategoryOrder: () => Promise<void>;
  onResetCategoryOrder?: () => void;
  hasCategoryOrderChanges: boolean;
  isSavingCategoryOrder: boolean;
  // Item ordering
  onItemOrderChange?: (categoryId: string, items: MenuCategoryItem[]) => void;
  onSaveItemOrder?: (categoryId: string) => Promise<void>;
  onResetItemOrder?: (categoryId: string) => void;
  itemOrderChanges?: Map<string, boolean>; // Map<categoryId, hasChanges>
  savingItemOrderFor?: string | null; // categoryId being saved
  reorderedItemsMap?: Map<string, MenuCategoryItem[]>; // Map<categoryId, reordered items>
  // Selection mode
  isSelectionMode?: boolean;
  selectedItemIds?: Set<string>;
  onToggleItem?: (itemId: string) => void;
  onToggleCategoryItems?: (categoryId: string, itemIds: string[]) => void;
}

export function DraggableCategoriesList({
  categories,
  expandedCategories,
  selectedLocationId,
  menuId,
  isMenuLocationOwned,
  onToggleCategory,
  onItemClick,
  onToggleVisibility,
  onResetOverride,
  onEditItem,
  refetchMenu,
  canModifyCategories = true,
  onCategoryOrderChange,
  onSaveCategoryOrder,
  onResetCategoryOrder,
  hasCategoryOrderChanges,
  isSavingCategoryOrder,
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
}: DraggableCategoriesListProps) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const showLocationPricing =
    selectedLocationId !== "all" && !!selectedLocationId;

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5, // Reduced from 10px for easier dragging
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);

    if (over && active.id !== over.id) {
      const oldIndex = categories.findIndex((c) => c.category_id === active.id);
      const newIndex = categories.findIndex((c) => c.category_id === over.id);

      if (oldIndex !== -1 && newIndex !== -1) {
        const newOrder = arrayMove(categories, oldIndex, newIndex);
        // Update display_order values
        const updatedOrder = newOrder.map((cat, idx) => ({
          ...cat,
          display_order: idx + 1,
        }));
        onCategoryOrderChange(updatedOrder);
      }
    }
  };

  const activeCategory = activeId
    ? categories.find((c) => c.category_id === activeId)
    : null;

  const isLocationScoped = selectedLocationId && selectedLocationId !== "all";

  return (
    <div className="space-y-4">
      {/* Save/Reset bar when there are changes */}
      {hasCategoryOrderChanges && (
        <div className="flex items-center justify-between p-3 rounded-lg bg-primary/5 border border-primary/20">
          <p className="text-sm text-muted-foreground">
            Category order changed
            {isLocationScoped && (
              <span className="ml-1 text-primary font-medium">
                (Location-specific)
              </span>
            )}
          </p>
          <div className="flex items-center gap-2">
            {onResetCategoryOrder && (
              <Button
                variant="outline"
                size="sm"
                onClick={onResetCategoryOrder}
                disabled={isSavingCategoryOrder}
              >
                <RotateCcw className="h-4 w-4 mr-1" />
                Reset
              </Button>
            )}
            <Button
              size="sm"
              onClick={onSaveCategoryOrder}
              disabled={isSavingCategoryOrder}
            >
              {isSavingCategoryOrder ? (
                <>
                  <span className="animate-spin mr-1">⏳</span>
                  Saving...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-1" />
                  Save Order
                </>
              )}
            </Button>
          </div>
        </div>
      )}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={categories.map((c) => c.category_id)}
          strategy={verticalListSortingStrategy}
        >
          {categories.map((category) => (
            <SortableCategoryWrapper
              key={category.category_id}
              category={category}
              menuId={menuId}
              isExpanded={expandedCategories.has(category.id)}
              onToggle={() => onToggleCategory(category.id)}
              onItemClick={onItemClick}
              showLocationPricing={showLocationPricing}
              locationId={selectedLocationId}
              isMenuLocationOwned={isMenuLocationOwned}
              canModifyCategories={canModifyCategories}
              onToggleVisibility={onToggleVisibility}
              onResetOverride={onResetOverride}
              onEditItem={onEditItem}
              onCategoryRemoved={refetchMenu}
              // Item ordering
              reorderedItems={reorderedItemsMap?.get(category.category_id)}
              onItemOrderChange={onItemOrderChange}
              onSaveItemOrder={onSaveItemOrder}
              onResetItemOrder={onResetItemOrder}
              hasItemOrderChanges={
                itemOrderChanges?.get(category.category_id) || false
              }
              isSavingItemOrder={savingItemOrderFor === category.category_id}
              // Selection
              isSelectionMode={isSelectionMode}
              selectedItemIds={selectedItemIds}
              onToggleItem={onToggleItem}
              onToggleCategoryItems={onToggleCategoryItems}
            />
          ))}
        </SortableContext>
        <DragOverlay>
          {activeCategory && <DragOverlayCategory category={activeCategory} />}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
