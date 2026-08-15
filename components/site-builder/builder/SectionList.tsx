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
import {
  Copy,
  Eye,
  EyeOff,
  GripVertical,
  Lock,
  MoreHorizontal,
  Plus,
  Search,
  Trash2,
  TriangleAlert,
  X,
  Zap,
} from "lucide-react";
import { useMemo, useState } from "react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { describeReason, documentHealth, type SectionHealth } from "@/lib/site-builder/binding-health";
import { ZONES, type Zone } from "@/lib/site-builder/sections/kinds";
import { SECTION_REGISTRY, sectionTitle } from "@/lib/site-builder/sections/registry";
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
 *
 * **Rows are labelled with the merchant's own heading**, not the kind name. Nine
 * sections called "Content", "Content", "Gallery" is a list you read; "Our
 * story", "Meet the team", "Inside the kitchen" is a list you scan.
 *
 * **Live references are marked.** A `⚡` says this section's content comes from
 * the POS; a `⚠` says one of the things it points at will not render. The
 * renderer has always known both and silently dropped the second — correct for a
 * public page, wrong for an editor.
 */

const ZONE_LABELS: Record<Zone, string> = {
  masthead: "Top of page",
  body: "Page sections",
  colophon: "Bottom of page",
};

export default function SectionList({ store }: { store: BuilderStore }) {
  const doc = store((s) => s.doc);
  const catalog = store((s) => s.catalog);
  const reorderSections = store((s) => s.reorderSections);
  const openAddSection = store((s) => s.openAddSection);

  const [query, setQuery] = useState("");
  const term = query.trim().toLowerCase();

  const health = useMemo(() => documentHealth(doc, catalog), [doc, catalog]);

  const sensors = useSensors(
    // A small activation distance so a click to select is not read as a drag.
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const matches = (section: Section) =>
    !term ||
    sectionTitle(section).toLowerCase().includes(term) ||
    SECTION_REGISTRY[section.kind].label.toLowerCase().includes(term);

  const byZone = (zone: Zone) =>
    doc.sections.filter((s) => SECTION_REGISTRY[s.kind].zone === zone && matches(s));

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

  const bodyMatches = byZone("body");
  const totalMatches = ZONES.reduce((sum, zone) => sum + byZone(zone).length, 0);

  /**
   * Where a new section should land when added from the body group's own button:
   * immediately after the last body section, so "add" means "add to the end of
   * the page" rather than "add after whatever happened to be selected".
   */
  const appendIndex = (() => {
    const bodyAll = doc.sections.filter((s) => SECTION_REGISTRY[s.kind].zone === "body");
    const last = bodyAll[bodyAll.length - 1];
    return last ? doc.sections.findIndex((s) => s.id === last.id) + 1 : undefined;
  })();

  return (
    <div className="flex h-full flex-col bg-background">
      <div className="shrink-0 px-3 pb-2 pt-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search sections"
            aria-label="Search sections"
            className="h-8 w-full rounded-md border border-input bg-transparent pl-8 pr-7 text-[13px] outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 [&::-webkit-search-cancel-button]:appearance-none"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Clear search"
              className="absolute right-1.5 top-1/2 flex size-5 -translate-y-1/2 items-center justify-center rounded text-muted-foreground transition-colors hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
        {term && totalMatches === 0 && (
          <p className="px-2 py-8 text-center text-xs text-muted-foreground">
            No sections match “{query}”.
          </p>
        )}

        {/* `verticalListSortingStrategy` already constrains movement to the list
            axis, so this needs no modifier — and therefore no extra dependency. */}
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          {ZONES.map((zone) => {
            const sections = byZone(zone);
            if (sections.length === 0 && (zone !== "body" || term)) return null;

            const rows = (
              <ul className="space-y-px">
                {sections.map((section) => (
                  <Row
                    key={section.id}
                    section={section}
                    // Reordering a filtered list moves things the merchant
                    // cannot see, so drag is offered only on the full list.
                    sortable={zone === "body" && !term}
                    health={health.get(section.id)}
                    store={store}
                  />
                ))}

                {zone === "body" && sections.length === 0 && !term && (
                  <li>
                    <button
                      type="button"
                      onClick={() => openAddSection(appendIndex)}
                      className="w-full rounded-md border border-dashed border-input px-3 py-4 text-xs text-muted-foreground transition-colors hover:border-ring hover:text-foreground"
                    >
                      Add your first section
                    </button>
                  </li>
                )}
              </ul>
            );

            return (
              <section key={zone} className="mb-3 last:mb-0">
                <div className="flex h-6 items-center gap-1.5 px-2">
                  <h3 className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    {ZONE_LABELS[zone]}
                  </h3>
                  {zone !== "body" && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Lock className="size-2.5 text-muted-foreground/70" />
                      </TooltipTrigger>
                      <TooltipContent side="right">
                        Always here, and always in this order.
                      </TooltipContent>
                    </Tooltip>
                  )}
                </div>

                {zone === "body" ? (
                  <SortableContext
                    items={bodyMatches.map((s) => s.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    {rows}
                  </SortableContext>
                ) : (
                  rows
                )}

                {/* The add affordance belongs to the zone it adds to. Position
                    then needs no explaining — and there is no way to ask for a
                    section in a zone that cannot hold one. */}
                {zone === "body" && sections.length > 0 && !term && (
                  <button
                    type="button"
                    onClick={() => openAddSection(appendIndex)}
                    className="mt-1 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                  >
                    <Plus className="size-3.5" />
                    Add section
                  </button>
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
  health,
  store,
}: {
  section: Section;
  sortable: boolean;
  health: SectionHealth | undefined;
  store: BuilderStore;
}) {
  const def = SECTION_REGISTRY[section.kind];
  const selectedId = store((s) => s.selectedId);
  const select = store((s) => s.select);
  const toggleHidden = store((s) => s.toggleHidden);
  const duplicateSection = store((s) => s.duplicateSection);
  const removeSection = store((s) => s.removeSection);

  const selected = section.id === selectedId;
  const title = sectionTitle(section);
  const broken = health?.broken ?? [];

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: section.id,
    disabled: !sortable,
  });

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "group relative flex items-center gap-1 rounded-md pr-1 transition-colors",
        isDragging && "z-10 opacity-60 shadow-lg",
        selected ? "bg-accent text-accent-foreground" : "hover:bg-accent/50",
      )}
    >
      {/* A selected row is marked by a bar rather than a fill: the panel sits
          beside a canvas whose colours belong to the merchant, and a saturated
          selection would compete with them. */}
      <span
        aria-hidden
        className={cn(
          "absolute inset-y-1 left-0 w-0.5 rounded-full bg-primary transition-opacity",
          selected ? "opacity-100" : "opacity-0",
        )}
      />

      {sortable ? (
        <span
          {...attributes}
          {...listeners}
          aria-label={`Reorder ${title}`}
          className="flex w-4 cursor-grab items-center justify-center self-stretch rounded-l-md text-muted-foreground opacity-0 transition-opacity focus:outline-none focus-visible:opacity-100 focus-visible:ring-[3px] focus-visible:ring-ring/50 group-hover:opacity-100 active:cursor-grabbing"
        >
          <GripVertical className="size-3.5" />
        </span>
      ) : (
        <span aria-hidden className="flex w-4 items-center justify-center" />
      )}

      <button
        type="button"
        onClick={() => select(section.id)}
        className="flex min-w-0 flex-1 items-center gap-2 py-1.5 text-left"
      >
        <SectionIcon
          name={def.icon}
          className={cn(
            "size-3.5 shrink-0",
            selected ? "text-foreground" : "text-muted-foreground",
          )}
        />
        <span
          className={cn(
            "truncate text-[13px]",
            selected ? "font-medium" : "text-foreground/80",
            section.hidden && "line-through opacity-50",
          )}
        >
          {title}
        </span>
      </button>

      <span className="flex shrink-0 items-center gap-0.5">
        {broken.length > 0 ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <span
                className="flex size-5 items-center justify-center text-amber-600"
                role="img"
                aria-label={`${broken.length} item${broken.length === 1 ? "" : "s"} will not show`}
              >
                <TriangleAlert className="size-3.5" />
              </span>
            </TooltipTrigger>
            <TooltipContent side="right" className="max-w-56">
              {broken.length} item{broken.length === 1 ? "" : "s"} here will not show —{" "}
              {describeReason(broken[0].reason).toLowerCase()}.
            </TooltipContent>
          </Tooltip>
        ) : (
          health?.live && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span
                  className="flex size-5 items-center justify-center text-muted-foreground opacity-60"
                  role="img"
                  aria-label="Updates automatically from your POS"
                >
                  <Zap className="size-3" />
                </span>
              </TooltipTrigger>
              <TooltipContent side="right" className="max-w-56">
                Content here comes from your POS and updates on its own.
              </TooltipContent>
            </Tooltip>
          )
        )}

        {section.hidden && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span
                className="flex size-5 items-center justify-center text-muted-foreground"
                role="img"
                aria-label="Hidden from the page"
              >
                <EyeOff className="size-3.5" />
              </span>
            </TooltipTrigger>
            <TooltipContent side="right">Hidden from the page.</TooltipContent>
          </Tooltip>
        )}

        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label={`Options for ${title}`}
            className={cn(
              "flex size-6 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-all hover:bg-background hover:text-foreground focus:outline-none focus-visible:opacity-100 focus-visible:ring-[3px] focus-visible:ring-ring/50 group-hover:opacity-100 data-[state=open]:opacity-100",
            )}
          >
            <MoreHorizontal className="size-3.5" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem onSelect={() => toggleHidden(section.id)}>
              {section.hidden ? <Eye /> : <EyeOff />}
              {section.hidden ? "Show on the page" : "Hide from the page"}
            </DropdownMenuItem>

            {!def.singleton && (
              <DropdownMenuItem onSelect={() => duplicateSection(section.id)}>
                <Copy />
                Duplicate
              </DropdownMenuItem>
            )}

            {def.deletable && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  onSelect={() => removeSection(section.id)}
                >
                  <Trash2 />
                  Delete
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </span>
    </li>
  );
}
