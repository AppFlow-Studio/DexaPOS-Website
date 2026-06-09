"use client";

import React, { useState } from "react";
import {
  DndContext,
  closestCenter,
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
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Save, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ModifierGroupItemsModel } from "@/types/db-modles";

type ModifierItem = ModifierGroupItemsModel & {
  location_override?: Array<{
    id: string;
    price_modifier: number | null;
    is_active: boolean | null;
    location_id: string;
  }> | null;
};

interface SortableOptionRowProps {
  item: ModifierItem;
  index: number;
  children: React.ReactNode;
}

function SortableOptionRow({ item, index, children }: SortableOptionRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id });

  const style = { transform: CSS.Transform.toString(transform), transition };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(isDragging && "opacity-50 z-50")}
    >
      <div className="flex items-start gap-2">
        <button
          {...attributes}
          {...listeners}
          className="mt-3 flex items-center justify-center w-6 h-6 rounded hover:bg-muted cursor-grab active:cursor-grabbing touch-none shrink-0"
          aria-label="Drag to reorder"
        >
          <GripVertical className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
        <span className="mt-3.5 flex items-center justify-center w-4 h-4 rounded-full bg-muted text-muted-foreground text-[10px] font-medium shrink-0">
          {index + 1}
        </span>
        <div className="flex-1 min-w-0">{children}</div>
      </div>
    </div>
  );
}

interface SortableModifierItemListProps {
  items: ModifierItem[];
  locationId: string | null;
  hasChanges: boolean;
  isSaving: boolean;
  onOrderChange: (items: ModifierItem[]) => void;
  onSave: () => Promise<void>;
  onReset: () => void;
  renderItem: (item: ModifierItem) => React.ReactNode;
}

export function SortableModifierItemList({
  items,
  locationId,
  hasChanges,
  isSaving,
  onOrderChange,
  onSave,
  onReset,
  renderItem,
}: SortableModifierItemListProps) {
  const [activeId, setActiveId] = useState<string | null>(null);

  // Pointer-only — no KeyboardSensor to avoid event capture conflicts with nested DndContext
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);
    if (over && active.id !== over.id) {
      const oldIndex = items.findIndex((i) => i.id === active.id);
      const newIndex = items.findIndex((i) => i.id === over.id);
      if (oldIndex !== -1 && newIndex !== -1) {
        onOrderChange(
          arrayMove(items, oldIndex, newIndex).map((item, idx) => ({
            ...item,
            display_order: idx + 1,
          }))
        );
      }
    }
  };

  const activeItem = activeId ? items.find((i) => i.id === activeId) : null;
  const isLocationScoped = locationId && locationId !== "all";

  return (
    <div className="space-y-2">
      {hasChanges && (
        <div className="flex items-center justify-between p-2 rounded-lg bg-muted/50 border border-dashed">
          <p className="text-xs text-muted-foreground">
            Option order changed
            {isLocationScoped && (
              <span className="ml-1 text-primary">(Location-specific)</span>
            )}
          </p>
          <div className="flex items-center gap-1.5">
            <Button
              variant="ghost"
              size="sm"
              onPointerDown={(e) => { e.stopPropagation(); }}
              onClick={(e) => { e.stopPropagation(); onReset(); }}
              disabled={isSaving}
              className="h-7 text-xs"
            >
              <RotateCcw className="h-3 w-3 mr-1" />
              Reset
            </Button>
            <Button
              size="sm"
              onPointerDown={(e) => { e.stopPropagation(); }}
              onClick={(e) => { e.stopPropagation(); onSave(); }}
              disabled={isSaving}
              className="h-7 text-xs"
            >
              {isSaving ? (
                <span className="flex items-center gap-1">
                  <span className="animate-spin">⏳</span> Saving...
                </span>
              ) : (
                <span className="flex items-center gap-1">
                  <Save className="h-3 w-3" /> Save Order
                </span>
              )}
            </Button>
          </div>
        </div>
      )}

      <div onPointerDown={(e) => e.stopPropagation()}>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={items.map((i) => i.id)}
          strategy={verticalListSortingStrategy}
        >
          <div className="space-y-2">
            {items.map((item, index) => (
              <SortableOptionRow key={item.id} item={item} index={index}>
                {renderItem(item)}
              </SortableOptionRow>
            ))}
          </div>
        </SortableContext>
        <DragOverlay>
          {activeItem && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg border bg-card shadow-xl opacity-90">
              <GripVertical className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-sm font-medium">{activeItem.name}</span>
            </div>
          )}
        </DragOverlay>
      </DndContext>
      </div>
    </div>
  );
}
