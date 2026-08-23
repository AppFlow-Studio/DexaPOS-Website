"use server";

import { auth } from "@clerk/nextjs/server";

import PageRenderer, { SiteChrome } from "@/components/site-builder/PageRenderer";
import { collectAssetIds, collectBindings } from "@/lib/site-builder/bindings/collect";
import { resolveBindings } from "@/lib/site-builder/bindings/resolve";
import { normalizePage } from "@/lib/site-builder/normalize";
import { getResolverSources } from "@/lib/site-builder/request-scope";
import { loadAssetMap } from "@/lib/site-builder/asset-map";
import { collectFormIds, formResolver, loadFormMap } from "@/lib/site-builder/forms/form-map";
import { loadEvents } from "@/lib/site-builder/events/event-map";
import { pageNeedsEvents } from "@/lib/site-builder/sections/registry";
import { buildRenderContext, loadSiteContext } from "@/lib/site-builder/site-context";
import { createServerSupabaseClient } from "@/lib/supabase/server";

/**
 * Re-renders the canvas for the builder.
 *
 * **Returns JSX, not an HTML string.** A Server Action's return value is
 * serialized as an RSC payload, so the client can hold a server-rendered React
 * tree in state and drop it straight into the canvas. That means the builder
 * uses the *same* `PageRenderer` the public site does — one implementation of
 * every section's markup, which cannot drift (ANALYSIS blocker B7).
 *
 * The obvious-looking alternative — `renderToStaticMarkup` in a route handler,
 * returning HTML — does not work: Next refuses `react-dom/server` anywhere in
 * the app-directory module graph. This is the supported way to get server-
 * rendered output back from a client interaction, and it is a better one
 * (no `dangerouslySetInnerHTML`, no serialization round-trip).
 *
 * The document arrives from the browser and is therefore untrusted: it is
 * normalized before it reaches a renderer, and the merchant is re-authorized on
 * every call rather than trusting the session that opened the builder.
 */
export async function renderCanvas(doc: unknown, locationId: string) {
  const { orgId } = await auth();
  if (!orgId) return null;

  // When the builder page awaits this action in process, these two are already
  // memoised for the request and cost nothing. When the browser invokes it after
  // an edit, it is a fresh request and they are paid for properly.
  const site = await loadSiteContext(orgId, locationId);
  if (!site) return null;

  // Never trust the posted document.
  const page = normalizePage(doc);

  const sources = getResolverSources(site.deliveryPricingEnabled);

  // Menu bindings, photographs and forms are unrelated round trips, so they
  // overlap.
  // Registry-driven, and it must stay identical to the public renderer's test:
  // a section that resolves its events in one and not the other looks correct
  // in the canvas and blank once published.
  const wantsEvents = pageNeedsEvents(page.sections);

  const [{ map: resolved }, assets, forms, events] = await Promise.all([
    resolveBindings(
      collectBindings(page, { includeHidden: true }),
      { merchantId: site.merchantId, locationId: site.locationId },
      sources,
    ),
    loadAssetMap(createServerSupabaseClient(), collectAssetIds(page)),
    // The merchant's DRAFT definitions, deliberately — the canvas has to show
    // what they are editing right now. The public render resolves published
    // ones, so an unpublished form change never reaches a visitor.
    loadFormMap(createServerSupabaseClient(), site.merchantId, collectFormIds(page)),
    wantsEvents ? loadSiteEvents(site.merchantId) : Promise.resolve([]),
  ]);

  const ctx = {
    ...buildRenderContext(site, "builder", assets),
    resolveForm: formResolver(forms),
    events,
    // No `eventUrl` in the builder: the public address does not exist until the
    // site is published, and a card that navigated out of the editor would be
    // worse than one that does not navigate at all.
  };

  return (
    <SiteChrome ctx={ctx}>
      <PageRenderer doc={page} resolved={resolved} ctx={ctx} />
    </SiteChrome>
  );
}

/**
 * The merchant's events, for the canvas.
 *
 * Looks the site up by merchant because `SiteContext` carries the storefront,
 * not the website row — the same lookup `loadFormMap` avoids by being keyed on
 * merchant id directly.
 */
async function loadSiteEvents(merchantId: string) {
  const supabase = createServerSupabaseClient();
  const { data: site } = await supabase
    .from("merchant_sites")
    .select("id")
    .eq("merchant_id", merchantId)
    .maybeSingle();

  if (!site) return [];
  return loadEvents(supabase, String(site.id));
}
