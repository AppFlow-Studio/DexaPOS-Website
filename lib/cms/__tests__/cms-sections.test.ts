import { describe, expect, it } from "vitest";
import { mergeCanonicalSections, Section } from "../cms-sections";

describe("mergeCanonicalSections", () => {
  const canonical: Section[] = [
    { id: "home-hero", type: "hero", heading: "Canonical hero" },
    { id: "home-value", type: "cards", subheading: "Why operators choose DEXA" },
    { id: "home-cta", type: "cta", heading: "Canonical CTA" },
  ];

  it("restores missing canonical sections in canonical order", () => {
    const result = mergeCanonicalSections(
      [{ id: "home-hero", type: "hero", heading: "Edited hero" }],
      canonical
    );

    expect(result.map((section) => section.id)).toEqual([
      "home-hero",
      "home-value",
      "home-cta",
    ]);
    expect(result[1].subheading).toBe("Why operators choose DEXA");
  });

  it("preserves CMS edits and appends custom sections", () => {
    const result = mergeCanonicalSections(
      [
        { id: "home-value", type: "cards", subheading: "Edited value heading" },
        { id: "custom-section", type: "rich_text", heading: "Custom" },
      ],
      canonical
    );

    expect(result.find((section) => section.id === "home-value")?.subheading).toBe(
      "Edited value heading"
    );
    expect(result.at(-1)?.id).toBe("custom-section");
  });
});
