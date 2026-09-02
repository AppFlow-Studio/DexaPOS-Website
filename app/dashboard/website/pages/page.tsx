import { resolveWebsiteOrgId } from "@/lib/site-builder/request-org";
import { redirect } from "next/navigation";

import PagesScreen from "@/components/site-builder/dashboard/PagesScreen";
import type { MerchantSiteRow, SitePageSummary } from "@/lib/site-builder/db-types";
import { loadSiteContext } from "@/lib/site-builder/site-context";
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
  const site = await loadSiteContext(orgId, params.location);
  if (!site) return <NoStorefront />;

  const { website, pages } = await loadPages(site.merchantId);

  return (
    <PagesScreen
      clerkOrgId={orgId}
      locationId={site.locationId}
      website={website}
      storeName={site.name}
      pages={pages}
    />
  );
}

async function loadPages(
  merchantId: string,
): Promise<{ website: MerchantSiteRow | null; pages: SitePageSummary[] }> {
  try {
    const supabase = createServerSupabaseClient();

    const { data: website } = await supabase
      .from("merchant_sites")
      .select("*")
      .eq("merchant_id", merchantId)
      .maybeSingle();

    if (!website) return { website: null, pages: [] };

    const { data: pages } = await supabase
      .from("site_pages")
      .select(
        "id, site_id, merchant_id, path, title, is_home, status, revision, published_version_id, published_at, created_at, updated_at",
      )
      .eq("site_id", (website as MerchantSiteRow).id)
      .neq("status", "archived")
      .order("is_home", { ascending: false })
      .order("title", { ascending: true });

    return { website: website as MerchantSiteRow, pages: (pages ?? []) as SitePageSummary[] };
  } catch {
    return { website: null, pages: [] };
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
