import { beforeEach, describe, expect, it } from "vitest";

import {
  addSection,
  duplicateSection,
  moveSection,
  moveSectionBy,
  removeSection,
  restoreRequiredSection,
  setSectionHidden,
  updateSectionProps,
} from "../mutations";
import { createStarterPage, type PageDocument } from "../page-document";
import { SECTION_REGISTRY } from "../sections/registry";
import { validatePage } from "../validate";

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

describe("restoreRequiredSection", () => {
  /** A document that lost its footer — an older build, an import, a direct edit. */
  const withoutFooter = (): PageDocument => ({
    ...doc,
    sections: doc.sections.filter((s) => s.kind !== "footer"),
  });

  it("puts a missing required section back, in its zone", () => {
    const broken = withoutFooter();
    const result = restoreRequiredSection(broken, "footer", { ctx: { locationId: "loc_1" } });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // The footer belongs last regardless of where it was appended.
    expect(result.doc.sections.at(-1)!.kind).toBe("footer");
    expect(validatePage(result.doc).errors.filter((e) => e.kind === "footer")).toHaveLength(0);
  });

  it("clears the blocking error the merchant could not otherwise fix", () => {
    const broken = withoutFooter();
    expect(validatePage(broken).ok).toBe(false);
    // The gallery refuses it, which is exactly why the repair path exists.
    expect(addSection(broken, "footer").ok).toBe(false);

    const result = restoreRequiredSection(broken, "footer", { ctx: { locationId: "loc_1" } });
    expect(result.ok).toBe(true);
    if (result.ok) expect(validatePage(result.doc).ok).toBe(true);
  });

  it("restores a header above the hero, not below it", () => {
    // Both live in the masthead, so zone sorting alone would append the header
    // after the hero and put the navigation in the middle of the page.
    const broken: PageDocument = {
      ...doc,
      sections: doc.sections.filter((s) => s.kind !== "header"),
    };

    const result = restoreRequiredSection(broken, "header", { ctx: { locationId: "loc_1" } });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const kinds = result.doc.sections.map((s) => s.kind);
    expect(kinds.indexOf("header")).toBeLessThan(kinds.indexOf("hero"));
    expect(kinds[0]).toBe("header");
  });

  it("leaves the merchant's body ordering untouched", () => {
    const withBody = addSection(doc, "gallery");
    expect(withBody.ok).toBe(true);
    if (!withBody.ok) return;

    const broken: PageDocument = {
      ...withBody.doc,
      sections: withBody.doc.sections.filter((s) => s.kind !== "footer"),
    };
    const bodyBefore = broken.sections
      .filter((s) => SECTION_REGISTRY[s.kind].zone === "body")
      .map((s) => s.id);

    const result = restoreRequiredSection(broken, "footer", { ctx: { locationId: "loc_1" } });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(
      result.doc.sections
        .filter((s) => SECTION_REGISTRY[s.kind].zone === "body")
        .map((s) => s.id),
    ).toEqual(bodyBefore);
  });

  it("refuses when the section is already present", () => {
    const result = restoreRequiredSection(doc, "footer");
    expect(result.ok).toBe(false);
  });

  it("refuses anything the merchant is allowed to delete", () => {
    // Not a general-purpose "add anything" hatch around `addable`.
    const result = restoreRequiredSection(doc, "gallery");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("not_addable");
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

  /**
   * Still refused, but now for a stronger reason than it used to be.
   *
   * This asserted `cross_zone_move`, which was the only rule that existed: the
   * hero was refused a trip into the body, while being free to swap with the
   * header inside the masthead. `movable: false` refuses the move outright, so
   * the reason arrives before the zone arithmetic is ever reached. See
   * `capabilities.test.ts` for the hole that closed.
   */
  it("refuses to drag the hero below a body section", () => {
    const result = moveSection(doc, idOf(doc, "hero"), doc.sections.length - 1);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("not_movable");
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
