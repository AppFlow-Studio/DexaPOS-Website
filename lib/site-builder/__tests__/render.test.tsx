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
import HeroSection from "@/components/site-builder/sections/HeroSection";
import ThemePreview from "@/components/site-builder/dashboard/design/ThemePreview";
import { composeTheme, type StyleMode } from "../style-inputs";
import { isLight } from "../color";

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
  const CLIENT_UI_DIRS = new Set(["builder", "dashboard", "shell"]);

  /**
   * Rendered by the **public route** (`built-site.tsx`) but never by
   * `PageRenderer`, so they are outside the graph this rule protects.
   *
   * A different reason from `CLIENT_UI_DIRS` above, and worth keeping separate:
   * those are dashboard UI that a visitor never sees at all. `tracking/` ships
   * to visitors — it is just mounted beside the page rather than inside it.
   * `SiteAnalyticsScripts` is a server component that renders one small client
   * island for the delegated click listener, which is the whole client-side
   * footprint of marketing pixels.
   *
   * The carve-out is only safe while nothing in the render graph reaches in
   * here, which is what the next test asserts rather than assumes.
   */
  const PUBLIC_ROUTE_ONLY_DIRS = new Set(["tracking"]);

  it("has no client components anywhere in the render graph", () => {
    const renderRoot = join(process.cwd(), "components/site-builder");
    const offenders: string[] = [];

    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        // `builder/` (the canvas), `dashboard/` (the page list and style
        // workspace) and `shell/` (the chrome those two are built from — the
        // overlay, the list card, the status pill) are interactive dashboard
        // UI. They are legitimately client-side and none of them is reachable
        // from PageRenderer, so the render-graph rule does not apply. Every
        // *other* directory here is in the render graph and must stay
        // server-only.
        if (entry.isDirectory()) {
          if (!CLIENT_UI_DIRS.has(entry.name) && !PUBLIC_ROUTE_ONLY_DIRS.has(entry.name)) {
            walk(path);
          }
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

  /**
   * The carve-out above is only sound while the render graph cannot reach the
   * directories it excludes — otherwise excluding a directory from the scan
   * would quietly *create* the breakage the scan exists to catch.
   *
   * So: nothing under the render graph may import from `tracking/`. A section
   * that wants to report a click imports `trackAttrs` from
   * `lib/site-builder/tracking` instead — a pure module with no React in it,
   * which is exactly why the attribute-plus-delegated-listener design was
   * chosen over an `onClick`.
   */
  it("keeps the public-route-only directories out of the render graph", () => {
    const renderRoot = join(process.cwd(), "components/site-builder");
    const offenders: string[] = [];

    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) {
          if (!CLIENT_UI_DIRS.has(entry.name) && !PUBLIC_ROUTE_ONLY_DIRS.has(entry.name)) {
            walk(path);
          }
          continue;
        }
        if (!entry.name.endsWith(".tsx") && !entry.name.endsWith(".ts")) continue;

        const source = readFileSync(path, "utf-8");
        for (const excluded of PUBLIC_ROUTE_ONLY_DIRS) {
          const reaches =
            source.includes(`components/site-builder/${excluded}/`) ||
            new RegExp(`from\s+["'][./]*${excluded}/`).test(source);
          if (reaches) offenders.push(`${entry.name} → ${excluded}/`);
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
    expect(html).toContain('<footer id="contact"');
  });

  it("renders every selected Hero carousel frame without adding a client component", () => {
    const doc = demoWith([]);
    const heroId = doc.sections.find((section) => section.kind === "hero")!.id;
    const changed = updateSectionProps(doc, heroId, {
      image: { assetId: "hero-1", alt: "Dining room" },
      carousel: [
        { assetId: "hero-1", alt: "Dining room duplicate" },
        { assetId: "hero-2", alt: "Dinner plate" },
        { assetId: "hero-2", alt: "Dinner plate duplicate" },
      ],
    });
    expect(changed.ok).toBe(true);
    if (!changed.ok) return;

    const ctx = ctxFor();
    ctx.resolveAsset = (assetId) => ({
      url: `https://cdn.example/${assetId}.jpg`,
      alt: null,
      width: 1600,
      height: 900,
    });
    const html = renderToStaticMarkup(
      <SiteChrome ctx={ctx}>
        <PageRenderer doc={changed.doc} resolved={mapWith()} ctx={ctx} />
      </SiteChrome>,
    );

    expect(html).toContain('data-hero-carousel="true"');
    expect(html).toContain("https://cdn.example/hero-1.jpg");
    expect(html).toContain("https://cdn.example/hero-2.jpg");
    expect(html.match(/src="https:\/\/cdn\.example\/hero-1\.jpg"/g)).toHaveLength(1);
    expect(html.match(/src="https:\/\/cdn\.example\/hero-2\.jpg"/g)).toHaveLength(1);
    expect(html).toContain("prefers-reduced-motion");
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
  /**
   * The FAQ answer is the last merchant-authored markup on a built page. The
   * content section used to be the other one; decision W3 replaced its
   * rich-text body with a plain-text subtitle, which is why this assertion
   * moved rather than disappeared.
   */
  it("strips script tags from rich text", () => {
    let doc = demoWith([]);
    const faqId = doc.sections.find((s) => s.kind === "faq")!.id;
    const result = updateSectionProps(doc, faqId, {
      items: [
        {
          question: "Are you open on Sundays?",
          answer: '<p>Hello</p><script>alert("xss")</script><img src=x onerror="alert(1)">',
        },
      ],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    doc = result.doc;

    const html = render(doc, mapWith());
    expect(html).toContain("Hello");
    expect(html).not.toContain("<script");
    expect(html).not.toContain("onerror");
  });

  /**
   * The reshape's security dividend: a content subtitle is a text node, so
   * markup in it is escaped by React rather than sanitized by an allowlist we
   * have to keep correct.
   */
  it("escapes markup typed into a content subtitle", () => {
    const doc = demoWith([]);
    const contentId = doc.sections.find((s) => s.kind === "content")!.id;
    const result = updateSectionProps(doc, contentId, {
      subtitle: '<script>alert("xss")</script>',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const html = render(result.doc, mapWith());
    expect(html).not.toContain("<script");
    expect(html).toContain("&lt;script&gt;");
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

// ─────────────────────────────────────────────────────────────────────────────
// the style preview must agree with the renderer
// ─────────────────────────────────────────────────────────────────────────────

/**
 * `ThemePreview` is the only picture a merchant sees while choosing a theme, so
 * every band in it has to be painted with the token the real section uses.
 *
 * It drifted once, on the footer: the preview used `surfaceDark` — dark in light
 * mode *and* dark mode — so flipping Light/Dark appeared to leave the footer
 * alone, while the real footer on `surfaceMuted` had been inverting all along.
 */
describe("ThemePreview agrees with the sections it previews", () => {
  const preview = (mode: StyleMode) =>
    renderToStaticMarkup(
      <ThemePreview
        theme={composeTheme({
          brand: "#D62828",
          mode,
          corner: "rounded",
          headingFont: "Inter, sans-serif",
          fontFamily: "Inter, sans-serif",
        })}
        device="desktop"
        restaurantName="Joes Coffee Shop"
      />,
    );

  /** The style attribute of the preview's footer band, lower-cased for comparison. */
  const footerStyle = (html: string) => {
    const match = html.match(/class="border-t px-5 py-4"\s+style="([^"]*)"/);
    if (!match) throw new Error("preview footer band not found");
    return match[1].replace(/&quot;/g, '"').toLowerCase();
  };

  const tokens = (mode: StyleMode) =>
    composeTheme({
      brand: "#D62828",
      mode,
      corner: "rounded",
      headingFont: "Inter, sans-serif",
      fontFamily: "Inter, sans-serif",
    });

  it("paints the preview footer with the tokens FooterSection uses", () => {
    // FooterSection: background surfaceMuted, color text, borderColor border.
    for (const mode of ["light", "dark"] as const) {
      const theme = tokens(mode);
      const style = footerStyle(preview(mode));

      expect(style).toContain(theme.surfaceMuted.toLowerCase());
      expect(style).toContain(theme.text.toLowerCase());
      expect(style).not.toContain(theme.surfaceDark.toLowerCase());
    }
  });

  it("inverts the preview footer between light and dark", () => {
    // The reported bug, stated as the merchant experienced it: toggling the mode
    // must visibly change the footer band.
    const light = tokens("light");
    const dark = tokens("dark");

    expect(isLight(light.surfaceMuted)).toBe(true);
    expect(isLight(dark.surfaceMuted)).toBe(false);
    expect(footerStyle(preview("light"))).not.toBe(footerStyle(preview("dark")));
  });

  it("keeps surfaceDark on the band that is dark in both modes", () => {
    // Not a bug, and the reason the drift went unnoticed: the hero band is meant
    // to stay dark either way, so `surfaceDark` must never be a mode indicator.
    expect(isLight(tokens("light").surfaceDark)).toBe(false);
    expect(isLight(tokens("dark").surfaceDark)).toBe(false);

    // It is still exercised somewhere in the preview, or a broken supporting
    // colour would ship unseen.
    expect(preview("light").toLowerCase()).toContain(tokens("light").surfaceDark.toLowerCase());
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// the hero carousel must actually be visible
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Every hero frame is `absolute inset-0`, so the wrapper around them has to be
 * a positioned ancestor with a real height. It carried a hardcoded `relative`
 * on top of whatever the variant passed, and Tailwind emits `.relative` after
 * `.absolute` — so on the full-bleed variants `relative` won, `h-full` lost the
 * definite parent height it needed, the wrapper collapsed to zero height, and
 * all three photographs vanished. The hero rendered as a flat colour.
 *
 * A merchant saw an empty hero with three photos listed in the panel beside it.
 */
describe("hero carousel positioning", () => {
  const POSITION_UTILITIES = ["static", "fixed", "absolute", "relative", "sticky"];

  const heroHtml = (variant: string, assetIds: string[]) => {
    const ids = new Set(assetIds);
    const ctx = createRenderContext({
      mode: "public",
      // No storefront hero to fall back on: this is about the carousel alone.
      site: {
        siteId: "site_1",
        locationId: LOCATION_ID,
        slug: "tonys",
        name: "Tony's Pizza",
        logoUrl: null,
        heroImageUrl: null,
        phone: null,
        basePath: "/sites/tonys",
        orderUrl: "/sites/tonys",
        menuUrl: "/sites/tonys",
        nav: [],
        pricingDisclosureText: null,
      },
      resolveAsset: (id: string) =>
        ids.has(id) ? { url: `https://cdn.test/${id}.jpg`, alt: null, width: 1600, height: 900 } : null,
    });

    const section = {
      id: "sec_hero",
      kind: "hero" as const,
      props: {
        variant,
        heading: "Great coffee",
        carousel: assetIds.map((assetId) => ({ assetId })),
        overlayOpacity: 51,
      },
    };

    return renderToStaticMarkup(
      <HeroSection section={section as never} resolved={emptyResolvedMap()} ctx={ctx} />,
    );
  };

  /** The wrapper's class list, for the carousel container. */
  const wrapperClasses = (html: string) => {
    const match = html.match(/<div class="([^"]*)" data-hero-carousel="true"/);
    if (!match) throw new Error("carousel wrapper not found");
    return match[1].split(/\s+/);
  };

  it.each(["classic", "spotlight", "bistro"])(
    "gives the %s carousel exactly one position utility",
    (variant) => {
      const classes = wrapperClasses(heroHtml(variant, ["a", "b", "c"]));
      const positions = classes.filter((c) => POSITION_UTILITIES.includes(c));

      // Two would mean the stylesheet's order decides, not this file.
      expect(positions, `${variant}: ${classes.join(" ")}`).toHaveLength(1);
    },
  );

  it("keeps the full-bleed variants absolutely positioned", () => {
    for (const variant of ["classic", "spotlight"]) {
      const classes = wrapperClasses(heroHtml(variant, ["a", "b", "c"]));
      expect(classes, variant).toContain("absolute");
      expect(classes, variant).toContain("inset-0");
      expect(classes, variant).not.toContain("relative");
    }
  });

  it("keeps the split variant a positioned aspect box", () => {
    const classes = wrapperClasses(heroHtml("bistro", ["a", "b", "c"]));
    expect(classes).toContain("relative");
    expect(classes).not.toContain("absolute");
    expect(classes.some((c) => c.startsWith("aspect-"))).toBe(true);
  });

  it("still renders one frame per resolvable photo", () => {
    const html = heroHtml("classic", ["a", "b", "c"]);
    // `<img>` elements, not mentions of the class — the <style> block names it
    // twice more in the reduced-motion rules.
    expect(html.split("<img ").length - 1).toBe(3);
    for (const id of ["a", "b", "c"]) expect(html).toContain(`https://cdn.test/${id}.jpg`);
  });
});
