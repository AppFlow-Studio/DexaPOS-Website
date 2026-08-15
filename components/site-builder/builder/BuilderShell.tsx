"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { renderCanvas } from "@/app/dashboard/website/builder/render-canvas";
import type { PageDocument } from "@/lib/site-builder/page-document";
import Canvas from "./Canvas";
import SectionList from "./SectionList";
import SettingsPanel from "./SettingsPanel";
import Toolbar, { AddSectionModal } from "./Toolbar";
import { createBuilderStore, noopSaveAdapter, type SaveAdapter } from "./store";

/**
 * The builder's only stateful client root.
 *
 * Everything below it reads from one Zustand store whose single piece of state
 * is the page document. Re-rendering the canvas means posting that document to
 * the server and swapping in the HTML it returns — so the canvas shows the same
 * markup the public site will, not an approximation of it.
 */
export default function BuilderShell({
  initialDoc,
  initialCanvas = null,
  locationId,
  initialRevision = 0,
  saveAdapter = noopSaveAdapter,
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

  const [addOpen, setAddOpen] = useState(false);

  const doc = store((s) => s.doc);
  const notice = store((s) => s.notice);
  const clearNotice = store((s) => s.clearNotice);
  const setCanvas = store((s) => s.setCanvas);
  const setRendering = store((s) => s.setRendering);

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

  const openAddSection = () => setAddOpen(true);

  return (
    // The dashboard chrome is a fixed 4rem header (app/dashboard/layout.tsx), so
    // the builder claims exactly the rest of the viewport and never scrolls the
    // page itself — each of the three columns scrolls independently instead.
    <div className="flex h-[calc(100vh-4rem)] flex-col overflow-hidden bg-zinc-50">
      <Toolbar store={store} onOpenAddSection={openAddSection} />

      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-60 shrink-0 border-r border-zinc-200 md:block">
          <SectionList store={store} onOpenAddSection={openAddSection} />
        </aside>

        <Canvas store={store} />

        <aside className="hidden w-85 shrink-0 border-l border-zinc-200 lg:block">
          <SettingsPanel store={store} />
        </aside>
      </div>

      {addOpen && <AddSectionModal store={store} onClose={() => setAddOpen(false)} />}
    </div>
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
      const { revision, setSaveState, replaceDoc } = store.getState();
      setSaveState("saving");

      const outcome = await adapter.save(doc, revision);
      if (outcome.ok) {
        store.setState({ revision: outcome.revision, saveState: "saved" });
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
      // Never steal undo from a field the merchant is typing in.
      if (target?.matches("input, textarea, select, [contenteditable]")) return;

      const mod = event.metaKey || event.ctrlKey;
      if (mod && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) store.getState().redo();
        else store.getState().undo();
        return;
      }
      if (event.key === "Escape") store.getState().select(null);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [store]);
}
