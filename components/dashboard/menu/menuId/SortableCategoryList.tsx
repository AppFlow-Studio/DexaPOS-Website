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
import { Panel, PanelSection } from "@/components/dashboard/shell";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { MenuCategory } from "@/types/menu";

interface SortableCategoryItemProps {
  category: MenuCategory;
  index: number;
  isActive?: boolean;
}

function SortableCategoryItem({
  category,
  index,
  isActive = true,
}: SortableCategoryItemProps) {
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
        "flex items-center gap-3 p-3 rounded-lg border bg-card transition-all",
        isDragging && "opacity-50 shadow-lg z-50",
        !isActive && "opacity-60"
      )}
    >
      {/* Drag Handle */}
      <button
        {...attributes}
        {...listeners}
        className="flex items-center justify-center w-8 h-8 rounded hover:bg-muted cursor-grab active:cursor-grabbing touch-none"
        aria-label="Drag to reorder"
      >
        <GripVertical className="h-5 w-5 text-muted-foreground" />
      </button>

      {/* Order Number */}
      <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary text-sm font-medium">
        {index + 1}
      </span>

      {/* Category Info */}
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2 min-w-0">
          <span className="font-medium truncate min-w-0">
            {category.category?.name || "Unnamed Category"}
          </span>
          {!category.is_active && (
            <Badge variant="secondary" className="text-xs shrink-0">
              Hidden
            </Badge>
          )}
          {category.category?.location_id && (
            <Badge variant="outline" className="text-xs shrink-0">
              {category.category?.location_name || "Location"}
            </Badge>
          )}
        </div>
        <p className="text-sm text-muted-foreground truncate">
          {category.items?.length || 0} items
        </p>
      </div>
    </div>
  );
}

// Overlay for dragging
function DragOverlayContent({
  category,
  index,
}: {
  category: MenuCategory;
  index: number;
}) {
  return (
    <div className="flex items-center gap-3 p-3 rounded-lg border bg-card shadow-xl">
      <div className="flex items-center justify-center w-8 h-8 rounded bg-muted">
        <GripVertical className="h-5 w-5 text-muted-foreground" />
      </div>
      <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary text-sm font-medium">
        {index + 1}
      </span>
      <div className="flex-1 min-w-0">
        <span className="font-medium truncate">
          {category.category?.name || "Unnamed Category"}
        </span>
      </div>
    </div>
  );
}

interface SortableCategoryListProps {
  categories: MenuCategory[];
  onOrderChange: (categories: MenuCategory[]) => void;
  onSave: () => Promise<void>;
  onReset?: () => void;
  hasChanges: boolean;
  isSaving: boolean;
  locationId: string | null;
}

export function SortableCategoryList({
  categories,
  onOrderChange,
  onSave,
  onReset,
  hasChanges,
  isSaving,
  locationId,
}: SortableCategoryListProps) {
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
      const oldIndex = categories.findIndex((c) => c.category_id === active.id);
      const newIndex = categories.findIndex((c) => c.category_id === over.id);

      if (oldIndex !== -1 && newIndex !== -1) {
        const newOrder = arrayMove(categories, oldIndex, newIndex);
        // Update display_order values
        const updatedOrder = newOrder.map((cat, idx) => ({
          ...cat,
          display_order: idx + 1,
        }));
        onOrderChange(updatedOrder);
      }
    }
  };

  const activeCategory = activeId
    ? categories.find((c) => c.category_id === activeId)
    : null;
  const activeIndex = activeId
    ? categories.findIndex((c) => c.category_id === activeId)
    : -1;

  const isLocationScoped = locationId && locationId !== "all";

  return (
    <Panel>
      <PanelSection
        label="Category Order"
        caption={
          <>
            Drag categories to reorder them
            {isLocationScoped && (
              /* Brand accent literal — `text-primary` is violet (C5). */
              <span className="ml-1 text-[#0C4FD1] dark:text-[#6CA0FF]">
                (Location-specific)
              </span>
            )}
          </>
        }
        action={
          hasChanges ? (
            <div className="flex items-center gap-2">
              {onReset && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onReset}
                  disabled={isSaving}
                  className="rounded-full"
                >
                  <RotateCcw className="h-4 w-4 mr-1" />
                  Reset
                </Button>
              )}
              <Button size="sm" onClick={onSave} disabled={isSaving} className="rounded-full">
                {isSaving ? (
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
          ) : undefined
        }
        className="space-y-2"
      >
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
            {categories.map((category, index) => (
              <SortableCategoryItem
                key={category.category_id}
                category={category}
                index={index}
                isActive={category.is_active}
              />
            ))}
          </SortableContext>
          <DragOverlay>
            {activeCategory && (
              <DragOverlayContent
                category={activeCategory}
                index={activeIndex}
              />
            )}
          </DragOverlay>
        </DndContext>

        {categories.length === 0 && (
          <div className="py-8 text-center text-muted-foreground">
            No categories to reorder
          </div>
        )}
      </PanelSection>
    </Panel>
  );
}
