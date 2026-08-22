"use client";

import React, { useState } from "react";
import {
  DndContext,
  closestCenter,
  MouseSensor,
  TouchSensor,
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
  rectSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Save, RotateCcw, Loader2 } from "lucide-react";
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
  /** Receives the grip so the card itself can place it inside its own padding. */
  children: (dragHandle: React.ReactNode) => React.ReactNode;
}

function SortableOptionRow({ item, children }: SortableOptionRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id });

  const style = { transform: CSS.Transform.toString(transform), transition };

  // Handed to the card rather than rendered beside it: sitting outside, the
  // grip pushed the card in by ~24px at every width and left a ragged left
  // edge against the group card above it.
  const dragHandle = (
    <button
      {...attributes}
      {...listeners}
      className="flex h-6 w-6 shrink-0 cursor-grab items-center justify-center rounded-full touch-none text-muted-foreground hover:bg-background/80 hover:text-foreground active:cursor-grabbing"
      aria-label={`Drag ${item.name} to reorder`}
      onClick={(e) => e.stopPropagation()}
    >
      <GripVertical className="h-3.5 w-3.5" />
    </button>
  );

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn("min-w-0", isDragging && "opacity-50 z-50")}
    >
      {children(dragHandle)}
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
  renderItem: (
    item: ModifierItem,
    dragHandle: React.ReactNode,
  ) => React.ReactNode;
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

  // Pointer-only — no KeyboardSensor to avoid event capture conflicts with nested DndContext.
  // Both drags start from the grip (which is `touch-none`), so touch needs no long-press delay;
  // a short distance threshold keeps an imprecise tap on the grip from jittering into a drag.
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { distance: 8 } })
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
    <div className="min-w-0 space-y-2">
      {hasChanges && (
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-2xl border-0 bg-muted/60 p-3 shadow-none">
          <p className="min-w-0 flex-1 basis-32 text-xs text-muted-foreground">
            Option order changed
            {isLocationScoped && (
              <span className="ml-1 text-primary">(Location-specific)</span>
            )}
          </p>
          <div className="flex shrink-0 items-center gap-1.5">
            <Button
              variant="ghost"
              size="sm"
              onPointerDown={(e) => { e.stopPropagation(); }}
              onClick={(e) => { e.stopPropagation(); onReset(); }}
              disabled={isSaving}
              className="h-7 shrink-0 rounded-full px-3 text-xs"
            >
              <RotateCcw className="size-3 shrink-0" />
              Reset
            </Button>
            <Button
              size="sm"
              onPointerDown={(e) => { e.stopPropagation(); }}
              onClick={(e) => { e.stopPropagation(); onSave(); }}
              disabled={isSaving}
              className="h-7 shrink-0 rounded-full px-3 text-xs"
            >
              {isSaving ? (
                <>
                  <Loader2 className="size-3 shrink-0 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="size-3 shrink-0" />
                  <span>
                    Save<span className="hidden xs:inline">&nbsp;Order</span>
                  </span>
                </>
              )}
            </Button>
          </div>
        </div>
      )}

      <div className="min-w-0" onPointerDown={(e) => e.stopPropagation()}>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        {/* Two per row from `sm` up. `rectSortingStrategy`, not the vertical
            one: in a grid the items also move horizontally, and the vertical
            strategy only ever offsets along Y — the preview would slide the
            wrong way on every drag that crosses a column. */}
        <SortableContext
          items={items.map((i) => i.id)}
          strategy={rectSortingStrategy}
        >
          <div className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2">
            {items.map((item) => (
              <SortableOptionRow key={item.id} item={item}>
                {(dragHandle) => renderItem(item, dragHandle)}
              </SortableOptionRow>
            ))}
          </div>
        </SortableContext>
        <DragOverlay>
          {activeItem && (
            <div className="flex items-center gap-2 rounded-2xl border bg-card px-3 py-2 shadow-xl opacity-90">
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
