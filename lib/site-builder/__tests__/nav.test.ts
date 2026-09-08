import { describe, expect, it } from "vitest";

import {
  MAX_NAV_ITEMS,
  isExternalHref,
  moveNavItem,
  normalizeNavPath,
  parseNavItems,
  serializeNav,
  type NavItem,
} from "../nav";
import { readNav } from "../public-context";

/**
 * The writer and the reader of `merchant_sites.nav` live in different files and
 * are called from different processes — the editor writes, the public renderer
 * reads. Nothing but these tests holds them to the same contract, and the
 * failure mode is quiet: a link the merchant saved and the header never draws.
 *
 * So the important tests here are round trips, not unit assertions on either
 * side alone.
 */
describe("nav round trip: editor writes → renderer reads", () => {
  const pages: NavItem[] = [
    { label: "Home", path: "" },
    { label: "Menu", path: "menu" },
    { label: "Book a table", href: "https://example.com/reservations" },
  ];

  it("renders every saved link, in order, under a storefront base path", () => {
    const stored = serializeNav(pages);

    expect(readNav(stored, "/sites/joes-coffee-shop")).toEqual([
      { label: "Home", href: "/sites/joes-coffee-shop" },
      { label: "Menu", href: "/sites/joes-coffee-shop/menu" },
      { label: "Book a table", href: "https://example.com/reservations" },
    ]);
  });

  it("renders the same stored nav correctly at a brand subdomain", () => {
    // The same row, no base path. This is why paths are stored relative: one
    // stored nav has to be right at both addresses.
    const stored = serializeNav(pages);

    expect(readNav(stored, "")).toEqual([
      { label: "Home", href: "/" },
      { label: "Menu", href: "/menu" },
      { label: "Book a table", href: "https://example.com/reservations" },
    ]);
  });

  it("drops exactly what the renderer would drop, so a save shows the truth", () => {
    const stored = serializeNav([
      { label: "  ", path: "menu" }, // no label
      { label: "Broken", href: "not-a-url" }, // external, unusable
      { label: "Good", path: "about" },
    ]);

    expect(stored.items).toEqual([{ label: "Good", path: "about" }]);
    expect(readNav(stored, "")).toEqual([{ label: "Good", href: "/about" }]);
  });

  it("survives a save-reload cycle unchanged", () => {
    const stored = serializeNav(pages);
    // What the editor reads back out of the column on the next page load.
    expect(parseNavItems(stored)).toEqual(stored.items);
  });
});

describe("serializeNav", () => {
  it("stores paths without a leading slash, however they were typed", () => {
    const stored = serializeNav([{ label: "Menu", path: "///menu" }]);
    expect(stored.items).toEqual([{ label: "Menu", path: "menu" }]);
  });

  it("trims labels and external URLs", () => {
    const stored = serializeNav([{ label: "  Order  ", href: "  https://example.com  " }]);
    expect(stored.items).toEqual([{ label: "Order", href: "https://example.com" }]);
  });

  it("caps the list at what the header can display", () => {
    const many = Array.from({ length: MAX_NAV_ITEMS + 4 }, (_, i) => ({
      label: `Page ${i}`,
      path: `page-${i}`,
    }));
    expect(serializeNav(many).items).toHaveLength(MAX_NAV_ITEMS);
  });

  it("keeps an empty nav empty rather than inventing a default", () => {
    expect(serializeNav([])).toEqual({ items: [] });
  });
});

describe("parseNavItems", () => {
  it("reads the column's default value as no links", () => {
    expect(parseNavItems({ items: [] })).toEqual([]);
  });

  it("tolerates a malformed or absent column instead of throwing", () => {
    expect(parseNavItems(null)).toEqual([]);
    expect(parseNavItems(undefined)).toEqual([]);
    expect(parseNavItems({})).toEqual([]);
    expect(parseNavItems({ items: "nope" })).toEqual([]);
    expect(parseNavItems({ items: [null, 42, "x"] })).toEqual([]);
  });

  it("prefers href over path when a hand-written row carries both", () => {
    // readNav resolves the same way — the external branch is checked first.
    const parsed = parseNavItems({
      items: [{ label: "Both", path: "menu", href: "https://example.com" }],
    });
    expect(parsed).toEqual([{ label: "Both", href: "https://example.com" }]);
    expect(readNav({ items: parsed }, "")).toEqual([
      { label: "Both", href: "https://example.com" },
    ]);
  });
});

describe("moveNavItem", () => {
  const items: NavItem[] = [
    { label: "A", path: "a" },
    { label: "B", path: "b" },
    { label: "C", path: "c" },
  ];

  it("swaps with the neighbour in the given direction", () => {
    expect(moveNavItem(items, 0, 1).map((i) => i.label)).toEqual(["B", "A", "C"]);
    expect(moveNavItem(items, 2, -1).map((i) => i.label)).toEqual(["A", "C", "B"]);
  });

  it("refuses to move off either end, returning the list untouched", () => {
    expect(moveNavItem(items, 0, -1)).toBe(items);
    expect(moveNavItem(items, 2, 1)).toBe(items);
    expect(moveNavItem(items, 9, 1)).toBe(items);
  });
});

describe("helpers", () => {
  it("recognises only absolute http(s) URLs as external", () => {
    expect(isExternalHref("https://example.com")).toBe(true);
    expect(isExternalHref("http://example.com")).toBe(true);
    expect(isExternalHref("//example.com")).toBe(false);
    expect(isExternalHref("/menu")).toBe(false);
    expect(isExternalHref("javascript:alert(1)")).toBe(false);
    expect(isExternalHref(null)).toBe(false);
  });

  it("normalises a home path to the empty string", () => {
    expect(normalizeNavPath("/")).toBe("");
    expect(normalizeNavPath("  ")).toBe("");
  });
});
