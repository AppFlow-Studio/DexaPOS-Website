import { describe, expect, it } from "vitest";

import { SECTION_KINDS, ZONE_ORDER } from "../sections/kinds";
import { SECTION_REGISTRY, addableKinds, getSectionDefinition } from "../sections/registry";

describe("section registry", () => {
  it("has an entry for every kind, keyed consistently", () => {
    for (const kind of SECTION_KINDS) {
      expect(SECTION_REGISTRY[kind], `missing entry for ${kind}`).toBeDefined();
      expect(SECTION_REGISTRY[kind].kind).toBe(kind);
    }
    expect(Object.keys(SECTION_REGISTRY).sort()).toEqual([...SECTION_KINDS].sort());
  });

  it("produces defaults that satisfy its own schema", () => {
    for (const kind of SECTION_KINDS) {
      const def = SECTION_REGISTRY[kind];
      const parsed = def.schema.safeParse(def.defaults({ locationId: "loc_1" }));
      expect(parsed.success, `${kind} defaults failed its schema`).toBe(true);
    }
  });

  it("assigns every kind a real zone", () => {
    for (const kind of SECTION_KINDS) {
      expect(ZONE_ORDER[SECTION_REGISTRY[kind].zone]).toBeTypeOf("number");
    }
  });

  it("keeps the locked sections locked", () => {
    for (const kind of ["header", "hero", "footer"] as const) {
      const def = SECTION_REGISTRY[kind];
      expect(def.addable, `${kind} should not be addable`).toBe(false);
      expect(def.deletable, `${kind} should not be deletable`).toBe(false);
      expect(def.singleton, `${kind} should be a singleton`).toBe(true);
    }
    expect(addableKinds()).not.toContain("header");
    expect(addableKinds()).toContain("content");
  });

  /**
   * `unavailable` is how a kind says its dependency does not exist yet, so the
   * Add Section gallery can offer it truthfully instead of letting a merchant
   * add a section that cannot do what its own description promises.
   */
  describe("unavailable kinds", () => {
    it("only marks kinds a merchant could otherwise add", () => {
      for (const kind of SECTION_KINDS) {
        const def = SECTION_REGISTRY[kind];
        if (!def.unavailable) continue;
        expect(def.addable, `${kind} is unavailable but was never addable`).toBe(true);
        expect(def.unavailable.trim().length, `${kind} needs a reason`).toBeGreaterThan(0);
      }
    });

    /**
     * Gallery depends entirely on the asset library: `resolveAssetUrl` returns
     * null for every id, so a gallery added today can never hold a photo.
     * Delete this expectation when Stage 7 lands — it is the reminder.
     */
    it("keeps gallery gated until the asset library exists", () => {
      expect(SECTION_REGISTRY.gallery.unavailable).toBeTruthy();
    });

    it("leaves every other kind usable", () => {
      const gated = SECTION_KINDS.filter((kind) => SECTION_REGISTRY[kind].unavailable);
      expect(gated).toEqual(["gallery"]);
    });
  });

  it("declares bindings only where the schema can hold them", () => {
    expect(SECTION_REGISTRY["popular-items"].bindingTypes).toContain("menu_item");
    expect(SECTION_REGISTRY.location.bindingTypes).toContain("location");
    // Kinds with no bindings must not claim live fields.
    for (const kind of SECTION_KINDS) {
      const def = SECTION_REGISTRY[kind];
      if (def.bindingTypes.length === 0) {
        expect(def.liveFields, `${kind} claims live fields with no bindings`).toHaveLength(0);
      }
    }
  });

  /**
   * Decision D6 enforced structurally rather than by convention: if a section
   * cannot hold a price, a published page can never show a stale one.
   */
  it("gives popular-items nowhere to store a snapshotted price", () => {
    const shape = SECTION_REGISTRY["popular-items"].schema.shape as Record<string, unknown>;
    for (const forbidden of ["price", "name", "description", "image", "imageUrl", "available"]) {
      expect(shape, `popular-items must not have a ${forbidden} field`).not.toHaveProperty(
        forbidden,
      );
    }
  });

  it("returns undefined for a kind this build does not know", () => {
    expect(getSectionDefinition("tiktok-feed")).toBeUndefined();
  });
});
