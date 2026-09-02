import { describe, expect, it } from "vitest";

import { decideRenderMode, type SiteRequestFacts } from "../resolve-render-mode";

/**
 * The routing fork.
 *
 * These are the tests that make it safe to put a built site in front of a
 * working restaurant, and the property they exist to protect is blunt: **no
 * state of the built site may change what a merchant's existing ordering URLs
 * do.** An earlier version of this fork resolved a storefront slug to its
 * merchant's site, which meant one publish would have replaced all five of a
 * five-location merchant's ordering pages with a single brand home page. The
 * first two tests below are the ones that would have caught it.
 */

const SITE = {
  id: "site_1",
  merchantId: "merchant_1",
  renderMode: "builder" as const,
  publishedPageCount: 1,
  nav: { items: [] },
  theme: { brand: "#111" },
  siteSeo: {},
};

const PAGE = {
  id: "page_1",
  title: "Home",
  path: "",
  locationId: null,
  versionId: "version_1",
  versionNumber: 3,
  publishedAt: "2026-08-16T00:00:00.000Z",
  content: { schemaVersion: 1, sections: [] },
};

/** A request arriving at a brand subdomain, which is where built sites live. */
function atSubdomain(overrides: Partial<SiteRequestFacts> = {}): SiteRequestFacts {
  return {
    hasActiveStorefront: false,
    addressedBySubdomain: true,
    site: SITE,
    page: PAGE,
    ...overrides,
  };
}

/** A request arriving at an ordering storefront's own slug. */
function atStorefront(overrides: Partial<SiteRequestFacts> = {}): SiteRequestFacts {
  return {
    hasActiveStorefront: true,
    addressedBySubdomain: false,
    site: SITE,
    page: PAGE,
    ...overrides,
  };
}

describe("decideRenderMode", () => {
  describe("an ordering storefront's address", () => {
    /**
     * The regression that motivated this whole file. `online_store_config.slug`
     * is per LOCATION while a site is per MERCHANT, so anything that resolves a
     * storefront slug to its merchant's site lets one publish hijack every
     * branch's ordering page at once.
     */
    it("always serves ordering, even when the built site is fully live", () => {
      const decision = decideRenderMode(atStorefront());

      expect(decision).toEqual({ mode: "template", reason: "storefront_address" });
    });

    it("serves ordering no matter what state the built site is in", () => {
      const states: Partial<SiteRequestFacts>[] = [
        { site: null, page: null },
        { site: { ...SITE, renderMode: "template" } },
        { site: { ...SITE, publishedPageCount: 0 }, page: null },
        { site: { ...SITE, publishedPageCount: 99 } },
        { page: null },
      ];

      for (const state of states) {
        expect(decideRenderMode(atStorefront(state)).mode).toBe("template");
      }
    });
  });

  describe("a brand subdomain", () => {
    it("serves the published page", () => {
      const decision = decideRenderMode(atSubdomain());

      expect(decision.mode).toBe("builder");
      if (decision.mode !== "builder") throw new Error("unreachable");
      expect(decision.pageId).toBe("page_1");
      expect(decision.versionNumber).toBe(3);
      expect(decision.content).toEqual(PAGE.content);
      // Site-wide values ride along so the shell renders in one pass.
      expect(decision.nav).toEqual(SITE.nav);
      expect(decision.theme).toEqual(SITE.theme);
    });

    it("404s at a path with nothing published on it", () => {
      const decision = decideRenderMode(atSubdomain({ page: null }));

      expect(decision).toEqual({ mode: "builder_not_found", siteId: "site_1" });
    });

    /**
     * No template fallback here, and deliberately so: the templates are
     * addressed by storefront slug, so there is nothing behind a brand
     * subdomain to fall back to. Falling back would mean answering the brand's
     * URL with one arbitrary branch's ordering page.
     */
    it("404s rather than falling back, in every not-live state", () => {
      const states: Partial<SiteRequestFacts>[] = [
        { site: null, page: null },
        { site: { ...SITE, renderMode: "template" } },
        { site: { ...SITE, publishedPageCount: 0 }, page: null },
      ];

      for (const state of states) {
        expect(decideRenderMode(atSubdomain(state))).toEqual({
          mode: "not_found",
          reason: "subdomain_without_published_site",
        });
      }
    });

    it("never downgrades a page the merchant genuinely published", () => {
      for (const publishedPageCount of [1, 2, 50]) {
        const decision = decideRenderMode(
          atSubdomain({ site: { ...SITE, publishedPageCount } }),
        );
        expect(decision.mode).toBe("builder");
      }
    });
  });

  it("404s an address that is neither a storefront nor a brand site", () => {
    const decision = decideRenderMode(
      atStorefront({ hasActiveStorefront: false, site: null, page: null }),
    );

    expect(decision).toEqual({ mode: "not_found", reason: "unknown_address" });
  });

  /**
   * A brand page carries `location_id = NULL`, and that null is the input
   * `canShowPrices` reads to refuse to guess at a price before the visitor has
   * chosen a branch. Losing it here would quietly defeat the rule agreed on
   * 2026-08-15, so it is asserted rather than assumed.
   */
  it("carries the page's own location through, including null", () => {
    const brand = decideRenderMode(atSubdomain());
    const branch = decideRenderMode(atSubdomain({ page: { ...PAGE, locationId: "loc_9" } }));

    expect(brand.mode === "builder" && brand.locationId).toBeNull();
    expect(branch.mode === "builder" && branch.locationId).toBe("loc_9");
  });
});
