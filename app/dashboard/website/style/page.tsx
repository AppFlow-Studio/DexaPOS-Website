import { resolveWebsiteOrgId } from "@/lib/site-builder/request-org";
import Link from "next/link";
import { redirect } from "next/navigation";

import { loadMenuCatalog } from "@/app/dashboard/website/pages/menu-catalog";
import StyleOverlay from "@/components/site-builder/dashboard/StyleOverlay";
import { Button } from "@/components/ui/button";
import type { MerchantSiteRow } from "@/lib/site-builder/db-types";
import { parseNavItems } from "@/lib/site-builder/nav";
import { loadSiteContext } from "@/lib/site-builder/site-context";
import { createServerSupabaseClient } from "@/lib/supabase/server";

/**
 * Site-wide style.
 *
 * Reads rather than creates, like the page list: a merchant looking at their
 * colours has not asked for a website to exist.
 */

export const dynamic = "force-dynamic";

export default async function StyleRoute({
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

  if (!website) {
    return (
      <div className="mx-auto max-w-xl p-8 sm:p-12">
        <h1 className="text-xl font-semibold">Create your website before setting its style</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Start with a home page first. Then you can set the colours, corners and typeface that apply
          across every page.
        </p>
        <Button className="mt-5" asChild>
          <Link href={`/dashboard/website/pages/home?location=${encodeURIComponent(storefront.locationId)}`}>
            Create website
          </Link>
        </Button>
      </div>
    );
  }

  /*
    The merchant's own navigation and their own dishes, so the miniature page is
    a preview of *their* site rather than of an imaginary one. The catalog read
    is the same one the page editor makes and is scoped to this location; a
    failure costs the three dish names and nothing else, because `ThemePreview`
    falls back to placeholders.
  */
  const catalog = await loadMenuCatalog(storefront.locationId);
  const previewItems = catalog.items
    .filter((item) => item.available)
    .slice(0, 3)
    .map((item) => ({ name: item.name, image: item.image }));

  return (
    <StyleOverlay
      clerkOrgId={orgId}
      locationId={storefront.locationId}
      website={website as MerchantSiteRow}
      siteName={storefront.name}
      logoUrl={storefront.logoUrl}
      nav={parseNavItems((website as MerchantSiteRow).nav).map((item) => item.label)}
      previewItems={previewItems}
      // The pre-builder storefront colours, used only for keys the website theme
      // has never set. `resolveTheme` layers these under the saved theme.
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
