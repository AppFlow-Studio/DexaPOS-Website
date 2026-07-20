"use client";

import * as React from "react";
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
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Save, RotateCcw, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { SectionHeader } from "./OverviewSection";
import type { SectionRenderCtx } from "@/app/dashboard/menu/items/[itemId]/edit/ItemEditLayout";
import { ReorderMenuItemModifierGroups } from "@/app/dashboard/actions/menu-items";
import {
  useIsAllLocations,
  useSelectedLocation,
  useIsSingleLocation,
} from "@/stores/location-store";
import { invalidateOrderOutSync } from "@/app/dashboard/hooks/useOrderOutMenuSync";

type ModifierGroupEntry = {
  id: string;
  display_order?: number | null;
  modifier_group?: { id: string; name: string } | null;
};

function sortEntries(entries: ModifierGroupEntry[]): ModifierGroupEntry[] {
  return [...entries].sort((a, b) => {
    const aOrder =
      typeof a.display_order === "number"
        ? a.display_order
        : Number.MAX_SAFE_INTEGER;
    const bOrder =
      typeof b.display_order === "number"
        ? b.display_order
        : Number.MAX_SAFE_INTEGER;
    if (aOrder !== bOrder) return aOrder - bOrder;
    return (a.modifier_group?.name ?? "").localeCompare(
      b.modifier_group?.name ?? ""
    );
  });
}

interface SortableGroupRowProps {
  entry: ModifierGroupEntry;
  index: number;
}

function SortableGroupRow({ entry, index }: SortableGroupRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: entry.id });

  const style = { transform: CSS.Transform.toString(transform), transition };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex items-center gap-3 p-2.5 rounded-lg border bg-card transition-all",
        isDragging && "opacity-50 shadow-lg z-50"
      )}
    >
      <button
        {...attributes}
        {...listeners}
        onMouseDown={(e) => { console.log("[drag] mousedown on handle", entry.id, e.target); }}
        className="flex items-center justify-center w-7 h-7 rounded hover:bg-muted cursor-grab active:cursor-grabbing touch-none"
        aria-label="Drag to reorder"
      >
        <GripVertical className="h-4 w-4 text-muted-foreground" />
      </button>
      <span className="flex items-center justify-center w-5 h-5 rounded-full bg-muted text-muted-foreground text-xs font-medium shrink-0">
        {index + 1}
      </span>
      <div className="h-7 w-7 rounded-md bg-purple-50 flex items-center justify-center shrink-0">
        <Layers className="h-3.5 w-3.5 text-purple-600" />
      </div>
      <span className="flex-1 text-sm font-medium truncate">
        {entry.modifier_group?.name ?? "Unnamed"}
      </span>
    </div>
  );
}

export function ModifiersSection({ item, itemId, globalScope }: SectionRenderCtx) {
  const queryClient = useQueryClient();
  const isAllLocations = useIsAllLocations();
  const isSingleLocation = useIsSingleLocation();
  const selectedLocation = useSelectedLocation();
  // Single-location accounts reorder the core groups (omit location_id) even if a
  // stale per-location selection is still in scope. isSingleLocation drives this.
  const locationId =
    isAllLocations || isSingleLocation ? null : (selectedLocation?.id ?? null);

  const rawGroups: ModifierGroupEntry[] = item?.menu_item_modifier_groups ?? [];
  const [groups, setGroups] = React.useState<ModifierGroupEntry[]>(() =>
    sortEntries(rawGroups)
  );
  const [originalGroups, setOriginalGroups] = React.useState<ModifierGroupEntry[]>(() =>
    sortEntries(rawGroups)
  );
  const [hasChanges, setHasChanges] = React.useState(false);
  const [isSaving, setIsSaving] = React.useState(false);
  const [activeId, setActiveId] = React.useState<string | null>(null);

  // Sync when item or its modifier group list changes (e.g. after save/refetch)
  const groupsKey = rawGroups.map((g) => `${g.id}:${g.display_order}`).join(",");
  React.useEffect(() => {
    if (isSaving) return; // don't overwrite local state while save is in flight
    const sorted = sortEntries(rawGroups);
    setGroups(sorted);
    setOriginalGroups(sorted);
    setHasChanges(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupsKey]);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
  );

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);
    if (over && active.id !== over.id) {
      const oldIndex = groups.findIndex((g) => g.id === active.id);
      const newIndex = groups.findIndex((g) => g.id === over.id);
      if (oldIndex !== -1 && newIndex !== -1) {
        const reordered = arrayMove(groups, oldIndex, newIndex).map(
          (g, idx) => ({ ...g, display_order: idx + 1 })
        );
        setGroups(reordered);
        setHasChanges(true);
      }
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    const payload = groups.map((g, idx) => ({
      modifierGroupId: g.modifier_group?.id ?? g.id,
      displayOrder: idx + 1,
    }));
    try {
      const result = await ReorderMenuItemModifierGroups(itemId, payload, locationId);
      if (result.error) throw new Error(result.error);
      toast.success("Modifier group order saved");
      setOriginalGroups(groups);
      setHasChanges(false);
      queryClient.invalidateQueries({ queryKey: ["menu-item", itemId] });
      queryClient.invalidateQueries({ queryKey: ["menu-items"] });
      invalidateOrderOutSync(queryClient);
    } catch (e: any) {
      toast.error("Failed to save order", { description: e?.message });
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = () => {
    setGroups(originalGroups);
    setHasChanges(false);
  };

  const activeEntry = activeId ? groups.find((g) => g.id === activeId) : null;

  return (
    <div className="space-y-4">
      <SectionHeader title="Modifiers" scope={globalScope} />
      <div className="space-y-3 rounded-lg border bg-card p-4">
        {groups.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No modifier groups attached. Attach from the Modifiers page.
          </p>
        ) : (
          <>
            {hasChanges && (
              <div className="flex items-center justify-between p-2 rounded-lg bg-muted/50 border border-dashed">
                <p className="text-sm text-muted-foreground">
                  Order changed
                  {locationId && (
                    <span className="ml-1 text-primary">(Location-specific)</span>
                  )}
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleReset}
                    disabled={isSaving}
                  >
                    <RotateCcw className="h-3 w-3 mr-1" />
                    Reset
                  </Button>
                  <Button size="sm" onClick={handleSave} disabled={isSaving}>
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

            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={groups.map((g) => g.id)}
                strategy={verticalListSortingStrategy}
              >
                <div className="space-y-1.5">
                  {groups.map((entry, index) => (
                    <SortableGroupRow
                      key={entry.id}
                      entry={entry}
                      index={index}
                    />
                  ))}
                </div>
              </SortableContext>
              <DragOverlay>
                {activeEntry && (
                  <div className="flex items-center gap-3 p-2.5 rounded-lg border bg-card shadow-xl">
                    <GripVertical className="h-4 w-4 text-muted-foreground" />
                    <Layers className="h-3.5 w-3.5 text-purple-600" />
                    <span className="text-sm font-medium">
                      {activeEntry.modifier_group?.name ?? "Unnamed"}
                    </span>
                  </div>
                )}
              </DragOverlay>
            </DndContext>
          </>
        )}
        <p className="text-[11px] text-muted-foreground">
          {isSingleLocation
            ? "Modifier attachment is shared across your menu. Drag to reorder how groups appear on the POS."
            : "Modifier attachment is always Global. Drag to reorder how groups appear on the POS."}
        </p>
      </div>
    </div>
  );
}
