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
    ["content", "title", "text"],
    ["content", "subtitle", "text"],
    ["content", "background", "select"],
    ["content", "media", "select"],
    ["content", "button", "link"],
    ["gallery", "images", "image"],
    ["gallery", "columns", "select"],
    ["popular-items", "items", "binding-list"],
    ["popular-items", "showPrices", "boolean"],
    // Wrapped in `.default(true)`; `unwrap` must see through it to the boolean.
    ["popular-items", "showAddButton", "boolean"],
    ["features", "items", "repeater"],
    ["faq", "items", "repeater"],
    ["location", "location", "binding-list"],
    ["location", "mapStyle", "select"],
    ["footer", "links", "repeater"],
    ["video", "videoId", "video"],
    ["integrations", "provider", "select"],
    ["integrations", "embedUrl", "embed"],
  ])("classifies %s.%s as %s", (kind, field, expected) => {
    const controls = controlsFor(kind as (typeof SECTION_KINDS)[number]);
    expect(controls[field]?.kind).toBe(expected);
  });

  /**
   * The FAQ answer is the only merchant-authored markup left on a built page —
   * the content reshape (decision W3) took the other one. It lives inside a
   * repeater, so the classification has to be asserted on the sub-control.
   */
  it("classifies the faq answer as rich text, inside its repeater", () => {
    const items = controlsFor("faq").items;
    expect(items.kind).toBe("repeater");
    expect(items.fields?.find((f) => f.name === "answer")?.kind).toBe("richtext");
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

  it("reads number bounds from the schema instead of assuming percentages", () => {
    expect(controlsFor("hero").overlayOpacity).toMatchObject({ min: 0, max: 100 });
    expect(controlsFor("events").limit).toMatchObject({ min: 1, max: 24 });
    const rating = controlsFor("reviews").items.fields?.find((field) => field.name === "rating");
    expect(rating).toMatchObject({ kind: "rating", min: 1, max: 5 });
  });

  it("describes repeater sub-fields", () => {
    const faqItems = controlsFor("faq").items;
    expect(faqItems.fields?.map((f) => f.name)).toEqual(["question", "answer"]);
    expect(faqItems.fields?.find((f) => f.name === "answer")?.kind).toBe("richtext");
  });
});

/**
 * `describeSchema` sees one field at a time, which is what keeps it honest —
 * but a few controls are only correctly labelled in the light of a sibling.
 * The integrations paste box is the case: "Untappd iframe URL or IDs" is the
 * right label only while Untappd is the selected provider.
 */
describe("fieldOverrides refine what the schema cannot know", () => {
  const overridesFor = (provider: string) =>
    SECTION_REGISTRY.integrations.fieldOverrides?.({ provider }) ?? {};

  it("relabels the embed field for the chosen provider", () => {
    expect(overridesFor("untappd").embedUrl?.label).toBe("Untappd iframe URL or IDs");
    expect(overridesFor("spotify").embedUrl?.label).toContain("Spotify");
    expect(overridesFor("google-maps").embedUrl?.label).toContain("Google Maps");
  });

  it("carries help text and an example the plain control has nowhere to get", () => {
    const embed = overridesFor("untappd").embedUrl;
    expect(embed?.help).toContain("Only the verified IDs are saved");
    expect(embed?.placeholder).toContain("business.untappd.com");
  });

  it("falls back rather than throwing on an unknown provider", () => {
    expect(overridesFor("not-a-provider").embedUrl?.label).toBeTruthy();
  });

  it("only ever merges over a control the schema already produced", () => {
    const fields = new Set(Object.keys(SECTION_REGISTRY.integrations.schema.shape));
    for (const kind of SECTION_KINDS) {
      const def = SECTION_REGISTRY[kind];
      if (!def.fieldOverrides) continue;
      const schemaKeys = new Set(Object.keys(def.schema.shape));
      for (const name of Object.keys(def.fieldOverrides({}))) {
        expect(schemaKeys.has(name), `${kind}.${name}`).toBe(true);
      }
    }
    expect(fields.has("embedUrl")).toBe(true);
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

/**
 * `pdf.file` and `hero.image` are the same `AssetRef` shape, so nothing
 * structural separates them. Until `DOCUMENT_FIELDS` existed the drawer routed
 * both to the photo picker, which is why the PDF section could never be filled
 * in: a merchant was shown "Your photos", an image-only `accept`, and a gate
 * that refused every PDF.
 */
describe("documents are not photographs", () => {
  it("gives the PDF section's file field a file control", () => {
    expect(controlsFor("pdf").file).toMatchObject({ kind: "file" });
  });

  it("leaves every genuine photo field on the image control", () => {
    expect(controlsFor("hero").image).toMatchObject({ kind: "image" });
    expect(controlsFor("hero").carousel).toMatchObject({ kind: "image" });
    expect(controlsFor("gallery").images).toMatchObject({ kind: "image" });
    expect(controlsFor("content").mediaImage).toMatchObject({ kind: "image" });
    expect(controlsFor("content").backgroundImage).toMatchObject({ kind: "image" });
  });
});
