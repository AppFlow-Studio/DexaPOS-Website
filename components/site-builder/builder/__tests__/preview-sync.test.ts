// @vitest-environment happy-dom

import { describe, expect, it } from "vitest";

import { createDemoPage } from "@/lib/site-builder/fixtures/demo-page";
import { updateSectionProps } from "@/lib/site-builder/mutations";
import type { PageDocument } from "@/lib/site-builder/page-document";
import { applyTextPreviewPatches, getTextPreviewPatches } from "../preview-sync";

function update(doc: PageDocument, sectionId: string, patch: Record<string, unknown>): PageDocument {
  const result = updateSectionProps(doc, sectionId, patch);
  if (!result.ok) throw new Error(result.message);
  return result.doc;
}

describe("fast preview classification", () => {
  it("classifies a marked scalar text edit without requiring a server render", () => {
    const before = createDemoPage();
    const after = update(before, "s_demo_hero", { heading: "Dinner, handled." });

    expect(getTextPreviewPatches(before, after)).toEqual([
      { sectionId: "s_demo_hero", path: "props.heading", value: "Dinner, handled." },
    ]);
  });

  it("keeps structural and empty-text transitions on the server path", () => {
    const before = createDemoPage();
    const hidden = {
      ...before,
      sections: before.sections.map((section) =>
        section.id === "s_demo_hero" ? { ...section, hidden: true } : section,
      ),
    };
    const cleared = update(before, "s_demo_hero", { heading: "" });

    expect(getTextPreviewPatches(before, hidden)).toBeNull();
    expect(getTextPreviewPatches(before, cleared)).toBeNull();
  });

  it("does not need a preview render for SEO-only changes", () => {
    const before = createDemoPage();
    const after = { ...before, seo: { ...before.seo, title: "A better title" } };

    expect(getTextPreviewPatches(before, after)).toEqual([]);
  });
});

describe("fast preview DOM patching", () => {
  it("updates a plain marked leaf without replacing the canvas", () => {
    const root = document.createElement("div");
    root.innerHTML =
      '<h1 data-sb-section-id="s_demo_hero" data-sb-field="props.heading" data-sb-field-kind="text">Old heading</h1>';

    const applied = applyTextPreviewPatches(root, [
      { sectionId: "s_demo_hero", path: "props.heading", value: "New heading" },
    ]);

    expect(applied).toBe(true);
    expect(root.textContent).toBe("New heading");
  });

  it("refuses rich text and nested markup so the server remains authoritative", () => {
    const root = document.createElement("div");
    root.innerHTML =
      '<summary data-sb-section-id="s_demo_faq" data-sb-field="props.items.0.question" data-sb-field-kind="text"><span>Question</span><span>+</span></summary>';

    expect(
      applyTextPreviewPatches(root, [
        { sectionId: "s_demo_faq", path: "props.items.0.question", value: "Changed" },
      ]),
    ).toBe(false);
  });
});
