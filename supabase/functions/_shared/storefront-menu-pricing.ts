/**
 * Storefront display prices, re-derived server-side.
 *
 * The storefront menu page prices every item from get_menus_for_location()
 * (one get_menu_with_categories() per menu) for the menu + category the item
 * sits in. That RPC runs its own cascade - e.g. a location-owned menu ignores
 * location item overrides - so get_effective_price() can disagree with what the
 * customer was shown (2026-10-01: shown $5.25, charged $7.25).
 *
 * create-online-order prices a cart line that carries its menu + category from
 * this index so the charge equals the display. The mapping MUST mirror
 * mapRpcMenuToStorefront in app/sites/lib/storefront-menu.ts; the parity test
 * app/sites/lib/__tests__/storefront-menu-pricing-parity.test.ts pins them.
 *
 * Pure (no Deno globals) so the parity test can import it under Vitest.
 */

export interface StorefrontLinePrice {
  price: number
  cash_price: number
  delivery_price: number
}

type JsonRecord = Record<string, unknown>

const asRecord = (value: unknown): JsonRecord | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as JsonRecord) : null

const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : [])

export function storefrontPriceKey(menuId: string, categoryId: string, itemId: string): string {
  return `${menuId}|${categoryId}|${itemId}`
}

/**
 * Index get_menus_for_location() output by menu|category|item. Menus hidden
 * online at this location are skipped, exactly like the storefront's
 * filterMenusVisibleOnline, so a cart cannot claim a price the storefront
 * never offered.
 */
export function indexStorefrontMenuPrices(
  rpcMenus: unknown,
  hiddenMenuIds: ReadonlySet<string> = new Set(),
): Map<string, StorefrontLinePrice> {
  const index = new Map<string, StorefrontLinePrice>()

  for (const rawMenu of asArray(rpcMenus)) {
    const menu = asRecord(rawMenu)
    const menuId = typeof menu?.id === 'string' ? menu.id : null
    if (!menu || !menuId || hiddenMenuIds.has(menuId)) continue

    for (const rawMenuCategory of asArray(menu.categories)) {
      const menuCategory = asRecord(rawMenuCategory)
      if (!menuCategory || menuCategory.is_active === false) continue
      const category = asRecord(menuCategory.category)
      const categoryId = typeof category?.id === 'string' ? category.id : null
      if (!categoryId) continue

      for (const rawCategoryItem of asArray(menuCategory.items)) {
        const menuItem = asRecord(asRecord(rawCategoryItem)?.menu_item)
        const itemId = typeof menuItem?.id === 'string' ? menuItem.id : null
        if (!menuItem || !itemId) continue

        const price = Number(menuItem.effective_price) || 0
        index.set(storefrontPriceKey(menuId, categoryId, itemId), {
          price,
          cash_price:
            menuItem.effective_cash_price != null ? Number(menuItem.effective_cash_price) : price,
          delivery_price:
            menuItem.effective_delivery_price != null
              ? Number(menuItem.effective_delivery_price)
              : price,
        })
      }
    }
  }

  return index
}
