import { describe, it, expect } from "vitest";
import {
  resolveEffectivePrice,
  listPricedMenus,
  type PriceLevelRow,
} from "./resolve-effective-price";

const DOWNTOWN = "loc-downtown-hamra";
const UPTOWN = "loc-uptown";
const BAKERY = "cat-bakery";
const TEST_MENU = "menu-test";
const STANDARD_MENU = "menu-standard";

describe("resolveEffectivePrice", () => {
  it("falls back to the L1 base when no overrides exist", () => {
    expect(
      resolveEffectivePrice({
        globalPrice: 4.9,
        rows: [],
        locationId: DOWNTOWN,
      }),
    ).toEqual({ price: 4.9, level: 1 });
  });

  // The bug from the screenshot: Downtown Hamra has a $6.90 local-menu (L5)
  // override, but the matrix footer showed the $4.90 base.
  it("uses the local-menu (L5) override as the effective price", () => {
    const rows: PriceLevelRow[] = [
      {
        level: 5,
        locationId: DOWNTOWN,
        categoryId: BAKERY,
        menuId: TEST_MENU,
        price: 6.9,
      },
    ];

    expect(
      resolveEffectivePrice({ globalPrice: 4.9, rows, locationId: DOWNTOWN }),
    ).toEqual({ price: 6.9, level: 5 });
  });

  it("does not leak one location's L5 override into another location", () => {
    const rows: PriceLevelRow[] = [
      {
        level: 5,
        locationId: DOWNTOWN,
        categoryId: BAKERY,
        menuId: TEST_MENU,
        price: 6.9,
      },
    ];

    expect(
      resolveEffectivePrice({ globalPrice: 4.9, rows, locationId: UPTOWN }),
    ).toEqual({ price: 4.9, level: 1 });
  });

  it("prefers L5 over L4, L3 and L2", () => {
    const rows: PriceLevelRow[] = [
      { level: 2, locationId: null, categoryId: BAKERY, menuId: null, price: 5 },
      {
        level: 3,
        locationId: DOWNTOWN,
        categoryId: BAKERY,
        menuId: null,
        price: 5.5,
      },
      {
        level: 4,
        locationId: null,
        categoryId: BAKERY,
        menuId: TEST_MENU,
        price: 6,
      },
      {
        level: 5,
        locationId: DOWNTOWN,
        categoryId: BAKERY,
        menuId: TEST_MENU,
        price: 6.9,
      },
    ];

    expect(
      resolveEffectivePrice({ globalPrice: 4.9, rows, locationId: DOWNTOWN }),
    ).toEqual({ price: 6.9, level: 5 });
  });

  it("prefers L4 (global menu) over L3 and L2", () => {
    const rows: PriceLevelRow[] = [
      { level: 2, locationId: null, categoryId: BAKERY, menuId: null, price: 5 },
      {
        level: 3,
        locationId: DOWNTOWN,
        categoryId: BAKERY,
        menuId: null,
        price: 5.5,
      },
      {
        level: 4,
        locationId: null,
        categoryId: BAKERY,
        menuId: TEST_MENU,
        price: 6,
      },
    ];

    expect(
      resolveEffectivePrice({ globalPrice: 4.9, rows, locationId: DOWNTOWN }),
    ).toEqual({ price: 6, level: 4 });
  });

  it("prefers L3 (local category) over L2 (global category)", () => {
    const rows: PriceLevelRow[] = [
      { level: 2, locationId: null, categoryId: BAKERY, menuId: null, price: 5 },
      {
        level: 3,
        locationId: DOWNTOWN,
        categoryId: BAKERY,
        menuId: null,
        price: 5.5,
      },
    ];

    expect(
      resolveEffectivePrice({ globalPrice: 4.9, rows, locationId: DOWNTOWN }),
    ).toEqual({ price: 5.5, level: 3 });
  });

  it("applies the global category (L2) price at every location", () => {
    const rows: PriceLevelRow[] = [
      { level: 2, locationId: null, categoryId: BAKERY, menuId: null, price: 5 },
    ];

    expect(
      resolveEffectivePrice({ globalPrice: 4.9, rows, locationId: UPTOWN }),
    ).toEqual({ price: 5, level: 2 });
  });

  it("skips location-scoped rungs when resolving the All column", () => {
    const rows: PriceLevelRow[] = [
      {
        level: 5,
        locationId: DOWNTOWN,
        categoryId: BAKERY,
        menuId: TEST_MENU,
        price: 6.9,
      },
      {
        level: 3,
        locationId: DOWNTOWN,
        categoryId: BAKERY,
        menuId: null,
        price: 5.5,
      },
      { level: 2, locationId: null, categoryId: BAKERY, menuId: null, price: 5 },
    ];

    expect(
      resolveEffectivePrice({ globalPrice: 4.9, rows, locationId: null }),
    ).toEqual({ price: 5, level: 2 });
  });

  // Mirrors the one real global-menu price in the DB: item 3333… carries $5.50
  // on Standard Menu / Espresso Bar with no location-scoped override.
  it("applies a global-menu (L4) price at every location and in the All column", () => {
    const rows: PriceLevelRow[] = [
      {
        level: 4,
        locationId: null,
        categoryId: "cat-espresso",
        menuId: STANDARD_MENU,
        price: 5.5,
      },
    ];

    expect(
      resolveEffectivePrice({ globalPrice: 4.9, rows, locationId: DOWNTOWN }),
    ).toEqual({ price: 5.5, level: 4 });
    expect(
      resolveEffectivePrice({ globalPrice: 4.9, rows, locationId: null }),
    ).toEqual({ price: 5.5, level: 4 });
  });

  // The L5 reset button asks "what would this cell fall back to?" by resolving
  // with L5 excluded. It must report the level that actually supplies the price,
  // not assume L4 — otherwise it labels the base price as a "global menu price".
  describe("reset fallback (L5 excluded)", () => {
    const withoutL5 = (rows: PriceLevelRow[]) =>
      rows.filter((r) => r.level !== 5);

    it("falls back to the item base when no other rung has a price", () => {
      const rows: PriceLevelRow[] = [
        {
          level: 5,
          locationId: DOWNTOWN,
          categoryId: BAKERY,
          menuId: TEST_MENU,
          price: 6.9,
        },
      ];

      expect(
        resolveEffectivePrice({
          globalPrice: 4.9,
          rows: withoutL5(rows),
          locationId: DOWNTOWN,
          categoryId: BAKERY,
          menuId: TEST_MENU,
        }),
      ).toEqual({ price: 4.9, level: 1 });
    });

    it("falls back to the global menu price when one exists", () => {
      const rows: PriceLevelRow[] = [
        {
          level: 4,
          locationId: null,
          categoryId: BAKERY,
          menuId: TEST_MENU,
          price: 6,
        },
        {
          level: 5,
          locationId: DOWNTOWN,
          categoryId: BAKERY,
          menuId: TEST_MENU,
          price: 6.9,
        },
      ];

      expect(
        resolveEffectivePrice({
          globalPrice: 4.9,
          rows: withoutL5(rows),
          locationId: DOWNTOWN,
          categoryId: BAKERY,
          menuId: TEST_MENU,
        }),
      ).toEqual({ price: 6, level: 4 });
    });

    it("falls back to the local category price when it is the nearest rung", () => {
      const rows: PriceLevelRow[] = [
        {
          level: 2,
          locationId: null,
          categoryId: BAKERY,
          menuId: null,
          price: 5,
        },
        {
          level: 3,
          locationId: DOWNTOWN,
          categoryId: BAKERY,
          menuId: null,
          price: 5.5,
        },
        {
          level: 5,
          locationId: DOWNTOWN,
          categoryId: BAKERY,
          menuId: TEST_MENU,
          price: 6.9,
        },
      ];

      expect(
        resolveEffectivePrice({
          globalPrice: 4.9,
          rows: withoutL5(rows),
          locationId: DOWNTOWN,
          categoryId: BAKERY,
          menuId: TEST_MENU,
        }),
      ).toEqual({ price: 5.5, level: 3 });
    });
  });

  // Real data: Chocolate Croissant @ Uptown Branch carries TWO local-menu
  // prices — test $6.90 and Standard Menu $1.00. A single effective number for
  // that column is arbitrary, so the grid resolves one row per menu.
  describe("per-menu resolution when a location has several menu prices", () => {
    const uptownRows: PriceLevelRow[] = [
      {
        level: 5,
        locationId: UPTOWN,
        categoryId: BAKERY,
        menuId: TEST_MENU,
        menuName: "test",
        price: 6.9,
      },
      {
        level: 5,
        locationId: UPTOWN,
        categoryId: BAKERY,
        menuId: STANDARD_MENU,
        menuName: "Standard Menu",
        price: 1,
      },
    ];

    it("lists each priced menu once, sorted by name", () => {
      expect(listPricedMenus(uptownRows)).toEqual([
        { menuId: STANDARD_MENU, menuName: "Standard Menu" },
        { menuId: TEST_MENU, menuName: "test" },
      ]);
    });

    it("ignores menus whose rows carry no price", () => {
      expect(
        listPricedMenus([
          ...uptownRows,
          {
            level: 5,
            locationId: UPTOWN,
            categoryId: BAKERY,
            menuId: "menu-unpriced",
            menuName: "Unpriced",
            price: null,
          },
        ]).map((m) => m.menuName),
      ).toEqual(["Standard Menu", "test"]);
    });

    it("resolves a different price per menu at the same location", () => {
      expect(
        resolveEffectivePrice({
          globalPrice: 4.9,
          rows: uptownRows,
          locationId: UPTOWN,
          menuId: TEST_MENU,
        }),
      ).toEqual({ price: 6.9, level: 5 });

      expect(
        resolveEffectivePrice({
          globalPrice: 4.9,
          rows: uptownRows,
          locationId: UPTOWN,
          menuId: STANDARD_MENU,
        }),
      ).toEqual({ price: 1, level: 5 });
    });

    it("falls back to the base for a menu with no override at that location", () => {
      expect(
        resolveEffectivePrice({
          globalPrice: 4.9,
          rows: uptownRows,
          locationId: DOWNTOWN,
          menuId: TEST_MENU,
        }),
      ).toEqual({ price: 4.9, level: 1 });
    });
  });

  it("scopes resolution to a single menu context when asked", () => {
    const rows: PriceLevelRow[] = [
      {
        level: 5,
        locationId: UPTOWN,
        categoryId: BAKERY,
        menuId: STANDARD_MENU,
        price: 1,
      },
      {
        level: 5,
        locationId: UPTOWN,
        categoryId: BAKERY,
        menuId: TEST_MENU,
        price: 6.9,
      },
    ];

    expect(
      resolveEffectivePrice({
        globalPrice: 4.9,
        rows,
        locationId: UPTOWN,
        menuId: STANDARD_MENU,
      }),
    ).toEqual({ price: 1, level: 5 });
  });
});
