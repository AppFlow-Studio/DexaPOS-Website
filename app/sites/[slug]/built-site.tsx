import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { cache, type ReactElement } from "react";

import PageRenderer, { SiteChrome } from "@/components/site-builder/PageRenderer";
import { collectBindings } from "@/lib/site-builder/bindings/collect";
import { resolveBindings } from "@/lib/site-builder/bindings/resolve";
import { emptyResolvedMap } from "@/lib/site-builder/bindings/resolved";
import { createSupabaseResolverSources } from "@/lib/site-builder/bindings/supabase-sources";
import { normalizePage } from "@/lib/site-builder/normalize";
import { buildPublicRenderContext } from "@/lib/site-builder/public-context";
import { resolveRenderMode } from "@/lib/site-builder/resolve-render-mode";
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
  const seo = (doc.seo ?? {}) as { title?: string; description?: string };
  const siteSeo = (decision.siteSeo ?? {}) as { titleSuffix?: string; description?: string };

  // The page's own title wins; the page *name* is the fallback, because a
  // merchant who never opened the SEO panel still deserves a real tab title
  // rather than the site's name repeated on every page.
  const title = seo.title?.trim() || decision.pageTitle?.trim() || undefined;
  const description = seo.description?.trim() || siteSeo.description?.trim() || undefined;
  const canonicalPath = path ? `/${path}` : "";

  return {
    title,
    description,
    alternates: { canonical: `/sites/${slug}${canonicalPath}` },
    openGraph: {
      title,
      description,
      url: `/sites/${slug}${canonicalPath}`,
      type: "website",
    },
  };
}

export async function renderBuiltSite(
  slug: string,
  path: string,
  { hasActiveStorefront }: { hasActiveStorefront: boolean },
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

  const { ctx, resolver, merchantId, deliveryPricingEnabled } =
    await buildPublicRenderContext(supabase, decision, basePath);

  // Published content is normalized on the way out as well as in: a version
  // written by an older build must render rather than throw on someone's live
  // site.
  const doc = normalizePage(decision.content);

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
          createSupabaseResolverSources(supabase, { deliveryPricingEnabled }),
        )
      ).map
    : emptyResolvedMap();

  return (
    <SiteChrome ctx={ctx}>
      <PageRenderer doc={doc} resolved={resolved} ctx={ctx} />
    </SiteChrome>
  );
}
