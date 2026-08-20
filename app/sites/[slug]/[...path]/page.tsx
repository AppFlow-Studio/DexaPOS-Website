import type { Metadata } from "next";
import { notFound } from "next/navigation";

import {
  FORM_ERROR_PARAM,
  FORM_SUBMITTED_PARAM,
} from "@/lib/site-builder/forms/protocol";
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
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
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

export default async function BuiltSitePathPage({ params, searchParams }: PageProps) {
  const { slug, path } = await params;

  const { location } = await getStorefrontMetaData(slug);

  const built = await renderBuiltSite(slug, path.join("/"), {
    hasActiveStorefront: !!location,
    formState: await readFormState(searchParams),
  });

  // A template storefront has no sub-pages, so anything that reaches here and
  // is not a built page simply does not exist.
  if (!built) notFound();

  return built;
}

/**
 * The outcome of a form post, read off the query string.
 *
 * Both values are form ids echoed back by the submit handler, so they are
 * compared against a rendered form's own id rather than trusted — a crafted
 * `?submitted=` cannot make an arbitrary form claim it was sent.
 */
async function readFormState(
  searchParams: Promise<Record<string, string | string[] | undefined>> | undefined,
): Promise<{ submitted?: string | null; error?: string | null } | undefined> {
  if (!searchParams) return undefined;
  const params = await searchParams;
  const one = (value: string | string[] | undefined) =>
    typeof value === "string" ? value : null;

  return {
    submitted: one(params[FORM_SUBMITTED_PARAM]),
    error: one(params[FORM_ERROR_PARAM]),
  };
}
