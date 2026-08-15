"use client";

import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Eye, EyeOff, GripVertical, Lock, Plus } from "lucide-react";

import { ZONES, type Zone } from "@/lib/site-builder/sections/kinds";
import { SECTION_REGISTRY } from "@/lib/site-builder/sections/registry";
import type { Section } from "@/lib/site-builder/sections/types";
import { cn } from "@/lib/utils";
import { SectionIcon } from "./section-icons";
import type { BuilderStore } from "./store";

/**
 * The layers panel — and the accessible reorder path.
 *
 * Drag-and-drop lives here rather than on the canvas, deliberately. A
 * pointer-only canvas excludes keyboard users, and there is a real legal
 * dimension to a tool that builds public-facing commerce sites. `dnd-kit`'s
 * sortable gives keyboard reordering for free (tab to a handle, space to lift,
 * arrows to move, space to drop), so this is simultaneously the simplest
 * implementation and the accessible one.
 *
 * **Rows are grouped by zone.** Zones are the rule that makes header/hero/footer
 * unmovable, and showing them as separate groups means a merchant sees *why* the
 * header will not drag rather than discovering it through a refusal toast. Only
 * the body group is sortable, so every drag this panel offers is a legal one —
 * the cross-zone refusal in `moveSectionBy` becomes unreachable from the UI
 * instead of being the thing that teaches the rule.
 */

const ZONE_LABELS: Record<Zone, string> = {
  masthead: "Top of page",
  body: "Page sections",
  colophon: "Bottom of page",
};

export default function SectionList({
  store,
  onOpenAddSection,
}: {
  store: BuilderStore;
  onOpenAddSection: () => void;
}) {
  const doc = store((s) => s.doc);
  const reorderSections = store((s) => s.reorderSections);

  const sensors = useSensors(
    // A small activation distance so a click to select is not read as a drag.
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const byZone = (zone: Zone) =>
    doc.sections.filter((s) => SECTION_REGISTRY[s.kind].zone === zone);

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    // Indices into the whole document, not into the body group — `moveSection`
    // works in document coordinates.
    const from = doc.sections.findIndex((s) => s.id === active.id);
    const to = doc.sections.findIndex((s) => s.id === over.id);
    if (from === -1 || to === -1) return;

    reorderSections(from, to);
  }

  const bodySections = byZone("body");

  return (
    <div className="flex h-full flex-col bg-white">
      <div className="flex items-center justify-between px-3 py-3">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
          Sections
        </h2>
        <button
          type="button"
          onClick={onOpenAddSection}
          aria-label="Add a section"
          title="Add a section"
          className="flex size-6 items-center justify-center rounded-md text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900"
        >
          <Plus className="size-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-4">
        {/* `verticalListSortingStrategy` already constrains movement to the list
            axis, so this needs no modifier — and therefore no extra dependency. */}
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          {ZONES.map((zone) => {
            const sections = byZone(zone);
            if (sections.length === 0 && zone !== "body") return null;

            const rows = (
              <ul className="space-y-0.5">
                {sections.map((section) => (
                  <Row
                    key={section.id}
                    section={section}
                    sortable={zone === "body"}
                    store={store}
                  />
                ))}

                {zone === "body" && sections.length === 0 && (
                  <li>
                    <button
                      type="button"
                      onClick={onOpenAddSection}
                      className="w-full rounded-lg border border-dashed border-zinc-300 px-3 py-4 text-xs text-zinc-500 transition-colors hover:border-zinc-400 hover:text-zinc-900"
                    >
                      Add your first section
                    </button>
                  </li>
                )}
              </ul>
            );

            return (
              <section key={zone} className="mb-3 last:mb-0">
                <h3 className="px-2 pb-1 text-[10px] font-medium uppercase tracking-wide text-zinc-400">
                  {ZONE_LABELS[zone]}
                </h3>

                {zone === "body" ? (
                  <SortableContext
                    items={bodySections.map((s) => s.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    {rows}
                  </SortableContext>
                ) : (
                  rows
                )}
              </section>
            );
          })}
        </DndContext>
      </div>
    </div>
  );
}

function Row({
  section,
  sortable,
  store,
}: {
  section: Section;
  sortable: boolean;
  store: BuilderStore;
}) {
  const def = SECTION_REGISTRY[section.kind];
  const selectedId = store((s) => s.selectedId);
  const select = store((s) => s.select);
  const toggleHidden = store((s) => s.toggleHidden);

  const selected = section.id === selectedId;

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: section.id,
    disabled: !sortable,
  });

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "group relative flex items-center gap-1 rounded-lg pr-1 transition-colors",
        isDragging && "z-10 opacity-60 shadow-lg",
        selected ? "bg-zinc-900 text-white" : "hover:bg-zinc-100",
      )}
    >
      {sortable ? (
        <span
          {...attributes}
          {...listeners}
          aria-label={`Reorder ${def.label}`}
          className={cn(
            "flex w-4 cursor-grab items-center justify-center self-stretch rounded-l-lg opacity-0 transition-opacity focus:outline-none focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-blue-500 group-hover:opacity-100 active:cursor-grabbing",
            selected ? "text-white/60" : "text-zinc-400",
          )}
        >
          <GripVertical className="size-3.5" />
        </span>
      ) : (
        <span
          aria-hidden
          className={cn(
            "flex w-4 items-center justify-center",
            selected ? "text-white/40" : "text-zinc-300",
          )}
        >
          <Lock className="size-3" />
        </span>
      )}

      <button
        type="button"
        onClick={() => select(section.id)}
        className="flex min-w-0 flex-1 items-center gap-2.5 py-2 text-left"
      >
        <SectionIcon
          name={def.icon}
          className={cn("size-4 shrink-0", selected ? "text-white/80" : "text-zinc-400")}
        />
        <span
          className={cn(
            "truncate text-[13px]",
            selected ? "font-medium" : "text-zinc-700",
            section.hidden && "line-through opacity-50",
          )}
        >
          {def.label}
        </span>
      </button>

      <button
        type="button"
        aria-label={section.hidden ? `Show ${def.label}` : `Hide ${def.label}`}
        title={section.hidden ? "Show on the page" : "Hide from the page"}
        onClick={() => toggleHidden(section.id)}
        className={cn(
          "flex size-6 shrink-0 items-center justify-center rounded-md transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500",
          // A hidden section keeps its control visible: that is the affordance
          // telling the merchant the row is hidden rather than broken.
          section.hidden ? "opacity-100" : "opacity-0 group-hover:opacity-100 focus:opacity-100",
          selected ? "text-white/70 hover:bg-white/15" : "text-zinc-500 hover:bg-zinc-200",
        )}
      >
        {section.hidden ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
      </button>
    </li>
  );
}
