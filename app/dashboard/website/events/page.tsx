import { resolveWebsiteOrgId } from "@/lib/site-builder/request-org";
import Link from "next/link";
import { redirect } from "next/navigation";

import { ListEvents } from "@/app/dashboard/website/actions/events";
import EventsScreen from "@/components/site-builder/dashboard/EventsScreen";
import { Button } from "@/components/ui/button";
import { loadSiteContext } from "@/lib/site-builder/site-context";
import { createServerSupabaseClient } from "@/lib/supabase/server";

/** The events list. Events are records, so this screen is a table and a form. */

export const dynamic = "force-dynamic";

export default async function WebsiteEventsRoute({
  searchParams,
}: {
  searchParams: Promise<{ location?: string }>;
}) {
  const orgId = await resolveWebsiteOrgId();
  if (!orgId) redirect("/sign-in");

  const params = await searchParams;
  const storefront = await loadSiteContext(orgId, params.location);
  if (!storefront) redirect("/dashboard/website/pages");

  const [result, { data: storefronts }] = await Promise.all([
    ListEvents(orgId),
    // The same list the public renderer resolves against — an event pinned to a
    // location with no live storefront would be shown against a branch that
    // cannot serve anyone.
    createServerSupabaseClient()
      .from("online_store_config")
      .select("location_id, store_name")
      .eq("merchant_id", storefront.merchantId)
      .eq("is_active", true),
  ]);

  if (!result.data) return <NoSite locationId={storefront.locationId} />;

  return (
    <EventsScreen
      clerkOrgId={orgId}
      events={result.data}
      locations={((storefronts ?? []) as Record<string, unknown>[]).map((row) => ({
        id: String(row.location_id),
        name: String(row.store_name ?? "Untitled location"),
      }))}
    />
  );
}

function NoSite({ locationId }: { locationId: string }) {
  return (
    <div className="mx-auto max-w-xl p-8 sm:p-12">
      <h1 className="text-xl font-semibold">Create your website before adding events</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Events appear on your website through an Events section, so start with a home page first.
      </p>
      <Button className="mt-5" asChild>
        <Link href={`/dashboard/website/pages/home?location=${encodeURIComponent(locationId)}`}>
          Create website
        </Link>
      </Button>
    </div>
  );
}
