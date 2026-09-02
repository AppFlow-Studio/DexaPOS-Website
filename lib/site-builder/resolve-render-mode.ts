/**
 * The routing fork — blocker **B3** / decision **D5**.
 *
 * The builder and the four storefront templates coexist and render into the
 * same URL space. Something has to choose, and this is the only place that
 * choice is made. When someone later asks "why is this merchant seeing the old
 * site", there is exactly one file to read.
 *
 * **The decision is pure.** `decideRenderMode` is a function of facts, so every
 * rule below has a unit test with no database in sight. Fetching those facts is
 * `loadSiteRequestFacts`, which is a single call to the `get_public_site_page`
 * SECURITY DEFINER function — the only public read path into the website
 * tables, and one that cannot return a draft (plan §0.3).
 *
 * **The namespace is flat.** A brand subdomain and a storefront slug are
 * interchangeable keys here, because the database refuses to let them collide
 * in either direction. That is what keeps this `(slug, path)` rather than
 * forcing host parsing into the routing layer.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type RenderDecision =
  /** Serve the existing storefront template. Nothing about it changes. */
  | { mode: "template"; reason: TemplateReason }
  /** Serve the built page. */
  | {
      mode: "builder";
      siteId: string;
      merchantId: string;
      /** `merchants.name` — the display fallback for the site's own name. */
      merchantName: string | null;
      pageId: string;
      pageTitle: string;
      pagePath: string;
      /** NULL for a brand page — the input `canShowPrices` needs. */
      locationId: string | null;
      versionId: string;
      versionNumber: number;
      publishedAt: string;
      content: unknown;
      nav: unknown;
      theme: unknown;
      siteSeo: unknown;
      /** The website's own logo, already resolved to a URL. Null falls back. */
      logoUrl: string | null;
      /** `merchant_sites.features` — raw. Read through `resolveFeatures`. */
      features: unknown;
      /** `merchant_sites.brand` — raw. Read through `resolveBrand`. */
      brand: unknown;
      /** `merchant_sites.integrations` — raw. Read through `resolveTracking`. */
      integrations: unknown;
    }
  /** The site is live but has nothing at this path — a built 404, not a template. */
  | { mode: "builder_not_found"; siteId: string }
  /** Nothing answers on this address at all. */
  | { mode: "not_found"; reason: NotFoundReason };

export type TemplateReason =
  | "storefront_address"
  | "no_site"
  | "render_mode_template"
  | "nothing_published";

export type NotFoundReason =
  | "unknown_address"
  | "subdomain_without_published_site";

/** Everything the fork needs, and nothing it does not. */
export interface SiteRequestFacts {
  /** An active storefront answers on this slug. */
  hasActiveStorefront: boolean;
  site: {
    id: string;
    merchantId: string;
    /**
     * `merchants.name`, the display fallback when the merchant has set no
     * business name of their own. Null only if the join found nothing, which
     * the FK makes impossible in practice.
     */
    merchantName: string | null;
    renderMode: "template" | "builder";
    /** Pages with a live version, across the whole site. Drives rule 5. */
    publishedPageCount: number;
    nav: unknown;
    theme: unknown;
    siteSeo: unknown;
    /**
     * The website's own logo, already resolved to a URL by the RPC.
     *
     * Optional here and required on the decision: a merchant who has never set
     * one has no logo fact at all, and the decision normalises that to null so
     * the renderer has one shape to read rather than two.
     */
    logoUrl?: string | null;
    /**
     * The two settings blocks, raw.
     *
     * Optional for the same reason as `logoUrl`: a fixture written before these
     * columns existed still describes a valid site, and `resolveFeatures` /
     * `resolveBrand` turn `undefined` into the same "nothing set" every other
     * missing value resolves to.
     */
    features?: unknown;
    brand?: unknown;
    integrations?: unknown;
  } | null;
  /** True when the slug matched a brand subdomain rather than a storefront. */
  addressedBySubdomain: boolean;
  /** The published page at the requested path, if there is one. */
  page: {
    id: string;
    title: string;
    path: string;
    locationId: string | null;
    versionId: string;
    versionNumber: number;
    publishedAt: string;
    content: unknown;
  } | null;
}

/**
 * PLAN-04 §2's rules, corrected for the 2026-08-15 site-granularity change.
 *
 * **A built site is served at its own subdomain and nowhere else.** This is the
 * rule the original five did not have, because they were written when a site
 * was per-location and a storefront slug therefore identified one. It is not:
 * `online_store_config.slug` is per *location*, so resolving a storefront slug
 * to its merchant's site meant that flipping one `render_mode` would replace
 * **every** branch's ordering page with a single brand home page. A
 * five-location merchant publishing once would have taken down five live
 * ordering storefronts.
 *
 * That is precisely what decision §0.1 ratified against — "the existing
 * per-location slugs keep serving the ordering storefront untouched" — and it
 * is what D1 requires, so the storefront address always wins here.
 *
 * The happy consequence is that the old fail-safe reasoning becomes structural
 * rather than conditional. There is no longer any way for the builder to take a
 * working storefront down, because the builder never occupies a storefront's
 * address in the first place.
 *
 * A brand subdomain gets no template fallback for the mirror-image reason: the
 * templates live at storefront slugs, so there is nothing behind that address
 * to fall back *to*. It 404s rather than serving one arbitrary branch's
 * ordering page at the brand's URL.
 */
export function decideRenderMode(facts: SiteRequestFacts): RenderDecision {
  const { site, page, hasActiveStorefront, addressedBySubdomain } = facts;

  // Nothing answers here at all.
  if (!hasActiveStorefront && !addressedBySubdomain) {
    return { mode: "not_found", reason: "unknown_address" };
  }

  // An ordering storefront's address always serves ordering. No state of the
  // built site can change what a merchant's existing URLs do.
  if (!addressedBySubdomain) {
    return { mode: "template", reason: "storefront_address" };
  }

  // From here the request arrived at a brand subdomain, which only a built site
  // can answer.
  const unbuilt = (): RenderDecision => ({
    mode: "not_found",
    reason: "subdomain_without_published_site",
  });

  if (!site) return unbuilt();
  if (site.renderMode !== "builder") return unbuilt();
  if (site.publishedPageCount === 0) return unbuilt();

  // The site is live, this path is not. A built 404 rather than a template:
  // mixing the two on one site is worse than a clean miss.
  if (!page) return { mode: "builder_not_found", siteId: site.id };

  return {
    mode: "builder",
    siteId: site.id,
    merchantId: site.merchantId,
    merchantName: site.merchantName ?? null,
    pageId: page.id,
    pageTitle: page.title,
    pagePath: page.path,
    locationId: page.locationId,
    versionId: page.versionId,
    versionNumber: page.versionNumber,
    publishedAt: page.publishedAt,
    content: page.content,
    nav: site.nav,
    theme: site.theme,
    siteSeo: site.siteSeo,
    logoUrl: site.logoUrl ?? null,
    features: site.features ?? null,
    brand: site.brand ?? null,
    integrations: site.integrations ?? null,
  };
}

/** The shape `get_public_site_page` returns. */
interface PublicSitePageRow {
  site_id: string;
  merchant_id: string;
  merchant_name: string | null;
  render_mode: string;
  addressed_by_subdomain: boolean;
  published_page_count: number;
  site_nav: unknown;
  site_theme: unknown;
  site_seo: unknown;
  site_logo_url: string | null;
  site_features: unknown;
  site_brand: unknown;
  site_integrations: unknown;
  page_id: string | null;
  page_title: string | null;
  page_path: string | null;
  page_location_id: string | null;
  version_id: string | null;
  version_number: number | null;
  version_published_at: string | null;
  content: unknown;
}

/**
 * Reads the facts for one public request.
 *
 * `hasActiveStorefront` is passed in rather than re-derived: the storefront
 * route has already resolved it, and `online_store_config` is anon-readable
 * through its own policy, so asking twice would be a round trip for an answer
 * the caller is holding.
 */
export async function loadSiteRequestFacts(
  supabase: SupabaseClient,
  slug: string,
  path: string,
  hasActiveStorefront: boolean,
): Promise<SiteRequestFacts> {
  // An active storefront answers this address, and a built site never can, so
  // there is nothing here worth a round trip. This is what keeps decision D1
  // true of performance as well as of output: an ordering storefront costs
  // exactly what it cost before the builder existed.
  if (hasActiveStorefront) {
    return { hasActiveStorefront, site: null, addressedBySubdomain: false, page: null };
  }

  const { data, error } = await supabase.rpc("get_public_site_page", {
    p_slug: slug,
    p_path: path,
  });

  if (error) {
    // A built site that cannot be read must not take the storefront down with
    // it. Reporting "no site" lands on rule 2, which serves the template.
    console.error(`[site-builder] public read failed for ${slug}/${path}:`, error.message);
    return { hasActiveStorefront, site: null, addressedBySubdomain: false, page: null };
  }

  const row = (data as PublicSitePageRow[] | null)?.[0];
  if (!row) {
    return { hasActiveStorefront, site: null, addressedBySubdomain: false, page: null };
  }

  return {
    hasActiveStorefront,
    addressedBySubdomain: row.addressed_by_subdomain,
    site: {
      id: row.site_id,
      merchantId: row.merchant_id,
      merchantName: row.merchant_name ?? null,
      renderMode: row.render_mode === "builder" ? "builder" : "template",
      publishedPageCount: row.published_page_count,
      nav: row.site_nav,
      theme: row.site_theme,
      siteSeo: row.site_seo,
      logoUrl: row.site_logo_url ?? null,
      features: row.site_features,
      brand: row.site_brand,
      integrations: row.site_integrations,
    },
    page:
      row.page_id && row.version_id
        ? {
            id: row.page_id,
            title: row.page_title ?? "",
            path: row.page_path ?? "",
            locationId: row.page_location_id,
            versionId: row.version_id,
            versionNumber: row.version_number ?? 0,
            publishedAt: row.version_published_at ?? "",
            content: row.content,
          }
        : null,
  };
}

/** Convenience: fetch and decide in one call. */
export async function resolveRenderMode(
  supabase: SupabaseClient,
  slug: string,
  path: string,
  hasActiveStorefront: boolean,
): Promise<RenderDecision> {
  return decideRenderMode(await loadSiteRequestFacts(supabase, slug, path, hasActiveStorefront));
}
