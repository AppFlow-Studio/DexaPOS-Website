import { auth } from "@clerk/nextjs/server";
import Link from "next/link";
import { redirect } from "next/navigation";

import { ListPages } from "@/app/dashboard/website/actions/pages";
import WebsiteDesignWorkspace from "@/components/site-builder/dashboard/WebsiteDesignWorkspace";
import { Button } from "@/components/ui/button";
import type { MerchantSiteRow } from "@/lib/site-builder/db-types";
import { loadSiteContext } from "@/lib/site-builder/site-context";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function WebsiteDesignPage({ searchParams }: { searchParams: Promise<{ location?: string }> }) {
  const { orgId } = await auth();
  if (!orgId) redirect("/sign-in");
  const params = await searchParams;
  const storefront = await loadSiteContext(orgId, params.location);
  if (!storefront) redirect("/dashboard/website");

  const supabase = createServerSupabaseClient();
  const { data: website } = await supabase.from("merchant_sites").select("*").eq("merchant_id", storefront.merchantId).maybeSingle();
  if (!website) return <div className="mx-auto max-w-xl p-8 sm:p-12"><h1 className="text-xl font-semibold">Create your website before setting its design</h1><p className="mt-2 text-sm text-muted-foreground">Start with a home page first. Then you can set the colors, typography, and shape style that apply across the site.</p><Button className="mt-5" asChild><Link href={`/dashboard/website/builder?location=${encodeURIComponent(storefront.locationId)}`}>Create website</Link></Button></div>;
  // Link targets for the navigation editor. Loaded here rather than in the
  // client so the nav offers the pages that actually exist — a hand-typed path
  // is a 404 the merchant cannot see from the editor.
  const pageList = await ListPages(orgId, (website as MerchantSiteRow).id);
  const pages = (pageList.data ?? []).map((page) => ({
    path: page.path,
    title: page.title,
    isHome: page.is_home,
  }));

  return (
    <WebsiteDesignWorkspace
      clerkOrgId={orgId}
      locationId={storefront.locationId}
      website={website as MerchantSiteRow}
      siteName={storefront.name}
      pages={pages}
      // The pre-builder storefront colours, used only for the keys the website
      // theme has never set. `resolveTheme` layers these under the saved theme.
      fallbackTheme={{
        brand: storefront.colors.primary ?? undefined,
        surface: storefront.colors.background ?? undefined,
        text: storefront.colors.text ?? undefined,
        border: storefront.colors.border ?? undefined,
        card: storefront.colors.card ?? undefined,
        fontFamily: storefront.colors.fontFamily
          ? `"${storefront.colors.fontFamily}", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`
          : undefined,
      }}
    />
  );
}
