import { auth } from "@clerk/nextjs/server";
import Link from "next/link";
import { redirect } from "next/navigation";

import { CreateHomePage, ListPages } from "@/app/dashboard/website/actions/pages";
import { GetPublishedDocument } from "@/app/dashboard/website/actions/publish";
import { LoadDraft } from "@/app/dashboard/website/actions/draft";
import { GetOrCreateSite } from "@/app/dashboard/website/actions/site";
import BuilderShell from "@/components/site-builder/builder/BuilderShell";
import type { ResolverSources } from "@/lib/site-builder/bindings/resolve";
import type { SitePageSummary } from "@/lib/site-builder/db-types";
import { getResolverSources } from "@/lib/site-builder/request-scope";
import { loadSampleMenuItemIds, loadSiteContext } from "@/lib/site-builder/site-context";
import { renderCanvas } from "./render-canvas";
import type { MenuCatalog } from "./menu-catalog";

/**
 * The page editor.
 *
 *   /dashboard/website/builder?location=<uuid>&page=<uuid>
 *
 * Both identities live in the URL, so a refresh, a bookmark or a shared link
 * reopens the exact draft the merchant was editing. Omitting `page` opens the
 * home page — the answer to "which page did I mean" that is right often enough
 * to be worth not asking.
 *
 * The document comes from `site_pages.draft_content` and edits are persisted by
 * `SaveDraft`. This route used to hand the builder a demo fixture with a no-op
 * save adapter: the whole editing surface worked, and none of it survived a
 * refresh. Anything built on top of that would have taught merchants a mental
 * model the product does not have.
 */

export const dynamic = "force-dynamic";

export default async function BuilderPage({
  searchParams,
}: {
  searchParams: Promise<{ location?: string; page?: string }>;
}) {
  const { orgId } = await auth();
  if (!orgId) redirect("/sign-in");

  const params = await searchParams;

  const site = await loadSiteContext(orgId, params.location);
  if (!site) return <NoStorefront />;

  // Request-scoped: `renderCanvas` resolves its bindings from this same
  // instance, so the menu is fetched once per page open rather than twice.
  const sources = getResolverSources(site.deliveryPricingEnabled);

  // Started here, awaited last. The menu is by far the slowest query on this
  // route — ~490 ms against a ~160 ms round-trip floor — and nothing between
  // here and the canvas depends on it, so it overlaps the site, page and draft
  // lookups instead of queueing behind them. `loadInitialCatalog` never
  // rejects, so the early returns below cannot orphan this promise.
  const catalogPromise = loadInitialCatalog(sources, site);

  const websiteResult = await GetOrCreateSite(orgId, site.locationId);
  if (!websiteResult.data) {
    return (
      <EditorError
        title="Could not open your website"
        detail={websiteResult.error ?? "The website record could not be loaded."}
      />
    );
  }
  const website = websiteResult.data;

  const pagesResult = await ListPages(orgId, website.id);
  let pages: SitePageSummary[] = pagesResult.data ?? [];

  // No page at all: create the merchant's home page from the starter document
  // rather than showing a blank canvas or, worse, a demo page dressed up as
  // their draft. Seeded with real menu ids so the featured section is populated.
  if (pages.length === 0) {
    const menuItemIds = await loadSampleMenuItemIds(sources, {
      merchantId: site.merchantId,
      locationId: site.locationId,
    });
    const created = await CreateHomePage(orgId, website.id, {
      locationId: site.locationId,
      menuItemIds,
      restaurantName: site.name,
    });
    if (!created.data) {
      return (
        <EditorError
          title="Could not create your home page"
          detail={created.error ?? "The page could not be created."}
        />
      );
    }
    pages = [created.data];
  }

  // An unknown or stale `?page=` falls back to home rather than erroring: the
  // most common way to get one is a bookmark to a page that was since deleted.
  const requested = params.page ? pages.find((p) => p.id === params.page) : undefined;
  const page = requested ?? pages.find((p) => p.is_home) ?? pages[0];

  // Two independent reads of two different tables, so they go together. The
  // baseline is what every "N changes" count is measured against; it is null on
  // a page that has never been published, and the builder then says "Not
  // published yet" instead of reporting every section as a change. Passing the
  // version id from `page` — which `ListPages` already selected — spares
  // `GetPublishedDocument` a round trip re-reading a column we hold, and costs
  // it nothing at all on a page that has never gone live.
  const [draft, published] = await Promise.all([
    LoadDraft(orgId, page.id),
    GetPublishedDocument(orgId, page.id, page.published_version_id),
  ]);

  if (!draft.data) {
    return (
      <EditorError
        title={`Could not open “${page.title}”`}
        detail={draft.error ?? "The draft could not be loaded."}
      />
    );
  }

  const doc = draft.data.document;
  const initialCatalog = await catalogPromise;

  // The first canvas is rendered here as a Server Component and handed down as
  // a prop. A client component may RECEIVE a server-rendered tree; it just may
  // not import one. Later renders come from the `renderCanvas` action, which
  // runs the identical code — so there is one render path, not two.
  return (
    <BuilderShell
      key={page.id}
      initialDoc={doc}
      initialCanvas={await renderCanvas(doc, site.locationId)}
      initialCatalog={initialCatalog}
      initialRevision={draft.data.revision}
      clerkOrgId={orgId}
      locationId={site.locationId}
      page={toEditorPage(page)}
      pages={pages.map(toEditorPage)}
      publishedDoc={published.data?.document ?? null}
      publishedAt={published.data?.publishedAt ?? null}
      // The ordering storefront, which is where a built site will eventually
      // live too — Stage 6 owns that collision (PLAN-04 §2). Until then this is
      // the only public URL there is to show the merchant.
      viewUrl={site.slug ? `/sites/${site.slug}` : undefined}
    />
  );
}

/**
 * The dish list the picker and the `⚠` markers both read.
 *
 * **Never rejects.** It is started before the page and draft lookups so that the
 * menu round trip overlaps them, which means it may be in flight while this
 * route takes an early `return`; a rejection with no handler attached yet would
 * surface as an unhandled rejection rather than as the empty catalog the UI
 * already knows how to explain.
 */
function loadInitialCatalog(
  sources: ResolverSources,
  site: { merchantId: string; locationId: string },
): Promise<MenuCatalog> {
  return sources
    .fetchMenuItems({
      merchantId: site.merchantId,
      locationId: site.locationId,
      scoped: true,
    })
    .then((items) => ({
      items: items
        .map((item) => ({
          id: item.id,
          name: item.name,
          description: item.description,
          price: item.price,
          image: item.image,
          available: item.available,
          isPopular: item.isPopular,
        }))
        .sort(
          (a, b) => Number(b.available) - Number(a.available) || a.name.localeCompare(b.name),
        ),
      showPrices: true,
    }))
    .catch((error) => {
      console.error("[site-builder] initial menu catalog failed:", error);
      return { items: [], showPrices: false, error: "Could not load your menu." };
    });
}

/** The subset of a page row the editor needs. Keeps the client payload small. */
function toEditorPage(page: SitePageSummary) {
  return {
    id: page.id,
    title: page.title,
    path: page.path,
    isHome: page.is_home,
    status: page.status,
    publishedAt: page.published_at,
  };
}

function NoStorefront() {
  return (
    <div className="mx-auto max-w-xl p-8 sm:p-12">
      <h1 className="text-xl font-semibold">Set up an Online Store first</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        The page editor uses your restaurant&rsquo;s location, menu, and branding. Configure an
        online store for a location, then come back to build your website.
      </p>
    </div>
  );
}

function EditorError({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="mx-auto max-w-xl p-8 sm:p-12">
      <h1 className="text-xl font-semibold">{title}</h1>
      <p className="mt-2 text-sm text-muted-foreground">{detail}</p>
      <Link
        href="/dashboard/website"
        className="mt-5 inline-flex h-9 items-center rounded-md border px-4 text-sm font-medium transition-colors hover:bg-accent"
      >
        Back to Website
      </Link>
    </div>
  );
}
