"use client";

import { create } from "zustand";

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
  /** Optimistic-concurrency token from the server. */
  revision: number;
  selectedId: string | null;
  device: DeviceMode;
  saveState: SaveState;
  /** Last refusal message, surfaced by the UI then cleared. */
  notice: string | null;

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
      revision: init.revision ?? 0,
      selectedId: null,
      device: "desktop",
      saveState: "idle",
      notice: null,
      past: [],
      future: [],
      canvas: init.canvas,
      isRendering: false,

      addSection: (kind, atIndex) => {
        const before = get().doc.sections.map((s) => s.id);
        apply(addSection(get().doc, kind, { atIndex }));
        // Select whatever was just inserted so the settings panel opens on it.
        const added = get().doc.sections.find((s) => !before.includes(s.id));
        if (added) set({ selectedId: added.id });
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

      select: (id) => set({ selectedId: id }),
      setDevice: (device) => set({ device }),
      setCanvas: (canvas) => set({ canvas }),
      setRendering: (isRendering) => set({ isRendering }),
      setSaveState: (saveState) => set({ saveState }),
      clearNotice: () => set({ notice: null }),

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
