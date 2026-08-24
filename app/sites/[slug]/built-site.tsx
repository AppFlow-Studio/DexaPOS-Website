import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { cache, type ReactElement } from "react";

import PageRenderer, { SiteChrome } from "@/components/site-builder/PageRenderer";
import SiteAnalyticsScripts from "@/components/site-builder/tracking/SiteAnalyticsScripts";
import { collectBindings } from "@/lib/site-builder/bindings/collect";
import { resolveBindings } from "@/lib/site-builder/bindings/resolve";
import { emptyResolvedMap } from "@/lib/site-builder/bindings/resolved";
import { createSupabaseResolverSources } from "@/lib/site-builder/bindings/supabase-sources";
import { buildRestaurantJsonLd, soleLocation } from "@/lib/site-builder/json-ld";
import { normalizePage } from "@/lib/site-builder/normalize";
import { collectAssetIds } from "@/lib/site-builder/bindings/collect";
import { loadPublicAssetMap } from "@/lib/site-builder/asset-map";
import { buildPublicRenderContext } from "@/lib/site-builder/public-context";
import { sitePublicUrl } from "@/lib/site-builder/public-url";
import { resolveRenderMode } from "@/lib/site-builder/resolve-render-mode";
import {
  readSiteSettings,
  resolveSiteSeo,
  siteDisplayName,
} from "@/lib/site-builder/site-settings";
import { resolveTracking } from "@/lib/site-builder/tracking";
import { collectFormIds, formResolver, loadPublicFormMap } from "@/lib/site-builder/forms/form-map";
import { loadPublicEvents } from "@/lib/site-builder/events/event-map";
import { pageNeedsEvents } from "@/lib/site-builder/sections/registry";
import { createAnonSupabaseClient } from "@/lib/supabase/anon";

/**
 * The built website, served to the public.
 *
 * This is the piece that makes publishing mean anything: before it, `PublishPage`
 * wrote a correct, immutable, versioned snapshot that nothing rendered.
 *
 * **Renders as a genuine anonymous visitor** (`createAnonSupabaseClient`), not
 * with the service role. Every read is either an RLS-protected public policy or
 * a SECURITY DEFINER function anon may execute, so a missing grant breaks this
 * page in development rather than leaking in production.
 *
 * **Returns `null` to mean "not this site's job".** The storefront template and
 * the built site share a URL space, and the fork between them
 * (`resolveRenderMode`) can legitimately answer "template" — in which case the
 * caller carries on rendering the storefront exactly as it did before. That is
 * decision D1 in code: a location with a template storefront and no built site
 * is byte-for-byte unaffected by this file existing.
 */
/**
 * The routing decision for this request, resolved at most once.
 *
 * `generateMetadata` and the page component both need it, and Next calls them
 * separately — without this memo every built page would ask the database the
 * same question twice. Keyed on primitives only, so both callers actually hit
 * it; `cache()` keys on argument identity, which a freshly constructed Supabase
 * client would defeat (see `lib/site-builder/request-scope.ts`).
 */
const getSiteDecision = cache(
  async (slug: string, path: string, hasActiveStorefront: boolean) =>
    resolveRenderMode(createAnonSupabaseClient(), slug, path, hasActiveStorefront),
);

/**
 * Metadata for a built page, or `null` when this is not a built site.
 *
 * Without it a built page inherits the *storefront's* `generateMetadata` — so a
 * merchant's About page would be titled after their ordering storefront, and
 * the sub-path route had no metadata at all. The page's own `seo` block is the
 * whole reason the editor collects one.
 */
export async function builtSiteMetadata(
  slug: string,
  path: string,
  { hasActiveStorefront }: { hasActiveStorefront: boolean },
): Promise<Metadata | null> {
  const decision = await getSiteDecision(slug, path, hasActiveStorefront);
  if (decision.mode !== "builder") return null;

  const doc = normalizePage(decision.content);
  const seo = (doc.seo ?? {}) as {
    title?: string;
    description?: string;
    ogImageAssetId?: string;
    noindex?: boolean;
  };
  // Through the resolver, not a cast: this column has never had a writer, so
  // anything already in it arrived by hand and cannot be assumed well-formed.
  const siteSeo = resolveSiteSeo(decision.siteSeo);

  // The page's own title wins; the page *name* is the fallback, because a
  // merchant who never opened the SEO panel still deserves a real tab title
  // rather than the site's name repeated on every page.
  const pageTitle = seo.title?.trim() || decision.pageTitle?.trim() || undefined;
  const description = seo.description?.trim() || siteSeo.description?.trim() || undefined;

  // What this website calls itself, through the one shared precedence function
  // so the tab title cannot disagree with the name rendered in the header.
  const { brand } = readSiteSettings({ brand: decision.brand });
  const siteName = siteDisplayName({
    brandName: brand.name,
    merchantName: decision.merchantName,
  });

  /**
   * The merchant's own suffix, not ours.
   *
   * The root layout sets a title template of "%s — DEXA POS", which is correct
   * for the dashboard and wrong on a restaurant's own website — it put our
   * brand in their browser tab and in every link they shared. `absolute` is
   * what opts out of an inherited template, so it is used even when there is
   * nothing to append.
   *
   * With no suffix stored the site's own name is the default, because
   * `<title>Home</title>` names nobody: a merchant who has never opened an SEO
   * panel still gets "Home — Joes Coffee Shop" in a search result and a
   * shared link. Skipped when the page title already carries the name, so a
   * page called "Joes Coffee Shop" is not titled twice over.
   */
  const suffix = siteSeo.titleSuffix?.trim() || siteName;
  const suffixIsRedundant =
    !suffix || (pageTitle?.toLowerCase().includes(suffix.toLowerCase()) ?? false);
  const title = pageTitle
    ? { absolute: suffixIsRedundant ? pageTitle : `${pageTitle} — ${suffix}` }
    : undefined;

  // Canonical is the brand subdomain, never `/sites/{slug}` — see
  // `sitePublicUrl`. `slug` is the subdomain here: the fork only reaches
  // `mode: "builder"` for a brand address.
  const canonical = sitePublicUrl(slug, path);

  /**
   * The sharing image, resolved from the library, falling back to the site's
   * own logo.
   *
   * One extra round trip, and only when the merchant has actually chosen an
   * image — `loadPublicAssetMap` short-circuits on an empty id list. The
   * fallback matters more than the field does: a link with no preview image
   * gets a blank card in every messaging app there is, and a restaurant's logo
   * is better than nothing every time.
   */
  const ogImage = seo.ogImageAssetId
    ? (
        await loadPublicAssetMap(createAnonSupabaseClient(), decision.merchantId, [
          seo.ogImageAssetId,
        ])
      ).get(seo.ogImageAssetId)?.url
    : undefined;

  const image = ogImage ?? decision.logoUrl ?? undefined;

  /**
   * Everything else the root layout would otherwise lend this page.
   *
   * `title` was escaped above and the reason applies just as strongly to the
   * rest of `app/layout.tsx`: without these three, a restaurant's website
   * served the DexaPOS logo as its favicon, called itself "DEXA POS" as its
   * application name, and carried our sales keywords — "quick-service POS",
   * "kitchen display system" — in the head of a page about someone's pizza.
   *
   * `null`, not `undefined`: an absent field inherits from the parent layout,
   * and only an explicit null removes it. Anyone adding a field to the root
   * layout's metadata needs to decide here whether a merchant should inherit
   * it. The default answer is no.
   */
  return {
    title,
    description,
    applicationName: siteName,
    // We have no honest keywords for someone else's restaurant, and the tag is
    // worth nothing to search engines anyway. Emitting *ours* is the harm.
    keywords: null,
    // The merchant's own logo, or no icon at all and the browser's default
    // letter — never ours. The URL is already absolute (a CDN URL), which
    // matters because `metadataBase` is dexaposai.com.
    icons: decision.logoUrl
      ? { icon: decision.logoUrl, shortcut: decision.logoUrl, apple: decision.logoUrl }
      : null,
    alternates: { canonical },
    // A merchant can take one page out of search results without unpublishing
    // it — a booking confirmation or a page shared only by link. `follow` stays
    // on: the page's own links to the rest of the site are still worth crawling.
    ...(seo.noindex ? { robots: { index: false, follow: true } } : {}),
    openGraph: {
      title: title?.absolute,
      description,
      url: canonical,
      type: "website",
      siteName: siteName,
      ...(image ? { images: [image] } : {}),
    },
    /**
     * Always emitted, even with no image to put in it.
     *
     * This used to be conditional on `image`, and an absent `twitter` key
     * inherits the root layout's — so a merchant with no sharing image had
     * their page shared as "DEXA POS — Restaurant operations, simplified."
     * with our logo on the card. The card type follows the image: `summary`
     * without one, which is what Twitter renders for a link with no art.
     */
    twitter: {
      card: image ? ("summary_large_image" as const) : ("summary" as const),
      title: title?.absolute,
      description,
      ...(image ? { images: [image] } : {}),
    },
  };
}

export async function renderBuiltSite(
  slug: string,
  path: string,
  {
    hasActiveStorefront,
    formState,
  }: {
    hasActiveStorefront: boolean;
    /**
     * The outcome of a form post that has just redirected back here.
     *
     * Read from the query string by the route and passed in rather than reached
     * for inside a section, because sections perform no I/O and receive no
     * request — and because a page may carry two forms, so the id has to be
     * compared rather than a boolean passed down.
     */
    formState?: { submitted?: string | null; error?: string | null };
  },
): Promise<ReactElement | null> {
  const supabase = createAnonSupabaseClient();
  const decision = await getSiteDecision(slug, path, hasActiveStorefront);

  switch (decision.mode) {
    case "template":
      return null;

    // The site is live but nothing is published here. A built 404 rather than
    // a fall-through to the template: mixing the two on one site is worse than
    // a clean miss.
    case "builder_not_found":
      notFound();

    case "not_found":
      // Only reachable at a brand subdomain, where there is no storefront to
      // fall back to. A storefront slug that resolves to nothing is left to the
      // caller, which already knows how to 404.
      if (!hasActiveStorefront) notFound();
      return null;
  }

  // The site is at the host root when the visitor arrived via its own
  // subdomain, and under /sites/{slug} otherwise. Getting this wrong makes
  // every internal link on the page point somewhere that does not exist.
  const host = (await headers()).get("host") ?? "";
  const viaSubdomain = host.split(":")[0].split(".")[0] === slug;
  const basePath = viaSubdomain ? "" : `/sites/${slug}`;

  // Published content is normalized on the way out as well as in: a version
  // written by an older build must render rather than throw on someone's live
  // site. It happens before the context is built because the asset ids are read
  // off the repaired document — a section dropped by normalization must not
  // have its photograph fetched.
  const doc = normalizePage(decision.content);

  const { ctx, resolver, merchantId, deliveryPricingEnabled } =
    await buildPublicRenderContext(supabase, decision, basePath, collectAssetIds(doc));

  // Forms this page embeds. A separate round trip from the asset map because it
  // is a different read path — the SECURITY DEFINER form function, which serves
  // only PUBLISHED definitions, so a merchant editing a form does not change
  // what live visitors are filling in until they publish it.
  // Forms and events are independent round trips, so they overlap. Events are
  // only fetched when the page actually carries an event-backed section — most
  // pages do not, and this is a whole extra query.
  //
  // Asked of the registry rather than matched against one kind by name: the
  // literal this replaced silently excluded `featured-event`, which would have
  // rendered against an empty list on a live site with nothing reporting it.
  const wantsEvents = pageNeedsEvents(doc.sections);

  const [forms, events] = await Promise.all([
    loadPublicFormMap(supabase, decision.siteId, collectFormIds(doc)),
    wantsEvents ? loadPublicEvents(supabase, decision.siteId) : Promise.resolve([]),
  ]);

  const publicCtx = {
    ...ctx,
    resolveForm: formResolver(forms),
    formState,
    events,
    eventUrl: (eventSlug: string) => `${basePath}/events/${eventSlug}`,
  };

  // No storefront to borrow a location from means nothing to resolve against.
  // An empty map is the same thing every binding already handles as
  // "unavailable", so menu sections render without items instead of erroring.
  const resolved = resolver.locationId
    ? (
        await resolveBindings(
          collectBindings(doc),
          {
            merchantId,
            locationId: resolver.locationId,
            scoped: resolver.scoped,
          },
          createSupabaseResolverSources(supabase, {
            deliveryPricingEnabled,
            // Anon cannot read `locations`; go through the public projection.
            publicMerchantId: merchantId,
          }),
        )
      ).map
    : emptyResolvedMap();

  // Structured data, from what the page actually resolved rather than a second
  // query: the address and hours in the markup and the ones in the JSON-LD are
  // then the same facts by construction, and cannot drift into contradicting
  // each other.
  const jsonLd = JSON.stringify(
    buildRestaurantJsonLd({
      name: ctx.site.name,
      url: sitePublicUrl(slug, decision.pagePath),
      description: (decision.siteSeo as { description?: string } | null)?.description,
      image: ctx.site.logoUrl ?? ctx.site.heroImageUrl,
      location: soleLocation(resolved.locations),
      brand: ctx.site.brand,
      acceptsReservations: ctx.site.features.reservations,
    }),
  );

  return (
    <SiteChrome ctx={publicCtx}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd }} />
      {/*
        The merchant's own marketing pixels, on the built site and nowhere else.
        Re-validated here rather than trusted from the database — see
        `resolveTracking`, which is the boundary these values must not cross
        unchecked because they end up inside inline script source.
      */}
      <SiteAnalyticsScripts tracking={resolveTracking(decision.integrations)} />
      <PageRenderer doc={doc} resolved={resolved} ctx={publicCtx} />
    </SiteChrome>
  );
}
