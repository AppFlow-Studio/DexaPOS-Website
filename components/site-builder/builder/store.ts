"use client";

import { create } from "zustand";

import type { CatalogItem } from "@/app/dashboard/website/pages/menu-catalog";
import {
  addSection,
  moveSectionBy,
  removeSection,
  restoreRequiredSection,
  updateSectionProps,
  updateSectionStyle,
  updateSeo,
  type MutationResult,
} from "@/lib/site-builder/mutations";
import type { PageDocument } from "@/lib/site-builder/page-document";
import type { SectionKind } from "@/lib/site-builder/sections/kinds";
import type { SectionStyle } from "@/lib/site-builder/sections/primitives";
import { sectionTitle } from "@/lib/site-builder/sections/registry";
import { DEFAULT_FEATURES, type SiteFeatures } from "@/lib/site-builder/site-settings";

/**
 * Builder state.
 *
 * **The document is the only state.** Selection is an id rather than a section
 * object; validation is computed, never stored. That is what makes undo a
 * two-line operation — push the previous document, pop it back — instead of a
 * command-pattern project, and it is why every mutation lives in
 * `lib/site-builder/mutations.ts` as a pure function rather than in here.
 *
 * The Owner-shaped rebuild removed four pieces of state rather than restyling
 * them: `device` (no preview widths), `pane` (no three-column layout to switch
 * between), `reviewOpen`/`publishResult` (publishing is a button, not a sheet)
 * and `savedAt` (no save indicator). History survives because deletion still
 * offers an undo and the drawer needs a way back — it just has no toolbar.
 *
 * `toggleHidden` and `duplicateSection` went the same way with the gutter's
 * overflow menu. `setSectionHidden` and `duplicateSection` remain in
 * `mutations.ts` — they are pure, tested, and the renderer still honours
 * `hidden` on stored documents — but nothing in the editor calls them, because
 * a merchant choosing between "delete this" and "hide this" is a decision the
 * product should not be asking them to make.
 */

export type SaveState = "idle" | "dirty" | "saving" | "saved" | "conflict" | "error";

/**
 * Build shows the editing affordances; Preview behaves as a visitor's browser
 * would, in place. Replaces the old `inspectorEnabled`, which described the
 * mechanism rather than the mode and was toggled by an icon whose pressed state
 * was the only clue which one you were in.
 */
export type EditorMode = "build" | "preview";

/** Page identity, as much of it as the editor needs. */
export interface EditorPage {
  id: string;
  title: string;
  /** Site-relative path. Empty string is the home page. */
  path: string;
  isHome: boolean;
  status: "draft" | "published" | "archived";
  publishedAt: string | null;
}

/**
 * What moved the selection.
 *
 * The canvas scrolls a section into view when something *else* selected it —
 * the publish gate's "Fix" link, or a freshly added section. A selection the
 * merchant made by clicking the canvas must not scroll the canvas.
 */
export type SelectionSource = "canvas" | "other";

/** Undo depth, matching the MockBuilder spec. */
const HISTORY_LIMIT = 50;

/**
 * How long a run of edits to the same field keeps folding into one undo entry.
 *
 * Typing used to push a history entry per keystroke, so Ctrl+Z walked back one
 * character at a time and a 50-character headline evicted every real edit from
 * a 50-deep stack. Commits now arrive when the typist pauses (see
 * `COMMIT_DELAY_MS` in `SectionDrawer`), so this only has to be comfortably
 * longer than that pause to fold a burst of typing into a single step, and
 * short enough that coming back to the same field after a think starts a new
 * one.
 */
const COALESCE_WINDOW_MS = 1_500;

/**
 * How the builder persists.
 *
 * An interface rather than a direct call so the editor can be driven by tests
 * without a database behind it.
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
   * The document that is currently live.
   *
   * `null` on a page that has never been published, which is a different state
   * from "published and identical" — the publish button reads both.
   */
  publishedDoc: PageDocument | null;
  publishedAt: string | null;

  page: EditorPage;

  publishing: boolean;

  /**
   * Why the last save failed.
   *
   * There is no save indicator any more, so this exists to be toasted once on
   * the transition into failure. A merchant typing into a document nothing is
   * storing has to be told, even in an editor that otherwise says nothing about
   * saving at all.
   */
  saveError: string | null;

  selectionSource: SelectionSource;
  /** The location this editor session is scoped to. */
  locationId: string | null;
  /**
   * The merchant's brand toggles.
   *
   * State rather than a prop threaded to the Add Section modal, because two
   * separate things read it — the catalogue, which omits what is off, and
   * `addSection`, which refuses it. A modal-only prop would have left the
   * mutation unguarded.
   */
  features: SiteFeatures;
  /** Bumped on every selection so the canvas can scroll exactly once. */
  revealNonce: number;
  /** Optimistic-concurrency token from the server. */
  revision: number;
  /** Monotonic local edit token used to acknowledge the exact saved snapshot. */
  editGeneration: number;
  selectedId: string | null;
  saveState: SaveState;
  /** Last refusal message, surfaced by the UI then cleared. */
  notice: string | null;

  mode: EditorMode;

  /** The page's own settings — name and address — in the drawer. */
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

  past: PageDocument[];
  future: PageDocument[];
  /**
   * Which field the last edit belonged to, and when — the two facts undo
   * coalescing needs. Internal: nothing renders them.
   */
  coalesceKey: string | null;
  coalesceAt: number;

  /** The server-rendered canvas, held as a React node. */
  canvas: React.ReactNode;
  isRendering: boolean;
  /** Increments when the local fast path cannot safely update the canvas. */
  canvasRefreshRequest: number;

  // section mutations
  addSection: (kind: SectionKind, atIndex?: number) => void;
  /**
   * Deletes a section and returns what is needed to offer an Undo.
   *
   * Returns null when the mutation was refused. The `generation` lets the
   * caller's Undo verify that nothing else has been edited since — undoing
   * blindly would silently revert whatever the merchant did next.
   */
  removeSection: (id: string) => { title: string; generation: number } | null;
  /** Undoes a specific deletion, or does nothing if the edit is no longer on top. */
  undoDelete: (generation: number) => boolean;
  /** Repairs a document that is missing a required header/hero/footer. */
  restoreRequiredSection: (kind: SectionKind, locationId?: string) => void;
  moveSectionBy: (id: string, delta: number) => void;
  /**
   * `coalesce` marks an edit as part of a continuing run on one field — text
   * being typed. Such edits replace the previous history entry rather than
   * adding one, so undo steps back over the whole run. Every other mutation
   * leaves it off and gets its own entry.
   */
  updateProps: (
    id: string,
    patch: Record<string, unknown>,
    opts?: { coalesce?: boolean },
  ) => void;
  updateStyle: (id: string, patch: Partial<SectionStyle>) => void;
  updateSeo: (patch: Partial<PageDocument["seo"]>) => void;

  // history — internal only. Deletion offers an undo; there is no toolbar.
  undo: () => void;

  // ui
  select: (id: string | null, source?: SelectionSource) => void;
  setCanvas: (canvas: React.ReactNode) => void;
  setRendering: (isRendering: boolean) => void;
  requestCanvasRefresh: () => void;
  setSaveState: (state: SaveState) => void;
  clearNotice: () => void;
  setMode: (mode: EditorMode) => void;
  openPageSettings: () => void;
  closeDrawer: () => void;
  openAddSection: (atIndex?: number | null) => void;
  closeAddSection: () => void;
  setCatalog: (catalog: CatalogItem[], showPrices: boolean, error?: string) => void;
  /** Records a successful save only when it matches the current document. */
  markSaved: (revision: number, savedGeneration: number) => void;
  setSaveError: (message: string | null) => void;
  /** Moves the change baseline to the document that just went live. */
  markPublished: (doc: PageDocument, publishedAt: string) => void;
  setPublishing: (publishing: boolean) => void;

  /**
   * Adopts the stored document wholesale — conflict resolution's "Load theirs".
   *
   * `revision` is required rather than optional: keeping the stale one would
   * guarantee the very next save conflicts again.
   */
  adoptServerDoc: (doc: PageDocument, revision: number) => void;

  /**
   * Records a rename the server has already accepted.
   *
   * Name and address live on the row, not in the document, so they are saved
   * immediately rather than through the draft's autosave.
   */
  patchPage: (patch: Partial<EditorPage>) => void;
}

export interface BuilderInit {
  doc: PageDocument;
  canvas: React.ReactNode;
  revision?: number;
  page: EditorPage;
  publishedDoc?: PageDocument | null;
  publishedAt?: string | null;
  /**
   * The location new sections should bind to. Sections that resolve live data
   * are born invalid without it.
   */
  locationId?: string | null;
  /** Defaults to everything off, which is what a merchant who has never opened settings has. */
  features?: SiteFeatures;
}

export function createBuilderStore(init: BuilderInit) {
  return create<BuilderState>((set, get) => {
    /**
     * Applies a pure mutation, pushing the previous document onto the undo
     * stack. A refused mutation leaves state untouched and surfaces the reason
     * rather than failing silently.
     */
    /**
     * Commits a mutation and records one history step.
     *
     * `coalesceKey` names the field a run of edits belongs to. When consecutive
     * edits share a key and land inside `COALESCE_WINDOW_MS`, the entry already
     * on the stack is kept and no new one is pushed — so the state undo returns
     * to is the one from *before* the run started, not one character back.
     * Passing nothing ends any run in progress, which is what makes an edit of a
     * different kind a hard boundary.
     */
    const apply = (result: MutationResult, coalesceKey: string | null = null) => {
      if (!result.ok) {
        set({ notice: result.message });
        return;
      }
      const state = get();
      const now = Date.now();
      const continuesRun =
        coalesceKey !== null &&
        coalesceKey === state.coalesceKey &&
        now - state.coalesceAt < COALESCE_WINDOW_MS &&
        state.past.length > 0;

      set({
        doc: result.doc,
        past: continuesRun ? state.past : [...state.past, state.doc].slice(-HISTORY_LIMIT),
        future: [],
        saveState: "dirty",
        editGeneration: state.editGeneration + 1,
        coalesceKey,
        coalesceAt: coalesceKey === null ? 0 : now,
      });
    };

    return {
      doc: init.doc,
      publishedDoc: init.publishedDoc ?? null,
      publishedAt: init.publishedAt ?? null,
      page: init.page,
      publishing: false,
      saveError: null,
      selectionSource: "other",
      locationId: init.locationId ?? null,
      features: init.features ?? DEFAULT_FEATURES,
      revealNonce: 0,
      revision: init.revision ?? 0,
      editGeneration: 0,
      selectedId: null,
      saveState: "idle",
      notice: null,
      mode: "build",
      pageSettingsOpen: false,
      addOpen: false,
      insertIndex: null,
      catalog: null,
      catalogShowPrices: false,
      catalogError: null,
      past: [],
      future: [],
      coalesceKey: null,
      coalesceAt: 0,
      canvas: init.canvas,
      isRendering: false,
      canvasRefreshRequest: 0,

      addSection: (kind, atIndex) => {
        const before = get().doc.sections.map((s) => s.id);
        const index = atIndex ?? get().insertIndex ?? undefined;
        apply(
          addSection(get().doc, kind, {
            atIndex: index ?? undefined,
            ctx: init.locationId ? { locationId: init.locationId } : undefined,
            features: get().features,
          }),
        );

        // Open the new section's settings and scroll to it. A section added into
        // a gap the merchant cannot currently see is indistinguishable from
        // nothing having happened.
        const added = get().doc.sections.find((s) => !before.includes(s.id));
        set((state) => ({
          addOpen: false,
          insertIndex: null,
          ...(added
            ? {
                selectedId: added.id,
                selectionSource: "other" as SelectionSource,
                revealNonce: state.revealNonce + 1,
              }
            : {}),
        }));
      },

      removeSection: (id) => {
        const section = get().doc.sections.find((s) => s.id === id);
        const title = section ? sectionTitle(section) : "Section";
        const before = get().editGeneration;

        apply(removeSection(get().doc, id));

        // A refused deletion leaves the generation untouched; there is nothing
        // to offer an undo for.
        if (get().editGeneration === before) return null;

        if (get().selectedId === id) set({ selectedId: null });
        return { title, generation: get().editGeneration };
      },

      undoDelete: (generation) => {
        if (get().editGeneration !== generation) return false;
        get().undo();
        return true;
      },

      restoreRequiredSection: (kind, locationId) => {
        const before = get().doc.sections.map((s) => s.id);
        apply(
          restoreRequiredSection(get().doc, kind, {
            ctx: locationId ? { locationId } : undefined,
          }),
        );
        const added = get().doc.sections.find((s) => !before.includes(s.id));
        if (added) {
          set((state) => ({
            selectedId: added.id,
            selectionSource: "other" as SelectionSource,
            revealNonce: state.revealNonce + 1,
          }));
        }
      },

      moveSectionBy: (id, delta) => apply(moveSectionBy(get().doc, id, delta)),

      updateProps: (id, patch, opts) =>
        apply(
          updateSectionProps(get().doc, id, patch),
          // Keyed by field, so moving to a different one starts a new entry
          // even mid-run.
          opts?.coalesce ? `${id}:${Object.keys(patch).sort().join(",")}` : null,
        ),

      updateStyle: (id, patch) => apply(updateSectionStyle(get().doc, id, patch)),

      updateSeo: (patch) => {
        const { doc, past } = get();
        set({
          doc: updateSeo(doc, patch),
          past: [...past, doc].slice(-HISTORY_LIMIT),
          future: [],
          saveState: "dirty",
          editGeneration: get().editGeneration + 1,
          coalesceKey: null,
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
          editGeneration: get().editGeneration + 1,
          // Otherwise the next keystroke would fold into the entry undo just
          // restored, and stepping back would not be repeatable.
          coalesceKey: null,
        });
      },

      select: (id, source = "other") =>
        set((state) => ({
          selectedId: id,
          pageSettingsOpen: false,
          selectionSource: source,
          revealNonce: id ? state.revealNonce + 1 : state.revealNonce,
        })),
      setCanvas: (canvas) => set({ canvas }),
      setRendering: (isRendering) => set({ isRendering }),
      requestCanvasRefresh: () =>
        set((state) => ({ canvasRefreshRequest: state.canvasRefreshRequest + 1 })),
      setSaveState: (saveState) => set({ saveState }),
      clearNotice: () => set({ notice: null }),

      setMode: (mode) =>
        set((state) => ({
          mode,
          // Leaving a section selected while the page behaves as a visitor's
          // would strands its drawer over a page the merchant is trying to use.
          selectedId: mode === "preview" ? null : state.selectedId,
          pageSettingsOpen: mode === "preview" ? false : state.pageSettingsOpen,
        })),

      openPageSettings: () => set({ pageSettingsOpen: true, selectedId: null }),

      closeDrawer: () => set({ selectedId: null, pageSettingsOpen: false }),

      openAddSection: (atIndex = null) => set({ addOpen: true, insertIndex: atIndex }),
      closeAddSection: () => set({ addOpen: false, insertIndex: null }),

      setCatalog: (catalog, showPrices, error) =>
        set({ catalog, catalogShowPrices: showPrices, catalogError: error ?? null }),

      markSaved: (revision, savedGeneration) =>
        set((state) => ({
          revision,
          saveState: state.editGeneration === savedGeneration ? "saved" : "dirty",
          saveError: null,
        })),

      setSaveError: (saveError) => set({ saveError }),

      // Publishing does not touch the draft. It moves the baseline the change
      // count is measured against to the snapshot that just went live.
      markPublished: (doc, publishedAt) =>
        set((state) => ({
          publishedDoc: doc,
          publishedAt,
          publishing: false,
          page: { ...state.page, status: "published", publishedAt },
        })),

      setPublishing: (publishing) => set({ publishing }),

      /**
       * The adopted document *is* the stored one, so there is nothing to save.
       *
       * This used to set `saveState: "dirty"`, which wrote the server's own
       * content straight back to the server and bumped the revision for
       * nothing. Worse, it left `saveError` set — and `useSaveFailureToast`
       * only re-arms on `"saved"`, so after one conflict a genuine later save
       * failure went unannounced for the rest of the session. §C3.
       *
       * `past` still receives the merchant's version: "Load theirs" discards
       * their work, and this is the only remaining trace of what it replaced.
       *
       * `editGeneration` still advances because the document genuinely changed
       * — that is what makes `markSaved` decline to acknowledge a save that was
       * already in flight against the document this just replaced.
       */
      adoptServerDoc: (doc, revision) =>
        set((state) => ({
          doc,
          revision,
          past: [...state.past, state.doc].slice(-HISTORY_LIMIT),
          future: [],
          selectedId: null,
          saveState: "saved",
          saveError: null,
          editGeneration: state.editGeneration + 1,
          coalesceKey: null,
        })),

      // Deliberately does not touch `saveState`: the rename is already stored,
      // so marking the document dirty would ask the merchant to save something
      // that has been saved.
      patchPage: (patch) => set((state) => ({ page: { ...state.page, ...patch } })),
    };
  });
}

export type BuilderStore = ReturnType<typeof createBuilderStore>;
