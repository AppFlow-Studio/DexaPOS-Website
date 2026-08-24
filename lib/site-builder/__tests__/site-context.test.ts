import { describe, expect, it } from "vitest";

import { DEFAULT_BRAND, DEFAULT_FEATURES } from "../site-settings";
import { buildRenderContext, type SiteContext } from "../site-context";

/**
 * A merchant whose ordering storefront and brand site have different
 * addresses — which is the normal case, and the one the editor got wrong.
 */
function siteFixture(overrides: Partial<SiteContext> = {}): SiteContext {
  return {
    merchantId: "merchant-1",
    locationId: "loc-1",
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
