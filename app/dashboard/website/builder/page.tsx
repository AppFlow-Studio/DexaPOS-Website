import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

import BuilderShell from "@/components/site-builder/builder/BuilderShell";
import { renderCanvas } from "./render-canvas";
import { createSupabaseResolverSources } from "@/lib/site-builder/bindings/supabase-sources";
import { createDemoPage } from "@/lib/site-builder/fixtures/demo-page";
import { normalizePage } from "@/lib/site-builder/normalize";
import { loadSampleMenuItemIds, loadSiteContext } from "@/lib/site-builder/site-context";
import { createServerSupabaseClient } from "@/lib/supabase/server";

/**
 * The builder canvas.
 *
 *   /dashboard/website/builder
 *   /dashboard/website/builder?location=<uuid>
 *
 * Fixture-driven, like the preview route: the starting document is a demo page
 * rather than a `site_pages` row, so the whole editing experience works before
 * the Stage 2 migration is applied. Edits live in memory and are lost on
 * refresh — the save adapter is a no-op until the site tables exist, which is
 * the one thing here that is not yet real.
 */

export const dynamic = "force-dynamic";

export default async function BuilderPage({
  searchParams,
}: {
  searchParams: Promise<{ location?: string }>;
}) {
  const { orgId } = await auth();
  if (!orgId) redirect("/sign-in");

  const params = await searchParams;
  const supabase = createServerSupabaseClient();

  const site = await loadSiteContext(supabase, orgId, params.location);
  if (!site) {
    return (
      <div className="mx-auto max-w-xl p-12">
        <h1 className="text-lg font-semibold">No online store on this merchant</h1>
        <p className="mt-2 text-sm text-neutral-600">
          The builder reads a storefront&rsquo;s location, menu and branding. Set up an online store
          for a location first, or pass <code>?location=&lt;uuid&gt;</code>.
        </p>
      </div>
    );
  }

  const sources = createSupabaseResolverSources(supabase, {
    deliveryPricingEnabled: site.deliveryPricingEnabled,
  });
  const menuItemIds = await loadSampleMenuItemIds(sources, {
    merchantId: site.merchantId,
    locationId: site.locationId,
  });
  const doc = normalizePage(createDemoPage({ locationId: site.locationId, menuItemIds }));

  // The first canvas is rendered here as a Server Component and handed down as
  // a prop. A client component may RECEIVE a server-rendered tree; it just may
  // not import one. Subsequent renders come from the `renderCanvas` action,
  // which runs the identical code — so there is one render path, not two.
  return (
    <BuilderShell
      initialDoc={doc}
      initialCanvas={await renderCanvas(doc, site.locationId)}
      locationId={site.locationId}
    />
  );
}
