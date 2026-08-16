import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getStorefrontMetaData } from "../../actions";
import { builtSiteMetadata, renderBuiltSite } from "../built-site";

/**
 * Every page of a built site except the home page.
 *
 * **A required catch-all, not an optional one.** PLAN-04 §2.1 sketched
 * `(builder)/[[...path]]`, but an optional catch-all matches the zero-segment
 * case too and therefore collides with the sibling `page.tsx` that already
 * serves the storefront — Next refuses two routes resolving to one path. A
 * required catch-all matches only `/sites/{slug}/something`, so the home page
 * stays with the storefront route (which delegates through the same fork) and
 * this handles the rest.
 *
 * **Reserved paths are handled by the router, not by a list.** Static segments
 * win over a dynamic catch-all in Next, so `/checkout`, `/info`, `/order/…` and
 * `/t/…` keep their existing routes and this never sees them.
 * `reserved-paths.ts` stops a merchant *creating* a page that would shadow one;
 * this is the second half of that guarantee.
 */

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ slug: string; path: string[] }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug, path } = await params;
  const { location } = await getStorefrontMetaData(slug);

  const built = await builtSiteMetadata(slug, path.join("/"), {
    hasActiveStorefront: !!location,
  });

  // Nothing published here — the page below 404s, so the title never shows.
  return built ?? {};
}

export default async function BuiltSitePathPage({ params }: PageProps) {
  const { slug, path } = await params;

  const { location } = await getStorefrontMetaData(slug);

  const built = await renderBuiltSite(slug, path.join("/"), {
    hasActiveStorefront: !!location,
  });

  // A template storefront has no sub-pages, so anything that reaches here and
  // is not a built page simply does not exist.
  if (!built) notFound();

  return built;
}
