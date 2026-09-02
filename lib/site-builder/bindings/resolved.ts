/**
 * What a binding resolves to at render time.
 *
 * Decision D6's payoff lives here: sections store references, and these are the
 * live values fetched fresh on every render. Nothing in this file is ever
 * persisted — if it were, a published page could go stale, which is the exact
 * failure the binding model exists to prevent.
 */

import type { BindingType } from "./types";

/**
 * Why a binding could not be resolved.
 *
 * `not_found` and `unavailable` are the only two the platform can actually
 * distinguish. `get_menus_for_location` folds snoozing, 86ing and a manual
 * "hide this item" into a single `effective_availability` flag, so a snoozed
 * item and a deliberately hidden one are indistinguishable here — and both
 * should behave identically on a public page anyway. Inventing a `snoozed`
 * reason we cannot actually detect would be a lie in the type system.
 */
export type UnavailableReason =
  /** Deleted, or not on any menu serving this location. */
  | "not_found"
  /** Exists here, but 86'd / snoozed / hidden right now. */
  | "unavailable";

/**
 * Every binding resolves to this — never a nullable.
 *
 * Renderers receive `Resolved<T>` and must handle `unavailable` as a **normal
 * render path**, not an error path. That is what stops "the merchant deleted a
 * menu item" from becoming a 500 on their live homepage.
 */
export type Resolved<T> =
  | { status: "ok"; data: T }
  | { status: "unavailable"; reason: UnavailableReason };

export const unavailable = (reason: UnavailableReason): Resolved<never> => ({
  status: "unavailable",
  reason,
});

export const resolved = <T>(data: T): Resolved<T> => ({ status: "ok", data });

export function isOk<T>(r: Resolved<T>): r is { status: "ok"; data: T } {
  return r.status === "ok";
}

/** Narrows a list of resolutions to the ones that rendered. */
export function okValues<T>(list: Resolved<T>[]): T[] {
  return list.filter(isOk).map((r) => r.data);
}

// ─────────────────────────────────────────────────────────────────────────────
// Resolved shapes
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Mirrors `StorefrontItem` (types/storefront.ts) deliberately, because both come
 * from the same RPC. Keeping the shapes aligned is what guarantees a built page
 * and the ordering page quote the same number for the same dish.
 *
 * `price` is the CARD price. Under dual pricing `cashPrice` is lower; a page
 * that renders `price` alongside a cash-discount disclosure matches the
 * storefront's behaviour.
 */
export interface ResolvedMenuItem {
  id: string;
  name: string;
  description: string | null;
  /** Card price, post-cascade (L1 global → L5 location+menu+category). */
  price: number;
  cashPrice: number;
  deliveryPrice: number;
  image: string | null;
  isPopular: boolean;
  isNew: boolean;
  dietaryTags: string[];
  allergens: string[];
}

export interface ResolvedLocation {
  id: string;
  name: string;
  addressLine1: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  phone: string | null;
  email: string | null;
  latitude: number | null;
  longitude: number | null;
  timezone: string | null;
  /** Raw `locations.business_hours`. Shaped by the renderer, not here. */
  businessHours: unknown;
}

/**
 * Everything a page needs, fetched once before rendering begins.
 *
 * A section component may NOT perform I/O — all data arrives here. That keeps
 * the query budget knowable, makes every renderer unit-testable against a
 * fixture, and prevents the N+1 that per-section fetching produces.
 */
export interface ResolvedMap {
  menuItems: Map<string, Resolved<ResolvedMenuItem>>;
  locations: Map<string, Resolved<ResolvedLocation>>;
}

export function emptyResolvedMap(): ResolvedMap {
  return { menuItems: new Map(), locations: new Map() };
}

/** Lookup that treats "never requested" the same as "no longer exists". */
export function lookup<T>(
  map: Map<string, Resolved<T>>,
  id: string,
): Resolved<T> {
  return map.get(id) ?? unavailable("not_found");
}

export function lookupMenuItem(
  map: ResolvedMap,
  id: string,
): Resolved<ResolvedMenuItem> {
  return lookup(map.menuItems, id);
}

export function lookupLocation(
  map: ResolvedMap,
  id: string,
): Resolved<ResolvedLocation> {
  return lookup(map.locations, id);
}

/** A binding the collector found and the resolver must satisfy. */
export interface BindingRequest {
  type: BindingType;
  id: string;
}
