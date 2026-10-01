import { describe, expect, it } from "vitest";
import { mapRpcMenuToStorefront } from "../storefront-menu";
import {
  indexStorefrontMenuPrices,
  storefrontPriceKey,
} from "../../../../supabase/functions/_shared/storefront-menu-pricing";

/**
 * The storefront shows prices from mapRpcMenuToStorefront; create-online-order
 * charges cart lines from indexStorefrontMenuPrices. Fed the same
 * get_menus_for_location() payload, they must agree on every price, or the
 * customer is charged something other than what they saw (2026-10-01).
 */

const menuItem = (
  id: string,
  prices: { price: number | string; cash?: number | string | null; delivery?: number | string | null }
) => ({
  menu_item: {
    id,
    name: id,
    description: null,
    image: null,
    effective_price: prices.price,
    effective_cash_price: prices.cash ?? null,
    effective_delivery_price: prices.delivery ?? null,
    effective_availability: true,
    modifier_groups: [],
  },
});

// Americano is $5.25 in Espresso Bar but $7.25 in Appetizers, on two menus.
const RPC_MENUS = [
  {
    id: "menu-happy-hour",
    name: "Happy Hour",
    categories: [
      {
        is_active: true,
        display_order: 1,
        category: { id: "cat-espresso", name: "Espresso Bar" },
        items: [
          menuItem("americano", { price: "5.25", cash: "5.04", delivery: "6.00" }),
          menuItem("mocha", { price: 6 }),
        ],
      },
      {
        is_active: true,
        display_order: 2,
        category: { id: "cat-appetizers", name: "Appetizers" },
        items: [menuItem("americano", { price: 7.25, cash: 6.97, delivery: 3.99 })],
      },
      {
        // Inactive menu category: hidden on the storefront, so not chargeable.
        is_active: false,
        display_order: 3,
        category: { id: "cat-retired", name: "Retired" },
        items: [menuItem("americano", { price: 1 })],
      },
    ],
  },
  {
    id: "menu-brunch",
    name: "Brunch",
    categories: [
      {
        is_active: true,
        display_order: 1,
        category: { id: "cat-espresso", name: "Espresso Bar" },
        items: [menuItem("americano", { price: "4.25" }), menuItem("zero", { price: null as unknown as number })],
      },
    ],
  },
];

function storefrontItems() {
  return RPC_MENUS.map(mapRpcMenuToStorefront)
    .filter((menu) => menu !== null)
    .flatMap((menu) => menu!.categories.flatMap((category) => category.items));
}

describe("storefront display price ↔ create-online-order charge parity", () => {
  it("stamps every displayed item with the menu and category it sits in", () => {
    const americano = storefrontItems().filter((item) => item.id === "americano");
    expect(americano.map((item) => [item.menu_id, item.category_id, item.price])).toEqual([
      ["menu-happy-hour", "cat-espresso", 5.25],
      ["menu-happy-hour", "cat-appetizers", 7.25],
      ["menu-brunch", "cat-espresso", 4.25],
    ]);
  });

  it("charges exactly the displayed price for every placement", () => {
    const index = indexStorefrontMenuPrices(RPC_MENUS);
    const items = storefrontItems();

    expect(index.size).toBe(items.length);
    for (const item of items) {
      expect(index.get(storefrontPriceKey(item.menu_id!, item.category_id!, item.id))).toEqual({
        price: item.price,
        cash_price: item.cash_price,
        delivery_price: item.delivery_price,
      });
    }
  });

  it("offers nothing from an inactive menu category", () => {
    const index = indexStorefrontMenuPrices(RPC_MENUS);
    expect(index.has(storefrontPriceKey("menu-happy-hour", "cat-retired", "americano"))).toBe(false);
  });

  it("offers nothing from a menu hidden online at the location", () => {
    const index = indexStorefrontMenuPrices(RPC_MENUS, new Set(["menu-brunch"]));
    expect(index.has(storefrontPriceKey("menu-brunch", "cat-espresso", "americano"))).toBe(false);
    expect(index.has(storefrontPriceKey("menu-happy-hour", "cat-espresso", "americano"))).toBe(true);
  });

  it("tolerates a malformed payload instead of throwing", () => {
    expect(indexStorefrontMenuPrices(null).size).toBe(0);
    expect(indexStorefrontMenuPrices([null, { id: "m", categories: [{ items: [{}] }] }]).size).toBe(0);
  });
});
