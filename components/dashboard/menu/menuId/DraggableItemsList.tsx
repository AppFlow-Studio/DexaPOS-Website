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
import { MenuCategoryItem } from "@/types/menu";
import { CategoryItemRow } from "./CategoryItemRow";

interface SortableItemWrapperProps {
  item: MenuCategoryItem;
  onItemClick: (itemId: string) => void;
  showLocationPricing: boolean;
  onEdit: () => void;
}

function SortableItemWrapper({
  item,
  onItemClick,
  showLocationPricing,
  onEdit,
}: SortableItemWrapperProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.menu_item_id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "relative flex items-center group",
        isDragging && "opacity-50 z-50 bg-muted"
      )}
    >
      {/* Drag Handle */}
      <div
        {...attributes}
        {...listeners}
        className={cn(
          "flex-shrink-0 w-8 h-full flex items-center justify-center cursor-grab active:cursor-grabbing",
          "opacity-40 hover:opacity-100 transition-opacity",
          "touch-none"
        )}
      >
        <GripVertical className="h-4 w-4 text-muted-foreground" />
      </div>

      <div className="flex-1">
        <CategoryItemRow
          item={item}
          onClick={() => onItemClick(item.menu_item_id)}
          showLocationPricing={showLocationPricing}
          onEdit={onEdit}
        />
      </div>
    </div>
  );
}

// Overlay for dragging
function DragOverlayItem({ item }: { item: MenuCategoryItem }) {
  const menuItem = item.menu_item;
  const effectivePrice = menuItem.effective_price ?? 0;

  return (
    <div className="bg-card border rounded-lg shadow-xl p-3 opacity-90">
      <div className="flex items-center gap-3">
        <GripVertical className="h-4 w-4 text-muted-foreground" />
        <span className="font-medium">{menuItem.name}</span>
        <span className="text-sm text-primary font-semibold">
          ${effectivePrice.toFixed(2)}
        </span>
      </div>
    </div>
  );
}

interface DraggableItemsListProps {
  items: MenuCategoryItem[];
  categoryId: string;
  onItemClick: (itemId: string) => void;
  showLocationPricing: boolean;
  onEditItem: (item: MenuCategoryItem) => void;
  // Item ordering
  onItemOrderChange: (items: MenuCategoryItem[]) => void;
  onSaveItemOrder: () => Promise<void>;
  onResetItemOrder?: () => void;
  hasItemOrderChanges: boolean;
  isSavingItemOrder: boolean;
  locationId: string | null;
}

export function DraggableItemsList({
  items,
  categoryId,
  onItemClick,
  showLocationPricing,
  onEditItem,
  onItemOrderChange,
  onSaveItemOrder,
  onResetItemOrder,
  hasItemOrderChanges,
  isSavingItemOrder,
  locationId,
}: DraggableItemsListProps) {
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
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
      const oldIndex = items.findIndex(
        (item) => item.menu_item_id === active.id
      );
      const newIndex = items.findIndex((item) => item.menu_item_id === over.id);

      if (oldIndex !== -1 && newIndex !== -1) {
        const newOrder = arrayMove(items, oldIndex, newIndex);
        // Update display_order values
        const updatedOrder = newOrder.map((item, idx) => ({
          ...item,
          display_order: idx + 1,
        }));
        onItemOrderChange(updatedOrder);
      }
    }
  };

  const activeItem = activeId
    ? items.find((item) => item.menu_item_id === activeId)
    : null;

  const isLocationScoped = locationId && locationId !== "all";

  if (items.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        No items in this category
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* Save/Reset bar when there are changes */}
      {hasItemOrderChanges && (
        <div className="flex items-center justify-between p-2 rounded-lg bg-primary/5 border border-primary/20 mb-2">
          <p className="text-xs text-muted-foreground">
            Item order changed
            {isLocationScoped && (
              <span className="ml-1 text-primary font-medium">
                (Location-specific)
              </span>
            )}
          </p>
          <div className="flex items-center gap-2">
            {onResetItemOrder && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onResetItemOrder}
                disabled={isSavingItemOrder}
                className="h-7 text-xs"
              >
                <RotateCcw className="h-3 w-3 mr-1" />
                Reset
              </Button>
            )}
            <Button
              size="sm"
              onClick={onSaveItemOrder}
              disabled={isSavingItemOrder}
              className="h-7 text-xs"
            >
              {isSavingItemOrder ? (
                <>
                  <span className="animate-spin mr-1">⏳</span>
                  Saving...
                </>
              ) : (
                <>
                  <Save className="h-3 w-3 mr-1" />
                  Save
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
          items={items.map((item) => item.menu_item_id)}
          strategy={verticalListSortingStrategy}
        >
          <div className="divide-y">
            {items.map((item) => (
              <SortableItemWrapper
                key={item.menu_item_id}
                item={item}
                onItemClick={onItemClick}
                showLocationPricing={showLocationPricing}
                onEdit={() => onEditItem(item)}
              />
            ))}
          </div>
        </SortableContext>
        <DragOverlay>
          {activeItem && <DragOverlayItem item={activeItem} />}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
