"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { loadMenuCatalog, type MenuCatalog } from "@/app/dashboard/website/pages/menu-catalog";
import { renderCanvas } from "@/app/dashboard/website/pages/render-canvas";
import type { PageDocument } from "@/lib/site-builder/page-document";
import type { ThemeTokens } from "@/lib/site-builder/render-context";
import AddSectionModal from "./AddSectionModal";
import Canvas from "./Canvas";
import EditorTopBar from "./EditorTopBar";
import SectionDrawer, { type DrawerSite } from "./SectionDrawer";
import { escapeClosesDrawer } from "./escape-guard";
import { getTextPreviewPatches } from "./preview-sync";
import { createDraftSaveAdapter } from "./save-adapter";
import type { SiteFeatures } from "@/lib/site-builder/site-settings";
import {
  createBuilderStore,
  type EditorMode,
  type EditorPage,
  type SaveAdapter,
} from "./store";

/**
 * The editor's only stateful client root.
 *
 * Everything below it reads from one Zustand store whose single piece of state
 * is the page document. Re-rendering the canvas means posting that document to
 * the server and swapping in the tree it returns — so the canvas shows the same
 * markup the public site will, not an approximation of it.
 *
 * **One column and a drawer.** The three-column layout this replaced spent
 * about 580px of a 1280px laptop on chrome, leaving a merchant judging a desktop
 * layout through a 700px window. The layers panel is gone entirely — its
 * reordering, hiding, duplicating and deleting all moved into the canvas gutters,
 * next to the section they act on — and the inspector became a drawer that
 * appears only while something is being edited.
 */
export default function BuilderShell({
  initialDoc,
  initialCanvas = null,
  locationId,
  initialRevision = 0,
  initialCatalog,
  clerkOrgId,
  page,
  site,
  theme,
  publishedDoc = null,
  publishedAt = null,
  features,
  saveAdapter,
}: {
  initialDoc: PageDocument;
  /**
   * The first paint, rendered as a Server Component by the route and passed
   * down as a prop. Server components can be handed to a client component as
   * props — they just cannot be *imported* by one.
   */
  initialCanvas?: React.ReactNode;
  locationId: string;
  initialRevision?: number;
  /** Loaded on the server with the opening page; avoids a second menu request. */
  initialCatalog?: MenuCatalog;
  clerkOrgId: string;
  page: EditorPage;
  /**
   * The site this page belongs to, for the header section's navigation editor.
   * Site-wide rather than page-wide, which is exactly why it arrives beside the
   * page rather than inside its document.
   */
  site: DrawerSite;
  /**
   * The merchant's resolved theme.
   *
   * The drawer needs it for one job the canvas cannot do for it: telling a
   * merchant that the custom text colour they just picked had to be adjusted to
   * stay readable. That answer depends on the actual colours behind the section,
   * so the panel needs the same tokens the renderer resolves against — see
   * `SectionTextColorControl`.
   */
  theme: ThemeTokens;
  publishedDoc?: PageDocument | null;
  publishedAt?: string | null;
  /**
   * The merchant's brand toggles, which decide what the Add Section catalogue
   * offers. Site-wide, like `site` above, and for the same reason.
   */
  features?: SiteFeatures;
  /** Overridable for tests; production always saves through `SaveDraft`. */
  saveAdapter?: SaveAdapter;
}) {
  // Saves are addressed to one page; a page switch remounts this component (the
  // route keys on page id), so the adapter never outlives its page.
  const [resolvedAdapter] = useState(
    () => saveAdapter ?? createDraftSaveAdapter(clerkOrgId, page.id),
  );

  /**
   * Created exactly once per mount — deliberately a lazy `useState` initialiser
   * rather than `useMemo`.
   *
   * This used to be `useMemo([initialDoc, initialCanvas, initialRevision])`,
   * which caused an infinite render loop: `renderCanvas` is a Server Action, and
   * completing one re-renders the route, so the route handed down fresh prop
   * identities, which rebuilt the store, which gave `doc` a new identity, which
   * re-fired the render effect, which called the action again. Measured at 13
   * canvas renders per 12 seconds with nobody touching the browser.
   *
   * It was also silent data loss: rebuilding the store resets it to
   * `initialDoc`, so any unsaved edit was discarded every time the server
   * re-rendered for any reason at all.
   */
  const [store] = useState(() => {
    const next = createBuilderStore({
      doc: initialDoc,
      canvas: initialCanvas,
      revision: initialRevision,
      page,
      publishedDoc,
      publishedAt,
      locationId,
      features,
    });
    if (initialCatalog) {
      next.getState().setCatalog(
        initialCatalog.items,
        initialCatalog.showPrices,
        initialCatalog.error,
      );
    }
    return next;
  });

  const doc = store((s) => s.doc);
  const mode = store((s) => s.mode);
  const notice = store((s) => s.notice);
  const selectedId = store((s) => s.selectedId);
  const pageSettingsOpen = store((s) => s.pageSettingsOpen);
  const clearNotice = store((s) => s.clearNotice);
  const setCanvas = store((s) => s.setCanvas);
  const setRendering = store((s) => s.setRendering);
  const canvasRefreshRequest = store((s) => s.canvasRefreshRequest);

  const drawerOpen = selectedId !== null || pageSettingsOpen;

  // Refusals — dragging the hero past the footer, deleting a locked section —
  // surface as a toast rather than failing silently.
  useEffect(() => {
    if (!notice) return;
    toast.info(notice);
    clearNotice();
  }, [notice, clearNotice]);

  useServerRender(doc, locationId, mode, canvasRefreshRequest, setCanvas, setRendering);
  useAutosave(store, resolvedAdapter);
  useSaveFailureToast(store);
  useMenuCatalog(store, locationId, !!initialCatalog);
  useUnsavedChangesWarning(store);
  useEscapeClosesDrawer(store);

  return (
    <EditorTopBar
      store={store}
      clerkOrgId={clerkOrgId}
      locationId={locationId}
      subdomain={site.subdomain}
    >
      <div className="flex h-full min-h-0">
        {/* Left, as Owner's is. The canvas keeps its position on screen when the
            drawer opens, so opening one does not shift the thing being edited. */}
        {drawerOpen && (
          <SectionDrawer
            store={store}
            locationId={locationId}
            clerkOrgId={clerkOrgId}
            site={site}
            theme={theme}
          />
        )}
        <Canvas store={store} />
      </div>

      <AddSectionModal store={store} />
    </EditorTopBar>
  );
}

/**
 * Re-renders only changes which cannot be patched safely in the existing tree.
 *
 * Marked, non-empty text fields are updated synchronously by Canvas. Structural
 * changes, rich text and anything without a suitable marker still use this
 * canonical server render, so the editor and the public storefront keep one
 * markup implementation.
 */
function useServerRender(
  doc: PageDocument,
  locationId: string,
  /**
   * Build or Preview. Part of what the *server* renders, not just chrome: the
   * toggle used to hide the gutter controls and leave the page itself in
   * builder mode, so Preview still drew placeholders for empty sections that no
   * visitor would ever see.
   */
  mode: EditorMode,
  canvasRefreshRequest: number,
  setCanvas: (canvas: React.ReactNode) => void,
  setRendering: (rendering: boolean) => void,
) {
  const first = useRef(true);
  const renderedDoc = useRef(doc);
  const renderedMode = useRef(mode);
  const handledRefreshRequest = useRef(canvasRefreshRequest);
  // Monotonic token: a slow earlier render must never overwrite a newer one.
  const latest = useRef(0);

  useEffect(() => {
    // The route already rendered the first canvas and passed it in.
    if (first.current) {
      first.current = false;
      return;
    }

    const refreshRequested = canvasRefreshRequest !== handledRefreshRequest.current;
    if (refreshRequested) handledRefreshRequest.current = canvasRefreshRequest;
    // A mode flip changes the markup even when the document has not moved, so
    // it is its own reason to re-render. Driven off `mode` directly rather than
    // by also bumping `canvasRefreshRequest` inside `setMode`: one signal for
    // one idea, and this one cannot get out of step with what was rendered.
    const modeChanged = mode !== renderedMode.current;
    if (modeChanged) renderedMode.current = mode;
    const mustRender =
      modeChanged || refreshRequested || getTextPreviewPatches(renderedDoc.current, doc) === null;
    if (!mustRender) return;

    // Advance the token at scheduling time, not only when the timer fires. A
    // newer edit must be able to invalidate an older in-flight server response.
    const token = ++latest.current;
    const snapshot = doc;
    // Edits are debounced so a burst of typing costs one render. A mode flip is
    // the direct answer to a click, and waiting 400 ms for it reads as a stall.
    const timer = setTimeout(async () => {
      setRendering(true);
      try {
        const node = await renderCanvas(snapshot, locationId, mode);
        if (token !== latest.current) return;

        /**
         * `renderCanvas` *refuses* rather than throws when the session has
         * lapsed or the site lookup fails — it returns `null`. Handing that
         * straight to `setCanvas` read as "the page rendered, and it is empty",
         * so the canvas fell back to its skeleton permanently and said nothing.
         * A dropped session was indistinguishable from a bug in the merchant's
         * own page. §I1.
         *
         * Routed into the `catch` below rather than handled here so there is
         * one failure path with one message. Deliberately *before*
         * `renderedDoc.current` advances: leaving it on the last tree that
         * actually rendered means the next edit retries a full render instead
         * of patching text into a canvas that was never replaced.
         */
        if (node === null) throw new Error("renderCanvas returned no tree");

        renderedDoc.current = snapshot;
        setCanvas(node);
      } catch (error) {
        console.error("[site-builder] canvas render failed:", error);
        toast.error("Could not update the preview.");
      } finally {
        if (token === latest.current) setRendering(false);
      }
    }, modeChanged ? 0 : 400);

    return () => clearTimeout(timer);
    // `mode` is safe to depend on here — it changes only on a click. Anything
    // with a fresh identity per render is not; see the loop documented above.
  }, [doc, locationId, mode, canvasRefreshRequest, setCanvas, setRendering]);
}

/**
 * Loads the menu once per editor session.
 *
 * Fetched here rather than by whichever panel happens to mount first. A failure
 * is not fatal: the dish picker explains itself rather than claiming the menu is
 * empty.
 */
function useMenuCatalog(
  store: ReturnType<typeof createBuilderStore>,
  locationId: string,
  alreadyLoaded: boolean,
) {
  useEffect(() => {
    if (alreadyLoaded) return;
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
  }, [store, locationId, alreadyLoaded]);
}

/**
 * Autosave.
 *
 * Debounced 1.5 s with a flush on tab-hide, per PLAN-02 §5.
 *
 * **The indicator is gone; the machinery is not.** Owner's editor has no save
 * button either, which means it autosaves — and an editor whose only write is
 * `Publish` loses a merchant's afternoon to a refresh. Removing the status text
 * is a simplicity win; removing the persistence would be a data-loss bug wearing
 * simplicity's clothes.
 */
function useAutosave(store: ReturnType<typeof createBuilderStore>, adapter: SaveAdapter) {
  const doc = store((s) => s.doc);
  const saveState = store((s) => s.saveState);
  const saving = useRef(false);
  const queued = useRef(false);

  useEffect(() => {
    if (saveState !== "dirty") return;

    const flush = async () => {
      if (saving.current) {
        queued.current = true;
        return;
      }

      const {
        doc: snapshot,
        revision,
        editGeneration,
        setSaveState,
        adoptServerDoc,
        markSaved,
        setSaveError,
      } = store.getState();
      saving.current = true;
      setSaveState("saving");

      try {
        const outcome = await adapter.save(snapshot, revision);
        if (outcome.ok) {
          markSaved(outcome.revision, editGeneration);
          return;
        }
        if (outcome.reason === "conflict") {
          // Never silently merge and never silently clobber — PLAN-02 §5.
          setSaveState("conflict");
          setSaveError("This page was changed in another window.");
          toast.warning("This page was changed in another window.", {
            action: {
              label: "Load theirs",
              onClick: () => adoptServerDoc(outcome.serverDoc, outcome.revision),
            },
          });
          return;
        }
        setSaveState("error");
        setSaveError(outcome.message);
      } finally {
        saving.current = false;
        if (queued.current) {
          queued.current = false;
          if (store.getState().saveState === "dirty") void flush();
        }
      }
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

/**
 * Says so, once, when a save fails.
 *
 * There is no status line to carry this any more. A merchant typing into a
 * document nothing is storing has to be told — in an editor that otherwise says
 * nothing about saving at all, this is the one moment silence would be a lie.
 */
function useSaveFailureToast(store: ReturnType<typeof createBuilderStore>) {
  const saveState = store((s) => s.saveState);
  const saveError = store((s) => s.saveError);
  const announced = useRef(false);

  useEffect(() => {
    if (saveState === "error" && saveError) {
      if (announced.current) return;
      announced.current = true;
      toast.error(saveError, {
        description: "Your recent changes are not stored. Keep this tab open.",
        duration: Infinity,
        action: {
          label: "Try again",
          onClick: () => store.getState().setSaveState("dirty"),
        },
      });
      return;
    }
    if (saveState === "saved") announced.current = false;
  }, [saveState, saveError, store]);
}

/**
 * Warns before a reload or tab close that would discard unsaved work.
 *
 * Autosave usually gets there first — this covers the window between the last
 * keystroke and the debounce, and the case that matters far more: a save that is
 * failing. Registered only while there is something to lose.
 */
function useUnsavedChangesWarning(store: ReturnType<typeof createBuilderStore>) {
  const saveState = store((s) => s.saveState);
  const atRisk = saveState === "dirty" || saveState === "error" || saveState === "conflict";

  useEffect(() => {
    if (!atRisk) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [atRisk]);
}

/**
 * The one keyboard shortcut left.
 *
 * Undo, redo and the command-palette Add Section are gone with their buttons.
 * Escape stays because closing a panel with it is not a builder convention a
 * merchant has to learn — it is what every panel everywhere already does.
 */
function useEscapeClosesDrawer(store: ReturnType<typeof createBuilderStore>) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!escapeClosesDrawer(event)) return;
      store.getState().closeDrawer();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [store]);
}
