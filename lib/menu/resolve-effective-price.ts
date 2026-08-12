/**
 * Effective-price resolution for the item pricing matrix.
 *
 * Mirrors the DB cascade in get_menu_with_categories:
 *   UI: L5 > L4 > L3 > L2 > L1
 *   DB: lmio > ci_menu > lcio > ci > mi
 *
 * The 5 levels (see lib/menu/cascade-labels.ts):
 *   L1 Item              — menu_items.price
 *   L2 Global category   — category_items (menu_id IS NULL)
 *   L3 Local category    — location_category_item_overrides
 *   L4 Global menu       — category_items (menu_id = <menu>)
 *   L5 Local menu        — location_menu_item_overrides
 *
 * `location_item_overrides` is NOT a cascade rung — the DB folds it into the
 * L1 base (it carries per-location badges/stock and a base-price modifier).
 */

import type { CascadeLevel } from "./cascade-labels";

export interface PriceLevelRow {
  level: CascadeLevel;
  locationId: string | null;
  categoryId: string | null;
  menuId: string | null;
  /** Display name for menu-scoped rows (L4/L5); used to label per-menu rows. */
  menuName?: string | null;
  price: number | null;
}

export interface ResolveArgs {
  /** L1 base price (menu_items.price) */
  globalPrice: number;
  rows: PriceLevelRow[];
  /** null = the "All" column (no location context) */
  locationId: string | null;
  /** Restrict resolution to one category context, when known. */
  categoryId?: string | null;
  /** Restrict resolution to one menu context, when known. */
  menuId?: string | null;
}

export interface ResolvedPrice {
  price: number;
  /** Which rung supplied the price. 1 means the L1 base. */
  level: CascadeLevel;
}

function matches(
  row: PriceLevelRow,
  args: Pick<ResolveArgs, "categoryId" | "menuId">,
): boolean {
  // Only filter by category/menu when the caller supplied that context.
  if (args.categoryId != null && row.categoryId != null) {
    if (row.categoryId !== args.categoryId) return false;
  }
  if (args.menuId != null && row.menuId != null) {
    if (row.menuId !== args.menuId) return false;
  }
  return true;
}

/**
 * Resolve what a customer actually pays, walking the cascade from the most
 * specific rung (L5) down to the L1 base.
 *
 * Location-scoped rungs (L3, L5) only apply within their own location. When
 * resolving the "All" column (locationId === null) they are skipped entirely,
 * because no single location context applies.
 */
export function resolveEffectivePrice(args: ResolveArgs): ResolvedPrice {
  const { globalPrice, rows, locationId } = args;

  const candidates = rows.filter((row) => {
    if (row.price == null) return false;
    if (!matches(row, args)) return false;

    // Location-scoped rungs must match the column's location.
    if (row.locationId != null) return row.locationId === locationId;

    // Global rungs (L2, L4) apply to every column, including "All".
    return true;
  });

  // Most specific wins: L5 > L4 > L3 > L2.
  for (const level of [5, 4, 3, 2] as const) {
    const hit = candidates.find((row) => row.level === level);
    if (hit) return { price: hit.price as number, level };
  }

  return { price: globalPrice, level: 1 };
}

/**
 * Distinct menus that carry a price for this item, at any level.
 *
 * The POS always resolves a price inside one menu (`get_menu_with_categories`
 * joins location_menu_item_overrides on `menu_id = m.id`), so a location can
 * charge several different prices at once — one per menu. Callers use this to
 * render one effective row per menu instead of a single ambiguous number.
 *
 * Returns menus sorted by name for a stable row order.
 */
export function listPricedMenus(
  rows: PriceLevelRow[],
): Array<{ menuId: string; menuName: string }> {
  const seen = new Map<string, string>();
  for (const row of rows) {
    if (row.price == null || !row.menuId) continue;
    if (!seen.has(row.menuId)) {
      seen.set(row.menuId, row.menuName ?? "Menu");
    }
  }
  return Array.from(seen, ([menuId, menuName]) => ({ menuId, menuName })).sort(
    (a, b) => a.menuName.localeCompare(b.menuName),
  );
}
