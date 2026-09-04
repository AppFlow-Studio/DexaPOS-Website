import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import ContentSection from "@/components/site-builder/sections/ContentSection";
import FooterSection from "@/components/site-builder/sections/FooterSection";
import HeroSection from "@/components/site-builder/sections/HeroSection";
import ReviewsSection from "@/components/site-builder/sections/ReviewsSection";
import ScrollingBannerSection from "@/components/site-builder/sections/ScrollingBannerSection";
import { emptyResolvedMap } from "../bindings/resolved";
import { createRenderContext } from "../render-context";
import type { SectionStyle, TextTone } from "../sections/primitives";

/**
 * The text tone, asserted where it actually has to appear: in the markup.
 *
 * `text-tone.test.ts` proves the *colours* are readable. This proves the control
 * is wired to them — a distinction that matters because the five sections below
 * paint their own backdrops and each one had to opt in by hand. The failure this
 * guards against is the quiet one: a merchant sets a tone, eleven sections
 * change, and the hero and the footer — the two they were most likely to be
 * looking at — do not.
 */

const ctx = createRenderContext({
  mode: "public",
  site: {
    siteId: "site_1",
    locationId: "loc_1",
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
});

const draw = (node: React.ReactElement) => renderToStaticMarkup(node);

function section<P>(kind: string, props: P, style: SectionStyle) {
  return { id: `sec_${kind}`, kind, props, style } as never;
}

describe("text tone reaches the markup", () => {
  it("recolours a section that takes its backdrop from style.background", () => {
    const render = (textTone: TextTone) =>
      draw(
        <ReviewsSection
          section={section(
            "reviews",
            {
              title: "Guests",
              layout: "grid",
              items: [{ quote: "Great.", author: "Sam R.", rating: 5 }],
            },
            { background: "default", textTone },
          )}
          resolved={emptyResolvedMap()}
          ctx={ctx}
        />,
      );

    expect(render("default")).toContain("color:var(--site-text)");
    expect(render("muted")).toContain("color:var(--site-text-dim)");
    expect(render("brand")).toContain("color:var(--site-text-brand)");
  });

  it("resolves against the dark band on a full-bleed hero, not the page", () => {
    const render = (textTone: TextTone) =>
      draw(
        <HeroSection
          section={section(
            "hero",
            {
              variant: "classic",
              heading: "Wood-fired since 1994",
              subheading: "Naples, in Brooklyn.",
              overlayOpacity: 35,
            },
            { textTone },
          )}
          resolved={emptyResolvedMap()}
          ctx={ctx}
        />,
      );

    // The dark-band variants of the same three tones — never the page's.
    expect(render("default")).toContain("color:var(--site-text-on-dark)");
    expect(render("muted")).toContain("color:var(--site-text-dim-on-dark)");
    expect(render("brand")).toContain("color:var(--site-text-brand-on-dark)");
  });

  it("follows a content block onto its own coloured band", () => {
    const render = (background: "none" | "color", textTone: TextTone) =>
      draw(
        <ContentSection
          section={section(
            "content",
            {
              background,
              backgroundTone: "dark",
              media: "none",
              alignment: "left",
              title: "About us",
              subtitle: "Tell your story here.",
            },
            { textTone },
          )}
          resolved={emptyResolvedMap()}
          ctx={ctx}
        />,
      );

    expect(render("none", "brand")).toContain("color:var(--site-text-brand)");
    // The same tone on the same section, once it is given a dark band.
    expect(render("color", "brand")).toContain("color:var(--site-text-brand-on-dark)");
  });

  it("recolours the footer's muted band", () => {
    const render = (textTone: TextTone) =>
      draw(
        <FooterSection
          section={section(
            "footer",
            {
              location: { type: "location", id: "loc_1" },
              showAddress: false,
              showHours: false,
              showPhone: false,
              showSocial: false,
              links: [],
            },
            { textTone },
          )}
          resolved={emptyResolvedMap()}
          ctx={ctx}
        />,
      );

    expect(render("default")).toContain("color:var(--site-text)");
    expect(render("muted")).toContain("color:var(--site-text-dim)");
  });

  it("recolours the scrolling banner against the tone it was given", () => {
    const render = (tone: "muted" | "dark", textTone: TextTone) =>
      draw(
        <ScrollingBannerSection
          section={section(
            "scrolling-banner",
            { items: [{ text: "Open until 11" }], speed: "normal", tone },
            { textTone },
          )}
          resolved={emptyResolvedMap()}
          ctx={ctx}
        />,
      );

    expect(render("muted", "brand")).toContain("color:var(--site-text-brand)");
    expect(render("dark", "brand")).toContain("color:var(--site-text-brand-on-dark)");
  });

  it("paints a custom colour into the section, guarded, on a hand-rolled backdrop", () => {
    const render = (textColor: string) =>
      draw(
        <HeroSection
          section={section(
            "hero",
            {
              variant: "classic",
              heading: "Wood-fired since 1994",
              overlayOpacity: 35,
            },
            { textTone: "custom", textColor },
          )}
          resolved={emptyResolvedMap()}
          ctx={ctx}
        />,
      );

    // Light copy on the hero's dark band survives as chosen.
    expect(render("#F5D0A9")).toContain("color:#F5D0A9");

    // A near-black would be invisible there, so the guard lightens it — and what
    // reaches the markup is the guarded value, never the stored one.
    const guarded = render("#111827");
    expect(guarded).not.toContain("color:#111827");
    expect(guarded).toMatch(/color:#[0-9A-Fa-f]{6}/);
  });

  it("leaves a section with no tone exactly as it rendered before", () => {
    const withoutTone = draw(
      <ReviewsSection
        section={section(
          "reviews",
          { title: "Guests", layout: "grid", items: [{ quote: "Great.", author: "Sam R.", rating: 5 }] },
          { background: "muted" },
        )}
        resolved={emptyResolvedMap()}
        ctx={ctx}
      />,
    );

    expect(withoutTone).toContain("background:var(--site-surface-muted);color:var(--site-text)");
  });
});
