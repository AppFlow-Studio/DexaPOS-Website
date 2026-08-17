"use server";

import { auth } from "@clerk/nextjs/server";

import PageRenderer, { SiteChrome } from "@/components/site-builder/PageRenderer";
import { collectBindings } from "@/lib/site-builder/bindings/collect";
import { resolveBindings } from "@/lib/site-builder/bindings/resolve";
import { normalizePage } from "@/lib/site-builder/normalize";
import { getResolverSources } from "@/lib/site-builder/request-scope";
import { buildRenderContext, loadSiteContext } from "@/lib/site-builder/site-context";

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

  const { map: resolved } = await resolveBindings(
    collectBindings(page, { includeHidden: true }),
    { merchantId: site.merchantId, locationId: site.locationId },
    sources,
  );

  const ctx = buildRenderContext(site, "builder");

  return (
    <SiteChrome ctx={ctx}>
      <PageRenderer doc={page} resolved={resolved} ctx={ctx} />
    </SiteChrome>
  );
}
