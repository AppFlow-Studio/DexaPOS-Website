import { resolveWebsiteOrgId } from "@/lib/site-builder/request-org";
import { redirect } from "next/navigation";

import PagesScreen from "@/components/site-builder/dashboard/PagesScreen";
import { WebsiteLocationPicker } from "@/components/site-builder/dashboard/WebsiteLocationPicker";
import { FeaturePaywall } from "@/components/billing/FeaturePaywall";
import type { MerchantSiteRow, SitePageSummary } from "@/lib/site-builder/db-types";
import { loadSiteContext, resolveWebsiteLocation } from "@/lib/site-builder/site-context";
import { createServerSupabaseClient } from "@/lib/supabase/server";

/**
 * The Website landing screen — the list of the merchant's pages.
 *
 * Reads rather than creates. Opening the page list must not be what brings a
 * merchant's website into existence; `GetOrCreateSite` belongs to the editor,
 * which is where a merchant has actually asked for one.
 */

export const dynamic = "force-dynamic";

export default async function WebsitePagesRoute({
  searchParams,
}: {
  searchParams: Promise<{ location?: string }>;
}) {
  const orgId = await resolveWebsiteOrgId();
  if (!orgId) redirect("/sign-in");

  const params = await searchParams;

  // Follow the standard single/global/location flow: a specific branch (param or
  // switcher cookie) or a single-location gate resolves directly; "All locations"
  // with several branches shows the picker, since website pages/prices are
  // per-branch.
  const scope = await resolveWebsiteLocation(orgId, params.location);
  if (!scope || scope.kind === "no-storefront") return <NoStorefront />;
  if (scope.kind === "pick") return <WebsiteLocationPicker locations={scope.locations} />;

  const site = await loadSiteContext(orgId, scope.locationId);
  if (!site) return <NoStorefront />;

  const { website, pages, locations } = await loadPages(site.merchantId, scope.locationId);

  return (
    <FeaturePaywall
      serviceCode="website_builder"
      locationId={site.locationId}
      clerkOrgId={orgId}
      title="Website Builder"
      description="Build and publish a branded marketing website — pages, styling, forms, and events — for this location."
      grandfathered={Boolean(website) || pages.length > 0}
    >
      <PagesScreen
        clerkOrgId={orgId}
        locationId={site.locationId}
        website={website}
        storeName={site.name}
        pages={pages}
        locations={locations}
      />
    </FeaturePaywall>
  );
}

async function loadPages(
  merchantId: string,
  activeLocationId: string,
): Promise<{
  website: MerchantSiteRow | null;
  pages: SitePageSummary[];
  locations: { id: string; name: string }[];
}> {
  try {
    const supabase = createServerSupabaseClient();

    const { data: website } = await supabase
      .from("merchant_sites")
      .select("*")
      .eq("merchant_id", merchantId)
      .maybeSingle();

    if (!website) return { website: null, pages: [], locations: [] };

    const [{ data: pages }, { data: storefronts }] = await Promise.all([
      supabase
        .from("site_pages")
        .select(
          // location_id decides whether a page is brand-wide or a location page —
          // shown as a badge in the list so a merchant can tell them apart.
          "id, site_id, merchant_id, location_id, path, title, is_home, status, revision, published_version_id, published_at, created_at, updated_at",
        )
        .eq("site_id", (website as MerchantSiteRow).id)
        .neq("status", "archived")
        // Location-focused: show brand pages (location_id null) plus the branch
        // currently being managed, never another branch's pages.
        .or(`location_id.is.null,location_id.eq.${activeLocationId}`)
        .order("is_home", { ascending: false })
        .order("title", { ascending: true }),
      supabase
        .from("online_store_config")
        .select("location_id, store_name")
        .eq("merchant_id", merchantId)
        .eq("is_active", true),
    ]);

    const locations = ((storefronts ?? []) as Record<string, unknown>[]).map((row) => ({
      id: String(row.location_id),
      name: String(row.store_name ?? "Untitled location"),
    }));

    return {
      website: website as MerchantSiteRow,
      pages: (pages ?? []) as SitePageSummary[],
      locations,
    };
  } catch {
    return { website: null, pages: [], locations: [] };
  }
}

function NoStorefront() {
  return (
    <div className="mx-auto max-w-xl p-8 sm:p-12">
      <h1 className="text-xl font-semibold">Set up an Online Store first</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Your Website uses your restaurant&rsquo;s location, branding, and Order Online destination.
        Once an Online Store is configured, you can start building your site here.
      </p>
    </div>
  );
}
