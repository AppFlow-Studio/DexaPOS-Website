import { auth } from "@clerk/nextjs/server";
import Link from "next/link";
import { redirect } from "next/navigation";

import { LoadDraft } from "@/app/dashboard/website/actions/draft";
import { ListPages } from "@/app/dashboard/website/actions/pages";
import { GetSite } from "@/app/dashboard/website/actions/site";
import PageRenderer, { SiteChrome } from "@/components/site-builder/PageRenderer";
import { collectBindings } from "@/lib/site-builder/bindings/collect";
import { resolveBindings } from "@/lib/site-builder/bindings/resolve";
import type { RenderMode } from "@/lib/site-builder/render-context";
import { getResolverSources } from "@/lib/site-builder/request-scope";
import { buildRenderContext, loadSiteContext } from "@/lib/site-builder/site-context";

/**
 * Full-page preview of a merchant's own draft.
 *
 * Reads `site_pages.draft_content` through `LoadDraft` — the same document the
 * editor has open, through the same `collectBindings` → `resolveBindings` →
 * `PageRenderer` pipeline the public site will use. What a merchant sees here
 * is what they built.
 *
 * It used to render `createDemoPage()`, a fixture about a fictional Brooklyn
 * pizzeria. That was the right call while the editor was fixture-driven too and
 * the Stage 2 migration was unapplied: it proved the renderers and the resolver
 * without any site tables. Once the editor started loading real drafts, the two
 * surfaces the merchant reaches from — the design workspace's **Full preview**
 * and the editor's external-link button — began showing them somebody else's
 * restaurant.
 *
 * **Never creates anything.** `GetSite` rather than `GetOrCreateSite`: looking
 * at a preview must not be what brings a merchant's website into existence.
 *
 *   /dashboard/website/preview?location=<uuid>&page=<uuid>
 *   /dashboard/website/preview?...&mode=builder   (shows edit attrs)
 */

export const dynamic = "force-dynamic";

interface PreviewSearchParams {
  location?: string;
  page?: string;
  mode?: string;
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

  const website = await GetSite(orgId);
  if (!website.data) {
    return (
      <PreviewNotice
        title="Nothing to preview yet"
        detail={
          website.error ??
          "You have not started a website. Open the page editor and your home page will be created for you."
        }
        action={{ href: "/dashboard/website", label: "Go to Website" }}
      />
    );
  }

  const pages = await ListPages(orgId, website.data.id);
  if (!pages.data?.length) {
    return (
      <PreviewNotice
        title="This website has no pages"
        detail={pages.error ?? "Open the page editor to create your home page."}
        action={{ href: "/dashboard/website/builder", label: "Open the editor" }}
      />
    );
  }

  // An unknown or stale `?page=` falls back to home, matching the editor: the
  // usual way to hold one is a bookmark to a page that has since been deleted.
  const requested = params.page ? pages.data.find((p) => p.id === params.page) : undefined;
  const page = requested ?? pages.data.find((p) => p.is_home) ?? pages.data[0];

  const draft = await LoadDraft(orgId, page.id);
  if (!draft.data) {
    return (
      <PreviewNotice
        title={`Could not open “${page.title}”`}
        detail={draft.error ?? "The draft could not be loaded."}
        action={{ href: "/dashboard/website", label: "Back to Website" }}
      />
    );
  }

  const doc = draft.data.document;
  const mode: RenderMode = params.mode === "builder" ? "builder" : "preview";

  const sources = getResolverSources(site.deliveryPricingEnabled);
  const { map: resolved, queryCount } = await resolveBindings(
    collectBindings(doc, { includeHidden: mode === "builder" }),
    { merchantId: site.merchantId, locationId: site.locationId },
    sources,
  );

  const ctx = buildRenderContext(site, mode);

  return (
    <>
      {/* Diagnostics, not product. The query count is the number worth watching
          while the resolver is young, and it is meaningless to a merchant. */}
      {process.env.NODE_ENV !== "production" && (
        <PreviewBar
          mode={mode}
          title={page.title}
          sections={doc.sections.length}
          bindings={resolved.menuItems.size + resolved.locations.size}
          queryCount={queryCount}
        />
      )}
      <SiteChrome ctx={ctx}>
        <PageRenderer doc={doc} resolved={resolved} ctx={ctx} />
      </SiteChrome>
    </>
  );
}

function PreviewBar({
  mode,
  title,
  sections,
  bindings,
  queryCount,
}: {
  mode: RenderMode;
  title: string;
  sections: number;
  bindings: number;
  queryCount: number;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-1 bg-neutral-900 px-4 py-2 text-xs text-neutral-300">
      <span className="font-semibold text-white">Preview · {title}</span>
      <span>mode: {mode}</span>
      <span>{sections} sections</span>
      <span>{bindings} bindings resolved</span>
      <span className={queryCount > 4 ? "text-amber-400" : "text-emerald-400"}>
        {queryCount} quer{queryCount === 1 ? "y" : "ies"}
      </span>
    </div>
  );
}

function PreviewNotice({
  title,
  detail,
  action,
}: {
  title: string;
  detail?: string;
  action?: { href: string; label: string };
}) {
  return (
    <div className="mx-auto max-w-xl p-12">
      <h1 className="text-lg font-semibold">{title}</h1>
      {detail && <p className="mt-2 text-sm text-neutral-600">{detail}</p>}
      {action && (
        <Link
          href={action.href}
          className="mt-5 inline-flex h-9 items-center rounded-md border px-4 text-sm font-medium transition-colors hover:bg-accent"
        >
          {action.label}
        </Link>
      )}
    </div>
  );
}
