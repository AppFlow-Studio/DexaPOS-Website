import { beforeEach, describe, expect, it } from "vitest";

import { countChanges, diffDocuments } from "../diff";
import { addSection, moveSectionBy, removeSection, setSectionHidden, updateSectionProps, updateSeo } from "../mutations";
import { createStarterPage, type PageDocument } from "../page-document";

let doc: PageDocument;

const idOf = (d: PageDocument, kind: string) => d.sections.find((s) => s.kind === kind)!.id;

const applied = (result: ReturnType<typeof addSection>): PageDocument => {
  if (!result.ok) throw new Error(`mutation refused: ${result.message}`);
  return result.doc;
};

beforeEach(() => {
  doc = createStarterPage({ locationId: "loc_1" });
});

describe("diffDocuments", () => {
  it("reports nothing for an unchanged document", () => {
    expect(diffDocuments(doc, doc)).toEqual([]);
    expect(countChanges(doc, doc)).toBe(0);
  });

  it("is insensitive to key order in props", () => {
    // The mutation reducers build patched objects by spreading, which preserves
    // insertion order — so a naive JSON.stringify would report an edit the first
    // time an optional field is set and then again if it is ever re-ordered.
    const heroId = idOf(doc, "hero");
    const reordered: PageDocument = {
      ...doc,
      sections: doc.sections.map((section) =>
        section.id === heroId
          ? {
              ...section,
              props: Object.fromEntries(
                Object.entries(section.props as Record<string, unknown>).reverse(),
              ),
            }
          : section,
      ) as PageDocument["sections"],
    };

    expect(diffDocuments(doc, reordered)).toEqual([]);
  });

  it("names an added section by its own heading", () => {
    const after = applied(addSection(doc, "faq"));
    const changes = diffDocuments(doc, after);

    expect(changes).toHaveLength(1);
    expect(changes[0].kind).toBe("added");
    // The FAQ default heading, not the registry label.
    expect(changes[0].label).toMatch(/added$/);
  });

  it("reports a removal", () => {
    const withFaq = applied(addSection(doc, "faq"));
    const faqId = idOf(withFaq, "faq");
    const after = applied(removeSection(withFaq, faqId));

    const changes = diffDocuments(withFaq, after);
    expect(changes).toHaveLength(1);
    expect(changes[0].kind).toBe("removed");
  });

  it("reports an edit", () => {
    const heroId = idOf(doc, "hero");
    const after = applied(updateSectionProps(doc, heroId, { heading: "A brand new headline" }));

    const changes = diffDocuments(doc, after);
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ kind: "edited", sectionId: heroId });
    // Labelled with the NEW heading — the merchant's current words.
    expect(changes[0].label).toBe("A brand new headline edited");
  });

  it("distinguishes hiding from showing", () => {
    const heroId = idOf(doc, "hero");
    const hidden = applied(setSectionHidden(doc, heroId, true));
    expect(diffDocuments(doc, hidden)[0]).toMatchObject({ kind: "hidden" });

    const shown = applied(setSectionHidden(hidden, heroId, false));
    expect(diffDocuments(hidden, shown)[0]).toMatchObject({ kind: "shown" });
  });

  it("reports a reorder once, not once per displaced section", () => {
    // Enough body sections that a single move displaces more than one
    // neighbour — which is the case a naive per-section diff gets wrong.
    let page = applied(addSection(doc, "faq"));
    page = applied(addSection(page, "gallery"));
    page = applied(addSection(page, "content"));

    // Derived rather than hardcoded: the starter page's own body sections count
    // too, and `moveSectionBy` refuses anything that would leave the zone.
    const body = page.sections.filter((s) => ["faq", "gallery", "content"].includes(s.kind));
    expect(body.length).toBeGreaterThanOrEqual(3);

    const first = body[0];
    const moved = applied(moveSectionBy(page, first.id, body.length - 1));

    const changes = diffDocuments(page, moved);
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ kind: "reordered", label: "Sections reordered" });
  });

  it("does not call an insertion a reorder", () => {
    const page = applied(addSection(doc, "faq"));
    const after = applied(addSection(page, "gallery", { atIndex: 1 }));

    const changes = diffDocuments(page, after);
    expect(changes.map((c) => c.kind)).toEqual(["added"]);
  });

  it("reports SEO edits separately", () => {
    const after = updateSeo(doc, { title: "Joe's Coffee — Downtown" });
    const changes = diffDocuments(doc, after);

    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ kind: "seo", label: "Search settings edited" });
  });

  it("accumulates independent changes", () => {
    const heroId = idOf(doc, "hero");
    let after = applied(updateSectionProps(doc, heroId, { heading: "Changed" }));
    after = applied(addSection(after, "faq"));
    after = updateSeo(after, { noindex: true });

    expect(countChanges(doc, after)).toBe(3);
  });
});
