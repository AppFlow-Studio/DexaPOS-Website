import { describe, expect, it } from "vitest";

import { describeSchema, humanize, type ControlKind } from "../schema-introspect";
import { SECTION_KINDS } from "../sections/kinds";
import { SECTION_REGISTRY } from "../sections/registry";

/**
 * These tests are the safety net for reading Zod's internal `def`, which is not
 * a stable public API. If a Zod upgrade changes that shape, the settings panel
 * would otherwise silently render the wrong control for every field — here it
 * fails loudly instead.
 */

const controlsFor = (kind: (typeof SECTION_KINDS)[number]) =>
  Object.fromEntries(
    describeSchema(SECTION_REGISTRY[kind].schema).map((c) => [c.name, c]),
  );

describe("describeSchema", () => {
  it("classifies every field of every section schema", () => {
    const unsupported: string[] = [];
    for (const kind of SECTION_KINDS) {
      for (const control of describeSchema(SECTION_REGISTRY[kind].schema)) {
        if (control.kind === "unsupported") unsupported.push(`${kind}.${control.name}`);
      }
    }
    expect(unsupported).toEqual([]);
  });

  it("produces a control for every field in the schema, and no extras", () => {
    for (const kind of SECTION_KINDS) {
      const schemaKeys = Object.keys(SECTION_REGISTRY[kind].schema.shape).sort();
      const controlKeys = describeSchema(SECTION_REGISTRY[kind].schema)
        .map((c) => c.name)
        .sort();
      expect(controlKeys, `mismatch for ${kind}`).toEqual(schemaKeys);
    }
  });

  it.each<[string, string, ControlKind]>([
    ["hero", "heading", "text"],
    ["hero", "variant", "select"],
    ["hero", "overlayOpacity", "number"],
    ["hero", "image", "image"],
    ["hero", "primaryCta", "link"],
    ["header", "sticky", "boolean"],
    ["header", "logoAlign", "select"],
    ["content", "body", "richtext"],
    ["content", "imagePosition", "select"],
    ["gallery", "images", "image"],
    ["gallery", "columns", "select"],
    ["popular-items", "items", "binding-list"],
    ["popular-items", "showPrices", "boolean"],
    ["features", "items", "repeater"],
    ["faq", "items", "repeater"],
    ["location", "location", "binding-list"],
    ["location", "mapStyle", "select"],
    ["footer", "links", "repeater"],
  ])("classifies %s.%s as %s", (kind, field, expected) => {
    const controls = controlsFor(kind as (typeof SECTION_KINDS)[number]);
    expect(controls[field]?.kind).toBe(expected);
  });

  it("marks optional fields optional and required fields required", () => {
    const hero = controlsFor("hero");
    expect(hero.heading.optional).toBe(false);
    expect(hero.subheading.optional).toBe(true);
    expect(hero.image.optional).toBe(true);
  });

  it("extracts enum options in schema order", () => {
    expect(controlsFor("hero").variant.options?.map((o) => o.value)).toEqual([
      "classic",
      "bistro",
      "spotlight",
    ]);
  });

  it("extracts literal-union options for column counts", () => {
    expect(controlsFor("gallery").columns.options?.map((o) => o.value)).toEqual(["2", "3", "4"]);
  });

  it("reads array maximums so the editor can stop the merchant at the cap", () => {
    expect(controlsFor("popular-items").items.maxItems).toBe(24);
    expect(controlsFor("gallery").images.maxItems).toBe(24);
    expect(controlsFor("faq").items.maxItems).toBe(30);
  });

  it("describes repeater sub-fields", () => {
    const faqItems = controlsFor("faq").items;
    expect(faqItems.fields?.map((f) => f.name)).toEqual(["question", "answer"]);
    expect(faqItems.fields?.find((f) => f.name === "answer")?.kind).toBe("richtext");
  });
});

describe("humanize", () => {
  it.each([
    ["heading", "Heading"],
    ["showOrderButton", "Show order button"],
    ["imagePosition", "Image position"],
    ["popular-items", "Popular items"],
    ["grid-3", "Grid 3"],
  ])("%s → %s", (input, expected) => {
    expect(humanize(input)).toBe(expected);
  });
});
