"use client";

import { ChevronDown, ChevronUp, Copy, Eye, EyeOff, Loader2, Trash2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import type { PageDocument } from "@/lib/site-builder/page-document";
import { SECTION_REGISTRY } from "@/lib/site-builder/sections/registry";
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
 */
export default function Canvas({ store }: { store: BuilderStore }) {
  const doc = store((s) => s.doc);
  const canvas = store((s) => s.canvas);
  const device = store((s) => s.device);
  const selectedId = store((s) => s.selectedId);
  const isRendering = store((s) => s.isRendering);
  const select = store((s) => s.select);

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

  /** Clicks inside the rendered markup select a section rather than navigate. */
  const onClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      const target = event.target as HTMLElement;
      // Links and buttons inside the canvas would navigate or submit; inside the
      // editor they only ever mean "select this section".
      if (target.closest("a, button")) event.preventDefault();

      const sectionEl = target.closest<HTMLElement>("[data-sb-section-id]");
      select(sectionEl?.dataset.sbSectionId ?? null);
    },
    [select],
  );

  const onMouseOver = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    const sectionEl = (event.target as HTMLElement).closest<HTMLElement>("[data-sb-section-id]");
    setHoveredId(sectionEl?.dataset.sbSectionId ?? null);
  }, []);

  return (
    <div className="relative flex flex-1 flex-col overflow-hidden bg-zinc-100">
      {/* Rendering is a server round trip, so it is always perceptible. A quiet
          pill beats a spinner over the page: the previous markup stays readable
          and the merchant keeps their place. */}
      <div
        aria-live="polite"
        className={cn(
          "pointer-events-none absolute left-1/2 top-4 z-20 -translate-x-1/2 transition-all duration-200",
          isRendering ? "translate-y-0 opacity-100" : "-translate-y-2 opacity-0",
        )}
      >
        <span className="flex items-center gap-1.5 rounded-full bg-zinc-900/90 px-3 py-1.5 text-[11px] font-medium text-white shadow-lg backdrop-blur">
          <Loader2 className="size-3 animate-spin" />
          Updating preview
        </span>
      </div>

      <div className="flex-1 overflow-auto p-6">
        <div
          className={cn(
            "relative mx-auto bg-white transition-[width,box-shadow] duration-300",
            device === "desktop"
              ? "rounded-xl shadow-sm ring-1 ring-zinc-900/5"
              : "rounded-2xl shadow-xl ring-1 ring-zinc-900/10",
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

          <Overlay
            doc={doc}
            rects={rects}
            selectedId={selectedId}
            hoveredId={hoveredId}
            store={store}
          />
        </div>
      </div>
    </div>
  );
}

function CanvasSkeleton() {
  return (
    <div className="space-y-4 p-8" aria-label="Loading preview">
      <div className="h-10 w-1/3 animate-pulse rounded-lg bg-zinc-100" />
      <div className="h-56 animate-pulse rounded-xl bg-zinc-100" />
      <div className="grid grid-cols-3 gap-4">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-32 animate-pulse rounded-xl bg-zinc-100" />
        ))}
      </div>
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
                isSelected ? "ring-2 ring-blue-500" : "ring-1 ring-blue-400/50",
              )}
            />

            <span
              className={cn(
                "pointer-events-none absolute left-0 top-0 flex -translate-y-full items-center gap-1.5 rounded-t-md px-2 py-1 text-[11px] font-medium text-white",
                isSelected ? "bg-blue-500" : "bg-blue-400",
              )}
            >
              {def.label}
              {section.hidden && (
                <span className="flex items-center gap-1 rounded bg-white/20 px-1 py-px text-[10px]">
                  <EyeOff className="size-2.5" />
                  Hidden
                </span>
              )}
            </span>

            {isSelected && (
              <div className="pointer-events-auto absolute right-0 top-0 flex -translate-y-full items-center overflow-hidden rounded-t-md bg-blue-500 text-white">
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
                  {section.hidden ? (
                    <EyeOff className="size-3.5" />
                  ) : (
                    <Eye className="size-3.5" />
                  )}
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
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex size-6 items-center justify-center transition-colors disabled:cursor-not-allowed disabled:opacity-40",
        destructive ? "hover:bg-red-500" : "hover:bg-blue-600",
      )}
    >
      {children}
    </button>
  );
}
