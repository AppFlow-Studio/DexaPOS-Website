import { auth } from "@clerk/nextjs/server";
import Link from "next/link";
import { redirect } from "next/navigation";

import { CreateHomePage, ListPages } from "@/app/dashboard/website/actions/pages";
import { LoadDraft } from "@/app/dashboard/website/actions/draft";
import { GetPublishedDocument } from "@/app/dashboard/website/actions/publish";
import { EnsureNavSeeded, GetOrCreateSite } from "@/app/dashboard/website/actions/site";
import BuilderShell from "@/components/site-builder/builder/BuilderShell";
import type { SitePageSummary } from "@/lib/site-builder/db-types";
import { getResolverSources } from "@/lib/site-builder/request-scope";
import {
  buildRenderContext,
  loadSampleMenuItemIds,
  loadSiteContext,
} from "@/lib/site-builder/site-context";
import { loadMenuCatalog } from "../menu-catalog";
import { renderCanvas } from "../render-canvas";

/**
 * The page editor.
 *
 *   /dashboard/website/pages/<pageId>?location=<uuid>
 *
 * Both identities live in the URL — the page as a path segment, matching
 * Owner's `/website/pages/{id}?locationId=` — so a refresh, a bookmark or a
 * shared link reopens the exact draft the merchant was editing.
 *
 * `home` is accepted in place of an id and resolves to the merchant's home
 * page, which is what the sidebar and the "no pages yet" path both want and is
 * a better answer than guessing at a uuid.
 */

export const dynamic = "force-dynamic";

export default async function EditorRoute({
  params,
  searchParams,
}: {
  params: Promise<{ pageId: string }>;
  searchParams: Promise<{ location?: string }>;
}) {
  const { orgId } = await auth();
  if (!orgId) redirect("/sign-in");

  const [{ pageId }, query] = await Promise.all([params, searchParams]);

  const site = await loadSiteContext(orgId, query.location);
  if (!site) return <NoStorefront />;

  // Request-scoped: `renderCanvas` resolves its bindings from this same
  // instance, so the menu is fetched once per page open rather than twice.
  const sources = getResolverSources(site.deliveryPricingEnabled);

  /**
   * Warms the menu, which is by far the slowest query on this route — ~490 ms
   * against a ~160 ms round-trip floor.
   *
   * Started here and never awaited: `fetchMenuItems` memoises per
   * `merchantId:locationId` for the request, so this overlaps the site, page and
   * draft lookups and the real catalog read below then costs nothing. It used to
   * build the catalog itself, with its own copy of the mapping, the sorting and
   * a hardcoded `showPrices: true` — which is precisely how the dish picker came
   * to quote prices on pages that withhold them.
   *
   * The `catch` is not optional: an early `return` below would otherwise leave
   * a rejected promise with no handler attached. The rejection stays in the memo
   * and `loadMenuCatalog` reports it properly.
   */
  void sources
    .fetchMenuItems({ merchantId: site.merchantId, locationId: site.locationId, scoped: true })
    .catch(() => {});

  const websiteResult = await GetOrCreateSite(orgId, site.locationId);
  if (!websiteResult.data) {
    return (
      <EditorError
        title="Could not open your website"
        detail={websiteResult.error ?? "The website record could not be loaded."}
      />
    );
  }

  const pagesResult = await ListPages(orgId, websiteResult.data.id);
  let pages: SitePageSummary[] = pagesResult.data ?? [];

  // No page at all: create the merchant's home page from the starter document
  // rather than showing a blank canvas. Seeded with real menu ids so the
  // featured section is populated.
  if (pages.length === 0) {
    const menuItemIds = await loadSampleMenuItemIds(sources, {
      merchantId: site.merchantId,
      locationId: site.locationId,
    });
    const created = await CreateHomePage(orgId, websiteResult.data.id, {
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

  // An unknown or stale id falls back to home rather than erroring: the most
  // common way to hold one is a bookmark to a page that was since deleted.
  const requested = pageId === "home" ? undefined : pages.find((p) => p.id === pageId);
  const page = requested ?? pages.find((p) => p.is_home) ?? pages[0];

  // Two independent reads of two different tables, so they go together. The
  // baseline is what the publish button measures against; it is null on a page
  // that has never been published. Passing the version id from `page` — which
  // `ListPages` already selected — spares `GetPublishedDocument` a round trip
  // re-reading a column we hold.
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

  // Read only now that the page is known: whether the picker may show money
  // depends on what the page is about, and that answer comes from the same
  // helper the canvas uses rather than a second copy of the rule.
  const initialCatalog = await loadMenuCatalog(site.locationId, page.location_id);

  /**
   * The navigation, seeded from published pages the first time a site with an
   * empty one is opened.
   *
   * Sites built before there was an editor for this carry `{"items":[]}`, which
   * renders a header with no links — so their published pages were live and
   * unreachable. Seeding here rather than in a data migration means the derived
   * list is only ever a starting point: from the moment the merchant opens the
   * header, the stored nav is theirs.
   */
  const navItems = await EnsureNavSeeded(orgId, websiteResult.data.id, websiteResult.data.nav);

  // The first canvas is rendered here as a Server Component and handed down as
  // a prop. A client component may RECEIVE a server-rendered tree; it just may
  // not import one. Later renders come from the `renderCanvas` action, which
  // runs the identical code — so there is one render path, not two.
  return (
    <BuilderShell
      key={page.id}
      initialDoc={doc}
      initialCanvas={await renderCanvas(doc, site.locationId, "build", page.location_id)}
      initialCatalog={initialCatalog}
      initialRevision={draft.data.revision}
      clerkOrgId={orgId}
      locationId={site.locationId}
      features={site.features}
      /*
        Resolved through `buildRenderContext`, which is the same function the
        canvas and the public site use — so the colours the drawer measures a
        custom text colour against are the colours it will actually be rendered
        on, not a second opinion about them.
      */
      theme={buildRenderContext(site, "builder", undefined, page.location_id).theme}
      page={{
        id: page.id,
        title: page.title,
        // What the page is ABOUT — null on a brand page. The shell re-renders
        // the canvas and loads the dish picker from the browser, and both of
        // those decide whether money may appear; without this they would fall
        // back to the storefront and disagree with the first render above.
        locationId: page.location_id,
        path: page.path,
        isHome: page.is_home,
        status: page.status,
        publishedAt: page.published_at,
      }}
      site={{
        id: websiteResult.data.id,
        nav: navItems,
        subdomain: websiteResult.data.subdomain,
        pages: pages.map((p) => ({
          title: p.title,
          path: p.path,
          isHome: p.is_home,
          isPublished: p.status === "published",
        })),
      }}
      publishedDoc={published.data?.document ?? null}
      publishedAt={published.data?.publishedAt ?? null}
    />
  );
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
        href="/dashboard/website/pages"
        className="mt-5 inline-flex h-9 items-center rounded-md border px-4 text-sm font-medium transition-colors hover:bg-accent"
      >
        Back to Pages
      </Link>
    </div>
  );
}
