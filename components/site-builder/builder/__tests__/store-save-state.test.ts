import { describe, expect, it } from "vitest";

import { createDemoPage } from "@/lib/site-builder/fixtures/demo-page";
import { createBuilderStore } from "../store";

describe("builder save acknowledgement", () => {
  it("never marks an edit made during a save as saved", () => {
    const store = createBuilderStore({ doc: createDemoPage(), revision: 4 });

    store.getState().updateProps("s_demo_hero", { heading: "First edit" });
    const savedGeneration = store.getState().editGeneration;
    store.getState().updateProps("s_demo_hero", { heading: "Second edit" });

    store.getState().markSaved(5, savedGeneration);

    expect(store.getState().revision).toBe(5);
    expect(store.getState().saveState).toBe("dirty");
    expect(store.getState().doc.sections.find((section) => section.id === "s_demo_hero")?.props).toMatchObject({
      heading: "Second edit",
    });
  });
});
