import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * What a merchant's public site says about itself in its `<head>`.
 *
 * `app/layout.tsx` is our marketing site's layout, and Next merges its metadata
 * into every route beneath it. The title template was escaped when that was
 * noticed; three fields were not, so a restaurant's website shipped the DexaPOS
 * favicon, our application name and our sales keywords. These assertions lock
 * that class of bug shut — a field added to the root layout has to be decided
 * on here, not inherited by accident.
 */

const resolveRenderMode = vi.fn();

vi.mock("@/lib/site-builder/resolve-render-mode", () => ({
  resolveRenderMode: (...args: unknown[]) => resolveRenderMode(...args),
}));

vi.mock("@/lib/supabase/anon", () => ({
  createAnonSupabaseClient: () => ({}),
}));

vi.mock("@/lib/site-builder/asset-map", () => ({
  loadPublicAssetMap: async () => new Map(),
}));

const { builtSiteMetadata } = await import("@/app/sites/[slug]/built-site");

/** A published brand page, with only the fields metadata reads. */
function decision(overrides: Record<string, unknown> = {}) {
  return {
    mode: "builder",
    siteId: "site_1",
    merchantId: "merchant_1",
    merchantName: "Joes Coffee Shop",
    pageId: "page_1",
    pageTitle: "Home",
    pagePath: "",
    locationId: null,
    versionId: "v1",
    versionNumber: 1,
    publishedAt: "2026-08-01T00:00:00Z",
    content: { version: 2, sections: [] },
    nav: null,
    theme: null,
    siteSeo: null,
    logoUrl: null,
    features: null,
    brand: null,
    addressedBySubdomain: true,
    ...overrides,
  };
}

const metadata = (overrides: Record<string, unknown> = {}) => {
  resolveRenderMode.mockResolvedValue(decision(overrides));
  return builtSiteMetadata("joes-coffee-shop", "", { hasActiveStorefront: false });
};

beforeEach(() => {
  resolveRenderMode.mockReset();
});

describe("builtSiteMetadata keeps our brand off the merchant's site", () => {
  it("emits no DexaPOS keywords and no DexaPOS favicon", async () => {
    const meta = await metadata();

    // `null`, not absent: an absent field inherits from the root layout.
    expect(meta?.keywords).toBeNull();
    expect(meta?.icons).toBeNull();
    expect(JSON.stringify(meta)).not.toContain("dexalogolight");
    expect(JSON.stringify(meta)).not.toContain("DEXA POS");
  });

  it("names the merchant as the application, not us", async () => {
    expect((await metadata())?.applicationName).toBe("Joes Coffee Shop");
  });

  it("uses the merchant's own logo as the icon when they have one", async () => {
    const meta = await metadata({ logoUrl: "https://cdn.test/joes-logo.png" });

    expect(meta?.icons).toEqual({
      icon: "https://cdn.test/joes-logo.png",
      shortcut: "https://cdn.test/joes-logo.png",
      apple: "https://cdn.test/joes-logo.png",
    });
  });
});

describe("builtSiteMetadata titles", () => {
  it("falls back to the site's own name, so no page is titled bare 'Home'", async () => {
    expect((await metadata())?.title).toEqual({ absolute: "Home — Joes Coffee Shop" });
  });

  it("prefers a stored suffix over the resolved name", async () => {
    const meta = await metadata({ siteSeo: { titleSuffix: "Joe's · Hamra" } });
    expect(meta?.title).toEqual({ absolute: "Home — Joe's · Hamra" });
  });

  it("does not repeat a name the page title already carries", async () => {
    const meta = await metadata({ pageTitle: "Joes Coffee Shop" });
    expect(meta?.title).toEqual({ absolute: "Joes Coffee Shop" });
  });
});

describe("builtSiteMetadata sharing cards", () => {
  it("never lets a merchant with no sharing image inherit ours", async () => {
    const meta = await metadata();

    // An absent `twitter` key inherits the root layout's card, which is our
    // marketing copy and our logo. It has to be present even when empty.
    expect(meta?.twitter).toBeDefined();
    expect(JSON.stringify(meta?.twitter)).not.toContain("dexalogolight");
    expect(JSON.stringify(meta?.twitter)).not.toContain("DEXA POS");
  });

  it("names the restaurant as the og:site_name", async () => {
    const meta = await metadata();
    expect((meta?.openGraph as { siteName?: string })?.siteName).toBe("Joes Coffee Shop");
  });
});
