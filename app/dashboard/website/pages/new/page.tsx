import { resolveWebsiteOrgId } from "@/lib/site-builder/request-org";
import Link from "next/link";
import { redirect } from "next/navigation";

import { GetOrCreateSite } from "@/app/dashboard/website/actions/site";
import NewPageOverlay from "@/components/site-builder/dashboard/NewPageOverlay";
import { OwnerOnlyPage } from "@/components/site-builder/dashboard/OwnerOnlyPage";
import { isMerchantOwnerForOrg } from "@/lib/site-builder/owner";
import { loadSiteContext } from "@/lib/site-builder/site-context";
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
  const site = await loadSiteContext(orgId, params.location);
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

  // The branches a page may be scoped to. Read from `online_store_config` (not
  // `locations`) so the offered set is exactly what `resolvePricingLocation`
  // accepts at render time — the same source the Settings default-location list
  // uses. A location page shows that branch's hours, address and prices; a brand
  // page (the default) speaks for the whole business.
  const supabase = createServerSupabaseClient();
  const { data: storefronts } = await supabase
    .from("online_store_config")
    .select("location_id, store_name")
    .eq("merchant_id", site.merchantId)
    .eq("is_active", true);

  const locations = ((storefronts ?? []) as Record<string, unknown>[]).map((row) => ({
    id: String(row.location_id),
    name: String(row.store_name ?? "Untitled location"),
  }));

  return (
    <NewPageOverlay
      clerkOrgId={orgId}
      locationId={site.locationId}
      siteId={website.data.id}
      locations={locations}
    />
  );
}
