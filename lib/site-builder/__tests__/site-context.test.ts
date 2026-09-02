import { describe, expect, it } from "vitest";

import { DEFAULT_BRAND, DEFAULT_FEATURES } from "../site-settings";
import { canShowPrices } from "../render-context";
import { buildRenderContext, type SiteContext } from "../site-context";

/**
 * A merchant whose ordering storefront and brand site have different
 * addresses — which is the normal case, and the one the editor got wrong.
 */
function siteFixture(overrides: Partial<SiteContext> = {}): SiteContext {
  return {
    merchantId: "merchant-1",
    locationId: "loc-1",
    availableLocationIds: ["loc-1"],
    storeConfigId: "cfg-1",
    slug: "downtown-hamra",
    subdomain: "joes-coffee-shop",
    name: "Joes Coffee Shop",
    logoUrl: null,
    heroImageUrl: null,
    phone: null,
    pricingDisclosureText: null,
    deliveryPricingEnabled: true,
    colors: {
      primary: null,
      background: null,
      text: null,
      border: null,
      card: null,
      fontFamily: null,
    },
    websiteTheme: {},
    features: DEFAULT_FEATURES,
    brand: DEFAULT_BRAND,
    nav: { items: [{ label: "About us", path: "about-us" }] },
    ...overrides,
  };
}

describe("buildRenderContext link targets", () => {
  it("points in-site links at the brand subdomain and ordering at the storefront", () => {
    const ctx = buildRenderContext(siteFixture(), "builder");

    expect(ctx.site.basePath).toBe("/sites/joes-coffee-shop");
    expect(ctx.site.orderUrl).toBe("/sites/downtown-hamra");
    expect(ctx.site.menuUrl).toBe("/sites/downtown-hamra");
    // The defect was one string doing both jobs, so assert they differ.
    expect(ctx.site.basePath).not.toBe(ctx.site.orderUrl);
  });

  it("builds nav hrefs from the brand address, not the storefront", () => {
    const ctx = buildRenderContext(siteFixture(), "builder");

    expect(ctx.site.nav).toEqual([
      { label: "About us", href: "/sites/joes-coffee-shop/about-us" },
    ]);
  });

  it("falls back to the storefront for a merchant with no subdomain yet", () => {
    const ctx = buildRenderContext(siteFixture({ subdomain: null }), "builder");

    expect(ctx.site.basePath).toBe("/sites/downtown-hamra");
    expect(ctx.site.orderUrl).toBe("/sites/downtown-hamra");
    expect(ctx.site.nav).toEqual([
      { label: "About us", href: "/sites/downtown-hamra/about-us" },
    ]);
  });
});

/**
 * The editor must reach the same verdict about money as the live site.
 *
 * `buildRenderContext` used to pass the *storefront* into `ctx.site.locationId`,
 * so `canShowPrices` could never return false: a merchant turned on "Never show
 * prices before a branch is chosen", saved it, and the canvas and Preview went
 * on showing prices their published site had already stopped showing. These
 * assert the rule through `canShowPrices` rather than the field, because that is
 * the question sections actually ask.
 */
describe("buildRenderContext pricing scope", () => {
  it("withholds prices on a brand page with no default location", () => {
    const ctx = buildRenderContext(siteFixture(), "builder", undefined, null);

    expect(ctx.site.locationId).toBeNull();
    expect(canShowPrices(ctx)).toBe(false);
  });

  it("shows prices on a page that is about one restaurant", () => {
    const ctx = buildRenderContext(siteFixture(), "builder", undefined, "loc-1");

    expect(ctx.site.locationId).toBe("loc-1");
    expect(canShowPrices(ctx)).toBe(true);
  });

  it("shows the default location's prices on a brand page when one is named", () => {
    const site = siteFixture({
      brand: { ...DEFAULT_BRAND, defaultLocationId: "loc-1" },
    });

    expect(canShowPrices(buildRenderContext(site, "builder", undefined, null))).toBe(true);
  });

  it("honours 'never show prices before a branch is chosen' over the default", () => {
    const site = siteFixture({
      brand: { ...DEFAULT_BRAND, defaultLocationId: "loc-1", forceLocationChoice: true },
    });

    const ctx = buildRenderContext(site, "builder", undefined, null);

    expect(ctx.site.locationId).toBeNull();
    expect(canShowPrices(ctx)).toBe(false);
  });

  it("still prices a location page when the toggle is on — the page's own scope wins", () => {
    const site = siteFixture({
      brand: { ...DEFAULT_BRAND, forceLocationChoice: true },
    });

    expect(canShowPrices(buildRenderContext(site, "builder", undefined, "loc-1"))).toBe(true);
  });

  it("ignores a default pointing at a branch with no active storefront", () => {
    // The branch has been deactivated since the default was chosen. The live
    // site falls back to withholding prices; the canvas must agree, so the
    // merchant finds out here rather than from a visitor.
    const site = siteFixture({
      availableLocationIds: [],
      brand: { ...DEFAULT_BRAND, defaultLocationId: "loc-1" },
    });

    expect(canShowPrices(buildRenderContext(site, "builder", undefined, null))).toBe(false);
  });

  it("defaults to a brand page when the caller states no scope", () => {
    // Theme-only callers pass nothing. Withholding is the safe default: a page
    // whose scope is unknown must not invent prices from the edited storefront.
    expect(canShowPrices(buildRenderContext(siteFixture(), "builder"))).toBe(false);
  });
});
