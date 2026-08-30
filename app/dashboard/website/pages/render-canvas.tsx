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
import type { RenderMode } from "@/lib/site-builder/render-context";
import {
  buildRenderContext,
  loadSiteContext,
  resolveEditorPricingLocation,
} from "@/lib/site-builder/site-context";
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
export async function renderCanvas(
  doc: unknown,
  locationId: string,
  /**
   * Which editor mode the canvas is standing in for. `"preview"` renders the
   * page exactly as a visitor would see it — no gutters, and no placeholders
   * for empty sections — which is the whole point of the Build/Preview toggle.
   */
  mode: "build" | "preview" = "build",
  /**
   * The scope of the page on the canvas — `site_pages.location_id`, null on a
   * brand page.
   *
   * Separate from `locationId` above, which is the storefront being edited. The
   * canvas used to know only the latter and therefore priced every page as
   * though the visitor had already picked a branch, which is the one thing a
   * brand page must not do. Untrusted like everything else that arrives here:
   * it is only ever fed to `resolvePricingLocation`, which withholds prices on
   * anything it cannot account for.
   */
  pageLocationId: string | null = null,
) {
  const { orgId } = await auth();
  if (!orgId) return null;

  // When the builder page awaits this action in process, these two are already
  // memoised for the request and cost nothing. When the browser invokes it after
  // an edit, it is a fresh request and they are paid for properly.
  const site = await loadSiteContext(orgId, locationId);
  if (!site) return null;

  // Never trust the posted document.
  const page = normalizePage(doc);

  /**
   * Nor the posted mode. This is a Server Action, so `mode` arrives over the
   * network and its TypeScript union is not enforced at runtime: anything that
   * is not the literal `"preview"` renders as the builder. In particular a
   * crafted call must not be able to reach `"public"`.
   */
  const renderMode: RenderMode = mode === "preview" ? "preview" : "builder";

  const sources = getResolverSources(site.deliveryPricingEnabled);

  /**
   * What this page is priced against — null when no single number is honest.
   *
   * Resolved once and used for both the context and the resolver below, exactly
   * as `buildPublicRenderContext` does, so the canvas cannot show prices the
   * live page withholds or filter items the live page keeps.
   */
  const pricingLocationId = resolveEditorPricingLocation(site, pageLocationId);

  // Menu bindings, photographs and forms are unrelated round trips, so they
  // overlap.
  // Registry-driven, and it must stay identical to the public renderer's test:
  // a section that resolves its events in one and not the other looks correct
  // in the canvas and blank once published.
  const wantsEvents = pageNeedsEvents(page.sections);

  const [{ map: resolved }, assets, forms, events] = await Promise.all([
    resolveBindings(
      collectBindings(page, { includeHidden: true }),
      {
        merchantId: site.merchantId,
        /**
         * An unscoped page still BORROWS a location to read names, descriptions
         * and photographs — those are merchant-level and identical everywhere.
         * It is `scoped` that decides whether the borrowed branch's prices and
         * 86/snooze may be believed. Same bargain as the public renderer.
         */
        locationId: pricingLocationId ?? site.locationId,
        // False on a brand page, which is what stops the canvas filtering out
        // items one branch happens to have 86'd — the live page shows them.
        scoped: pricingLocationId !== null,
      },
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
    ...buildRenderContext(site, renderMode, assets, pageLocationId),
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
