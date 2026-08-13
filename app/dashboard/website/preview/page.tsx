import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

import PageRenderer, { SiteChrome } from "@/components/site-builder/PageRenderer";
import { collectBindings } from "@/lib/site-builder/bindings/collect";
import { resolveBindings } from "@/lib/site-builder/bindings/resolve";
import { createSupabaseResolverSources } from "@/lib/site-builder/bindings/supabase-sources";
import { createDemoPage } from "@/lib/site-builder/fixtures/demo-page";
import { normalizePage } from "@/lib/site-builder/normalize";
import {
  DEFAULT_THEME,
  createRenderContext,
  type RenderMode,
} from "@/lib/site-builder/render-context";
import { createServerSupabaseClient } from "@/lib/supabase/server";

/**
 * Stage 4 acceptance surface — a real page, server-rendered, with live prices.
 *
 * Deliberately driven by a **fixture** rather than by `site_pages`, so the
 * renderers and the binding resolver can be verified before the Stage 2
 * migration is applied anywhere. Everything below the document source is the
 * production path: the same `collectBindings` → `resolveBindings` →
 * `PageRenderer` pipeline the public site will use.
 *
 * Swapping the fixture for `LoadDraft(pageId)` is a one-line change once the
 * migration lands.
 *
 * Merchant-gated: it reads that merchant's real menu.
 *
 *   /dashboard/website/preview?location=<uuid>
 *   /dashboard/website/preview?location=<uuid>&mode=builder   (shows edit attrs)
 */

export const dynamic = "force-dynamic";

interface PreviewSearchParams {
  location?: string;
  mode?: string;
  items?: string;
}

export default async function WebsitePreviewPage({
  searchParams,
}: {
  searchParams: Promise<PreviewSearchParams>;
}) {
  const { orgId } = await auth();
  if (!orgId) redirect("/sign-in");

  const params = await searchParams;
  const supabase = createServerSupabaseClient();

  const { data: merchant } = await supabase
    .from("merchants")
    .select("id")
    .eq("clerk_org_id", orgId)
    .single();

  if (!merchant) return <PreviewNotice title="Merchant not found" />;
  const merchantId = merchant.id as string;

  // One flat query, then pick in JS. Conditionally chaining `.eq()` onto a
  // reassigned builder grows the PostgrestFilterBuilder type until inference
  // gives up (TS2589), and a merchant has a handful of storefronts at most.
  const { data: storeRows } = await supabase
    .from("online_store_config")
    .select(
      "id, location_id, slug, store_name, logo_url, hero_image_url, phone, primary_color, background_color, text_color, border_color, card_color, font_family, pricing_disclosure_text, delivery_pricing_enabled",
    )
    .eq("merchant_id", merchantId);

  const storeConfigs = (storeRows ?? []) as Record<string, string | boolean | null>[];
  const storeConfig = params.location
    ? storeConfigs.find((c) => c.location_id === params.location)
    : storeConfigs[0];

  if (!storeConfig) {
    return (
      <PreviewNotice
        title="No online store on this merchant"
        detail="The preview reads a storefront's location, menu and branding. Set up an online store for a location first, or pass ?location=<uuid>."
      />
    );
  }

  const config = storeConfig;
  const locationId = String(config.location_id);

  // Real menu items, so the preview shows real prices rather than lorem ipsum.
  const { data: sampleItems } = await supabase
    .from("menu_items")
    .select("id")
    .eq("merchant_id", merchantId)
    .limit(6);

  const menuItemIds = params.items
    ? params.items.split(",").filter(Boolean)
    : ((sampleItems ?? []) as { id: string }[]).map((i) => i.id);

  // ── the production pipeline, from here down ──────────────────────────────
  const doc = normalizePage(createDemoPage({ locationId, menuItemIds }));

  const mode: RenderMode = params.mode === "builder" ? "builder" : "preview";

  const sources = createSupabaseResolverSources(supabase, {
    deliveryPricingEnabled: config.delivery_pricing_enabled !== false,
  });

  const { map: resolved, queryCount } = await resolveBindings(
    collectBindings(doc, { includeHidden: mode === "builder" }),
    { merchantId, locationId },
    sources,
  );

  const ctx = createRenderContext({
    mode,
    site: {
      siteId: String(config.id),
      locationId,
      slug: String(config.slug ?? ""),
      name: String(config.store_name ?? "Your restaurant"),
      logoUrl: (config.logo_url as string | null) ?? null,
      heroImageUrl: (config.hero_image_url as string | null) ?? null,
      phone: (config.phone as string | null) ?? null,
      basePath: `/sites/${config.slug}`,
      // Stage 6 owns the real answer (PLAN-04 §2); the storefront root is the
      // ordering page today, which is exactly the collision Stage 6 resolves.
      orderUrl: `/sites/${config.slug}`,
      menuUrl: `/sites/${config.slug}`,
      nav: [],
      pricingDisclosureText: (config.pricing_disclosure_text as string | null) ?? null,
    },
    theme: {
      ...DEFAULT_THEME,
      brand: String(config.primary_color ?? DEFAULT_THEME.brand),
      surface: String(config.background_color ?? DEFAULT_THEME.surface),
      text: String(config.text_color ?? DEFAULT_THEME.text),
      border: String(config.border_color ?? DEFAULT_THEME.border),
      card: String(config.card_color ?? DEFAULT_THEME.card),
      fontFamily: config.font_family
        ? `"${config.font_family}", system-ui, sans-serif`
        : DEFAULT_THEME.fontFamily,
    },
  });

  return (
    <>
      <PreviewBar
        mode={mode}
        sections={doc.sections.length}
        bindings={resolved.menuItems.size + resolved.locations.size}
        queryCount={queryCount}
      />
      <SiteChrome ctx={ctx}>
        <PageRenderer doc={doc} resolved={resolved} ctx={ctx} />
      </SiteChrome>
    </>
  );
}

/** Diagnostics strip — the query count is the number worth watching. */
function PreviewBar({
  mode,
  sections,
  bindings,
  queryCount,
}: {
  mode: RenderMode;
  sections: number;
  bindings: number;
  queryCount: number;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-1 bg-neutral-900 px-4 py-2 text-xs text-neutral-300">
      <span className="font-semibold text-white">Website preview</span>
      <span>mode: {mode}</span>
      <span>{sections} sections</span>
      <span>{bindings} bindings resolved</span>
      <span className={queryCount > 4 ? "text-amber-400" : "text-emerald-400"}>
        {queryCount} quer{queryCount === 1 ? "y" : "ies"}
      </span>
      <span className="opacity-60">fixture-driven — no site tables required</span>
    </div>
  );
}

function PreviewNotice({ title, detail }: { title: string; detail?: string }) {
  return (
    <div className="mx-auto max-w-xl p-12">
      <h1 className="text-lg font-semibold">{title}</h1>
      {detail && <p className="mt-2 text-sm text-neutral-600">{detail}</p>}
    </div>
  );
}
