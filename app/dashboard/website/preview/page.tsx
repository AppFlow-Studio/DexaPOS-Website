import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

import PageRenderer, { SiteChrome } from "@/components/site-builder/PageRenderer";
import { collectBindings } from "@/lib/site-builder/bindings/collect";
import { resolveBindings } from "@/lib/site-builder/bindings/resolve";
import { createDemoPage } from "@/lib/site-builder/fixtures/demo-page";
import { normalizePage } from "@/lib/site-builder/normalize";
import type { RenderMode } from "@/lib/site-builder/render-context";
import { getResolverSources } from "@/lib/site-builder/request-scope";
import {
  buildRenderContext,
  loadSampleMenuItemIds,
  loadSiteContext,
} from "@/lib/site-builder/site-context";

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

  const site = await loadSiteContext(orgId, params.location);
  if (!site) {
    return (
      <PreviewNotice
        title="No online store on this merchant"
        detail="The preview reads a storefront's location, menu and branding. Set up an online store for a location first, or pass ?location=<uuid>."
      />
    );
  }

  // Sources are built before the document, so seeding the fixture and resolving
  // it share one memoised menu fetch instead of issuing two.
  const sources = getResolverSources(site.deliveryPricingEnabled);
  const resolverCtx = { merchantId: site.merchantId, locationId: site.locationId };

  const menuItemIds = params.items
    ? params.items.split(",").filter(Boolean)
    : await loadSampleMenuItemIds(sources, resolverCtx);

  // ── the production pipeline, from here down ──────────────────────────────
  const doc = normalizePage(
    createDemoPage({ locationId: site.locationId, menuItemIds }),
  );

  const mode: RenderMode = params.mode === "builder" ? "builder" : "preview";

  const { map: resolved, queryCount } = await resolveBindings(
    collectBindings(doc, { includeHidden: mode === "builder" }),
    resolverCtx,
    sources,
  );

  const ctx = buildRenderContext(site, mode);

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
