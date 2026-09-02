import { describe, expect, it } from "vitest";

import { htmlToPlainText, runMigrations, v1ToV2 } from "../migrations";
import { normalizePageWithReport } from "../normalize";
import { CURRENT_SCHEMA_VERSION } from "../page-document";
import { SUBTITLE_MAX, TITLE_MAX } from "../sections/primitives";

/**
 * v1 → v2: the content section takes Owner's field set (decision W3).
 *
 * The only breaking change in the parity plan, and the only migration that has
 * ever run against merchant documents — so it is tested against a document of
 * the **real stored v1 shape**, exactly as `migrations/index.ts` requires, not
 * against a hand-tuned minimal object that happens to exercise the branches.
 *
 * The rule the whole thing rests on: a migration must never throw, and must
 * never lose a merchant's words. Format, yes — that was the trade. Words, no.
 */

/** A real v1 home page, of the shape `createStarterPage` used to produce. */
const V1_DOCUMENT = {
  schemaVersion: 1,
  sections: [
    { id: "s_home_header", kind: "header", props: { logoAlign: "left", sticky: true, showOrderButton: true, orderButtonLabel: "Order Now", showPhone: false, transparentOverHero: false } },
    {
      id: "s_home_story",
      kind: "content",
      props: {
        heading: "Our story",
        body: "<p>We opened in 1998 with one oven &amp; a short menu.</p><p>Everything is made in house.</p>",
        imagePosition: "right",
        image: { assetId: "asset_1", alt: "The dining room" },
        cta: { label: "Contact us", target: { kind: "contact" } },
      },
    },
    { id: "s_home_footer", kind: "footer", props: { showHours: true, links: [], social: [] } },
  ],
  seo: {},
  settings: {},
};

const contentOf = (doc: Record<string, unknown>) =>
  (doc.sections as { kind: string; props: Record<string, unknown> }[]).find(
    (s) => s.kind === "content",
  )!.props;

describe("v1ToV2", () => {
  const migrated = v1ToV2(V1_DOCUMENT);
  const props = contentOf(migrated);

  it("stamps the new version", () => {
    expect(migrated.schemaVersion).toBe(2);
  });

  it("carries the heading across as the title", () => {
    expect(props.title).toBe("Our story");
  });

  it("keeps the merchant's sentences, without their markup", () => {
    expect(props.subtitle).toBe(
      "We opened in 1998 with one oven & a short menu. Everything is made in house.",
    );
  });

  it("keeps the image, as the media slot", () => {
    expect(props.media).toBe("photo");
    expect(props.mediaImage).toEqual({ assetId: "asset_1", alt: "The dining room" });
  });

  it("turns the image position into an alignment", () => {
    expect(props.alignment).toBe("right");
  });

  it("carries the call to action across", () => {
    expect(props.button).toEqual({ label: "Contact us", target: { kind: "contact" } });
  });

  it("starts every migrated section with no background, as v1 had none", () => {
    expect(props.background).toBe("none");
  });

  it("leaves other kinds completely untouched", () => {
    const sections = migrated.sections as { kind: string; props: unknown }[];
    expect(sections.find((s) => s.kind === "header")!.props).toEqual(
      V1_DOCUMENT.sections[0].props,
    );
    expect(sections.find((s) => s.kind === "footer")!.props).toEqual(
      V1_DOCUMENT.sections[2].props,
    );
  });

  /**
   * `imagePosition: "none"` with a leftover image was not rendering that image
   * in v1. Promoting it to a visible photo would change a live page for a
   * merchant who never asked for it.
   */
  it("does not start showing an image the old page was hiding", () => {
    const hidden = v1ToV2({
      ...V1_DOCUMENT,
      sections: [
        {
          id: "s1",
          kind: "content",
          props: { heading: "T", body: "<p>x</p>", imagePosition: "none", image: { assetId: "a" } },
        },
      ],
    });
    expect(contentOf(hidden).media).toBe("none");
  });

  it("collapses `above`, which has no equivalent, to a side-by-side layout", () => {
    const above = v1ToV2({
      ...V1_DOCUMENT,
      sections: [
        {
          id: "s1",
          kind: "content",
          props: { heading: "T", body: "<p>x</p>", imagePosition: "above", image: { assetId: "a" } },
        },
      ],
    });
    expect(contentOf(above).alignment).toBe("left");
    expect(contentOf(above).media).toBe("photo");
  });

  it("omits a title and subtitle that were empty rather than writing empty strings", () => {
    const bare = v1ToV2({
      ...V1_DOCUMENT,
      sections: [{ id: "s1", kind: "content", props: { body: "  ", imagePosition: "none" } }],
    });
    expect(contentOf(bare).title).toBeUndefined();
    expect(contentOf(bare).subtitle).toBeUndefined();
  });

  /** Rule 3 of the migration contract: it must never throw. */
  it("survives documents that make no sense", () => {
    expect(() => v1ToV2({ schemaVersion: 1 })).not.toThrow();
    expect(() => v1ToV2({ schemaVersion: 1, sections: "nonsense" })).not.toThrow();
    expect(() =>
      v1ToV2({ schemaVersion: 1, sections: [null, 7, { kind: "content" }] }),
    ).not.toThrow();
  });
});

describe("htmlToPlainText", () => {
  it("puts a space where a block used to end, not nothing", () => {
    expect(htmlToPlainText("<p>One</p><p>Two</p>")).toBe("One Two");
  });

  it("drops inline formatting without eating the words", () => {
    expect(htmlToPlainText("<p>Wood-<strong>fired</strong> <em>pizza</em></p>")).toBe(
      "Wood-fired pizza",
    );
  });

  it("decodes the entities TipTap actually writes", () => {
    expect(htmlToPlainText("<p>fish &amp; chips &quot;special&quot;</p>")).toBe(
      'fish & chips "special"',
    );
  });

  it("keeps list items readable", () => {
    expect(htmlToPlainText("<ul><li>Dough</li><li>Sauce</li></ul>")).toBe("Dough Sauce");
  });

  it("returns nothing for markup that was only markup", () => {
    expect(htmlToPlainText("<p></p><br/>")).toBe("");
  });
});

/**
 * The path a merchant's stored document actually takes: migrate, then repair.
 * Length is deliberately not enforced by the migration — `clampStrings` does it
 * — so this is where the two are checked together.
 */
describe("through normalizePage, as a stored document is read", () => {
  it("migrates and repairs in one pass", () => {
    const { doc, repairs } = normalizePageWithReport(V1_DOCUMENT);

    expect(doc.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(repairs.some((r) => r.kind === "migrated")).toBe(true);

    const content = doc.sections.find((s) => s.kind === "content")!;
    expect((content.props as { title?: string }).title).toBe("Our story");
  });

  it("truncates a long body rather than dropping it on the floor", () => {
    const { doc } = normalizePageWithReport({
      ...V1_DOCUMENT,
      sections: [
        {
          id: "s1",
          kind: "content",
          props: {
            heading: "H".repeat(120),
            body: `<p>${"B".repeat(900)}</p>`,
            imagePosition: "none",
          },
        },
      ],
    });

    const props = doc.sections[0].props as { title?: string; subtitle?: string };
    expect(props.title).toBe("H".repeat(TITLE_MAX));
    expect(props.subtitle).toBe("B".repeat(SUBTITLE_MAX));
  });

  it("is idempotent — a v2 document read twice does not change", () => {
    const once = normalizePageWithReport(V1_DOCUMENT).doc;
    const twice = normalizePageWithReport(once).doc;
    expect(twice).toEqual(once);
  });

  it("runs through runMigrations from any older version", () => {
    const { applied } = runMigrations(V1_DOCUMENT, 1, CURRENT_SCHEMA_VERSION);
    expect(applied).toEqual([1]);
  });
});
