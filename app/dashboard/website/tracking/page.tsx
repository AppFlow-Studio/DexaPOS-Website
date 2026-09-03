import { resolveWebsiteOrgId } from "@/lib/site-builder/request-org";
import Link from "next/link";
import { redirect } from "next/navigation";

import TrackingScreen from "@/components/site-builder/dashboard/TrackingScreen";
import { Button } from "@/components/ui/button";
import type { MerchantSiteRow } from "@/lib/site-builder/db-types";
import { loadSiteContext } from "@/lib/site-builder/site-context";
import { resolveTracking } from "@/lib/site-builder/tracking";
import { createServerSupabaseClient } from "@/lib/supabase/server";

/**
 * Tracking — marketing pixels for the built site.
 *
 * Reads rather than creates, like Pages, Style and Settings.
 */

export const dynamic = "force-dynamic";

export default async function WebsiteTrackingRoute({
  searchParams,
}: {
  searchParams: Promise<{ location?: string }>;
}) {
  const orgId = await resolveWebsiteOrgId();
  if (!orgId) redirect("/sign-in");

  const params = await searchParams;
  const storefront = await loadSiteContext(orgId, params.location);
  if (!storefront) redirect("/dashboard/website/pages");

  const supabase = createServerSupabaseClient();
  const { data: website } = await supabase
    .from("merchant_sites")
    .select("*")
    .eq("merchant_id", storefront.merchantId)
    .maybeSingle();

  if (!website) return <NoSite locationId={storefront.locationId} />;

  const site = website as MerchantSiteRow;

  return (
    <TrackingScreen
      clerkOrgId={orgId}
      siteId={site.id}
      tracking={resolveTracking(site.integrations)}
      // `render_mode` only becomes `builder` on a first successful publish, so
      // this is the honest answer to "will these pixels record anything today".
      // Worth saying up front: a merchant who sets up a pixel, sees no data and
      // is not told why assumes the pixel field is broken.
      siteIsLive={site.render_mode === "builder" && Boolean(site.subdomain)}
    />
  );
}

function NoSite({ locationId }: { locationId: string }) {
  return (
    <div className="mx-auto max-w-xl p-8 sm:p-12">
      <h1 className="text-xl font-semibold">Create your website before adding tracking</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Start with a home page. Then you can add your Facebook, Google and TikTok pixels, and they
        will be included on every page.
      </p>
      <Button className="mt-5" asChild>
        <Link href={`/dashboard/website/pages/home?location=${encodeURIComponent(locationId)}`}>
          Create website
        </Link>
      </Button>
    </div>
  );
}
