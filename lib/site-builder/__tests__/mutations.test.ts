import { beforeEach, describe, expect, it } from "vitest";

import {
  addSection,
  duplicateSection,
  moveSection,
  moveSectionBy,
  removeSection,
  setSectionHidden,
  updateSectionProps,
} from "../mutations";
import { createStarterPage, type PageDocument } from "../page-document";

let doc: PageDocument;

const idOf = (d: PageDocument, kind: string) => d.sections.find((s) => s.kind === kind)!.id;

beforeEach(() => {
  doc = createStarterPage({ locationId: "loc_1" });
});

describe("addSection", () => {
  it("adds an addable kind and keeps zone order", () => {
    const result = addSection(doc, "faq", { atIndex: 0 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Dropped "above the header" but re-sorted into the body zone.
    expect(result.doc.sections[0].kind).toBe("header");
    expect(result.doc.sections.filter((s) => s.kind === "faq")).toHaveLength(2);
  });

  it("refuses kinds the merchant may not add", () => {
    const result = addSection(doc, "header");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("not_addable");
  });

  it("does not mutate the input document", () => {
    const before = JSON.stringify(doc);
    addSection(doc, "content");
    expect(JSON.stringify(doc)).toBe(before);
  });
});

describe("removeSection", () => {
  it("removes a deletable section", () => {
    const galleryId = idOf(doc, "gallery");
    const result = removeSection(doc, galleryId);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.doc.sections.some((s) => s.id === galleryId)).toBe(false);
  });

  it.each(["header", "hero", "footer"])("refuses to remove the %s", (kind) => {
    const result = removeSection(doc, idOf(doc, kind));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("not_deletable");
  });

  it("reports an unknown id rather than silently doing nothing", () => {
    const result = removeSection(doc, "s_nope");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("unknown_section");
  });
});

describe("moveSection", () => {
  it("moves a body section within the body", () => {
    const contentId = idOf(doc, "content");
    const from = doc.sections.findIndex((s) => s.id === contentId);
    const result = moveSectionBy(doc, contentId, 1);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.doc.sections.findIndex((s) => s.id === contentId)).toBe(from + 1);
  });

  it("refuses to drag the hero below a body section", () => {
    const result = moveSection(doc, idOf(doc, "hero"), doc.sections.length - 1);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("cross_zone_move");
  });

  it("refuses to drag a body section above the header", () => {
    const result = moveSection(doc, idOf(doc, "gallery"), 0);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("cross_zone_move");
  });

  it("refuses an index outside the page", () => {
    const result = moveSection(doc, idOf(doc, "gallery"), 99);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("out_of_range");
  });
});

describe("duplicateSection", () => {
  it("gives the copy a new id and shares no nested state", () => {
    const galleryId = idOf(doc, "gallery");
    const result = duplicateSection(doc, galleryId);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const copies = result.doc.sections.filter((s) => s.kind === "gallery");
    expect(copies).toHaveLength(2);
    expect(copies[0].id).not.toBe(copies[1].id);
    expect((copies[0].props as { images: unknown[] }).images).not.toBe(
      (copies[1].props as { images: unknown[] }).images,
    );
  });

  it("refuses to duplicate a singleton", () => {
    const result = duplicateSection(doc, idOf(doc, "hero"));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("singleton_exists");
  });
});

describe("updateSectionProps", () => {
  it("applies a valid patch", () => {
    const heroId = idOf(doc, "hero");
    const result = updateSectionProps(doc, heroId, { heading: "Wood-fired pizza" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect((result.doc.sections.find((s) => s.id === heroId)!.props as { heading: string }).heading)
      .toBe("Wood-fired pizza");
  });

  it("rejects an invalid value instead of repairing it", () => {
    const result = updateSectionProps(doc, idOf(doc, "hero"), { variant: "neon" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("invalid_props");
  });

  it("accepts menu-item bindings on popular-items", () => {
    const result = updateSectionProps(doc, idOf(doc, "popular-items"), {
      items: [
        { type: "menu_item", id: "4471" },
        { type: "menu_item", id: "4472" },
      ],
    });
    expect(result.ok).toBe(true);
  });

  it("rejects a binding of the wrong type", () => {
    const result = updateSectionProps(doc, idOf(doc, "popular-items"), {
      items: [{ type: "location", id: "loc_1" }],
    });
    expect(result.ok).toBe(false);
  });

  it("strips unknown keys rather than storing them", () => {
    const heroId = idOf(doc, "hero");
    const result = updateSectionProps(doc, heroId, { sneaky: "value" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.doc.sections.find((s) => s.id === heroId)!.props).not.toHaveProperty("sneaky");
  });
});

describe("setSectionHidden", () => {
  it("hides and unhides without deleting", () => {
    const galleryId = idOf(doc, "gallery");
    const hidden = setSectionHidden(doc, galleryId, true);
    expect(hidden.ok).toBe(true);
    if (!hidden.ok) return;
    expect(hidden.doc.sections.find((s) => s.id === galleryId)!.hidden).toBe(true);
    expect(hidden.doc.sections).toHaveLength(doc.sections.length);
  });
});
