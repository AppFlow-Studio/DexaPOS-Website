import { describe, expect, it } from "vitest";

import { moveSection, moveSectionBy, removeSection, updateSectionProps } from "../mutations";
import { createStarterPage } from "../page-document";
import { SECTION_KINDS } from "../sections/kinds";
import { SECTION_REGISTRY } from "../sections/registry";

/**
 * Per-section capabilities — `editable` / `deletable` / `movable`.
 *
 * The mechanism read off a live Owner.com account, and the one that keeps every
 * merchant site structurally sound: a header is always first, a footer always
 * last, and neither is a matter of taste. The canvas omits the controls a kind
 * does not have, and these tests hold the mutation layer to the same rules — a
 * flag the UI honours and the document layer does not is a flag that lasts
 * exactly as long as nobody forges a request or writes a second editor.
 */
describe("section capabilities", () => {
  const doc = createStarterPage({ locationId: "loc_1" });
  const idOf = (kind: string) => doc.sections.find((s) => s.kind === kind)?.id;

  it("gives every kind all three flags", () => {
    for (const kind of SECTION_KINDS) {
      const def = SECTION_REGISTRY[kind];
      expect(def.editable, `${kind}.editable`).toBeTypeOf("boolean");
      expect(def.deletable, `${kind}.deletable`).toBeTypeOf("boolean");
      expect(def.movable, `${kind}.movable`).toBeTypeOf("boolean");
    }
  });

  it("locks the structural sections in place", () => {
    for (const kind of ["header", "hero", "footer"] as const) {
      expect(SECTION_REGISTRY[kind].movable, `${kind} must not move`).toBe(false);
      expect(SECTION_REGISTRY[kind].deletable, `${kind} must not be deleted`).toBe(false);
    }
  });

  it("lets ordinary body sections do all three", () => {
    for (const kind of ["content", "gallery", "features", "faq"] as const) {
      const def = SECTION_REGISTRY[kind];
      expect(def.editable && def.deletable && def.movable, `${kind} should be free`).toBe(true);
    }
  });

  /**
   * The defect this was written for.
   *
   * `moveSection` refused only *cross-zone* moves, and the header and hero share
   * the masthead zone — so nothing stopped a merchant swapping the two and
   * publishing a page whose navigation sat underneath its own hero image. It
   * was reachable from the canvas: the hero's "move up" button was enabled,
   * because its neighbour was in the same zone.
   */
  it("refuses to move the hero above the header", () => {
    const heroId = idOf("hero");
    expect(heroId, "starter page should have a hero").toBeTruthy();

    const result = moveSectionBy(doc, heroId!, -1);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("not_movable");
  });

  it("refuses to move the header at all", () => {
    const headerId = idOf("header")!;
    expect(moveSection(doc, headerId, 1).ok).toBe(false);
    expect(moveSectionBy(doc, headerId, 1).ok).toBe(false);
  });

  it("refuses to move the footer off the bottom", () => {
    const footerId = idOf("footer")!;
    const result = moveSectionBy(doc, footerId, -1);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("not_movable");
  });

  it("still moves a body section between its neighbours", () => {
    const body = doc.sections.filter((s) => SECTION_REGISTRY[s.kind].zone === "body");
    expect(body.length, "starter page needs two body sections to test a move").toBeGreaterThan(1);

    const result = moveSectionBy(doc, body[0].id, 1);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const moved = result.doc.sections.findIndex((s) => s.id === body[0].id);
      const other = result.doc.sections.findIndex((s) => s.id === body[1].id);
      expect(moved).toBeGreaterThan(other);
    }
  });

  it("refuses to delete a structural section", () => {
    const result = removeSection(doc, idOf("footer")!);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("not_deletable");
  });

  /**
   * Nothing in the shipped registry is uneditable yet — `popular-items` keeps
   * its picker (decision W4) and the footer keeps its copy until brand settings
   * own it. The refusal still has to work, because the first data-driven kind
   * (Events) arrives with `editable: false` and this is what will hold it.
   */
  it("refuses props edits to a kind with no editor", () => {
    const original = SECTION_REGISTRY.content.editable;
    try {
      (SECTION_REGISTRY.content as { editable: boolean }).editable = false;
      const result = updateSectionProps(doc, idOf("content")!, { heading: "Nope" });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe("not_editable");
    } finally {
      (SECTION_REGISTRY.content as { editable: boolean }).editable = original;
    }
  });
});

/**
 * Conditional fields — Owner's Content panel never shows a photo picker for a
 * background the merchant has not chosen. Hidden rather than disabled, for the
 * same reason the gutter omits controls instead of greying them out.
 */
describe("hiddenFields", () => {
  const hidden = (props: Record<string, unknown>) =>
    new Set(SECTION_REGISTRY.content.hiddenFields?.(props) ?? []);

  it("hides both media controls until there is media", () => {
    const set = hidden({ background: "none", media: "none" });
    expect(set.has("mediaImage")).toBe(true);
    expect(set.has("alignment")).toBe(true);
  });

  it("reveals the alignment control once a photo is chosen", () => {
    const set = hidden({ background: "none", media: "photo" });
    expect(set.has("alignment")).toBe(false);
    expect(set.has("mediaImage")).toBe(false);
  });

  it("offers a tone only for a colour background, and a photo only for a photo one", () => {
    expect(hidden({ background: "color", media: "none" }).has("backgroundTone")).toBe(false);
    expect(hidden({ background: "color", media: "none" }).has("backgroundImage")).toBe(true);
    expect(hidden({ background: "photo", media: "none" }).has("backgroundImage")).toBe(false);
    expect(hidden({ background: "photo", media: "none" }).has("backgroundTone")).toBe(true);
  });

  it("never hides a field that is not in the schema", () => {
    const shape = Object.keys(SECTION_REGISTRY.content.schema.shape);
    for (const props of [
      { background: "none", media: "none" },
      { background: "color", media: "photo" },
      { background: "photo", media: "none" },
    ]) {
      for (const name of hidden(props)) expect(shape, `${name} is not a content field`).toContain(name);
    }
  });
});
