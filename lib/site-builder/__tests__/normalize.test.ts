import { describe, expect, it } from "vitest";

import { normalizePage, normalizePageWithReport } from "../normalize";
import { createStarterPage } from "../page-document";

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
    expect(normalizePage({ sections: [] }).schemaVersion).toBe(1);
    expect(normalizePage({ schemaVersion: 99, sections: [] }).schemaVersion).toBe(1);
  });
});
