import { auth } from "@clerk/nextjs/server";
import Link from "next/link";
import { redirect } from "next/navigation";

import { GetOrCreateSite } from "@/app/dashboard/website/actions/site";
import NewPageOverlay from "@/components/site-builder/dashboard/NewPageOverlay";
import { loadSiteContext } from "@/lib/site-builder/site-context";

/**
 * Creating a page.
 *
 * `GetOrCreateSite` rather than `GetSite`: a merchant who reaches for "New Page"
 * has unambiguously asked for a website, so this is one of the two places
 * allowed to bring one into existence. The page list, which a merchant may open
 * out of curiosity, is not.
 */

export const dynamic = "force-dynamic";

export default async function NewPageRoute({
  searchParams,
}: {
  searchParams: Promise<{ location?: string }>;
}) {
  const { orgId } = await auth();
  if (!orgId) redirect("/sign-in");

  const params = await searchParams;
  const site = await loadSiteContext(orgId, params.location);
  if (!site) redirect("/dashboard/website/pages");

  const website = await GetOrCreateSite(orgId, site.locationId);
  if (!website.data) {
    return (
      <div className="mx-auto max-w-xl p-8 sm:p-12">
        <h1 className="text-xl font-semibold">Could not open your website</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {website.error ?? "The website record could not be loaded."}
        </p>
        <Link
          href="/dashboard/website/pages"
          className="mt-5 inline-flex h-9 items-center rounded-md border px-4 text-sm font-medium transition-colors hover:bg-accent"
        >
          Back to Pages
        </Link>
      </div>
    );
  }

  return (
    <NewPageOverlay clerkOrgId={orgId} locationId={site.locationId} siteId={website.data.id} />
  );
}
