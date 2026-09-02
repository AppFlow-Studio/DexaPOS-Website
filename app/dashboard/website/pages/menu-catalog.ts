"use server";

import { resolveWebsiteOrgId } from "@/lib/site-builder/request-org";

import { getResolverSources } from "@/lib/site-builder/request-scope";
import { loadSiteContext, resolveEditorPricingLocation } from "@/lib/site-builder/site-context";

/**
 * The menu items a page on this site may actually bind to.
 *
 * One action serves two features that would otherwise each need their own:
 *
 *  1. **The binding picker** — a merchant choosing dishes must see the real dish,
 *     the real price and whether it is being served, not a list of uuids.
 *  2. **The `⚠` markers in the layers panel** — a bound id absent from this list
 *     is `not_found`; one present with `available: false` is `unavailable`. That
 *     is exactly what the resolver concludes at render time, so the editor can
 *     reach the same verdict client-side with no second round trip and no risk of
 *     the two disagreeing.
 *
 * Drawn from `sources.fetchMenuItems`, which is `get_menus_for_location` — the
 * same path the storefront and the renderer use. **Never query `menu_items`
 * directly here:** that table holds every item the merchant has ever created,
 * including ones on no menu serving this location, and offering those in the
 * picker is how a merchant builds a page whose dishes silently vanish at render
 * (the defect fixed in HANDOFF §6b).
 */

export interface CatalogItem {
  id: string;
  name: string;
  description: string | null;
  /** Card price, post-cascade. Meaningless unless `showPrices`. */
  price: number;
  image: string | null;
  /** `effective_availability` — false when 86'd, snoozed or hidden. */
  available: boolean;
  isPopular: boolean;
}

export interface MenuCatalog {
  items: CatalogItem[];
  /**
   * Whether money may be shown against these items.
   *
   * Mirrors `canShowPrices` for the editor. On a brand page — one covering the
   * whole merchant rather than a chosen restaurant — branches can charge
   * different amounts for the same dish, so any single price is a guess. The
   * picker shows names and photos and withholds the money.
   *
   * Resolved through `resolveEditorPricingLocation`, the same rule the canvas
   * uses. It used to be `locationId !== null` against the *storefront* id, which
   * every caller passes as a real uuid — so the branch that withholds prices was
   * unreachable and the picker quoted one branch's prices beside a canvas that
   * had stopped showing them.
   */
  showPrices: boolean;
  /** Set when the catalog could not be read, so the UI can say so plainly. */
  error?: string;
}

const EMPTY: MenuCatalog = { items: [], showPrices: false };

export async function loadMenuCatalog(
  /** The storefront being edited — which restaurant's menu to read. */
  locationId: string | null,
  /**
   * The scope of the page the picker is open on — `site_pages.location_id`,
   * null on a brand page.
   *
   * Optional because the Style page has no page in hand: it wants the merchant's
   * dish names and photographs for a miniature and never reads `showPrices`, so
   * the brand-page default costs it nothing.
   */
  pageLocationId: string | null = null,
): Promise<MenuCatalog> {
  const orgId = await resolveWebsiteOrgId();
  if (!orgId) return { ...EMPTY, error: "Not signed in." };

  const site = await loadSiteContext(orgId, locationId ?? undefined);
  if (!site) return { ...EMPTY, error: "This merchant has no online store yet." };

  const pricingLocationId = resolveEditorPricingLocation(site, pageLocationId);

  try {
    const items = await getResolverSources(site.deliveryPricingEnabled).fetchMenuItems({
      merchantId: site.merchantId,
      // Borrow the storefront when the page is unscoped: names and photographs
      // are merchant-level, and `scoped` is what governs prices and 86/snooze.
      locationId: pricingLocationId ?? site.locationId,
      scoped: pricingLocationId !== null,
    });

    return {
      // Sorted for a stable, browsable list: served items first, then by name.
      // The picker's own search does the narrowing; this only decides what a
      // merchant sees before they type.
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
          (a, b) =>
            Number(b.available) - Number(a.available) || a.name.localeCompare(b.name),
        ),
      showPrices: pricingLocationId !== null,
    };
  } catch (error) {
    // A picker that cannot load is a bad afternoon; a builder that white-screens
    // because the menu RPC hiccuped is a lost page of work.
    console.error("[site-builder] menu catalog failed:", error);
    return { ...EMPTY, error: "Could not load your menu. Try again in a moment." };
  }
}
