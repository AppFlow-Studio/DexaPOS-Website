import { describe, expect, it } from "vitest";

import { updateSectionProps, updateSeo } from "../mutations";
import { createEmptyPage, createStarterPage, type PageDocument } from "../page-document";
import { SECTION_REGISTRY } from "../sections/registry";
import { validatePage } from "../validate";

function starter(): PageDocument {
  const doc = createStarterPage({ locationId: "loc_1" });
  return updateSeo(doc, {
    title: "Tony's Pizza — Brooklyn",
    description:
      "Wood-fired Neapolitan pizza in Williamsburg. Order online for pickup or delivery, open until 11pm.",
  });
}

const codes = (issues: { code: string }[]) => issues.map((i) => i.code);

describe("validatePage", () => {
  it("passes a complete starter page", () => {
    const result = validatePage(starter());
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it("errors when a locked section is missing", () => {
    const doc = starter();
    const withoutFooter = { ...doc, sections: doc.sections.filter((s) => s.kind !== "footer") };
    const result = validatePage(withoutFooter);
    expect(result.ok).toBe(false);
    expect(codes(result.errors)).toContain("missing_required_section");
  });

  it("errors on a page with nothing between the hero and the footer", () => {
    const result = validatePage(createEmptyPage({ locationId: "loc_1" }));
    expect(result.ok).toBe(false);
    expect(codes(result.errors)).toContain("empty_page");
  });

  it("errors on a duplicate singleton", () => {
    const doc = starter();
    const hero = doc.sections.find((s) => s.kind === "hero")!;
    const result = validatePage({
      ...doc,
      sections: [...doc.sections, { ...hero, id: "s_hero_2" }],
    });
    expect(result.ok).toBe(false);
    expect(codes(result.errors)).toContain("duplicate_singleton");
  });

  it("errors on duplicate section ids", () => {
    const doc = starter();
    const result = validatePage({
      ...doc,
      sections: doc.sections.map((s) => ({ ...s, id: "s_same" })),
    });
    expect(result.ok).toBe(false);
    expect(codes(result.errors)).toContain("duplicate_section_id");
  });

  it("errors when zones are out of order", () => {
    const doc = starter();
    const footer = doc.sections.find((s) => s.kind === "footer")!;
    const rest = doc.sections.filter((s) => s.kind !== "footer");
    const result = validatePage({ ...doc, sections: [rest[0], footer, ...rest.slice(1)] });
    expect(result.ok).toBe(false);
    expect(codes(result.errors)).toContain("zone_out_of_order");
  });

  it("errors when a required binding has no id", () => {
    const doc = createStarterPage(); // no locationId → footer/location bindings empty
    const result = validatePage(doc);
    expect(result.ok).toBe(false);
    expect(codes(result.errors)).toContain("unset_binding");
  });

  /**
   * The D6 consequence that matters most: a merchant who deleted a menu item
   * last month must still be able to publish a typo fix.
   */
  it("treats a deleted menu item as a warning, never an error", () => {
    const doc = starter();
    const popularId = doc.sections.find((s) => s.kind === "popular-items")!.id;
    const bound = updateSectionProps(doc, popularId, {
      items: [
        { type: "menu_item", id: "4471" },
        { type: "menu_item", id: "4472" },
      ],
    });
    expect(bound.ok).toBe(true);
    if (!bound.ok) return;

    const result = validatePage(bound.doc, { unresolvedBindingIds: ["4472"] });
    expect(result.ok).toBe(true);
    expect(codes(result.warnings)).toContain("unresolved_binding");
  });

  describe("SEO warnings", () => {
    it("warns when the title and description are missing", () => {
      const result = validatePage(createStarterPage({ locationId: "loc_1" }));
      expect(codes(result.warnings)).toContain("seo_missing_title");
      expect(codes(result.warnings)).toContain("seo_missing_description");
    });

    it("warns on an over-long title", () => {
      const result = validatePage(updateSeo(starter(), { title: "x".repeat(80) }));
      expect(codes(result.warnings)).toContain("seo_title_long");
    });

    it("warns on a too-short description", () => {
      const result = validatePage(updateSeo(starter(), { description: "Too short." }));
      expect(codes(result.warnings)).toContain("seo_description_length");
    });

    it("warns when the page is set to noindex", () => {
      const result = validatePage(updateSeo(starter(), { noindex: true }));
      expect(codes(result.warnings)).toContain("seo_noindex");
    });

    it("never blocks publishing on SEO alone", () => {
      const result = validatePage(createStarterPage({ locationId: "loc_1" }));
      expect(result.ok).toBe(true);
      expect(result.warnings.length).toBeGreaterThan(0);
    });
  });

  it("warns about empty sections", () => {
    // The starter's gallery and FAQ ship empty by design.
    const result = validatePage(starter());
    expect(codes(result.warnings)).toContain("empty_section");
  });

  it("warns about an image with no alt text", () => {
    const doc = starter();
    const heroId = doc.sections.find((s) => s.kind === "hero")!.id;
    const withImage = updateSectionProps(doc, heroId, { image: { assetId: "as_1" } });
    expect(withImage.ok).toBe(true);
    if (!withImage.ok) return;
    expect(codes(validatePage(withImage.doc).warnings)).toContain("image_missing_alt");
  });

  it("does not warn once alt text is supplied", () => {
    const doc = starter();
    const heroId = doc.sections.find((s) => s.kind === "hero")!.id;
    const withAlt = updateSectionProps(doc, heroId, {
      image: { assetId: "as_1", alt: "Pizza coming out of a wood-fired oven" },
    });
    expect(withAlt.ok).toBe(true);
    if (!withAlt.ok) return;
    const heroWarnings = validatePage(withAlt.doc).warnings.filter(
      (w) => w.sectionId === heroId && w.code === "image_missing_alt",
    );
    expect(heroWarnings).toEqual([]);
  });

  it("reports invalid props as an error", () => {
    const doc = starter();
    const result = validatePage({
      ...doc,
      sections: doc.sections.map((s) =>
        s.kind === "hero"
          ? // Deliberately invalid: this is the shape a corrupted or
            // hand-edited document would arrive in.
            ({ ...s, props: { ...s.props, variant: "neon" } } as unknown as typeof s)
          : s,
      ),
    });
    expect(result.ok).toBe(false);
    expect(codes(result.errors)).toContain("invalid_section_props");
  });

  it("derives its required kinds from the registry, not a hardcoded list", () => {
    const required = Object.values(SECTION_REGISTRY)
      .filter((d) => !d.deletable)
      .map((d) => d.kind)
      .sort();
    expect(required).toEqual(["footer", "header", "hero"]);
  });
});
