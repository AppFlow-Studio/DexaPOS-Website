import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import PageRenderer, { SiteChrome } from "@/components/site-builder/PageRenderer";
import { SECTION_RENDERERS } from "@/components/site-builder/registry";
import {
  emptyResolvedMap,
  resolved,
  unavailable,
  type ResolvedMap,
  type ResolvedMenuItem,
} from "../bindings/resolved";
import { createDemoPage } from "../fixtures/demo-page";
import { updateSectionProps } from "../mutations";
import { normalizePage, type PageDocument } from "../index";
import { createRenderContext, type RenderMode } from "../render-context";
import { SECTION_KINDS } from "../sections/kinds";

// ─────────────────────────────────────────────────────────────────────────────
// fixtures
// ─────────────────────────────────────────────────────────────────────────────

const LOCATION_ID = "loc_1";

function menuItem(id: string, overrides: Partial<ResolvedMenuItem> = {}): ResolvedMenuItem {
  return {
    id,
    name: `Dish ${id}`,
    description: "Very good.",
    price: 18,
    cashPrice: 17.1,
    deliveryPrice: 21,
    image: null,
    isPopular: false,
    isNew: false,
    dietaryTags: [],
    allergens: [],
    ...overrides,
  };
}

function ctxFor(mode: RenderMode = "public", locationId: string | null = LOCATION_ID) {
  return createRenderContext({
    mode,
    site: {
      siteId: "site_1",
      locationId,
      slug: "tonys",
      name: "Tony's Pizza",
      logoUrl: null,
      heroImageUrl: null,
      phone: "+17185550101",
      basePath: "/sites/tonys",
      orderUrl: "/sites/tonys",
      menuUrl: "/sites/tonys",
      nav: [],
      pricingDisclosureText: "Prices reflect online rates.",
    },
  });
}

function mapWith(
  items: Record<string, ResolvedMenuItem | { missing: true } | { off: true }> = {},
): ResolvedMap {
  const map = emptyResolvedMap();
  for (const [id, value] of Object.entries(items)) {
    if ("missing" in value) map.menuItems.set(id, unavailable("not_found"));
    else if ("off" in value) map.menuItems.set(id, unavailable("unavailable"));
    else map.menuItems.set(id, resolved(value));
  }
  map.locations.set(
    LOCATION_ID,
    resolved({
      id: LOCATION_ID,
      name: "Tony's Pizza",
      addressLine1: "123 Bedford Ave",
      city: "Brooklyn",
      state: "NY",
      postalCode: "11211",
      phone: "+17185550101",
      email: null,
      latitude: 40.71,
      longitude: -73.96,
      timezone: "America/New_York",
      businessHours: { monday: { enabled: true, from: "11:00", to: "23:00" } },
    }),
  );
  return map;
}

function render(
  doc: PageDocument,
  map: ResolvedMap,
  mode: RenderMode = "public",
  locationId: string | null = LOCATION_ID,
): string {
  const ctx = ctxFor(mode, locationId);
  return renderToStaticMarkup(
    <SiteChrome ctx={ctx}>
      <PageRenderer doc={doc} resolved={map} ctx={ctx} />
    </SiteChrome>,
  );
}

/** The demo page, with `popular-items` bound to the given ids. */
function demoWith(ids: string[]): PageDocument {
  return normalizePage(createDemoPage({ locationId: LOCATION_ID, menuItemIds: ids }));
}

// ─────────────────────────────────────────────────────────────────────────────
// architecture invariants
// ─────────────────────────────────────────────────────────────────────────────

describe("renderer architecture", () => {
  const sectionsDir = join(process.cwd(), "components/site-builder/sections");

  /**
   * The single most important invariant in the renderer (ANALYSIS blocker B7).
   * The mock trapped all 17 renderers inside one 5,051-line "use client" module,
   * which is why its Phase 4 was impossible without extracting them first.
   *
   * It is also load-bearing for the builder: the canvas re-renders through
   * `renderToStaticMarkup` in a route handler, and Next refuses
   * `react-dom/server` in any module graph that reaches a client component. One
   * `"use client"` anywhere under the renderer breaks the canvas — so this test
   * covers the whole render tree, not just `sections/`.
   */
  const CLIENT_UI_DIRS = new Set(["builder", "dashboard"]);

  it("has no client components anywhere in the render graph", () => {
    const renderRoot = join(process.cwd(), "components/site-builder");
    const offenders: string[] = [];

    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        // `builder/` (the canvas) and `dashboard/` (the merchant-facing
        // overview and design workspace) are interactive dashboard UI. They are
        // legitimately client-side and neither is reachable from PageRenderer,
        // so the render-graph rule does not apply to them. Every *other*
        // directory here is part of the render graph and must stay server-only.
        if (entry.isDirectory()) {
          if (!CLIENT_UI_DIRS.has(entry.name)) walk(path);
          continue;
        }
        if (entry.name.endsWith(".tsx") || entry.name.endsWith(".ts")) {
          // Match the *directive* — a line that is exactly `"use client";` —
          // not the string anywhere in the file, or a comment explaining why a
          // component deliberately is not one would fail this test.
          const isClient = readFileSync(path, "utf-8")
            .split("\n")
            .some((line) => /^\s*["']use client["'];?\s*$/.test(line));
          if (isClient) offenders.push(entry.name);
        }
      }
    };

    walk(renderRoot);
    expect(offenders).toEqual([]);
  });

  it("has a renderer for every section kind", () => {
    for (const kind of SECTION_KINDS) {
      expect(SECTION_RENDERERS[kind], `no renderer for ${kind}`).toBeTypeOf("function");
    }
  });

  it("routes every image through SiteImage rather than a bare <img>", () => {
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) walk(path);
        else if (entry.name.endsWith(".tsx")) {
          const source = readFileSync(path, "utf-8");
          // HeaderSection renders the site logo, which is a platform URL rather
          // than a merchant asset — allowed, and annotated as such.
          if (source.includes("<img") && entry.name !== "HeaderSection.tsx") {
            offenders.push(entry.name);
          }
        }
      }
    };
    walk(sectionsDir);
    expect(offenders).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// rendering
// ─────────────────────────────────────────────────────────────────────────────

describe("PageRenderer", () => {
  it("renders a complete page to static HTML", () => {
    const html = render(demoWith(["a", "b", "c"]), mapWith({ a: menuItem("a"), b: menuItem("b"), c: menuItem("c") }));

    expect(html).toContain("Wood-fired pizza, made the slow way");
    expect(html).toContain("Guest Favorites");
    expect(html).toContain("Our story");
    expect(html).toContain("123 Bedford Ave");
    expect(html).toContain("</footer>");
  });

  it("emits theme tokens as CSS custom properties on the shell", () => {
    const html = render(demoWith([]), mapWith());
    expect(html).toContain("--site-brand");
    expect(html).toContain("--site-surface");
  });

  it("skips hidden sections on the public site but shows them in the builder", () => {
    const doc = demoWith([]);
    const hidden: PageDocument = {
      ...doc,
      sections: doc.sections.map((s) => (s.kind === "faq" ? { ...s, hidden: true } : s)),
    };

    expect(render(hidden, mapWith())).not.toContain("Frequently asked questions");
    expect(render(hidden, mapWith(), "builder")).toContain("Frequently asked questions");
  });

  it("does not throw on a section kind it does not know", () => {
    const doc = demoWith([]);
    const withAlien = {
      ...doc,
      sections: [...doc.sections, { id: "s_x", kind: "tiktok-feed", props: {} }],
    } as unknown as PageDocument;

    expect(() => render(withAlien, mapWith())).not.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// D6 in the markup
// ─────────────────────────────────────────────────────────────────────────────

describe("popular-items — decision D6 at render time", () => {
  it("shows live prices from the resolver, not from the document", () => {
    const html = render(demoWith(["a", "b"]), mapWith({ a: menuItem("a", { price: 24.5 }), b: menuItem("b") }));
    expect(html).toContain("$24.50");
  });

  it("drops a deleted item and keeps rendering the rest", () => {
    const html = render(
      demoWith(["a", "gone", "b"]),
      mapWith({ a: menuItem("a", { name: "Margherita" }), gone: { missing: true }, b: menuItem("b", { name: "Diavola" }) }),
    );
    expect(html).toContain("Margherita");
    expect(html).toContain("Diavola");
    expect(html).not.toContain("gone");
  });

  it("drops an 86'd item", () => {
    const html = render(
      demoWith(["a", "off", "b"]),
      mapWith({ a: menuItem("a"), off: { off: true }, b: menuItem("b") }),
    );
    expect(html).not.toContain("Dish off");
  });

  it("hides the whole section rather than showing one lonely card", () => {
    const html = render(
      demoWith(["a", "gone", "gone2"]),
      mapWith({ a: menuItem("a"), gone: { missing: true }, gone2: { missing: true } }),
    );
    expect(html).not.toContain("Guest Favorites");
  });

  it("keeps the section visible in the builder even when nothing resolves", () => {
    const html = render(demoWith(["gone"]), mapWith({ gone: { missing: true } }), "builder");
    expect(html).toContain("Guest Favorites");
  });

  it("shows the pricing disclosure when prices are shown", () => {
    const html = render(demoWith(["a", "b"]), mapWith({ a: menuItem("a"), b: menuItem("b") }));
    expect(html).toContain("Prices reflect online rates.");
  });

  it("honours a merchant label override without touching the live price", () => {
    let doc = demoWith([]);
    const popularId = doc.sections.find((s) => s.kind === "popular-items")!.id;
    const result = updateSectionProps(doc, popularId, {
      items: [
        { type: "menu_item", id: "a", overrides: { label: "Chef's pick" } },
        { type: "menu_item", id: "b" },
      ],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    doc = result.doc;

    const html = render(doc, mapWith({ a: menuItem("a", { price: 31 }), b: menuItem("b") }));
    expect(html).toContain("Chef&#x27;s pick");
    expect(html).toContain("$31.00");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// security & the overlay protocol
// ─────────────────────────────────────────────────────────────────────────────

describe("merchant content is sanitized on render", () => {
  it("strips script tags from rich text", () => {
    let doc = demoWith([]);
    const contentId = doc.sections.find((s) => s.kind === "content")!.id;
    const result = updateSectionProps(doc, contentId, {
      body: '<p>Hello</p><script>alert("xss")</script><img src=x onerror="alert(1)">',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    doc = result.doc;

    const html = render(doc, mapWith());
    expect(html).toContain("Hello");
    expect(html).not.toContain("<script");
    expect(html).not.toContain("onerror");
  });

  it("neutralizes a javascript: URL in a footer link", () => {
    let doc = demoWith([]);
    const footerId = doc.sections.find((s) => s.kind === "footer")!.id;
    const result = updateSectionProps(doc, footerId, {
      links: [{ label: "Evil", target: { kind: "url", value: "javascript:alert(1)" } }],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const html = render(result.doc, mapWith());
    expect(html).not.toContain("javascript:");
  });
});

describe("builder overlay protocol", () => {
  it("stamps data-sb attributes only in builder mode", () => {
    const doc = demoWith(["a", "b"]);
    const map = mapWith({ a: menuItem("a"), b: menuItem("b") });

    const publicHtml = render(doc, map, "public");
    expect(publicHtml).not.toContain("data-sb-section-id");
    expect(publicHtml).not.toContain("data-sb-field");

    const builderHtml = render(doc, map, "builder");
    expect(builderHtml).toContain('data-sb-section-id="s_demo_hero"');
    expect(builderHtml).toContain('data-sb-kind="hero"');
    expect(builderHtml).toContain('data-sb-field="props.heading"');
  });

  it("marks locked sections so the canvas can refuse to move them", () => {
    const html = render(demoWith([]), mapWith(), "builder");
    expect(html).toContain('data-sb-locked="true"');
  });

  /**
   * Preview is what a merchant checks their draft in, so it must be the public
   * render — not an approximation of it. The only legitimate difference is the
   * shell's own mode marker.
   */
  it("produces identical markup in public and preview mode", () => {
    const doc = demoWith(["a", "b"]);
    const map = mapWith({ a: menuItem("a"), b: menuItem("b") });
    const stripMode = (html: string) => html.replace(/ data-sb-mode="[^"]*"/, "");

    expect(stripMode(render(doc, map, "preview"))).toBe(stripMode(render(doc, map, "public")));
  });
});

describe("hours and location", () => {
  it("renders parsed business hours", () => {
    const html = render(demoWith([]), mapWith());
    expect(html).toContain("Monday");
    expect(html).toContain("11:00 AM – 11:00 PM");
  });

  it("keeps the section rendering when the location cannot be resolved", () => {
    const map = emptyResolvedMap();
    map.locations.set(LOCATION_ID, unavailable("not_found"));
    const html = render(demoWith([]), map);
    expect(html).toContain("Find us");
    expect(html).not.toContain("123 Bedford Ave");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// one site, many locations
//
// A merchant has ONE website; a page under it is either about the brand or
// about a single restaurant (`site_pages.location_id`). Branches may charge
// different amounts for the same dish, so a price on a brand page — before the
// visitor has chosen where they are ordering from — would be a guess.
// Decided with the team 2026-08-15.
// ─────────────────────────────────────────────────────────────────────────────

describe("prices are location-scoped", () => {
  const BRAND_PAGE = null;

  it("shows prices on a location page", () => {
    const html = render(demoWith(["a", "b"]), mapWith({ a: menuItem("a", { price: 24.5 }), b: menuItem("b") }));
    expect(html).toContain("$24.50");
  });

  it("shows no price on a brand page, however the merchant configured the section", () => {
    // The demo fixture sets showPrices: true — the section wants prices. The
    // render context is what withholds them.
    const html = render(
      demoWith(["a", "b"]),
      mapWith({ a: menuItem("a", { price: 24.5 }), b: menuItem("b") }),
      "public",
      BRAND_PAGE,
    );

    expect(html).not.toContain("$24.50");
    expect(html).not.toContain("$18.00");
  });

  it("still shows the dishes on a brand page — names and photos are merchant-level", () => {
    const html = render(
      demoWith(["a", "b"]),
      mapWith({ a: menuItem("a"), b: menuItem("b") }),
      "public",
      BRAND_PAGE,
    );

    // Withholding prices must not empty the section; the food is the point.
    expect(html).toContain("Dish a");
    expect(html).toContain("Dish b");
  });

  it("drops the dual-pricing disclosure when no price is shown", () => {
    // The disclosure explains a price the visitor cannot see — it would be noise
    // at best and confusing at worst.
    const withPrices = render(demoWith(["a", "b"]), mapWith({ a: menuItem("a"), b: menuItem("b") }));
    const brandPage = render(
      demoWith(["a", "b"]),
      mapWith({ a: menuItem("a"), b: menuItem("b") }),
      "public",
      BRAND_PAGE,
    );

    expect(withPrices).toContain("Prices reflect online rates.");
    expect(brandPage).not.toContain("Prices reflect online rates.");
  });
});
