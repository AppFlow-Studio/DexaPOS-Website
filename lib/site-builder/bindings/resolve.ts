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
  /**
   * The location to query. Always required — `get_menus_for_location` cannot
   * answer without one, even for a brand page.
   */
  locationId: string;
  /**
   * Whether `locationId` is the restaurant the visitor actually chose.
   *
   * Defaults to true. Pass `false` on a brand page, where a location was merely
   * borrowed to read item names, descriptions and photos — those live on
   * `menu_items` at the merchant level and are identical everywhere, while
   * prices and 86/snooze are not.
   *
   * When false, availability is not applied: on an unscoped page there is no
   * single kitchen to be out of something, and hiding a signature dish because
   * one branch ran out would be arbitrary. Prices still resolve; the renderer
   * declines to show them (`canShowPrices`).
   */
  scoped?: boolean;
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

  const menuItemIds = grouped.get("menu_item") ?? [];
  const locationIds = [
    ...new Set([...(grouped.get("location") ?? []), ...(grouped.get("hours") ?? [])]),
  ];

  let queryCount = 0;
  if (menuItemIds.length > 0) queryCount += 1;
  if (locationIds.length > 0) queryCount += 1;

  // The two sources share no data, so they are issued together. In series this
  // cost a full extra round trip — ~400 ms against a remote database, on every
  // single render of every page.
  //
  // `allSettled` rather than `all`: one source failing must still leave the
  // other's bindings resolved, so a menu outage degrades the Guest Favorites
  // section without also blanking the address and opening hours.
  const [itemsOutcome, locationsOutcome] = await Promise.allSettled([
    menuItemIds.length > 0 ? sources.fetchMenuItems(ctx) : Promise.resolve([]),
    locationIds.length > 0 ? sources.fetchLocations(locationIds) : Promise.resolve([]),
  ]);

  // ── menu items ────────────────────────────────────────────────────────────
  if (menuItemIds.length > 0) {
    if (itemsOutcome.status === "fulfilled") {
      const byId = new Map(itemsOutcome.value.map((i) => [i.id, i]));

      // See `ResolverContext.scoped`: a brand page borrowed this location purely
      // for names and photos, so its 86/snooze state says nothing about what the
      // visitor's eventual restaurant can make.
      const applyAvailability = ctx.scoped !== false;

      for (const id of menuItemIds) {
        const item = byId.get(id);
        if (!item) {
          // Deleted, or not on a menu serving this location. Same handling
          // either way: the section skips it and the publish gate warns.
          map.menuItems.set(id, unavailable("not_found"));
        } else if (!item.available && applyAvailability) {
          map.menuItems.set(id, unavailable("unavailable"));
        } else {
          const { available: _available, ...data } = item;
          map.menuItems.set(id, resolved(data));
        }
      }
    } else {
      console.error("[site-builder] menu item resolution failed:", itemsOutcome.reason);
      for (const id of menuItemIds) map.menuItems.set(id, unavailable("not_found"));
    }
  }

  // ── locations (and hours, which live on the same row) ──────────────────────
  if (locationIds.length > 0) {
    if (locationsOutcome.status === "fulfilled") {
      const byId = new Map(locationsOutcome.value.map((l) => [l.id, l]));

      for (const id of locationIds) {
        const location = byId.get(id);
        map.locations.set(id, location ? resolved(location) : unavailable("not_found"));
      }
    } else {
      console.error("[site-builder] location resolution failed:", locationsOutcome.reason);
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
