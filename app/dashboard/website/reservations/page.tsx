import { auth } from "@clerk/nextjs/server";
import Link from "next/link";
import { redirect } from "next/navigation";

import { GetReservationConfig } from "@/app/dashboard/website/actions/reservations-settings";
import ReservationsScreen from "@/components/site-builder/dashboard/ReservationsScreen";
import { Button } from "@/components/ui/button";
import type { MerchantSiteRow } from "@/lib/site-builder/db-types";
import { loadSiteContext } from "@/lib/site-builder/site-context";
import {
  readSiteSettings,
  resolveReservationApproval,
  resolveReservationMode,
} from "@/lib/site-builder/site-settings";
import { createServerSupabaseClient } from "@/lib/supabase/server";

/**
 * Everything about reservations, on one screen.
 *
 * **The master switch lives here, not in Website settings.** It used to sit in
 * the Features card two screens away, which meant a merchant met two different
 * on/off controls — one for the website, one per branch — with nothing on
 * either screen saying which was in charge. For a single-location merchant they
 * were simply the same switch twice. Now the site-wide one is the first thing
 * on this page and the branches sit underneath it, so the hierarchy is visible
 * rather than something you have to be told.
 *
 * Reads rather than creates, like Settings and Pages: opening this is not a
 * merchant asking for a website to exist.
 */

export const dynamic = "force-dynamic";

export default async function WebsiteReservationsRoute({
  searchParams,
}: {
  searchParams: Promise<{ location?: string }>;
}) {
  const { orgId } = await auth();
  if (!orgId) redirect("/sign-in");

  const params = await searchParams;
  const storefront = await loadSiteContext(orgId, params.location);
  if (!storefront) redirect("/dashboard/website/pages");

  const supabase = createServerSupabaseClient();

  const [{ data: website }, config] = await Promise.all([
    supabase
      .from("merchant_sites")
      .select("*")
      .eq("merchant_id", storefront.merchantId)
      .maybeSingle(),
    GetReservationConfig(orgId),
  ]);

  if (!website) return <NoSite locationId={storefront.locationId} />;

  const site = website as MerchantSiteRow;
  const settings = readSiteSettings(site);
  const enabled = resolveReservationMode(settings) === "native";
  // Read independently of `enabled`: the stored answer survives the master
  // switch being turned off and on, so a merchant does not silently lose it.
  const approval = resolveReservationApproval(settings);

  if (config.error) {
    return (
      <div className="mx-auto max-w-xl p-8 sm:p-12">
        <h1 className="text-xl font-semibold">We could not load your reservation settings</h1>
        <p className="mt-2 text-sm text-muted-foreground">{config.error}</p>
      </div>
    );
  }

  return (
    <ReservationsScreen
      clerkOrgId={orgId}
      siteId={site.id}
      initialConfig={config.data ?? []}
      initialEnabled={enabled}
      initialApproval={approval}
    />
  );
}

function NoSite({ locationId }: { locationId: string }) {
  return (
    <div className="mx-auto max-w-xl p-8 sm:p-12">
      <h1 className="text-xl font-semibold">Create your website before taking bookings</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Start with a home page. Then you can turn reservations on and set the times you seat
        guests.
      </p>
      <Button className="mt-5" asChild>
        <Link href={`/dashboard/website/pages/home?location=${encodeURIComponent(locationId)}`}>
          Create website
        </Link>
      </Button>
    </div>
  );
}
