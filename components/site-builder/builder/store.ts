"use client";

import { create } from "zustand";

import type { CatalogItem } from "@/app/dashboard/website/builder/menu-catalog";
import {
  addSection,
  duplicateSection,
  moveSectionBy,
  removeSection,
  setSectionHidden,
  updateSectionProps,
  updateSeo,
  type MutationResult,
} from "@/lib/site-builder/mutations";
import type { PageDocument } from "@/lib/site-builder/page-document";
import type { SectionKind } from "@/lib/site-builder/sections/kinds";

/**
 * Builder state.
 *
 * **The document is the only state.** Selection is an id rather than a section
 * object; validation is computed, never stored. That is what makes undo/redo a
 * two-line operation — push the previous document, pop it back — instead of a
 * command-pattern project, and it is why every mutation lives in
 * `lib/site-builder/mutations.ts` as a pure function rather than in here.
 */

export type DeviceMode = "desktop" | "tablet" | "mobile";

export type SaveState = "idle" | "dirty" | "saving" | "saved" | "conflict" | "error";

/**
 * Which column is showing below `lg`, where three do not fit.
 *
 * Narrow layouts drill in rather than hiding panels: the merchant can always
 * reach every control, just not all at once. Ignored at `lg` and above, where
 * the structure rail and canvas are both always present.
 */
export type Pane = "structure" | "canvas" | "inspector";

/** Undo depth, matching the MockBuilder spec. */
const HISTORY_LIMIT = 50;

/**
 * How the builder persists.
 *
 * An interface rather than a direct call so the canvas could be built and used
 * before the Stage 2 migration was applied: the default adapter keeps the
 * document in memory, and `SaveDraft(pageId, doc, revision)` drops in behind the
 * same signature with no change above this line.
 */
export interface SaveAdapter {
  save(doc: PageDocument, revision: number): Promise<SaveOutcome>;
}

export type SaveOutcome =
  | { ok: true; revision: number }
  | { ok: false; reason: "conflict"; serverDoc: PageDocument; revision: number }
  | { ok: false; reason: "error"; message: string };

/** In-memory adapter. Accepts everything; persists nothing. */
export const noopSaveAdapter: SaveAdapter = {
  async save(_doc, revision) {
    return { ok: true, revision: revision + 1 };
  },
};

interface BuilderState {
  doc: PageDocument;
  /**
   * The document as it was last published — the baseline every "3 changes"
   * count is measured against.
   *
   * Until Stage 5 exists there is nothing published to compare with, so this
   * starts as the document the builder opened with. That makes the count read
   * "changes this session", which is honest and useful; `markPublished` swaps in
   * the real meaning the moment a publish pipeline can call it.
   */
  publishedDoc: PageDocument;
  /** Optimistic-concurrency token from the server. */
  revision: number;
  selectedId: string | null;
  device: DeviceMode;
  saveState: SaveState;
  /** When the last successful save landed, for "Saved 2m ago". */
  savedAt: number | null;
  /** Last refusal message, surfaced by the UI then cleared. */
  notice: string | null;

  /**
   * Whether canvas clicks select a section or pass through to the page.
   *
   * An editor that permanently swallows clicks makes it impossible to test your
   * own links, accordions and menu tabs — so this turns the overlay off and
   * lets the merchant use their page as a visitor would.
   */
  inspectorEnabled: boolean;

  /**
   * Page-level settings (search title, description, indexing) in the inspector.
   *
   * The inspector is otherwise a consequence of selection — it appears when a
   * section is selected and gets out of the way when one is not, so that a
   * merchant reviewing their page gets the widest canvas the screen allows.
   * Page settings belong to no section, so they need their own way in; the
   * toolbar's page menu opens this.
   */
  pageSettingsOpen: boolean;

  /** Add Section modal, and where its choice should land. */
  addOpen: boolean;
  /** Document index to insert at; `null` appends to the end of the body zone. */
  insertIndex: number | null;

  /** Menu items this page may bind to. `null` until loaded. */
  catalog: CatalogItem[] | null;
  /** False on a brand page, where a single price would be a guess. */
  catalogShowPrices: boolean;
  catalogError: string | null;

  pane: Pane;

  past: PageDocument[];
  future: PageDocument[];

  /**
   * The server-rendered canvas, held as a React node rather than an HTML
   * string — it arrives from a Server Action as an RSC payload.
   */
  canvas: React.ReactNode;
  isRendering: boolean;

  // section mutations
  addSection: (kind: SectionKind, atIndex?: number) => void;
  removeSection: (id: string) => void;
  duplicateSection: (id: string) => void;
  moveSectionBy: (id: string, delta: number) => void;
  reorderSections: (fromIndex: number, toIndex: number) => void;
  updateProps: (id: string, patch: Record<string, unknown>) => void;
  toggleHidden: (id: string) => void;
  updateSeo: (patch: Partial<PageDocument["seo"]>) => void;

  // history
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;

  // ui
  select: (id: string | null) => void;
  setDevice: (device: DeviceMode) => void;
  setCanvas: (canvas: React.ReactNode) => void;
  setRendering: (isRendering: boolean) => void;
  setSaveState: (state: SaveState) => void;
  clearNotice: () => void;
  toggleInspector: () => void;
  setPane: (pane: Pane) => void;
  openPageSettings: () => void;
  closeInspector: () => void;
  openAddSection: (atIndex?: number | null) => void;
  closeAddSection: () => void;
  setCatalog: (catalog: CatalogItem[], showPrices: boolean, error?: string) => void;
  /** Records a successful save so the toolbar can say when. */
  markSaved: (revision: number) => void;
  /** Resets the change baseline. Called by the publish pipeline at Stage 5. */
  markPublished: () => void;

  /** Replaces the document wholesale — starter templates, conflict resolution. */
  replaceDoc: (doc: PageDocument, revision?: number) => void;
}

export interface BuilderInit {
  doc: PageDocument;
  canvas: React.ReactNode;
  revision?: number;
}

export function createBuilderStore(init: BuilderInit) {
  return create<BuilderState>((set, get) => {
    /**
     * Applies a pure mutation, pushing the previous document onto the undo
     * stack. A refused mutation — dragging the hero past the footer, deleting a
     * locked section — leaves state untouched and surfaces the reason, rather
     * than failing silently.
     */
    const apply = (result: MutationResult) => {
      if (!result.ok) {
        set({ notice: result.message });
        return;
      }
      const { doc, past } = get();
      set({
        doc: result.doc,
        past: [...past, doc].slice(-HISTORY_LIMIT),
        future: [],
        saveState: "dirty",
      });
    };

    return {
      doc: init.doc,
      publishedDoc: init.doc,
      revision: init.revision ?? 0,
      selectedId: null,
      device: "desktop",
      saveState: "idle",
      savedAt: null,
      notice: null,
      inspectorEnabled: true,
      pageSettingsOpen: false,
      addOpen: false,
      insertIndex: null,
      catalog: null,
      catalogShowPrices: false,
      catalogError: null,
      pane: "canvas",
      past: [],
      future: [],
      canvas: init.canvas,
      isRendering: false,

      addSection: (kind, atIndex) => {
        const before = get().doc.sections.map((s) => s.id);
        // An explicit argument wins; otherwise honour wherever the merchant
        // opened the modal from — a zone's "+" or a gap in the canvas.
        const index = atIndex ?? get().insertIndex ?? undefined;
        apply(addSection(get().doc, kind, { atIndex: index ?? undefined }));

        // Select whatever was just inserted so the settings panel opens on it.
        const added = get().doc.sections.find((s) => !before.includes(s.id));
        set({
          addOpen: false,
          insertIndex: null,
          ...(added ? { selectedId: added.id, pane: "inspector" as Pane } : {}),
        });
      },

      removeSection: (id) => {
        apply(removeSection(get().doc, id));
        if (get().selectedId === id) set({ selectedId: null });
      },

      duplicateSection: (id) => apply(duplicateSection(get().doc, id)),

      moveSectionBy: (id, delta) => apply(moveSectionBy(get().doc, id, delta)),

      reorderSections: (fromIndex, toIndex) => {
        const { doc } = get();
        const section = doc.sections[fromIndex];
        if (!section) return;
        apply(moveSectionBy(doc, section.id, toIndex - fromIndex));
      },

      updateProps: (id, patch) => apply(updateSectionProps(get().doc, id, patch)),

      toggleHidden: (id) => {
        const section = get().doc.sections.find((s) => s.id === id);
        if (!section) return;
        apply(setSectionHidden(get().doc, id, !section.hidden));
      },

      updateSeo: (patch) => {
        const { doc, past } = get();
        set({
          doc: updateSeo(doc, patch),
          past: [...past, doc].slice(-HISTORY_LIMIT),
          future: [],
          saveState: "dirty",
        });
      },

      undo: () => {
        const { past, future, doc } = get();
        const previous = past[past.length - 1];
        if (!previous) return;
        set({
          doc: previous,
          past: past.slice(0, -1),
          future: [doc, ...future].slice(0, HISTORY_LIMIT),
          saveState: "dirty",
        });
      },

      redo: () => {
        const { past, future, doc } = get();
        const next = future[0];
        if (!next) return;
        set({
          doc: next,
          past: [...past, doc].slice(-HISTORY_LIMIT),
          future: future.slice(1),
          saveState: "dirty",
        });
      },

      canUndo: () => get().past.length > 0,
      canRedo: () => get().future.length > 0,

      // Selecting drills the narrow layout into the inspector; deselecting
      // returns to the canvas. At `lg` and above `pane` is ignored entirely.
      select: (id) =>
        set({ selectedId: id, pageSettingsOpen: false, pane: id ? "inspector" : "canvas" }),
      setDevice: (device) => set({ device }),
      setCanvas: (canvas) => set({ canvas }),
      setRendering: (isRendering) => set({ isRendering }),
      setSaveState: (saveState) => set({ saveState }),
      clearNotice: () => set({ notice: null }),

      toggleInspector: () =>
        set((state) => ({
          inspectorEnabled: !state.inspectorEnabled,
          // Leaving a section selected while the overlay is off strands its
          // controls on a page the merchant is now trying to click through.
          selectedId: state.inspectorEnabled ? null : state.selectedId,
        })),

      setPane: (pane) => set({ pane }),

      openPageSettings: () =>
        set({ pageSettingsOpen: true, selectedId: null, pane: "inspector" }),

      closeInspector: () =>
        set({ selectedId: null, pageSettingsOpen: false, pane: "canvas" }),

      openAddSection: (atIndex = null) => set({ addOpen: true, insertIndex: atIndex }),
      closeAddSection: () => set({ addOpen: false, insertIndex: null }),

      setCatalog: (catalog, showPrices, error) =>
        set({ catalog, catalogShowPrices: showPrices, catalogError: error ?? null }),

      markSaved: (revision) => set({ revision, saveState: "saved", savedAt: Date.now() }),

      markPublished: () => set((state) => ({ publishedDoc: state.doc })),

      replaceDoc: (doc, revision) =>
        set((state) => ({
          doc,
          revision: revision ?? state.revision,
          past: [...state.past, state.doc].slice(-HISTORY_LIMIT),
          future: [],
          selectedId: null,
          saveState: "dirty",
        })),
    };
  });
}

export type BuilderStore = ReturnType<typeof createBuilderStore>;
