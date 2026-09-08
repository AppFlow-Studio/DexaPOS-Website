"use client";

import { ChevronDown, ChevronUp, EyeOff, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { PageDocument } from "@/lib/site-builder/page-document";
import { SECTION_REGISTRY, sectionTitle } from "@/lib/site-builder/sections/registry";
import { cn } from "@/lib/utils";
import { announce } from "./announce";
import {
  getAddSectionPoints,
  measureSectionRects,
  SECTION_BOUNDARY_SELECTOR,
} from "./canvas-dom";
import { deleteSectionWithUndo } from "./delete-section";
import DevicePreviewFrame from "./DevicePreviewFrame";
import { applyTextPreviewPatches, getTextPreviewPatches } from "./preview-sync";
import type { BuilderStore } from "./store";

/**
 * Build stays at one stable desktop width so gutters and section editing do not
 * jump around. Preview uses independent desktop, tablet and phone viewports.
 */
const CANVAS_WIDTH = 1120;

/**
 * The editing surface.
 *
 * Renders server-produced markup and lays an interaction layer over it. The
 * canvas never re-implements a section — it asks the server to render the
 * document and positions controls by reading the `data-sb-*` attributes each
 * section stamps (PLAN-03 §5).
 *
 * **Controls live in the gutters, outside the page.** The overlay this replaced
 * drew a ring around the selected section, floated a title chip above it and put
 * a six-button toolbar in its top-right corner — all of it on top of the thing
 * the merchant was trying to look at. Moving the controls outside the canvas
 * means the page is never obscured by the tools for editing it, which is the
 * single biggest reason Owner's editor feels calmer than ours did.
 *
 * **The overlay is monochrome on purpose.** Everything a merchant is trying to
 * judge — their brand colour, their photos, their type — is inside the frame.
 */
export default function Canvas({ store }: { store: BuilderStore }) {
  const doc = store((s) => s.doc);
  const canvas = store((s) => s.canvas);
  const mode = store((s) => s.mode);
  const previewDevice = store((s) => s.previewDevice);
  const selectedId = store((s) => s.selectedId);
  const isRendering = store((s) => s.isRendering);
  const requestCanvasRefresh = store((s) => s.requestCanvasRefresh);
  const select = store((s) => s.select);
  const openAddSection = store((s) => s.openAddSection);

  const hostRef = useRef<HTMLDivElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [rects, setRects] = useState<Record<string, DOMRect>>({});
  const canvasDoc = useRef(doc);
  const previousCanvas = useRef(canvas);

  const building = mode === "build";

  useRevealSelectedSection(store, hostRef, scrollerRef);

  // A new server tree is authoritative. From this point, later scalar edits can
  // be patched locally without asking the server to recreate the entire page.
  useLayoutEffect(() => {
    if (previousCanvas.current === canvas) return;
    previousCanvas.current = canvas;
    canvasDoc.current = doc;
  }, [canvas, doc]);

  useLayoutEffect(() => {
    const previous = canvasDoc.current;
    if (previous === doc) return;

    const patches = getTextPreviewPatches(previous, doc);
    const host = hostRef.current;

    // Structural and rich-text changes are already picked up by the server
    // render hook. Only ask for a refresh here when a change *looked* safe but
    // the current markup does not honour the marker contract.
    if (patches === null) return;

    if (!host || !applyTextPreviewPatches(host, patches)) {
      requestCanvasRefresh();
      return;
    }

    canvasDoc.current = doc;
  }, [doc, requestCanvasRefresh]);

  /** Reads every section's box so the gutters can line up with it. */
  const measure = useCallback(() => {
    const host = hostRef.current;
    if (!host) return;

    setRects(measureSectionRects(host));
  }, []);

  // Re-measure whenever the markup or the viewport changes. A ResizeObserver on
  // the host catches image loads and font swaps, which are the usual cause of an
  // overlay drifting a few pixels after the initial paint.
  useEffect(() => {
    measure();
    const host = hostRef.current;
    if (!host) return;

    const observer = new ResizeObserver(measure);
    observer.observe(host);
    host.querySelectorAll(SECTION_BOUNDARY_SELECTOR).forEach((el) => observer.observe(el));

    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [canvas, measure]);

  const onClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      const target = event.target as HTMLElement;

      // ── Preview ───────────────────────────────────────────────────────────
      // The page behaves as a visitor's would, which is the only way to test an
      // accordion or an anchor link. Navigation is the exception: this is the
      // same document as the dashboard, so following a link would unmount the
      // editor and take unsaved edits with it. Off-page links open in a new tab
      // instead — the merchant still gets to check where they go, and keeps
      // their work.
      if (!building) {
        const link = target.closest<HTMLAnchorElement>("a[href]");
        const href = link?.getAttribute("href");
        if (href && !href.startsWith("#")) {
          event.preventDefault();
          window.open(link!.href, "_blank", "noopener,noreferrer");
        }
        return;
      }

      // Links and buttons inside the canvas would navigate or submit; while
      // building they only ever mean "select this section".
      if (target.closest("a, button")) event.preventDefault();

      // Clicking a section is the same act as pressing its pencil, so a kind
      // with no editor must not open an empty drawer for it.
      const sectionEl = target.closest<HTMLElement>(SECTION_BOUNDARY_SELECTOR);
      const id = sectionEl?.dataset.sbSectionId ?? null;
      const kind = doc.sections.find((section) => section.id === id)?.kind;
      select(kind && !SECTION_REGISTRY[kind].editable ? null : id, "canvas");
    },
    [building, select, doc],
  );

  const onMouseOver = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (!building) return;
      const sectionEl = (event.target as HTMLElement).closest<HTMLElement>(
        SECTION_BOUNDARY_SELECTOR,
      );
      setHoveredId(sectionEl?.dataset.sbSectionId ?? null);
    },
    [building],
  );

  return (
    <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden bg-muted/40">
      <RenderingPill visible={isRendering} />

      {/*
        An honest answer instead of a broken one.

        The editing controls live in the gutters either side of the page, and
        the gutters are the first thing a narrow viewport takes away — so below
        `sm` the merchant had a canvas they could tap and nothing that would
        respond, except Add Section, which worked and made the rest look
        deliberate. Preview is genuinely useful at this width and now reachable
        from the header, so this points at it rather than pretending.
      */}
      {building && (
        <p className="border-b bg-background px-4 py-2 text-center text-[11px] leading-relaxed text-muted-foreground sm:hidden">
          Editing a section needs a wider screen. Preview works here.
        </p>
      )}

      {building ? (
        <div ref={scrollerRef} className="flex-1 overflow-auto px-4 py-6 sm:px-16 sm:py-10">
          {/* `overflow-visible` on purpose: the gutter controls hang outside this
              frame, which is the whole point of putting them there. */}
          <div
            className="relative mx-auto max-w-full bg-white shadow-[0_18px_50px_-30px_rgb(0_0_0_/_0.45)] ring-1 ring-black/10"
            style={{ width: CANVAS_WIDTH }}
          >
            <div
              ref={hostRef}
              onClick={onClick}
              onMouseOver={onMouseOver}
              onMouseLeave={() => setHoveredId(null)}
            >
              {canvas ?? <CanvasSkeleton />}
            </div>

            <Gutters
              doc={doc}
              rects={rects}
              selectedId={selectedId}
              hoveredId={hoveredId}
              store={store}
            />
            <AddSectionBands doc={doc} rects={rects} onInsert={openAddSection} />
          </div>
        </div>
      ) : (
        <DevicePreviewFrame
          key={previewDevice}
          device={previewDevice}
          hostRef={hostRef}
          onClick={onClick}
        >
          {canvas ?? <CanvasSkeleton />}
        </DevicePreviewFrame>
      )}
    </div>
  );
}

/**
 * Brings the selected section into view when the selection came from elsewhere.
 *
 * Only reacts to `revealNonce`, never to `selectedId`: re-selecting the same
 * section must scroll again, and a re-render that happens to carry the same id
 * must not. Skips canvas-originated selections, which the merchant is already
 * looking at, and respects reduced-motion.
 */
function useRevealSelectedSection(
  store: BuilderStore,
  hostRef: React.RefObject<HTMLDivElement | null>,
  scrollerRef: React.RefObject<HTMLDivElement | null>,
) {
  const revealNonce = store((s) => s.revealNonce);
  const handled = useRef(revealNonce);

  useEffect(() => {
    if (revealNonce === handled.current) return;
    handled.current = revealNonce;

    const { selectedId, selectionSource } = store.getState();
    if (!selectedId || selectionSource === "canvas") return;

    const scroller = scrollerRef.current;
    const target = hostRef.current?.querySelector<HTMLElement>(
      `[data-sb-boundary][data-sb-section-id="${CSS.escape(selectedId)}"]`,
    );
    if (!scroller || !target) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const offset =
      target.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop;

    scroller.scrollTo({ top: Math.max(0, offset - 48), behavior: reduced ? "auto" : "smooth" });
  }, [revealNonce, store, hostRef, scrollerRef]);
}

function RenderingPill({ visible }: { visible: boolean }) {
  return (
    <div
      aria-live="polite"
      className={cn(
        "absolute left-1/2 top-4 z-20 -translate-x-1/2 transition-all duration-200",
        visible ? "translate-y-0 opacity-100" : "pointer-events-none -translate-y-2 opacity-0",
      )}
    >
      <span className="flex items-center gap-1.5 rounded-full bg-foreground/90 px-3 py-1.5 text-[11px] font-medium text-background shadow-lg">
        <Loader2 className="size-3 animate-spin" />
        Updating preview
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
 * `Add Section` at every gap a section may be inserted into.
 *
 * **Always visible, not hover-revealed.** The old `+` appeared only when the
 * pointer found a 16px strip between two sections, which made adding a section
 * a thing you had to already know about. A labelled band states both the action
 * and its position without a word of explanation, and a merchant who has never
 * used a page builder can see where their next section will land.
 *
 * Only body-zone boundaries are offered. Nothing addable belongs above the hero
 * or below the footer, so those gaps are simply absent rather than refusing.
 */
function AddSectionBands({
  doc,
  rects,
  onInsert,
}: {
  doc: PageDocument;
  rects: Record<string, DOMRect>;
  onInsert: (atIndex: number) => void;
}) {
  const points = useMemo(() => getAddSectionPoints(doc, rects), [doc, rects]);

  return (
    <div className="pointer-events-none absolute inset-0">
      {points.map((point) => (
        <div
          key={point.key}
          className="group/band pointer-events-auto absolute inset-x-0 flex h-7 -translate-y-1/2 items-center justify-center"
          style={{ top: point.y }}
        >
          <span
            aria-hidden
            className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-foreground/10 transition-colors group-hover/band:bg-foreground/25"
          />
          <button
            type="button"
            onClick={() => onInsert(point.atIndex)}
            className="relative flex items-center gap-1 rounded-full border bg-background px-2.5 py-1 text-[11px] font-medium text-muted-foreground shadow-sm transition-colors hover:border-foreground/25 hover:text-foreground focus:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            <Plus className="size-3" />
            Add Section
          </button>
        </div>
      ))}
    </div>
  );
}

/**
 * Per-section controls, in the margins either side of the page.
 *
 * Left is what to do with the section, right is where to put it. Both appear on
 * hover and stay while the section is selected, so the drawer never opens over
 * a section whose controls have vanished.
 *
 * **The control set is per kind, and absent controls are absent — not greyed
 * out.** A header shows one button; a footer shows none. The merchant never
 * discovers a limit by clicking into it, which is the difference between a tool
 * that feels considered and one that feels like it keeps saying no. The flags
 * come from the registry, and `mutations.ts` refuses exactly the operations the
 * gutters decline to offer, so the affordance and the invariant cannot drift.
 *
 * `Hide` and `Duplicate` used to live in an overflow menu here. Both are gone:
 * neither exists in the product this is modelled on, and both asked a merchant
 * to make a decision about page structure that the section catalogue already
 * makes for them. `hidden` is still honoured by the renderer for documents that
 * carry it.
 */
function Gutters({
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
  const select = store((s) => s.select);

  return (
    <div className="pointer-events-none absolute inset-0">
      {doc.sections.map((section, index) => {
        const rect = rects[section.id];
        if (!rect) return null;

        const active = section.id === selectedId || section.id === hoveredId;
        if (!active) return null;

        const def = SECTION_REGISTRY[section.kind];

        // Only offer a move the mutation will accept. Zone rules are enforced in
        // `moveSectionBy`; mirroring the boundary here is what keeps an enabled
        // button from producing a refusal toast.
        // A neighbour that cannot move cannot be swapped with either, which is
        // what keeps the hero from displacing the header.
        const previous = doc.sections[index - 1];
        const following = doc.sections[index + 1];
        const canMoveUp =
          def.movable &&
          !!previous &&
          SECTION_REGISTRY[previous.kind].zone === def.zone &&
          SECTION_REGISTRY[previous.kind].movable;
        const canMoveDown =
          def.movable &&
          !!following &&
          SECTION_REGISTRY[following.kind].zone === def.zone &&
          SECTION_REGISTRY[following.kind].movable;

        const move = (delta: -1 | 1) => {
          const neighbour = delta === -1 ? previous : following;
          moveSectionBy(section.id, delta);
          if (neighbour) {
            announce(
              `${sectionTitle(section)} moved ${delta === -1 ? "before" : "after"} ${sectionTitle(neighbour)}.`,
            );
          }
        };

        return (
          <div
            key={section.id}
            className="absolute"
            style={{ left: 0, top: rect.y, width: "100%", height: rect.height }}
          >
            {/* A hairline rather than a ring: enough to say which section the
                controls belong to, not enough to compete with the merchant's
                own colours. */}
            <span
              aria-hidden
              className={cn(
                "pointer-events-none absolute inset-0 transition-colors",
                section.id === selectedId
                  ? "ring-1 ring-inset ring-foreground/25"
                  : "ring-1 ring-inset ring-foreground/10",
              )}
            />

            {(def.editable || def.deletable) && (
              <GutterStack side="left">
                {def.editable && (
                  <GutterButton
                    label={`Edit ${sectionTitle(section)}`}
                    onClick={() => select(section.id, "canvas")}
                  >
                    <Pencil className="size-4" />
                  </GutterButton>
                )}

                {def.deletable && (
                  <GutterButton
                    label={`Delete ${sectionTitle(section)}`}
                    destructive
                    onClick={() => deleteSectionWithUndo(store, section.id)}
                  >
                    <Trash2 className="size-4" />
                  </GutterButton>
                )}
              </GutterStack>
            )}

            {(canMoveUp || canMoveDown) && (
              <GutterStack side="right">
                <GutterButton label="Move up" disabled={!canMoveUp} onClick={() => move(-1)}>
                  <ChevronUp className="size-4" />
                </GutterButton>
                <GutterButton label="Move down" disabled={!canMoveDown} onClick={() => move(1)}>
                  <ChevronDown className="size-4" />
                </GutterButton>
              </GutterStack>
            )}

            {section.hidden && (
              <span className="pointer-events-none absolute left-3 top-3 flex items-center gap-1 rounded bg-foreground/80 px-1.5 py-0.5 text-[10px] font-medium text-background">
                <EyeOff className="size-2.5" />
                Hidden
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** The rounded pill of controls that sits just outside the page edge. */
function GutterStack({
  side,
  children,
}: {
  side: "left" | "right";
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "pointer-events-auto absolute top-2 flex flex-col overflow-hidden rounded-lg border bg-background shadow-sm",
        side === "left" ? "right-full mr-2" : "left-full ml-2",
      )}
    >
      {children}
    </div>
  );
}

function GutterButton({
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
            "flex size-8 items-center justify-center text-muted-foreground transition-colors disabled:cursor-not-allowed disabled:opacity-30",
            destructive
              ? "hover:bg-destructive/10 hover:text-destructive"
              : "hover:bg-accent hover:text-foreground",
          )}
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent side={destructive ? "left" : "left"}>{label}</TooltipContent>
    </Tooltip>
  );
}
