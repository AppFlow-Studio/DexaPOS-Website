import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import PopularItemsSection from "@/components/site-builder/sections/PopularItemsSection";
import {
  emptyResolvedMap,
  resolved,
  unavailable,
  type ResolvedMap,
  type ResolvedMenuItem,
} from "../bindings/resolved";
import { createRenderContext, type RenderMode } from "../render-context";
import {
  popularItemsDefaults,
  popularItemsSchema,
} from "../sections/schemas/popular-items";
import type { PopularItemsProps } from "../sections/schemas";

// ─────────────────────────────────────────────────────────────────────────────
// fixtures
// ─────────────────────────────────────────────────────────────────────────────

function menuItem(id: string, over: Partial<ResolvedMenuItem> = {}): ResolvedMenuItem {
  return {
    id,
    name: `Item ${id}`,
    description: "Worth ordering.",
    price: 12.5,
    cashPrice: 12,
    deliveryPrice: 13,
    image: `https://cdn.test/${id}.jpg`,
    isPopular: true,
    isNew: false,
    dietaryTags: [],
    allergens: [],
    ...over,
  };
}

function mapOf(...items: ResolvedMenuItem[]): ResolvedMap {
  const map = emptyResolvedMap();
  for (const item of items) map.menuItems.set(item.id, resolved(item));
  return map;
}

function render(
  props: Partial<PopularItemsProps>,
  map: ResolvedMap,
  mode: RenderMode = "public",
  orderUrl = "/sites/tonys",
): string {
  const ctx = createRenderContext({
    mode,
    site: {
      siteId: "site_1",
      locationId: "loc_1",
      slug: "tonys",
      name: "Tony's Pizza",
      logoUrl: null,
      heroImageUrl: null,
      phone: null,
      basePath: "/sites/tonys",
      orderUrl,
      menuUrl: orderUrl,
      nav: [],
      pricingDisclosureText: null,
    },
  });

  return renderToStaticMarkup(
    <PopularItemsSection
      section={{
        id: "sec_1",
        kind: "popular-items" as const,
        props: { ...popularItemsDefaults(), ...props },
      }}
      resolved={map}
      ctx={ctx}
    />,
  );
}

/** Two items, because the section hides itself below that on a public page. */
const twoItems = [menuItem("item_a"), menuItem("item_b")];
const twoBindings = [
  { type: "menu_item" as const, id: "item_a" },
  { type: "menu_item" as const, id: "item_b" },
];

// ─────────────────────────────────────────────────────────────────────────────

describe("popular-items: the + that deep-links into ordering", () => {
  it("defaults to on, and parses documents written before the field existed", () => {
    expect(popularItemsDefaults().showAddButton).toBe(true);

    // The whole point of `.default(true)`: an old document parses cleanly rather
    // than falling into normalizePage's repair path on every render.
    const { showAddButton: _omitted, ...legacy } = popularItemsDefaults();
    const parsed = popularItemsSchema.safeParse(legacy);
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.showAddButton).toBe(true);
  });

  it("renders one + per card, linking to the item on the ordering storefront", () => {
    const html = render({ items: twoBindings }, mapOf(...twoItems));

    expect(html).toContain('href="/sites/tonys?item=item_a"');
    expect(html).toContain('href="/sites/tonys?item=item_b"');
    expect(html).toContain('aria-label="Add Item item_a to cart"');
  });

  it("reports the click as an order_click, not a second name for it", () => {
    const html = render({ items: twoBindings }, mapOf(...twoItems));
    expect(html).toContain("order_click");
  });

  it("renders no + when the merchant turns it off", () => {
    const html = render(
      { items: twoBindings, showAddButton: false },
      mapOf(...twoItems),
    );

    expect(html).not.toContain("?item=");
    expect(html).not.toContain("to cart");
  });

  it("is inert in the builder, so an edit click cannot navigate away", () => {
    const html = render({ items: twoBindings }, mapOf(...twoItems), "builder");

    // Drawn, so the merchant sees what a visitor sees...
    expect(html).toContain("+");
    // ...but not a link, and not announced to assistive tech.
    expect(html).not.toContain("?item=");
    expect(html).not.toContain("to cart");
  });

  it("drops the + rather than linking nowhere when there is no storefront", () => {
    const html = render({ items: twoBindings }, mapOf(...twoItems), "public", "");

    expect(html).not.toContain("?item=");
    expect(html).not.toContain("to cart");
  });

  it("never links to an item the resolver dropped", () => {
    const map = mapOf(...twoItems, menuItem("item_c"));
    map.menuItems.set("item_c", unavailable("unavailable"));

    const html = render(
      {
        items: [...twoBindings, { type: "menu_item" as const, id: "item_c" }],
      },
      map,
    );

    expect(html).toContain('href="/sites/tonys?item=item_a"');
    // An 86'd item has no card at all, so it has no + either.
    expect(html).not.toContain("?item=item_c");
  });

  it("escapes an id into the query string rather than concatenating it", () => {
    const odd = menuItem("a&b c");
    const html = render(
      {
        items: [twoBindings[0], { type: "menu_item" as const, id: "a&b c" }],
      },
      mapOf(twoItems[0], odd),
    );

    expect(html).toContain("item=a%26b%20c");
  });
});
