import { describe, expect, it } from "vitest";

import { addSection } from "../mutations";
import { createStarterPage } from "../page-document";
import { addableKinds, SECTION_REGISTRY } from "../sections/registry";
import { parseVideoRef, videoEmbedUrl } from "../sections/schemas/video";

/**
 * The kinds Phase 4 added: `cards`, `reviews`, `scrolling-banner`, `video` —
 * and `pdf`, which shipped with them and has since been taken back out of the
 * Add Section catalogue.
 *
 * The registry's own tests already assert the invariants every kind shares —
 * defaults parse, zones are real, capabilities exist. These cover what is
 * specific to these, and in particular the two things that are genuinely
 * dangerous: a video embed built from merchant input, and a marquee that moves.
 */
describe("the new kinds are properly registered", () => {
  const added = ["cards", "reviews", "scrolling-banner", "video"] as const;

  it("offers all four in the Add Section catalogue", () => {
    for (const kind of added) {
      expect(addableKinds(), `${kind} should be addable`).toContain(kind);
    }
  });

  /**
   * Retired, not deleted. A merchant cannot insert one and the catalogue does
   * not mention it, but the kind still renders and can still be deleted —
   * pages published while it was offered must not break.
   */
  it("does not offer PDF, and refuses one asked for by name", () => {
    expect(addableKinds()).not.toContain("pdf");
    const result = addSection(createStarterPage({ locationId: "loc_1" }), "pdf");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("not_addable");
  });

  it("keeps PDF editable and deletable for pages that already carry one", () => {
    const def = SECTION_REGISTRY.pdf;
    expect(def.editable && def.deletable && def.movable).toBe(true);
  });

  it("makes each one ordinary composable content", () => {
    for (const kind of added) {
      const def = SECTION_REGISTRY[kind];
      expect(def.editable && def.deletable && def.movable, `${kind}`).toBe(true);
      expect(def.zone).toBe("body");
      expect(def.singleton).toBe(false);
    }
  });

  it("can actually add each one to a page", () => {
    let doc = createStarterPage({ locationId: "loc_1" });
    for (const kind of added) {
      const result = addSection(doc, kind);
      expect(result.ok, `${kind} could not be added`).toBe(true);
      if (result.ok) doc = result.doc;
    }
    expect(doc.sections.filter((s) => added.includes(s.kind as never))).toHaveLength(4);
  });

  it("keeps the footer last however many sections are added", () => {
    let doc = createStarterPage({ locationId: "loc_1" });
    for (const kind of added) {
      const result = addSection(doc, kind, { atIndex: 0 });
      if (result.ok) doc = result.doc;
    }
    expect(doc.sections[doc.sections.length - 1].kind).toBe("footer");
    expect(doc.sections[0].kind).toBe("header");
  });
});

/**
 * The video section is the only place merchant-typed text becomes a URL the
 * browser loads. It is parsed once, here, and what gets stored is a provider
 * and an id — never a URL, and never markup. There is no "paste your embed
 * code" field in this product.
 */
describe("parseVideoRef", () => {
  it("reads a standard YouTube watch link", () => {
    expect(parseVideoRef("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toEqual({
      provider: "youtube",
      videoId: "dQw4w9WgXcQ",
    });
  });

  it("reads short, embed and shorts links", () => {
    expect(parseVideoRef("https://youtu.be/dQw4w9WgXcQ")?.videoId).toBe("dQw4w9WgXcQ");
    expect(parseVideoRef("https://www.youtube.com/embed/dQw4w9WgXcQ")?.videoId).toBe("dQw4w9WgXcQ");
    expect(parseVideoRef("https://youtube.com/shorts/dQw4w9WgXcQ")?.videoId).toBe("dQw4w9WgXcQ");
  });

  it("reads a Vimeo link", () => {
    expect(parseVideoRef("https://vimeo.com/123456789")).toEqual({
      provider: "vimeo",
      videoId: "123456789",
    });
  });

  it("accepts an id that was pasted on its own", () => {
    expect(parseVideoRef("dQw4w9WgXcQ")?.provider).toBe("youtube");
    expect(parseVideoRef("123456789")?.provider).toBe("vimeo");
  });

  /**
   * Anything it cannot recognise returns null so the editor can say so, rather
   * than storing a guess that becomes a broken frame on a published page.
   */
  it("refuses anything it does not recognise", () => {
    expect(parseVideoRef("")).toBeNull();
    expect(parseVideoRef("https://example.com/video.mp4")).toBeNull();
    expect(parseVideoRef("<iframe src='https://evil.test'></iframe>")).toBeNull();
    expect(parseVideoRef("javascript:alert(1)")).toBeNull();
  });

  it("cannot be talked into a foreign host by a lookalike URL", () => {
    // The id is extracted from the pattern; the host in the input is discarded
    // entirely, so the embed can only ever point at the two providers.
    const parsed = parseVideoRef("https://evil.test/youtube.com/watch?v=dQw4w9WgXcQ");
    if (parsed) {
      expect(videoEmbedUrl(parsed.provider, parsed.videoId)).toMatch(
        /^https:\/\/(www\.youtube-nocookie\.com|player\.vimeo\.com)\//,
      );
    }
  });
});

describe("videoEmbedUrl", () => {
  it("uses the no-cookie YouTube host", () => {
    expect(videoEmbedUrl("youtube", "abc123")).toBe(
      "https://www.youtube-nocookie.com/embed/abc123",
    );
  });

  it("uses the Vimeo player host", () => {
    expect(videoEmbedUrl("vimeo", "123456")).toBe("https://player.vimeo.com/video/123456");
  });

  /**
   * The schema's pattern is what guarantees this: an id is `[A-Za-z0-9_-]*`, so
   * nothing that reaches here can carry a slash, a quote or a scheme.
   */
  it("cannot produce a URL outside those two hosts", () => {
    const parsed = SECTION_REGISTRY.video.schema.safeParse({
      provider: "youtube",
      videoId: "../../evil.test/x",
    });
    expect(parsed.success).toBe(false);
  });
});

describe("scrolling banner", () => {
  /**
   * Bare strings have no generated control — `describeField` classifies an
   * array of primitives as `unsupported` — so the items are objects and the
   * drawer renders a repeater. Caught by the introspection test, fixed here.
   */
  it("stores items as objects so the drawer can edit them", () => {
    const parsed = SECTION_REGISTRY["scrolling-banner"].schema.safeParse({
      items: [{ text: "Open seven days" }],
      speed: "normal",
      tone: "brand",
    });
    expect(parsed.success).toBe(true);
    expect(SECTION_REGISTRY["scrolling-banner"].schema.safeParse({
      items: ["Open seven days"],
      speed: "normal",
      tone: "brand",
    }).success).toBe(false);
  });

  it("requires at least one message, since an empty marquee is a blank stripe", () => {
    const parsed = SECTION_REGISTRY["scrolling-banner"].schema.safeParse({
      items: [],
      speed: "normal",
      tone: "brand",
    });
    expect(parsed.success).toBe(false);
  });
});

describe("reviews", () => {
  it("accepts a quote with no rating, because not every one comes with stars", () => {
    const parsed = SECTION_REGISTRY.reviews.schema.safeParse({
      items: [{ quote: "Best kebab in the city.", author: "Zahara Z." }],
    });
    expect(parsed.success).toBe(true);
  });

  it("keeps a rating within one to five whole stars", () => {
    const schema = SECTION_REGISTRY.reviews.schema;
    const item = { quote: "Good", author: "A" };
    expect(schema.safeParse({ items: [{ ...item, rating: 5 }] }).success).toBe(true);
    expect(schema.safeParse({ items: [{ ...item, rating: 6 }] }).success).toBe(false);
    expect(schema.safeParse({ items: [{ ...item, rating: 4.5 }] }).success).toBe(false);
  });

  it("starts empty rather than shipping invented praise", () => {
    expect(SECTION_REGISTRY.reviews.defaults().items).toEqual([]);
  });

  it("offers the three supported card layouts and defaults older reviews to grid", () => {
    const schema = SECTION_REGISTRY.reviews.schema;
    const base = { items: [{ quote: "Great", author: "A", rating: 5 }] };

    expect(schema.parse(base).layout).toBe("grid");

    for (const layout of ["grid", "list", "carousel"]) {
      expect(schema.safeParse({ ...base, layout }).success).toBe(true);
    }
    expect(schema.safeParse({ ...base, layout: "custom-css" }).success).toBe(false);
  });
});
