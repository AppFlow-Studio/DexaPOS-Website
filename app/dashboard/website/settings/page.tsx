import { resolveWebsiteOrgId } from "@/lib/site-builder/request-org";
import Link from "next/link";
import { redirect } from "next/navigation";

import { OwnerOnlyPage } from "@/components/site-builder/dashboard/OwnerOnlyPage";
import SettingsScreen from "@/components/site-builder/dashboard/SettingsScreen";
import { WebsiteLocationPicker } from "@/components/site-builder/dashboard/WebsiteLocationPicker";
import { Button } from "@/components/ui/button";
import { isMerchantOwnerForOrg } from "@/lib/site-builder/owner";
import type { MerchantSiteRow } from "@/lib/site-builder/db-types";
import { fetchMerchant, loadSiteContext, resolveWebsiteLocation } from "@/lib/site-builder/site-context";
import { readSiteSettings, resolveSiteSeo } from "@/lib/site-builder/site-settings";
import { createServerSupabaseClient } from "@/lib/supabase/server";

/**
 * Website settings — the brand layer.
 *
 * The screen that answers *whether*: which capabilities this restaurant has,
 * where its accounts are, and how a visitor who has not chosen a branch is
 * treated. The page editor answers *where* and *what it says*, and the two must
 * not overlap: a merchant who has to set their Instagram address on four pages
 * has been given four chances to get it wrong.
 *
 * Reads rather than creates, like Pages and Style. Opening settings is not a
 * merchant asking for a website to exist.
 */

export const dynamic = "force-dynamic";

export default async function WebsiteSettingsRoute({
  searchParams,
}: {
  searchParams: Promise<{ location?: string }>;
}) {
  const orgId = await resolveWebsiteOrgId();
  if (!orgId) redirect("/sign-in");

  const params = await searchParams;

  const scope = await resolveWebsiteLocation(orgId, params.location);
  if (!scope || scope.kind === "no-storefront") redirect("/dashboard/website/pages");
  if (scope.kind === "pick") return <WebsiteLocationPicker locations={scope.locations} />;

  const storefront = await loadSiteContext(orgId, scope.locationId);
  if (!storefront) redirect("/dashboard/website/pages");

  // Website editing is owner-only. Settings are a pure editing surface, so a
  // non-owner sees the read-only notice rather than the settings screen.
  if (!(await isMerchantOwnerForOrg(orgId))) {
    return (
      <OwnerOnlyPage
        locationId={storefront.locationId}
        title="Settings are view only"
        description="Only the store owner can change website settings."
      />
    );
  }

  // Shares `loadSiteContext`'s memo, so this is a read of an already-fetched
  // row rather than a second round trip.
  const merchant = await fetchMerchant(orgId);

  const supabase = createServerSupabaseClient();

  const [{ data: website }, { data: storefronts }] = await Promise.all([
    supabase
      .from("merchant_sites")
      .select("*")
      .eq("merchant_id", storefront.merchantId)
      .maybeSingle(),
    /**
     * The branches a default may point at.
     *
     * Read from `online_store_config` rather than `locations` deliberately: this
     * list must be exactly the set `resolvePricingLocation` will accept at
     * render time, and that one checks the storefronts a public page can
     * actually resolve against. Offering a location here that the renderer would
     * then reject is how a merchant ends up with a setting that silently does
     * nothing.
     */
    supabase
      .from("online_store_config")
      .select("location_id, store_name")
      .eq("merchant_id", storefront.merchantId)
      .eq("is_active", true),
  ]);

  if (!website) return <NoSite locationId={storefront.locationId} />;

  const site = website as MerchantSiteRow;
  const { features, brand } = readSiteSettings(site);
  const seo = resolveSiteSeo(site.site_seo);

  const locations = ((storefronts ?? []) as Record<string, unknown>[]).map((row) => ({
    id: String(row.location_id),
    name: String(row.store_name ?? "Untitled location"),
  }));

  return (
    <SettingsScreen
      clerkOrgId={orgId}
      siteId={site.id}
      features={features}
      brand={brand}
      seo={seo}
      locations={locations}
      merchantName={merchant?.name?.trim() || "Your restaurant"}
    />
  );
}

function NoSite({ locationId }: { locationId: string }) {
  return (
    <div className="mx-auto max-w-xl p-8 sm:p-12">
      <h1 className="text-xl font-semibold">Create your website before changing its settings</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Start with a home page. Then you can choose which features your website offers, and the
        details every page shows.
      </p>
      <Button className="mt-5" asChild>
        <Link href={`/dashboard/website/pages/home?location=${encodeURIComponent(locationId)}`}>
          Create website
        </Link>
      </Button>
    </div>
  );
}
