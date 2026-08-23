import { describe, expect, it, vi } from "vitest";

import { createDemoPage } from "@/lib/site-builder/fixtures/demo-page";
import { createBuilderStore, type BuilderInit, type EditorPage } from "../store";

const PAGE: EditorPage = {
  id: "page_1",
  title: "Home",
  path: "",
  isHome: true,
  status: "draft",
  publishedAt: null,
};

function makeStore(overrides: Partial<BuilderInit> = {}) {
  return createBuilderStore({
    doc: createDemoPage(),
    canvas: null,
    page: PAGE,
    ...overrides,
  });
}

const HERO = "s_demo_hero";
const heading = (store: ReturnType<typeof makeStore>) =>
  (store.getState().doc.sections.find((s) => s.id === HERO)?.props as { heading?: string })
    .heading;

/**
 * Typing used to push one history entry per keystroke, so Ctrl+Z walked back a
 * character at a time and fifty keystrokes evicted every real edit from a
 * fifty-deep stack. A run of typing is one step; anything else is its own.
 */
describe("undo coalescing", () => {
  it("folds a run of typing on one field into a single history entry", () => {
    const store = makeStore();
    const before = heading(store);

    for (const value of ["G", "Gu", "Gue", "Gues", "Guest"]) {
      store.getState().updateProps(HERO, { heading: value }, { coalesce: true });
    }

    expect(heading(store)).toBe("Guest");
    expect(store.getState().past).toHaveLength(1);

    store.getState().undo();

    // One undo returns to before the run began, not to "Gues".
    expect(heading(store)).toBe(before);
  });

  it("gives every un-marked edit its own entry, so clicks are not folded", () => {
    const store = makeStore();

    // A segmented control fires the same shape of single-key patch as typing.
    store.getState().updateProps(HERO, { heading: "One" });
    store.getState().updateProps(HERO, { heading: "Two" });
    store.getState().updateProps(HERO, { heading: "Three" });

    expect(store.getState().past).toHaveLength(3);

    store.getState().undo();
    expect(heading(store)).toBe("Two");
  });

  it("starts a new entry when the run moves to a different field", () => {
    const store = makeStore();

    store.getState().updateProps(HERO, { heading: "Typed" }, { coalesce: true });
    store.getState().updateProps(HERO, { subheading: "Also typed" }, { coalesce: true });

    expect(store.getState().past).toHaveLength(2);

    store.getState().undo();
    expect(heading(store)).toBe("Typed");
  });

  it("breaks the run when an edit of another kind lands between keystrokes", () => {
    const store = makeStore();

    store.getState().updateProps(HERO, { heading: "Typed" }, { coalesce: true });
    store.getState().updateSeo({ title: "A title" });
    store.getState().updateProps(HERO, { heading: "Typed more" }, { coalesce: true });

    expect(store.getState().past).toHaveLength(3);
  });

  it("starts a new entry once the merchant has paused", () => {
    vi.useFakeTimers();
    try {
      const store = makeStore();

      store.getState().updateProps(HERO, { heading: "Before" }, { coalesce: true });
      // Longer than COALESCE_WINDOW_MS: a return to the field after a think is
      // a new thought, and should undo separately.
      vi.advanceTimersByTime(2_000);
      store.getState().updateProps(HERO, { heading: "After" }, { coalesce: true });

      expect(store.getState().past).toHaveLength(2);

      store.getState().undo();
      expect(heading(store)).toBe("Before");
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not let the next keystroke fold into the entry undo just restored", () => {
    const store = makeStore();
    const before = heading(store);

    store.getState().updateProps(HERO, { heading: "First" }, { coalesce: true });
    store.getState().undo();
    expect(heading(store)).toBe(before);

    // Without resetting the run, this would replace the restored entry and the
    // second undo would have nothing to go back to.
    store.getState().updateProps(HERO, { heading: "Second" }, { coalesce: true });
    store.getState().undo();

    expect(heading(store)).toBe(before);
  });

  it("still refuses an invalid edit without disturbing history", () => {
    const store = makeStore();
    const depth = store.getState().past.length;

    // Past the hero title's cap, so the mutation layer rejects it.
    store.getState().updateProps(HERO, { heading: "x".repeat(500) }, { coalesce: true });

    expect(store.getState().notice).toBeTruthy();
    expect(store.getState().past).toHaveLength(depth);
  });
});
