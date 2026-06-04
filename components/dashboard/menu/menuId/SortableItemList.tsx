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
import { GripVertical, Save, RotateCcw, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { MenuCategoryItem } from "@/types/menu";

interface SortableItemRowProps {
  item: MenuCategoryItem;
  index: number;
}

function SortableItemRow({ item, index }: SortableItemRowProps) {
  const menuItem = item.menu_item;
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

  const effectivePrice = menuItem.effective_price ?? 0;
  const isAvailable = menuItem.effective_availability ?? true;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex items-center gap-3 p-2.5 rounded-lg border bg-card transition-all",
        isDragging && "opacity-50 shadow-lg z-50",
        !isAvailable && "opacity-60"
      )}
    >
      {/* Drag Handle */}
      <button
        {...attributes}
        {...listeners}
        className="flex items-center justify-center w-7 h-7 rounded hover:bg-muted cursor-grab active:cursor-grabbing touch-none"
        aria-label="Drag to reorder"
      >
        <GripVertical className="h-4 w-4 text-muted-foreground" />
      </button>

      {/* Order Number */}
      <span className="flex items-center justify-center w-5 h-5 rounded-full bg-muted text-muted-foreground text-xs font-medium">
        {index + 1}
      </span>

      {/* Item Image/Placeholder */}
      <div className="w-10 h-10 rounded-md bg-muted/50 flex items-center justify-center overflow-hidden shrink-0">
        {menuItem.image ? (
          <img
            src={menuItem.image}
            alt={menuItem.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <span className="text-lg">🍽️</span>
        )}
      </div>

      {/* Item Info */}
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2 min-w-0">
          <span className="font-medium text-sm truncate min-w-0">{menuItem.name}</span>
          {item.is_featured && (
            <Star className="h-3 w-3 text-yellow-500 fill-yellow-500 shrink-0" />
          )}
          {!isAvailable && (
            <Badge variant="secondary" className="text-xs shrink-0">
              Unavailable
            </Badge>
          )}
        </div>
      </div>

      {/* Price */}
      <div className="text-right shrink-0">
        <span className="font-semibold text-sm text-primary">
          ${effectivePrice.toFixed(2)}
        </span>
      </div>
    </div>
  );
}

// Overlay for dragging
function DragOverlayContent({
  item,
  index,
}: {
  item: MenuCategoryItem;
  index: number;
}) {
  const menuItem = item.menu_item;

  return (
    <div className="flex items-center gap-3 p-2.5 rounded-lg border bg-card shadow-xl">
      <div className="flex items-center justify-center w-7 h-7 rounded bg-muted">
        <GripVertical className="h-4 w-4 text-muted-foreground" />
      </div>
      <span className="flex items-center justify-center w-5 h-5 rounded-full bg-muted text-muted-foreground text-xs font-medium">
        {index + 1}
      </span>
      <div className="w-10 h-10 rounded-md bg-muted/50 flex items-center justify-center">
        <span className="text-lg">🍽️</span>
      </div>
      <span className="font-medium text-sm truncate">{menuItem.name}</span>
    </div>
  );
}

interface SortableItemListProps {
  items: MenuCategoryItem[];
  categoryId: string;
  onOrderChange: (items: MenuCategoryItem[]) => void;
  onSave: () => Promise<void>;
  onReset?: () => void;
  hasChanges: boolean;
  isSaving: boolean;
  locationId: string | null;
}

export function SortableItemList({
  items,
  categoryId,
  onOrderChange,
  onSave,
  onReset,
  hasChanges,
  isSaving,
  locationId,
}: SortableItemListProps) {
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
        onOrderChange(updatedOrder);
      }
    }
  };

  const activeItem = activeId
    ? items.find((item) => item.menu_item_id === activeId)
    : null;
  const activeIndex = activeId
    ? items.findIndex((item) => item.menu_item_id === activeId)
    : -1;

  const isLocationScoped = locationId && locationId !== "all";

  if (items.length === 0) {
    return (
      <div className="py-4 text-center text-muted-foreground text-sm">
        No items in this category
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {hasChanges && (
        <div className="flex items-center justify-between p-2 rounded-lg bg-muted/50 border border-dashed">
          <p className="text-sm text-muted-foreground">
            Item order changed
            {isLocationScoped && (
              <span className="ml-1 text-primary">(Location-specific)</span>
            )}
          </p>
          <div className="flex items-center gap-2">
            {onReset && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onReset}
                disabled={isSaving}
              >
                <RotateCcw className="h-3 w-3 mr-1" />
                Reset
              </Button>
            )}
            <Button size="sm" onClick={onSave} disabled={isSaving}>
              {isSaving ? (
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
          <div className="space-y-1.5">
            {items.map((item, index) => (
              <SortableItemRow
                key={item.menu_item_id}
                item={item}
                index={index}
              />
            ))}
          </div>
        </SortableContext>
        <DragOverlay>
          {activeItem && (
            <DragOverlayContent item={activeItem} index={activeIndex} />
          )}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
