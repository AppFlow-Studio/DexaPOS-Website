import { beforeEach, describe, expect, it } from "vitest";

import {
  countBrokenBindings,
  describeReason,
  documentHealth,
  sectionHealth,
  type HealthCatalogEntry,
} from "../binding-health";
import { addSection, updateSectionProps } from "../mutations";
import { createStarterPage, type PageDocument } from "../page-document";
import type { Section } from "../sections/types";

let doc: PageDocument;

const sectionOf = (d: PageDocument, kind: string): Section =>
  d.sections.find((s) => s.kind === kind)!;

const applied = (result: ReturnType<typeof addSection>): PageDocument => {
  if (!result.ok) throw new Error(`mutation refused: ${result.message}`);
  return result.doc;
};

const catalog: HealthCatalogEntry[] = [
  { id: "item_ok", available: true },
  { id: "item_86", available: false },
];

/** A starter page plus a popular-items section bound to the given ids. */
function pageWithItems(ids: string[]): PageDocument {
  const withSection = applied(addSection(doc, "popular-items"));
  const target = sectionOf(withSection, "popular-items");
  return applied(
    updateSectionProps(withSection, target.id, {
      items: ids.map((id) => ({ type: "menu_item", id })),
    }),
  );
}

beforeEach(() => {
  doc = createStarterPage({ locationId: "loc_1" });
});

describe("sectionHealth", () => {
  it("marks a section with no bindings as not live", () => {
    const page = applied(addSection(doc, "content"));
    expect(sectionHealth(sectionOf(page, "content"), catalog)).toEqual({
      live: false,
      broken: [],
    });
  });

  it("marks a bound section live even when every reference is fine", () => {
    const page = pageWithItems(["item_ok"]);
    expect(sectionHealth(sectionOf(page, "popular-items"), catalog)).toEqual({
      live: true,
      broken: [],
    });
  });

  it("reports an id missing from the catalog as not_found", () => {
    const page = pageWithItems(["item_gone"]);
    const health = sectionHealth(sectionOf(page, "popular-items"), catalog);

    expect(health.broken).toEqual([{ id: "item_gone", reason: "not_found" }]);
  });

  it("reports a present-but-86'd id as unavailable", () => {
    const page = pageWithItems(["item_86"]);
    const health = sectionHealth(sectionOf(page, "popular-items"), catalog);

    expect(health.broken).toEqual([{ id: "item_86", reason: "unavailable" }]);
  });

  it("distinguishes the two reasons on one section", () => {
    const page = pageWithItems(["item_ok", "item_86", "item_gone"]);
    const health = sectionHealth(sectionOf(page, "popular-items"), catalog);

    expect(health.broken).toEqual([
      { id: "item_86", reason: "unavailable" },
      { id: "item_gone", reason: "not_found" },
    ]);
  });

  it("claims nothing before the catalog loads", () => {
    // A null catalog must not flash warnings on a page that is perfectly fine —
    // it means "not known yet", not "nothing exists".
    const page = pageWithItems(["item_gone"]);
    expect(sectionHealth(sectionOf(page, "popular-items"), null)).toEqual({
      live: true,
      broken: [],
    });
  });

  it("does not check location bindings against the menu catalog", () => {
    // `location` sections bind to a restaurant record, which is not in this
    // catalog. Checking them here would report every one of them as not_found.
    const page = applied(addSection(doc, "location"));
    const health = sectionHealth(sectionOf(page, "location"), catalog);

    expect(health.live).toBe(true);
    expect(health.broken).toEqual([]);
  });
});

describe("documentHealth", () => {
  it("keys every section, including the unbound ones", () => {
    const page = pageWithItems(["item_86"]);
    const map = documentHealth(page, catalog);

    expect(map.size).toBe(page.sections.length);
    expect(map.get(sectionOf(page, "popular-items").id)?.broken).toHaveLength(1);
    expect(map.get(sectionOf(page, "hero").id)).toEqual({ live: false, broken: [] });
  });
});

describe("countBrokenBindings", () => {
  it("totals across sections", () => {
    const page = pageWithItems(["item_86", "item_gone", "item_ok"]);
    expect(countBrokenBindings(page, catalog)).toBe(2);
  });

  it("is zero before the catalog loads", () => {
    expect(countBrokenBindings(pageWithItems(["item_gone"]), null)).toBe(0);
  });
});

describe("describeReason", () => {
  it("never leaks an id or a status code to a merchant", () => {
    expect(describeReason("not_found")).toBe("No longer on a menu here");
    expect(describeReason("unavailable")).toBe("Unavailable right now");
  });
});
