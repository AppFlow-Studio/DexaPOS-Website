import { describe, expect, it } from "vitest";

import { normalizePage, normalizePageWithReport } from "../normalize";
import { CURRENT_SCHEMA_VERSION, createStarterPage } from "../page-document";
import { updateSectionProps } from "../mutations";
import { SECTION_REGISTRY } from "../sections/registry";
import { validatePage } from "../validate";

const validHeader = {
  id: "s_header",
  kind: "header",
  props: {
    logoAlign: "left",
    sticky: true,
    showOrderButton: true,
    showPhone: false,
    transparentOverHero: false,
  },
};

const validFooter = {
  id: "s_footer",
  kind: "footer",
  props: {
    location: { type: "location", id: "loc_1" },
    showAddress: true,
    showHours: true,
    showPhone: true,
    showSocial: true,
    links: [],
  },
};

describe("normalizePage", () => {
  it("never throws, whatever it is handed", () => {
    for (const input of [null, undefined, 0, "", "a string", [], [1, 2], true, NaN, {}]) {
      expect(() => normalizePage(input)).not.toThrow();
      expect(Array.isArray(normalizePage(input).sections)).toBe(true);
    }
  });

  it("round-trips a clean document with no repairs", () => {
    const doc = createStarterPage({ locationId: "loc_1" });
    const serialized = JSON.stringify(doc);
    const { doc: out, repairs } = normalizePageWithReport(JSON.parse(serialized));
    expect(repairs).toEqual([]);
    expect(JSON.stringify(out)).toBe(serialized);
  });

  it("drops a section kind it does not recognise", () => {
    const { doc, repairs } = normalizePageWithReport({
      schemaVersion: 1,
      sections: [validHeader, { id: "s_x", kind: "tiktok-feed", props: {} }, validFooter],
    });
    expect(doc.sections.map((s) => s.kind)).toEqual(["header", "footer"]);
    expect(repairs.map((r) => r.kind)).toContain("unknown_kind");
  });

  it("repairs one bad field without discarding the rest of the section", () => {
    const { doc, repairs } = normalizePageWithReport({
      schemaVersion: 1,
      sections: [
        {
          id: "s_hero",
          kind: "hero",
          // heading is the wrong type; variant and overlayOpacity are fine.
          props: { variant: "spotlight", heading: 42, overlayOpacity: 70 },
        },
      ],
    });
    const hero = doc.sections[0].props as { variant: string; heading: string; overlayOpacity: number };
    expect(hero.variant).toBe("spotlight");
    expect(hero.overlayOpacity).toBe(70);
    expect(hero.heading).toBe("Welcome"); // fell back to the default
    expect(repairs.map((r) => r.kind)).toContain("invalid_props");
  });

  it("gives every section a unique id", () => {
    const { doc, repairs } = normalizePageWithReport({
      schemaVersion: 1,
      sections: [
        validHeader,
        { ...validFooter, id: "s_header" }, // duplicate
        { kind: "content", props: { body: "<p>hi</p>", imagePosition: "none" } }, // missing
      ],
    });
    const ids = doc.sections.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(repairs.map((r) => r.kind)).toContain("duplicate_id");
    expect(repairs.map((r) => r.kind)).toContain("missing_id");
  });

  it("re-sorts sections into zone order", () => {
    const { doc } = normalizePageWithReport({
      schemaVersion: 1,
      sections: [
        validFooter,
        { kind: "content", props: { body: "<p>hi</p>", imagePosition: "none" } },
        validHeader,
      ],
    });
    expect(doc.sections.map((s) => s.kind)).toEqual(["header", "content", "footer"]);
  });

  it("discards unknown props rather than storing them", () => {
    const { doc } = normalizePageWithReport({
      schemaVersion: 1,
      sections: [{ ...validHeader, props: { ...validHeader.props, evilField: "<script>" } }],
    });
    expect(doc.sections[0].props).not.toHaveProperty("evilField");
  });

  it("resets a malformed seo blob without losing the sections", () => {
    const { doc, repairs } = normalizePageWithReport({
      schemaVersion: 1,
      sections: [validHeader],
      seo: "not an object",
    });
    expect(doc.seo).toEqual({});
    expect(doc.sections).toHaveLength(1);
    expect(repairs.map((r) => r.kind)).toContain("invalid_seo");
  });

  it("keeps a hidden section but records it as hidden", () => {
    const { doc } = normalizePageWithReport({
      schemaVersion: 1,
      sections: [{ ...validHeader, hidden: true }],
    });
    expect(doc.sections[0].hidden).toBe(true);
  });

  it("stamps the current schema version onto whatever it repairs", () => {
    expect(normalizePage({ sections: [] }).schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    // A document written by a *newer* build than this one. No migration can run
    // forwards from 99, so it is stamped with the version this build actually
    // understands rather than being trusted to describe itself.
    expect(normalizePage({ schemaVersion: 99, sections: [] }).schemaVersion).toBe(
      CURRENT_SCHEMA_VERSION,
    );
  });
});

/**
 * §C4 — a section repaired without a location id must still be a *legal*
 * section.
 *
 * The trigger is narrow and worth stating exactly, because a wrong reading of
 * it sends you at the wrong fix: the whole-object parse must fail (here
 * `showMap` is a string) **and** the `location` key must be missing or invalid.
 * A valid `location` always survives via `pickValidFields`, so this path never
 * destroys a good binding — it invents an unset one.
 *
 * What went wrong was not the empty id. It was that the empty id used to fail
 * `bindingSchema`, so `normalize` emitted props its own schema rejected,
 * breaking the contract in its header comment.
 */
describe("repairing a section that needs a location id it cannot know", () => {
  const brokenLocationSection = {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    sections: [{ id: "s_loc", kind: "location", props: { heading: "Find us", showMap: "yes" } }],
    seo: {},
    settings: {},
  };

  it("repairs to a section that satisfies its own schema", () => {
    const { doc, repairs } = normalizePageWithReport(brokenLocationSection);
    expect(repairs.map((r) => r.kind)).toContain("invalid_props");

    const section = doc.sections[0];
    const def = SECTION_REGISTRY[section.kind];
    expect(def.schema.safeParse(section.props).success).toBe(true);
  });

  it("still refuses to invent a location id", () => {
    const { doc } = normalizePageWithReport(brokenLocationSection);
    const props = doc.sections[0].props as { location: { id: string } };
    expect(props.location.id).toBe("");
  });

  /**
   * The repair used to re-run on every read — every `renderCanvas`, every draft
   * load — because its own output failed the parse that triggered it.
   */
  it("is idempotent: a second pass finds nothing left to repair", () => {
    const { doc: once } = normalizePageWithReport(brokenLocationSection);
    const { doc: twice, repairs } = normalizePageWithReport(once);
    expect(repairs).toEqual([]);
    expect(JSON.stringify(twice)).toBe(JSON.stringify(once));
  });

  /**
   * The symptom that actually reached merchants. `updateSectionProps` re-parses
   * `{ ...props, ...patch }` in full, so an unrelated edit to a section holding
   * an invalid binding was refused — the section appeared to stop responding.
   */
  it("leaves the section editable, so an unrelated change is not refused", () => {
    const { doc } = normalizePageWithReport(brokenLocationSection);
    const result = updateSectionProps(doc, "s_loc", { showMap: false });
    expect(result.ok, result.ok ? "" : result.message).toBe(true);
  });

  /** Deliberately unchanged: an unlinked section must not reach a live site. */
  it("still blocks publishing until a restaurant is linked", () => {
    const { doc } = normalizePageWithReport(brokenLocationSection);
    const { errors } = validatePage(doc);
    expect(errors.map((e) => e.code)).toContain("unset_binding");
  });
});
