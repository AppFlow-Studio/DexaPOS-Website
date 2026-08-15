"use client";

import { Layers, PanelRight, Square } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { loadMenuCatalog } from "@/app/dashboard/website/builder/menu-catalog";
import { renderCanvas } from "@/app/dashboard/website/builder/render-canvas";
import type { PageDocument } from "@/lib/site-builder/page-document";
import { cn } from "@/lib/utils";
import AddSectionModal from "./AddSectionModal";
import Canvas from "./Canvas";
import SectionList from "./SectionList";
import SettingsPanel from "./SettingsPanel";
import Toolbar from "./Toolbar";
import { createBuilderStore, noopSaveAdapter, type Pane, type SaveAdapter } from "./store";

/**
 * The builder's only stateful client root.
 *
 * Everything below it reads from one Zustand store whose single piece of state
 * is the page document. Re-rendering the canvas means posting that document to
 * the server and swapping in the tree it returns — so the canvas shows the same
 * markup the public site will, not an approximation of it.
 *
 * **The inspector appears on selection rather than sitting there.** Two fixed
 * rails cost about 580px of chrome, and a merchant on a 1280px laptop is then
 * judging a desktop layout through a 700px window. Making the third column a
 * consequence of selection gives two honest modes: *review*, where the canvas
 * gets everything the screen has, and *edit*, where the controls for the thing
 * you clicked are next to it. `Esc` returns to review.
 */
export default function BuilderShell({
  initialDoc,
  initialCanvas = null,
  locationId,
  initialRevision = 0,
  saveAdapter = noopSaveAdapter,
  siteName,
  viewUrl,
}: {
  initialDoc: PageDocument;
  /**
   * The first paint, rendered as a Server Component by the page and passed down
   * as a prop. Server components can be handed to a client component as props —
   * they just cannot be *imported* by one.
   */
  initialCanvas?: React.ReactNode;
  locationId: string;
  initialRevision?: number;
  saveAdapter?: SaveAdapter;
  siteName?: string;
  viewUrl?: string;
}) {
  /**
   * Created exactly once per mount — deliberately a lazy `useState` initialiser
   * rather than `useMemo`.
   *
   * This used to be `useMemo([initialDoc, initialCanvas, initialRevision])`,
   * which caused an infinite render loop: `renderCanvas` is a Server Action, and
   * completing one re-renders the route, so the page handed down fresh prop
   * identities, which rebuilt the store, which gave `doc` a new identity, which
   * re-fired the render effect, which called the action again. Measured at 13
   * canvas renders per 12 seconds with nobody touching the browser.
   *
   * It was also silent data loss: rebuilding the store resets it to
   * `initialDoc`, so any unsaved edit was discarded every time the server
   * re-rendered for any reason at all.
   *
   * After mount the store is the source of truth and later props are ignored;
   * `useState` guarantees that, where `useMemo` is only ever a hint.
   */
  const [store] = useState(() =>
    createBuilderStore({ doc: initialDoc, canvas: initialCanvas, revision: initialRevision }),
  );

  const doc = store((s) => s.doc);
  const notice = store((s) => s.notice);
  const selectedId = store((s) => s.selectedId);
  const pageSettingsOpen = store((s) => s.pageSettingsOpen);
  const pane = store((s) => s.pane);
  const clearNotice = store((s) => s.clearNotice);
  const setCanvas = store((s) => s.setCanvas);
  const setRendering = store((s) => s.setRendering);
  const setPane = store((s) => s.setPane);

  const inspectorOpen = selectedId !== null || pageSettingsOpen;

  // Refusals — dragging the hero past the footer, deleting a locked section —
  // surface as a toast rather than failing silently.
  useEffect(() => {
    if (!notice) return;
    toast.info(notice);
    clearNotice();
  }, [notice, clearNotice]);

  useServerRender(doc, locationId, setCanvas, setRendering);
  useAutosave(store, saveAdapter);
  useKeyboardShortcuts(store);
  useMenuCatalog(store, locationId);

  return (
    // The dashboard chrome is a fixed 4rem header, and `#main-content` pads its
    // children (`p-4 sm:p-6 pb-20 sm:pb-6` — app/dashboard/layout.tsx). The
    // negative margins cancel that padding so the builder is full-bleed, which
    // is both what an editor wants and what makes `100vh - 4rem` exactly right:
    // without them the shell overflowed by the padding, pushing the bottom pane
    // switcher off-screen at every breakpoint.
    <div className="-m-4 -mb-20 flex h-[calc(100vh-4rem)] flex-col overflow-hidden bg-background sm:-m-6 sm:-mb-6">
      <Toolbar store={store} siteName={siteName} viewUrl={viewUrl} />

      <div className="flex min-h-0 flex-1">
        <aside
          aria-label="Page structure"
          className={cn(
            "min-w-0 shrink-0 border-r",
            // Below lg exactly one pane shows and it fills the width; at lg and
            // above the rail is permanent.
            "w-full lg:block lg:w-60",
            pane === "structure" ? "block" : "hidden",
          )}
        >
          <SectionList store={store} />
        </aside>

        <div className={cn("min-w-0 flex-1", pane === "canvas" ? "flex" : "hidden lg:flex")}>
          <Canvas store={store} />
        </div>

        <aside
          aria-label="Settings"
          className={cn(
            "min-w-0 shrink-0 border-l",
            "w-full lg:w-85",
            inspectorOpen ? (pane === "inspector" ? "block" : "hidden lg:block") : "hidden",
          )}
        >
          {inspectorOpen && <SettingsPanel store={store} />}
        </aside>
      </div>

      <MobilePaneSwitcher pane={pane} setPane={setPane} inspectorOpen={inspectorOpen} />

      <AddSectionModal store={store} />
    </div>
  );
}

/**
 * Below `lg`, drill in rather than hide.
 *
 * Panels that simply disappear at a breakpoint leave a merchant on a small
 * laptop or a tablet with controls they cannot reach at all. Three tabs cost one
 * row of chrome and keep every part of the builder available at every size.
 */
function MobilePaneSwitcher({
  pane,
  setPane,
  inspectorOpen,
}: {
  pane: Pane;
  setPane: (pane: Pane) => void;
  inspectorOpen: boolean;
}) {
  const tabs: { id: Pane; label: string; Icon: typeof Layers; disabled?: boolean }[] = [
    { id: "structure", label: "Sections", Icon: Layers },
    { id: "canvas", label: "Page", Icon: Square },
    { id: "inspector", label: "Settings", Icon: PanelRight, disabled: !inspectorOpen },
  ];

  return (
    <nav
      aria-label="Builder panes"
      className="flex shrink-0 items-stretch border-t bg-background lg:hidden"
    >
      {tabs.map(({ id, label, Icon, disabled }) => (
        <button
          key={id}
          type="button"
          disabled={disabled}
          aria-current={pane === id}
          onClick={() => setPane(id)}
          className={cn(
            "flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium transition-colors disabled:opacity-30",
            pane === id ? "text-foreground" : "text-muted-foreground",
          )}
        >
          <Icon className="size-4" />
          {label}
        </button>
      ))}
    </nav>
  );
}

/**
 * Re-renders the document on the server, debounced.
 *
 * 400 ms is the "slow path" from PLAN-06 §2.2. The keystroke-level fast path
 * (patching a text node directly by its `data-sb-field`) is deliberately not
 * built yet — it is an optimisation, and shipping the simple version first
 * means finding out whether it is actually needed.
 */
function useServerRender(
  doc: PageDocument,
  locationId: string,
  setCanvas: (canvas: React.ReactNode) => void,
  setRendering: (rendering: boolean) => void,
) {
  const first = useRef(true);
  // Monotonic token: a slow earlier render must never overwrite a newer one.
  const latest = useRef(0);

  useEffect(() => {
    // The page already rendered the first canvas and passed it in.
    if (first.current) {
      first.current = false;
      return;
    }

    const timer = setTimeout(async () => {
      const token = ++latest.current;
      setRendering(true);
      try {
        const node = await renderCanvas(doc, locationId);
        if (token === latest.current) setCanvas(node);
      } catch (error) {
        console.error("[site-builder] canvas render failed:", error);
        toast.error("Could not update the preview.");
      } finally {
        if (token === latest.current) setRendering(false);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [doc, locationId, setCanvas, setRendering]);
}

/**
 * Loads the menu once per builder session.
 *
 * Two features depend on it — the dish picker and the `⚠` markers — and both
 * want the same answer, so it is fetched here rather than by whichever panel
 * happens to mount first. A failure is not fatal: the picker explains itself and
 * the markers stay silent rather than claiming everything is fine.
 */
function useMenuCatalog(store: ReturnType<typeof createBuilderStore>, locationId: string) {
  useEffect(() => {
    let cancelled = false;

    loadMenuCatalog(locationId)
      .then((catalog) => {
        if (cancelled) return;
        store.getState().setCatalog(catalog.items, catalog.showPrices, catalog.error);
      })
      .catch((error) => {
        if (cancelled) return;
        console.error("[site-builder] menu catalog failed:", error);
        store.getState().setCatalog([], false, "Could not load your menu.");
      });

    return () => {
      cancelled = true;
    };
  }, [store, locationId]);
}

/**
 * Autosave.
 *
 * Debounced 1.5 s with a flush on tab-hide, per PLAN-02 §5. The adapter is a
 * no-op until the site tables exist, but the timing, the save-state transitions
 * and the conflict path are all real — so wiring `SaveDraft` in later changes
 * one function, not this hook.
 */
function useAutosave(store: ReturnType<typeof createBuilderStore>, adapter: SaveAdapter) {
  const doc = store((s) => s.doc);
  const saveState = store((s) => s.saveState);

  useEffect(() => {
    if (saveState !== "dirty") return;

    const flush = async () => {
      const { revision, setSaveState, replaceDoc, markSaved } = store.getState();
      setSaveState("saving");

      const outcome = await adapter.save(doc, revision);
      if (outcome.ok) {
        markSaved(outcome.revision);
        return;
      }
      if (outcome.reason === "conflict") {
        // Never silently merge and never silently clobber — PLAN-02 §5.
        setSaveState("conflict");
        toast.warning("This page was changed in another window.", {
          action: {
            label: "Load theirs",
            onClick: () => replaceDoc(outcome.serverDoc, outcome.revision),
          },
        });
        return;
      }
      setSaveState("error");
      toast.error(outcome.message);
    };

    const timer = setTimeout(flush, 1500);
    const onHide = () => {
      if (document.visibilityState === "hidden") void flush();
    };
    document.addEventListener("visibilitychange", onHide);

    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onHide);
    };
  }, [doc, saveState, adapter, store]);
}

function useKeyboardShortcuts(store: ReturnType<typeof createBuilderStore>) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = !!target?.matches("input, textarea, select, [contenteditable]");

      const mod = event.metaKey || event.ctrlKey;

      // Add Section is reachable while typing: it opens a search field, so a
      // merchant part-way through editing a heading can still reach for it.
      if (mod && event.key.toLowerCase() === "k") {
        event.preventDefault();
        store.getState().openAddSection();
        return;
      }

      // Never steal undo from a field the merchant is typing in.
      if (typing) return;

      if (mod && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) store.getState().redo();
        else store.getState().undo();
        return;
      }

      // Shopify's inspector toggle, same shortcut — the one piece of muscle
      // memory a merchant may already have from another builder.
      if (mod && event.shiftKey && event.key.toLowerCase() === "i") {
        event.preventDefault();
        store.getState().toggleInspector();
        return;
      }

      if (event.key === "Escape") {
        // An open popover, dropdown or dialog owns this Escape. Without the
        // guard, dismissing the publish popover also closed the inspector
        // behind it — one keypress, two things dismissed, only one of them
        // asked for. Radix renders open layers into these wrappers and has not
        // yet unmounted them when this window listener runs.
        const layerOpen = document.querySelector(
          '[data-radix-popper-content-wrapper], [role="dialog"][data-state="open"]',
        );
        if (layerOpen) return;

        store.getState().closeInspector();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [store]);
}
