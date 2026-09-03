/**
 * The site navigation contract.
 *
 * `merchant_sites.nav` is stored as `{ items: [...] }` and read at render time by
 * `readNav` in [public-context.ts](./public-context.ts). Until now nothing wrote
 * it, so the shape lived only in the reader. This module is the writer's half,
 * kept beside it deliberately: a nav the editor can produce but the renderer
 * drops is invisible until a merchant publishes and finds their menu link gone.
 *
 * Nav is **site-wide, not per-page** — the schema comment on the column says so,
 * and the reason is versioning: a page's content is snapshotted on publish, so a
 * nav stored per page would mean changing one link re-versions every page.
 *
 * Two kinds of item, distinguished by which field is set:
 *
 *  - **internal** — `{ label, path }`, where `path` is a *page path* and never a
 *    URL. The same site answers at `{subdomain}.dexaposai.com` and at
 *    `/sites/{slug}`, so an absolute href would be correct in one and broken in
 *    the other. The renderer prefixes at request time; storage stays neutral.
 *  - **external** — `{ label, href }`, an absolute `http(s)` URL that passes
 *    through untouched.
 */

/** A single navigation link, in the shape stored on `merchant_sites.nav`. */
import { RESERVATIONS_PAGE_PATH } from "./reservations/paths";

export interface NavItem {
  label: string;
  /**
   * Page path without a leading slash. `""` is the home page.
   * Mutually exclusive with `href`.
   */
  path?: string;
  /** Absolute external URL. Mutually exclusive with `path`. */
  href?: string;
}

/**
 * The cap on nav length.
 *
 * Not a schema constraint — a limit the *header* imposes. `HeaderSection` lays
 * links out in a single row with no overflow or wrap behaviour, so a nav past
 * roughly this many items stops being navigation and starts being a broken
 * layout. Raise it only alongside a header that can cope.
 */
export const MAX_NAV_ITEMS = 8;

/** Whether a value is an absolute URL the renderer will pass through as-is. */
export function isExternalHref(value: unknown): value is string {
  return typeof value === "string" && /^https?:\/\//.test(value.trim());
}

/**
 * Strips a path down to storage form: no leading slash, no surrounding space.
 *
 * `readNav` already tolerates a leading slash, but storing one would mean the
 * same link round-tripping to two different strings depending on who typed it,
 * and a dirty-check comparing those strings would report changes nobody made.
 */
export function normalizeNavPath(value: string): string {
  return value.trim().replace(/^\/+/, "");
}

/**
 * Stored jsonb → editable items.
 *
 * Deliberately tolerant, because this reads whatever is already in the column:
 * a hand-written row, an older shape, or a partially-filled item saved by a
 * future version. Anything unreadable is dropped rather than surfaced as an
 * error — the editor's job is to show the merchant what will render, and
 * `readNav` drops exactly the same items.
 */
export function parseNavItems(nav: unknown): NavItem[] {
  const items = (nav as { items?: unknown } | null)?.items;
  if (!Array.isArray(items)) return [];

  return items.flatMap((raw): NavItem[] => {
    if (!raw || typeof raw !== "object") return [];
    const item = raw as { label?: unknown; path?: unknown; href?: unknown };
    const label = typeof item.label === "string" ? item.label.trim() : "";
    if (!label) return [];

    if (isExternalHref(item.href)) return [{ label, href: item.href.trim() }];
    if (typeof item.path === "string") return [{ label, path: normalizeNavPath(item.path) }];
    return [];
  });
}

/**
 * Editable items → the jsonb written to `merchant_sites.nav`.
 *
 * Drops what the renderer would drop anyway — an item with no label, or an
 * external row whose URL was never filled in — so that what the merchant sees
 * after a save is what the public page will show. Saving a half-typed row and
 * silently rendering nothing is the failure this prevents.
 */
export function serializeNav(items: NavItem[]): { items: NavItem[] } {
  const cleaned = items.flatMap((item): NavItem[] => {
    const label = item.label.trim();
    if (!label) return [];

    if (item.href !== undefined) {
      return isExternalHref(item.href) ? [{ label, href: item.href.trim() }] : [];
    }
    return [{ label, path: normalizeNavPath(item.path ?? "") }];
  });

  return { items: cleaned.slice(0, MAX_NAV_ITEMS) };
}

/** Moves the item at `index` one slot in `direction`, or returns the list unchanged. */
export function moveNavItem(items: NavItem[], index: number, direction: -1 | 1): NavItem[] {
  const target = index + direction;
  if (index < 0 || index >= items.length || target < 0 || target >= items.length) return items;

  const next = [...items];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

/**
 * Whether two items point at the same place.
 *
 * Labels are the merchant's business — two links may legitimately be called the
 * same thing — so identity is the destination, never the text.
 */
export function isSameNavTarget(a: NavItem, b: NavItem): boolean {
  if (a.href !== undefined || b.href !== undefined) {
    return (a.href ?? "").trim().toLowerCase() === (b.href ?? "").trim().toLowerCase();
  }
  return normalizeNavPath(a.path ?? "") === normalizeNavPath(b.path ?? "");
}

/**
 * Appends an item unless its destination is already in the list.
 *
 * **Append only, never reorder.** This runs when a page is published, and a
 * merchant who has spent time arranging their navigation must not find it
 * rearranged because they republished a page. A new page joins the end; where
 * it goes after that is their call.
 *
 * Silently does nothing at `MAX_NAV_ITEMS`. The alternative — refusing the
 * publish, or dropping an existing link to make room — would let a navigation
 * limit block a merchant from putting their new opening hours live.
 */
export function appendNavItem(items: NavItem[], item: NavItem): NavItem[] {
  if (items.some((existing) => isSameNavTarget(existing, item))) return items;
  if (items.length >= MAX_NAV_ITEMS) return items;
  return [...items, item];
}

/** Drops every item pointing at `path`. Used when a page stops being public. */
export function removeNavItemByPath(items: NavItem[], path: string): NavItem[] {
  const target = normalizeNavPath(path);
  return items.filter((item) => item.href !== undefined || normalizeNavPath(item.path ?? "") !== target);
}

/**
 * Whether a stored link still points at something a visitor can open.
 *
 *  - `ok` — an external URL, or an internal path whose page is published.
 *  - `unpublished` — the page exists but is not live, so the link 404s.
 *  - `missing` — no page has that path at all; it was deleted or renamed.
 *
 * External links are always `ok` because we cannot check them without making a
 * request from the merchant's browser to a third party, which is not a thing an
 * editor panel should do.
 */
export type NavLinkStatus = "ok" | "unpublished" | "missing";

/**
 * The publish state of one link's destination.
 *
 * `syncNavForPage` already removes a link when its page is unpublished through
 * the Pages screen, so in principle this can never fire. In practice it fires
 * for three reasons the sync cannot cover: a merchant can add an unpublished
 * page from the ⊕ Page picker on purpose (they are about to publish it), the
 * sync is best-effort inside a `try`/`catch` and a failed write is silent, and
 * every site built before the sync existed still carries whatever it carried.
 *
 * Verified against Joes Coffee Shop on 2026-08-20: their live header linked
 * `/career` while that page sat unpublished, so visitors got a 404 from the
 * site's own navigation.
 */
export function navLinkStatus(item: NavItem, pages: NavPage[]): NavLinkStatus {
  if (item.href !== undefined) return "ok";

  const target = normalizeNavPath(item.path ?? "");
  const page = pages.find((candidate) => normalizeNavPath(candidate.path) === target);

  if (!page) return "missing";
  return page.isPublished ? "ok" : "unpublished";
}

/** Every index in `items` whose destination a visitor cannot open. */
export function deadNavLinks(
  items: NavItem[],
  pages: NavPage[],
): { index: number; item: NavItem; status: Exclude<NavLinkStatus, "ok"> }[] {
  return items.flatMap((item, index) => {
    const status = navLinkStatus(item, pages);
    return status === "ok" ? [] : [{ index, item, status }];
  });
}

/** A page, as much of one as the navigation cares about. */
export interface NavPage {
  title: string;
  path: string;
  isHome: boolean;
  isPublished: boolean;
}

/**
 * Derives navigation from the pages that are actually published.
 *
 * The backfill for every site built before there was an editor for this. Those
 * sites carry `{"items":[]}`, which renders as a header with no links at all —
 * so a merchant could publish four pages and have visitors reach exactly one of
 * them, the home page, by typing its address.
 *
 * **The home page is deliberately not included**, matching what happens when a
 * page is published: the logo links home already, and a "Home" item beside it
 * spends one of eight slots saying so twice. The two paths have to agree, or a
 * site's navigation would depend on whether it was backfilled or built up one
 * publish at a time.
 *
 * Publication order, because that is the order a merchant built the pages in
 * and it is a better guess than alphabetical. It is only ever a starting point:
 * the editor owns the list from the first time it is opened.
 */
export function deriveNavFromPages(pages: NavPage[]): NavItem[] {
  return pages
    .filter((page) => page.isPublished && !page.isHome)
    // Same rule the publish path follows, and it has to be the same or a
    // backfilled site would carry a Reservations link that a site built one
    // publish at a time does not. The header's "Book a table" button is that
    // page's entry point.
    .filter((page) => normalizeNavPath(page.path) !== RESERVATIONS_PAGE_PATH)
    .slice(0, MAX_NAV_ITEMS)
    .map((page) => ({ label: page.title.trim() || "Untitled", path: normalizeNavPath(page.path) }));
}
