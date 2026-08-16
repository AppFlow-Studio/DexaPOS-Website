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
