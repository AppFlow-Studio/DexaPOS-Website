import { describe, expect, it } from "vitest";

import { createDemoPage } from "@/lib/site-builder/fixtures/demo-page";
import type { PageDocument } from "@/lib/site-builder/page-document";
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
    pages: [PAGE],
    ...overrides,
  });
}

describe("builder save acknowledgement", () => {
  it("never marks an edit made during a save as saved", () => {
    const store = makeStore({ revision: 4 });

    store.getState().updateProps("s_demo_hero", { heading: "First edit" });
    const savedGeneration = store.getState().editGeneration;
    store.getState().updateProps("s_demo_hero", { heading: "Second edit" });

    store.getState().markSaved(5, savedGeneration);

    expect(store.getState().revision).toBe(5);
    expect(store.getState().saveState).toBe("dirty");
    expect(
      store.getState().doc.sections.find((section) => section.id === "s_demo_hero")?.props,
    ).toMatchObject({ heading: "Second edit" });
  });

  it("clears a save error once a save lands", () => {
    const store = makeStore();
    store.getState().setSaveError("Could not reach the server.");
    store.getState().updateProps("s_demo_hero", { heading: "Edited" });

    store.getState().markSaved(1, store.getState().editGeneration);

    expect(store.getState().saveError).toBeNull();
    expect(store.getState().saveState).toBe("saved");
  });
});

describe("deleting a section", () => {
  it("offers an undo that restores exactly what was removed", () => {
    const store = makeStore();
    const before = store.getState().doc.sections.length;

    const deleted = store.getState().removeSection("s_demo_faq");

    expect(deleted).not.toBeNull();
    expect(deleted!.title).toBeTruthy();
    expect(store.getState().doc.sections).toHaveLength(before - 1);

    expect(store.getState().undoDelete(deleted!.generation)).toBe(true);
    expect(store.getState().doc.sections).toHaveLength(before);
    expect(store.getState().doc.sections.some((s) => s.id === "s_demo_faq")).toBe(true);
  });

  it("refuses a stale undo rather than reverting a later edit", () => {
    const store = makeStore();
    const deleted = store.getState().removeSection("s_demo_faq")!;

    // The merchant kept working. Undoing now would throw away this edit, not
    // restore the deletion.
    store.getState().updateProps("s_demo_hero", { heading: "Something else" });

    expect(store.getState().undoDelete(deleted.generation)).toBe(false);
    expect(
      store.getState().doc.sections.find((s) => s.id === "s_demo_hero")?.props,
    ).toMatchObject({ heading: "Something else" });
    expect(store.getState().doc.sections.some((s) => s.id === "s_demo_faq")).toBe(false);
  });

  it("returns null when the mutation is refused", () => {
    const store = makeStore();
    // The footer is not deletable — the refusal must not produce an undo toast.
    expect(store.getState().removeSection("s_demo_footer")).toBeNull();
  });
});

describe("publish baseline", () => {
  it("starts with no baseline when the page has never been published", () => {
    const store = makeStore();
    expect(store.getState().publishedDoc).toBeNull();
    expect(store.getState().publishedAt).toBeNull();
  });

  it("moves the baseline to the document that went live", () => {
    const store = makeStore();
    store.getState().updateProps("s_demo_hero", { heading: "Now live" });
    const live: PageDocument = store.getState().doc;

    store.getState().markPublished(live, "2026-08-16T10:00:00Z", {
      versionNumber: 1,
      publishedAt: "2026-08-16T10:00:00Z",
      unchanged: false,
    });

    expect(store.getState().publishedDoc).toBe(live);
    expect(store.getState().page.status).toBe("published");
    expect(store.getState().pages[0].publishedAt).toBe("2026-08-16T10:00:00Z");
    // Publishing must not touch the draft or its history.
    expect(store.getState().doc).toBe(live);
  });
});

describe("selection sync", () => {
  it("records the origin so only the other surfaces scroll", () => {
    const store = makeStore();

    store.getState().select("s_demo_hero", "canvas");
    expect(store.getState().selectionSource).toBe("canvas");
    const first = store.getState().revealNonce;

    // Re-selecting the same section must still bump the nonce: selecting it
    // again from the list is a request to scroll back to it.
    store.getState().select("s_demo_hero", "list");
    expect(store.getState().selectionSource).toBe("list");
    expect(store.getState().revealNonce).toBe(first + 1);
  });

  it("does not request a scroll when clearing the selection", () => {
    const store = makeStore();
    store.getState().select("s_demo_hero", "list");
    const nonce = store.getState().revealNonce;

    store.getState().select(null);
    expect(store.getState().revealNonce).toBe(nonce);
    expect(store.getState().selectedId).toBeNull();
  });
});
