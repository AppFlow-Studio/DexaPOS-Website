"use client";

import {
  ChevronDown,
  ChevronUp,
  Copy,
  Eye,
  EyeOff,
  Loader2,
  MousePointerClick,
  Plus,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { PageDocument } from "@/lib/site-builder/page-document";
import { SECTION_REGISTRY, sectionTitle } from "@/lib/site-builder/sections/registry";
import { cn } from "@/lib/utils";
import type { BuilderStore, DeviceMode } from "./store";

const DEVICE_WIDTHS: Record<DeviceMode, string> = {
  desktop: "100%",
  tablet: "834px",
  mobile: "390px",
};

/**
 * The editing surface.
 *
 * Renders server-produced markup and lays an interaction layer over it. The
 * canvas never re-implements a section — it asks the server to render the
 * document and positions controls over the result by reading the `data-sb-*`
 * attributes each section stamps (PLAN-03 §5).
 *
 * **Same-document rather than an iframe.** PLAN-06 §2.3 recommended an iframe
 * for style isolation; that turned out unnecessary here because every section
 * styles itself through `--site-*` custom properties scoped to the shell, and
 * the only global CSS is class-scoped `.site-prose`. Same-document removes the
 * whole postMessage geometry protocol and makes overlay positioning a direct
 * DOM read. If merchant styling later grows teeth — arbitrary fonts, custom CSS
 * — this is the component that changes, and nothing above it.
 *
 * **The overlay is monochrome on purpose.** Everything the merchant is trying to
 * judge — their brand colour, their photos, their type — is inside the frame. An
 * editor that puts its own saturated blue right next to those makes them
 * impossible to assess, so selection is expressed in the neutral foreground
 * colour and nothing else on this surface is coloured at all.
 */
export default function Canvas({ store }: { store: BuilderStore }) {
  const doc = store((s) => s.doc);
  const canvas = store((s) => s.canvas);
  const device = store((s) => s.device);
  const selectedId = store((s) => s.selectedId);
  const isRendering = store((s) => s.isRendering);
  const inspectorEnabled = store((s) => s.inspectorEnabled);
  const select = store((s) => s.select);
  const toggleInspector = store((s) => s.toggleInspector);
  const openAddSection = store((s) => s.openAddSection);

  const hostRef = useRef<HTMLDivElement>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [rects, setRects] = useState<Record<string, DOMRect>>({});

  /** Reads every section's box so the overlay can position itself. */
  const measure = useCallback(() => {
    const host = hostRef.current;
    if (!host) return;

    const hostBox = host.getBoundingClientRect();
    const next: Record<string, DOMRect> = {};

    host.querySelectorAll<HTMLElement>("[data-sb-section-id]").forEach((el) => {
      const id = el.dataset.sbSectionId;
      if (!id) return;
      const box = el.getBoundingClientRect();
      next[id] = new DOMRect(
        box.left - hostBox.left,
        box.top - hostBox.top,
        box.width,
        box.height,
      );
    });

    setRects(next);
  }, []);

  // Re-measure whenever the markup or the viewport changes. A ResizeObserver on
  // the host catches image loads and font swaps, which are the usual cause of
  // an overlay drifting a few pixels after the initial paint.
  useEffect(() => {
    measure();
    const host = hostRef.current;
    if (!host) return;

    const observer = new ResizeObserver(measure);
    observer.observe(host);
    host.querySelectorAll("[data-sb-section-id]").forEach((el) => observer.observe(el));

    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [canvas, device, measure]);

  const onClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      const target = event.target as HTMLElement;

      // ── Preview mode ──────────────────────────────────────────────────────
      // With the inspector off the page behaves as a visitor's would, which is
      // the only way to test an accordion or an anchor link. Navigation is the
      // exception: this is the same document as the dashboard, so following a
      // link would unmount the builder and take unsaved edits with it. Off-page
      // links open in a new tab instead — the merchant still gets to check
      // where they go, and keeps their work.
      if (!inspectorEnabled) {
        const link = target.closest<HTMLAnchorElement>("a[href]");
        const href = link?.getAttribute("href");
        if (href && !href.startsWith("#")) {
          event.preventDefault();
          window.open(link!.href, "_blank", "noopener,noreferrer");
        }
        return;
      }

      // Links and buttons inside the canvas would navigate or submit; while
      // editing they only ever mean "select this section".
      if (target.closest("a, button")) event.preventDefault();

      const sectionEl = target.closest<HTMLElement>("[data-sb-section-id]");
      select(sectionEl?.dataset.sbSectionId ?? null);
    },
    [inspectorEnabled, select],
  );

  const onMouseOver = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (!inspectorEnabled) return;
      const sectionEl = (event.target as HTMLElement).closest<HTMLElement>("[data-sb-section-id]");
      setHoveredId(sectionEl?.dataset.sbSectionId ?? null);
    },
    [inspectorEnabled],
  );

  return (
    <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden bg-muted/40">
      <StatusPill visible={isRendering}>
        <Loader2 className="size-3 animate-spin" />
        Updating preview
      </StatusPill>

      <StatusPill visible={!inspectorEnabled && !isRendering}>
        <MousePointerClick className="size-3" />
        Preview mode — links open in a new tab
        <button
          type="button"
          onClick={toggleInspector}
          className="ml-1 rounded-full bg-background/20 px-2 py-0.5 font-semibold transition-colors hover:bg-background/30"
        >
          Resume editing
        </button>
      </StatusPill>

      <div className="flex-1 overflow-auto p-6">
        <div
          className={cn(
            "relative mx-auto bg-white transition-[width,box-shadow] duration-300",
            device === "desktop"
              ? "rounded-xl shadow-sm ring-1 ring-foreground/5"
              : "rounded-2xl shadow-xl ring-1 ring-foreground/10",
          )}
          style={{ width: DEVICE_WIDTHS[device], maxWidth: "100%" }}
        >
          <div
            ref={hostRef}
            onClick={onClick}
            onMouseOver={onMouseOver}
            onMouseLeave={() => setHoveredId(null)}
            className="overflow-hidden rounded-xl"
          >
            {canvas ?? <CanvasSkeleton />}
          </div>

          {inspectorEnabled && (
            <>
              <Overlay
                doc={doc}
                rects={rects}
                selectedId={selectedId}
                hoveredId={hoveredId}
                store={store}
              />
              <InsertPoints doc={doc} rects={rects} onInsert={openAddSection} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/** The one floating message slot, so two states can never stack on each other. */
function StatusPill({ visible, children }: { visible: boolean; children: React.ReactNode }) {
  return (
    <div
      aria-live="polite"
      className={cn(
        "absolute left-1/2 top-4 z-20 -translate-x-1/2 transition-all duration-200",
        visible ? "translate-y-0 opacity-100" : "pointer-events-none -translate-y-2 opacity-0",
      )}
    >
      <span className="flex items-center gap-1.5 rounded-full bg-foreground/90 px-3 py-1.5 text-[11px] font-medium text-background shadow-lg backdrop-blur">
        {children}
      </span>
    </div>
  );
}

function CanvasSkeleton() {
  return (
    <div className="space-y-4 p-8" aria-label="Loading preview">
      <div className="h-10 w-1/3 animate-pulse rounded-lg bg-muted" />
      <div className="h-56 animate-pulse rounded-xl bg-muted" />
      <div className="grid grid-cols-3 gap-4">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-32 animate-pulse rounded-xl bg-muted" />
        ))}
      </div>
    </div>
  );
}

/**
 * A `+` at every gap a section may be inserted into.
 *
 * The best insert affordance in any builder surveyed, because it states position
 * without a word of UI: the merchant points at the space they want a section to
 * occupy. The alternative — one "Add section" button and a modal that then has
 * to ask *where* — makes position an extra decision taken out of context.
 *
 * Only body-zone boundaries are offered. Nothing addable belongs above the hero
 * or below the footer, so those gaps are simply absent rather than present and
 * refusing.
 */
function InsertPoints({
  doc,
  rects,
  onInsert,
}: {
  doc: PageDocument;
  rects: Record<string, DOMRect>;
  onInsert: (atIndex: number) => void;
}) {
  const points = useMemo(() => {
    const out: { key: string; atIndex: number; y: number }[] = [];

    doc.sections.forEach((section, index) => {
      if (SECTION_REGISTRY[section.kind].zone !== "body") return;
      const rect = rects[section.id];
      if (!rect) return;

      // Above this section.
      out.push({ key: `before-${section.id}`, atIndex: index, y: rect.y });

      // Below it, when it is the last body section on the page.
      const next = doc.sections[index + 1];
      if (!next || SECTION_REGISTRY[next.kind].zone !== "body") {
        out.push({ key: `after-${section.id}`, atIndex: index + 1, y: rect.y + rect.height });
      }
    });

    return out;
  }, [doc, rects]);

  return (
    <div className="pointer-events-none absolute inset-0">
      {points.map((point) => (
        <div
          key={point.key}
          className="group/insert pointer-events-auto absolute inset-x-0 flex h-4 items-center justify-center"
          style={{ top: point.y - 8 }}
        >
          <span
            aria-hidden
            className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-foreground/30 opacity-0 transition-opacity group-hover/insert:opacity-100"
          />
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label="Add a section here"
                onClick={() => onInsert(point.atIndex)}
                className="relative flex size-5 items-center justify-center rounded-full bg-foreground text-background opacity-0 shadow-sm transition-opacity focus:outline-none focus-visible:opacity-100 focus-visible:ring-[3px] focus-visible:ring-ring/50 group-hover/insert:opacity-100"
              >
                <Plus className="size-3" />
              </button>
            </TooltipTrigger>
            <TooltipContent>Add a section here</TooltipContent>
          </Tooltip>
        </div>
      ))}
    </div>
  );
}

/**
 * Selection rings and per-section controls, positioned absolutely over the
 * rendered markup. Pointer-events are off except on the controls themselves, so
 * hovering the page still reaches the markup underneath.
 */
function Overlay({
  doc,
  rects,
  selectedId,
  hoveredId,
  store,
}: {
  doc: PageDocument;
  rects: Record<string, DOMRect>;
  selectedId: string | null;
  hoveredId: string | null;
  store: BuilderStore;
}) {
  const moveSectionBy = store((s) => s.moveSectionBy);
  const removeSection = store((s) => s.removeSection);
  const duplicateSection = store((s) => s.duplicateSection);
  const toggleHidden = store((s) => s.toggleHidden);

  return (
    <div className="pointer-events-none absolute inset-0">
      {doc.sections.map((section, index) => {
        const rect = rects[section.id];
        if (!rect) return null;

        const isSelected = section.id === selectedId;
        const isHovered = section.id === hoveredId;
        if (!isSelected && !isHovered) return null;

        const def = SECTION_REGISTRY[section.kind];
        const zone = def.zone;

        // Only offer a move that the mutation will actually accept. Zone rules
        // are enforced in `moveSectionBy`; mirroring the boundary here is what
        // keeps an enabled button from producing a refusal toast.
        const prev = doc.sections[index - 1];
        const next = doc.sections[index + 1];
        const canMoveUp = !!prev && SECTION_REGISTRY[prev.kind].zone === zone;
        const canMoveDown = !!next && SECTION_REGISTRY[next.kind].zone === zone;

        return (
          <div
            key={section.id}
            className="absolute"
            style={{ left: rect.x, top: rect.y, width: rect.width, height: rect.height }}
          >
            <div
              className={cn(
                "pointer-events-none absolute inset-0 rounded-sm ring-inset transition-colors",
                isSelected ? "ring-2 ring-foreground/70" : "ring-1 ring-foreground/25",
              )}
            />

            <span
              className={cn(
                "pointer-events-none absolute left-0 top-0 flex max-w-[60%] -translate-y-full items-center gap-1.5 truncate rounded-t-md px-2 py-1 text-[11px] font-medium",
                isSelected
                  ? "bg-foreground text-background"
                  : "bg-foreground/70 text-background",
              )}
            >
              {sectionTitle(section)}
              {section.hidden && (
                <span className="flex items-center gap-1 rounded bg-background/20 px-1 py-px text-[10px]">
                  <EyeOff className="size-2.5" />
                  Hidden
                </span>
              )}
            </span>

            {isSelected && (
              <div className="pointer-events-auto absolute right-0 top-0 flex -translate-y-full items-center overflow-hidden rounded-t-md bg-foreground text-background">
                <CanvasButton
                  label="Move up"
                  disabled={!canMoveUp}
                  onClick={() => moveSectionBy(section.id, -1)}
                >
                  <ChevronUp className="size-3.5" />
                </CanvasButton>
                <CanvasButton
                  label="Move down"
                  disabled={!canMoveDown}
                  onClick={() => moveSectionBy(section.id, 1)}
                >
                  <ChevronDown className="size-3.5" />
                </CanvasButton>
                <CanvasButton
                  label={section.hidden ? "Show section" : "Hide section"}
                  onClick={() => toggleHidden(section.id)}
                >
                  {section.hidden ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                </CanvasButton>
                {!def.singleton && (
                  <CanvasButton label="Duplicate" onClick={() => duplicateSection(section.id)}>
                    <Copy className="size-3.5" />
                  </CanvasButton>
                )}
                {def.deletable && (
                  <CanvasButton
                    label="Delete"
                    destructive
                    onClick={() => removeSection(section.id)}
                  >
                    <Trash2 className="size-3.5" />
                  </CanvasButton>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function CanvasButton({
  label,
  onClick,
  disabled,
  destructive,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  destructive?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          disabled={disabled}
          onClick={onClick}
          className={cn(
            "flex size-6 items-center justify-center transition-colors disabled:cursor-not-allowed disabled:opacity-40",
            destructive ? "hover:bg-destructive" : "hover:bg-background/25",
          )}
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
