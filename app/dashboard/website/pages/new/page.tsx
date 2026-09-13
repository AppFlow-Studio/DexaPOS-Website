import { resolveWebsiteOrgId } from "@/lib/site-builder/request-org";
import Link from "next/link";
import { redirect } from "next/navigation";

import { GetOrCreateSite } from "@/app/dashboard/website/actions/site";
import NewPageOverlay from "@/components/site-builder/dashboard/NewPageOverlay";
import { OwnerOnlyPage } from "@/components/site-builder/dashboard/OwnerOnlyPage";
import { isMerchantOwnerForOrg } from "@/lib/site-builder/owner";
import { loadSiteContext, resolveWebsiteLocation } from "@/lib/site-builder/site-context";
import { createServerSupabaseClient } from "@/lib/supabase/server";

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
  const orgId = await resolveWebsiteOrgId();
  if (!orgId) redirect("/sign-in");

  const params = await searchParams;

  // Follow the single/global/location flow. This is a deep route reached with a
  // location already chosen; if we land here on "All locations" (several
  // branches), send the user to the Pages picker to choose one first.
  const scope = await resolveWebsiteLocation(orgId, params.location);
  if (!scope || scope.kind === "no-storefront" || scope.kind === "pick") {
    redirect("/dashboard/website/pages");
  }

  const site = await loadSiteContext(orgId, scope.locationId);
  if (!site) redirect("/dashboard/website/pages");

  // Website editing is owner-only. Placed before `GetOrCreateSite` so a
  // non-owner never triggers the bootstrap write that brings a site into
  // existence — they only ever see the read-only notice.
  if (!(await isMerchantOwnerForOrg(orgId))) {
    return (
      <OwnerOnlyPage
        locationId={site.locationId}
        title="Creating pages is owner only"
        description="Only the store owner can add pages to the website."
      />
    );
  }

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

  // The branch's own name, for the "This location — <name>" label. Read from
  // `online_store_config` (the storefront) rather than the site display name,
  // which resolves to the brand name and would not identify the branch.
  const supabase = createServerSupabaseClient();
  const { data: storefront } = await supabase
    .from("online_store_config")
    .select("store_name")
    .eq("merchant_id", site.merchantId)
    .eq("location_id", scope.locationId)
    .maybeSingle();

  const locationName = (storefront as { store_name?: string } | null)?.store_name ?? undefined;

  return (
    <NewPageOverlay
      clerkOrgId={orgId}
      locationId={site.locationId}
      locationName={locationName}
      siteId={website.data.id}
    />
  );
}
