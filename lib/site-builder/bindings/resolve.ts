/**
 * Turns a page's bindings into live data.
 *
 * **The query budget is a function of the number of distinct binding *types* on
 * the page, not the number of bindings.** A page showing 40 menu items issues
 * one menu query. This is the property that keeps a built page from degrading
 * as merchants add sections.
 *
 * Data sources are injected rather than constructed here, so the resolver is
 * unit-testable against fixtures with no database — which is how it was
 * verified before any migration had been applied.
 */

import { groupByType } from "./collect";
import {
  emptyResolvedMap,
  resolved,
  unavailable,
  type BindingRequest,
  type ResolvedLocation,
  type ResolvedMap,
  type ResolvedMenuItem,
} from "./resolved";

export interface ResolverContext {
  merchantId: string;
  locationId: string;
}

/**
 * The data the resolver needs, expressed as capabilities rather than a Supabase
 * client. `createSupabaseResolverSources` provides the real implementation;
 * tests provide arrays.
 */
export interface ResolverSources {
  /**
   * Every menu item available at this location, already carrying post-cascade
   * prices and effective availability.
   *
   * Implementations MUST derive this from the same path the storefront uses
   * (`get_menus_for_location`), never from a second price calculation — a built
   * page quoting a different price than the ordering page for the same dish is
   * a support ticket at best.
   */
  fetchMenuItems(ctx: ResolverContext): Promise<MenuItemSource[]>;
  fetchLocations(ids: string[]): Promise<ResolvedLocation[]>;
}

/** A menu item as the storefront RPC surfaces it, before availability is applied. */
export interface MenuItemSource extends ResolvedMenuItem {
  /** `effective_availability` — false when 86'd, snoozed, or hidden. */
  available: boolean;
}

export interface ResolveResult {
  map: ResolvedMap;
  /** Query count actually issued. Asserted in tests to protect the budget. */
  queryCount: number;
}

/**
 * Resolves every binding on a page.
 *
 * Never throws: a source that fails leaves its bindings `unavailable`, so a
 * transient database problem degrades one section rather than 500-ing a
 * merchant's live homepage. The failure is logged, not swallowed silently.
 */
export async function resolveBindings(
  requests: BindingRequest[],
  ctx: ResolverContext,
  sources: ResolverSources,
): Promise<ResolveResult> {
  const map = emptyResolvedMap();
  if (requests.length === 0) return { map, queryCount: 0 };

  const grouped = groupByType(requests);
  let queryCount = 0;

  // ── menu items ────────────────────────────────────────────────────────────
  const menuItemIds = grouped.get("menu_item") ?? [];
  if (menuItemIds.length > 0) {
    queryCount += 1;
    try {
      const items = await sources.fetchMenuItems(ctx);
      const byId = new Map(items.map((i) => [i.id, i]));

      for (const id of menuItemIds) {
        const item = byId.get(id);
        if (!item) {
          // Deleted, or not on a menu serving this location. Same handling
          // either way: the section skips it and the publish gate warns.
          map.menuItems.set(id, unavailable("not_found"));
        } else if (!item.available) {
          map.menuItems.set(id, unavailable("unavailable"));
        } else {
          const { available: _available, ...data } = item;
          map.menuItems.set(id, resolved(data));
        }
      }
    } catch (error) {
      console.error("[site-builder] menu item resolution failed:", error);
      for (const id of menuItemIds) map.menuItems.set(id, unavailable("not_found"));
    }
  }

  // ── locations (and hours, which live on the same row) ──────────────────────
  const locationIds = [
    ...new Set([...(grouped.get("location") ?? []), ...(grouped.get("hours") ?? [])]),
  ];
  if (locationIds.length > 0) {
    queryCount += 1;
    try {
      const locations = await sources.fetchLocations(locationIds);
      const byId = new Map(locations.map((l) => [l.id, l]));

      for (const id of locationIds) {
        const location = byId.get(id);
        map.locations.set(id, location ? resolved(location) : unavailable("not_found"));
      }
    } catch (error) {
      console.error("[site-builder] location resolution failed:", error);
      for (const id of locationIds) map.locations.set(id, unavailable("not_found"));
    }
  }

  // `menu_category` bindings are declared by the registry but unused by the v1
  // section set. Left unresolved rather than silently faked.

  return { map, queryCount };
}

/**
 * Ids the resolver could not satisfy — fed to `validatePage` at publish time so
 * the merchant is told "3 items in Guest Favorites no longer exist" before they
 * go live, rather than discovering it on the page.
 */
export function unresolvedIds(map: ResolvedMap): string[] {
  const out: string[] = [];
  for (const [id, value] of map.menuItems) {
    if (value.status === "unavailable" && value.reason === "not_found") out.push(id);
  }
  for (const [id, value] of map.locations) {
    if (value.status === "unavailable") out.push(id);
  }
  return out;
}
