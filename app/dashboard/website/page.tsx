import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

import WebsiteOverview from "@/components/site-builder/dashboard/WebsiteOverview";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { MerchantSiteRow, SitePageSummary } from "@/lib/site-builder/db-types";
import { loadSiteContext } from "@/lib/site-builder/site-context";

export const dynamic = "force-dynamic";

export default async function WebsitePage({ searchParams }: { searchParams: Promise<{ location?: string }> }) {
  const { orgId } = await auth();
  if (!orgId) redirect("/sign-in");

  const params = await searchParams;
  const storefront = await loadSiteContext(orgId, params.location);
  if (!storefront) {
    return <NoStorefront />;
  }

  const overview = await loadOverview(storefront.merchantId);
  return <WebsiteOverview locationId={storefront.locationId} storeName={storefront.name} storeUrl={storefront.slug ? `/sites/${storefront.slug}` : null} website={overview.website} pages={overview.pages} dataAvailable={overview.dataAvailable} />;
}

async function loadOverview(merchantId: string): Promise<{ website: MerchantSiteRow | null; pages: SitePageSummary[]; dataAvailable: boolean }> {
  try {
    const supabase = createServerSupabaseClient();
    const { data: website, error } = await supabase.from("merchant_sites").select("*").eq("merchant_id", merchantId).maybeSingle();
    if (error || !website) return { website: null, pages: [], dataAvailable: !error };
    const { data: pages, error: pagesError } = await supabase.from("site_pages").select("id, site_id, merchant_id, path, title, is_home, status, revision, published_version_id, published_at, created_at, updated_at").eq("site_id", website.id).neq("status", "archived").order("is_home", { ascending: false }).order("title", { ascending: true });
    return { website: website as MerchantSiteRow, pages: (pages ?? []) as SitePageSummary[], dataAvailable: !pagesError };
  } catch {
    return { website: null, pages: [], dataAvailable: false };
  }
}

function NoStorefront() {
  return <div className="mx-auto max-w-xl p-8 sm:p-12"><h1 className="text-xl font-semibold">Set up an Online Store first</h1><p className="mt-2 text-sm text-muted-foreground">Your Website uses your restaurant location, branding, and Order Online destination. Once an Online Store is configured, you can start building your site here.</p></div>;
}
