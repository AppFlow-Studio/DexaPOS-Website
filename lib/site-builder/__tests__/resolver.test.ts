import { describe, expect, it, vi } from "vitest";

import { collectBindings, extractBindings, groupByType } from "../bindings/collect";
import {
  resolveBindings,
  unresolvedIds,
  type MenuItemSource,
  type ResolverSources,
} from "../bindings/resolve";
import { flattenMenuItems } from "../bindings/supabase-sources";
import { lookupLocation, lookupMenuItem, type ResolvedLocation } from "../bindings/resolved";
import { addSection, updateSectionProps } from "../mutations";
import { createStarterPage, type PageDocument } from "../page-document";

// ─────────────────────────────────────────────────────────────────────────────
// helpers
// ─────────────────────────────────────────────────────────────────────────────

const LOCATION_ID = "loc_1";

function item(id: string, overrides: Partial<MenuItemSource> = {}): MenuItemSource {
  return {
    id,
    name: `Item ${id}`,
    description: null,
    price: 12.5,
    cashPrice: 12.5,
    deliveryPrice: 12.5,
    image: null,
    isPopular: false,
    isNew: false,
    dietaryTags: [],
    allergens: [],
    available: true,
    ...overrides,
  };
}

function location(id = LOCATION_ID): ResolvedLocation {
  return {
    id,
    name: "Tony's Pizza",
    addressLine1: "123 Bedford Ave",
    city: "Brooklyn",
    state: "NY",
    postalCode: "11211",
    phone: "+17185550101",
    email: null,
    latitude: 40.71,
    longitude: -73.96,
    timezone: "America/New_York",
    businessHours: [],
  };
}

function sources(
  items: MenuItemSource[],
  locations: ResolvedLocation[] = [location()],
): ResolverSources & { menuCalls: number; locationCalls: number } {
  const impl = {
    menuCalls: 0,
    locationCalls: 0,
    async fetchMenuItems() {
      impl.menuCalls += 1;
      return items;
    },
    async fetchLocations(ids: string[]) {
      impl.locationCalls += 1;
      return locations.filter((l) => ids.includes(l.id));
    },
  };
  return impl;
}

/** A starter page with `popular-items` bound to the given menu item ids. */
function pageWithItems(ids: string[]): PageDocument {
  const doc = createStarterPage({ locationId: LOCATION_ID });
  const popularId = doc.sections.find((s) => s.kind === "popular-items")!.id;
  const result = updateSectionProps(doc, popularId, {
    items: ids.map((id) => ({ type: "menu_item", id })),
  });
  if (!result.ok) throw new Error(result.message);
  return result.doc;
}

// ─────────────────────────────────────────────────────────────────────────────
// collect
// ─────────────────────────────────────────────────────────────────────────────

describe("collectBindings", () => {
  it("finds menu items and locations across the page", () => {
    const requests = collectBindings(pageWithItems(["a", "b"]));
    expect(requests).toContainEqual({ type: "menu_item", id: "a" });
    expect(requests).toContainEqual({ type: "menu_item", id: "b" });
    // location + footer both bind the site's location.
    expect(requests.filter((r) => r.type === "location")).toHaveLength(1);
  });

  it("deduplicates repeated references", () => {
    const doc = pageWithItems(["a", "a", "b", "a"]);
    const menuRequests = collectBindings(doc).filter((r) => r.type === "menu_item");
    expect(menuRequests).toHaveLength(2);
  });

  it("skips hidden sections unless asked", () => {
    const doc = pageWithItems(["a"]);
    const hidden: PageDocument = {
      ...doc,
      sections: doc.sections.map((s) =>
        s.kind === "popular-items" ? { ...s, hidden: true } : s,
      ),
    };
    expect(collectBindings(hidden).some((r) => r.type === "menu_item")).toBe(false);
    expect(
      collectBindings(hidden, { includeHidden: true }).some((r) => r.type === "menu_item"),
    ).toBe(true);
  });

  it("ignores an empty binding id — there is nothing to fetch", () => {
    expect(extractBindings({ items: [{ type: "menu_item", id: "" }] })).toEqual([]);
  });

  it("ignores a binding whose section does not declare that type", () => {
    // Stale data from an older schema: registry wins over document.
    const doc = createStarterPage({ locationId: LOCATION_ID });
    const withStale: PageDocument = {
      ...doc,
      sections: doc.sections.map((s) =>
        s.kind === "faq"
          ? ({ ...s, props: { ...s.props, rogue: { type: "menu_item", id: "x" } } } as typeof s)
          : s,
      ),
    };
    expect(collectBindings(withStale).some((r) => r.id === "x")).toBe(false);
  });

  it("finds bindings nested at any depth", () => {
    const found = extractBindings({ a: { b: [{ c: { type: "menu_item", id: "deep" } }] } });
    expect(found).toEqual([{ type: "menu_item", id: "deep" }]);
  });

  it("groups by type", () => {
    const grouped = groupByType([
      { type: "menu_item", id: "a" },
      { type: "menu_item", id: "b" },
      { type: "location", id: "loc_1" },
    ]);
    expect(grouped.get("menu_item")).toEqual(["a", "b"]);
    expect(grouped.get("location")).toEqual(["loc_1"]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// resolve
// ─────────────────────────────────────────────────────────────────────────────

describe("resolveBindings", () => {
  const ctx = { merchantId: "m_1", locationId: LOCATION_ID };

  it("resolves bound items to live values", async () => {
    const doc = pageWithItems(["a"]);
    const { map } = await resolveBindings(
      collectBindings(doc),
      ctx,
      sources([item("a", { name: "Margherita", price: 18 })]),
    );

    const result = lookupMenuItem(map, "a");
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.data.name).toBe("Margherita");
    expect(result.data.price).toBe(18);
  });

  /**
   * The query budget is the property that keeps a built page from degrading as
   * merchants add sections — assert it, don't assume it.
   */
  it("issues one query per binding TYPE, not per binding", async () => {
    // Two item sections, 44 bindings between them — the schema caps a single
    // section at 24, so spanning sections is both necessary and realistic.
    const ids = Array.from({ length: 44 }, (_, i) => `item_${i}`);
    let doc = pageWithItems(ids.slice(0, 24));

    const added = addSection(doc, "popular-items");
    expect(added.ok).toBe(true);
    if (!added.ok) return;
    const secondId = added.doc.sections.filter((s) => s.kind === "popular-items")[1].id;
    const bound = updateSectionProps(added.doc, secondId, {
      items: ids.slice(24).map((id) => ({ type: "menu_item", id })),
    });
    expect(bound.ok).toBe(true);
    if (!bound.ok) return;
    doc = bound.doc;

    const requests = collectBindings(doc);
    expect(requests.filter((r) => r.type === "menu_item")).toHaveLength(44);

    const src = sources(ids.map((id) => item(id)));
    const { queryCount, map } = await resolveBindings(requests, ctx, src);

    expect(src.menuCalls).toBe(1);
    expect(src.locationCalls).toBe(1);
    expect(queryCount).toBeLessThanOrEqual(4);
    expect(map.menuItems.size).toBe(44);
  });

  it("issues no queries for a page with no bindings", async () => {
    const src = sources([]);
    const { queryCount } = await resolveBindings([], ctx, src);
    expect(queryCount).toBe(0);
    expect(src.menuCalls).toBe(0);
  });

  /** D6 consequence 1: a deleted record must not break a live page. */
  it("marks a deleted item not_found rather than throwing", async () => {
    const doc = pageWithItems(["gone"]);
    const { map } = await resolveBindings(collectBindings(doc), ctx, sources([]));

    const result = lookupMenuItem(map, "gone");
    expect(result.status).toBe("unavailable");
    if (result.status !== "unavailable") return;
    expect(result.reason).toBe("not_found");
  });

  /** D6 consequence 2: 86 / snooze must be honoured. */
  it("marks an 86'd item unavailable", async () => {
    const doc = pageWithItems(["snoozed"]);
    const { map } = await resolveBindings(
      collectBindings(doc),
      ctx,
      sources([item("snoozed", { available: false })]),
    );

    const result = lookupMenuItem(map, "snoozed");
    expect(result.status).toBe("unavailable");
    if (result.status !== "unavailable") return;
    expect(result.reason).toBe("unavailable");
  });

  it("resolves the site location", async () => {
    const doc = pageWithItems([]);
    const { map } = await resolveBindings(collectBindings(doc), ctx, sources([]));
    const result = lookupLocation(map, LOCATION_ID);
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.data.city).toBe("Brooklyn");
  });

  it("treats a never-requested id as not_found", async () => {
    const { map } = await resolveBindings([], ctx, sources([]));
    expect(lookupMenuItem(map, "never-asked").status).toBe("unavailable");
  });

  /**
   * A transient database failure must degrade one section, never 500 a live
   * merchant homepage.
   */
  it("survives a source that throws", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const doc = pageWithItems(["a"]);

    const failing: ResolverSources = {
      async fetchMenuItems() {
        throw new Error("connection reset");
      },
      async fetchLocations() {
        return [location()];
      },
    };

    const { map } = await resolveBindings(collectBindings(doc), ctx, failing);
    expect(lookupMenuItem(map, "a").status).toBe("unavailable");
    // The rest of the page still resolves.
    expect(lookupLocation(map, LOCATION_ID).status).toBe("ok");
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it("reports unresolved ids for the publish gate", async () => {
    const doc = pageWithItems(["here", "gone"]);
    const { map } = await resolveBindings(
      collectBindings(doc),
      ctx,
      sources([item("here")]),
    );
    expect(unresolvedIds(map)).toContain("gone");
    expect(unresolvedIds(map)).not.toContain("here");
  });

  it("does not report an 86'd item as unresolved — it exists, it is just off today", async () => {
    const doc = pageWithItems(["snoozed"]);
    const { map } = await resolveBindings(
      collectBindings(doc),
      ctx,
      sources([item("snoozed", { available: false })]),
    );
    expect(unresolvedIds(map)).not.toContain("snoozed");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// flattenMenuItems — the storefront-parity layer
// ─────────────────────────────────────────────────────────────────────────────

describe("flattenMenuItems", () => {
  const rpcFixture = [
    {
      id: "menu_1",
      name: "Dinner",
      categories: [
        {
          is_active: true,
          items: [
            {
              menu_item: {
                id: "i1",
                name: "Margherita",
                description: "San Marzano, basil",
                effective_price: 18,
                effective_cash_price: 17.1,
                effective_delivery_price: 21,
                image: "https://cdn/i1.jpg",
                effective_availability: true,
                is_popular: true,
                dietary_flags: ["vegetarian"],
                allergens: ["gluten", "dairy"],
              },
            },
            {
              menu_item: {
                id: "i2",
                name: "Sold out special",
                effective_price: 24,
                effective_availability: false,
              },
            },
          ],
        },
        { is_active: false, items: [{ menu_item: { id: "hidden", effective_price: 1 } }] },
      ],
    },
  ];

  it("flattens the menu → category → item tree", () => {
    const items = flattenMenuItems(rpcFixture);
    expect(items.map((i) => i.id)).toEqual(["i1", "i2"]);
  });

  it("carries post-cascade prices through unchanged", () => {
    const [first] = flattenMenuItems(rpcFixture);
    expect(first.price).toBe(18);
    expect(first.cashPrice).toBe(17.1);
    expect(first.deliveryPrice).toBe(21);
  });

  it("falls back to the card price when dual pricing is off", () => {
    const items = flattenMenuItems([
      { categories: [{ items: [{ menu_item: { id: "x", effective_price: 10 } }] }] },
    ]);
    expect(items[0].cashPrice).toBe(10);
    expect(items[0].deliveryPrice).toBe(10);
  });

  /** Mirrors applyDeliveryPricingPolicy in app/sites/actions.ts. */
  it("collapses delivery price to card price when delivery pricing is disabled", () => {
    const [first] = flattenMenuItems(rpcFixture, false);
    expect(first.deliveryPrice).toBe(18);
  });

  it("carries effective_availability through as `available`", () => {
    const items = flattenMenuItems(rpcFixture);
    expect(items.find((i) => i.id === "i1")!.available).toBe(true);
    expect(items.find((i) => i.id === "i2")!.available).toBe(false);
  });

  it("skips inactive categories", () => {
    expect(flattenMenuItems(rpcFixture).some((i) => i.id === "hidden")).toBe(false);
  });

  it("keeps the first occurrence of an item that appears on several menus", () => {
    const items = flattenMenuItems([
      { categories: [{ items: [{ menu_item: { id: "dup", effective_price: 5 } }] }] },
      { categories: [{ items: [{ menu_item: { id: "dup", effective_price: 9 } }] }] },
    ]);
    expect(items).toHaveLength(1);
    expect(items[0].price).toBe(5);
  });

  it("tolerates malformed RPC payloads", () => {
    for (const junk of [null, undefined, {}, [], [null], [{ categories: null }]]) {
      expect(() => flattenMenuItems(junk)).not.toThrow();
      expect(flattenMenuItems(junk)).toEqual([]);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// query cost
//
// The resolver's cost is the thing most likely to regress silently: a page
// renders identically whether it issued two queries or six, so only a test
// notices. Measured against staging, one `get_menus_for_location` call is
// ~500 ms / 354 KB, and a serial round trip is ~400 ms — worth guarding.
// ─────────────────────────────────────────────────────────────────────────────

describe("query cost", () => {
  const COST_CTX = { merchantId: "m_1", locationId: LOCATION_ID };

  it("issues the menu and location fetches concurrently, not in series", async () => {
    const order: string[] = [];
    let releaseMenu: () => void = () => {};
    const menuGate = new Promise<void>((r) => {
      releaseMenu = r;
    });

    const slowSources: ResolverSources = {
      async fetchMenuItems() {
        order.push("menu:start");
        await menuGate;
        order.push("menu:end");
        return [item("a"), item("b")];
      },
      async fetchLocations(ids) {
        // If this only starts after the menu fetch resolves, the two are
        // serial and the page pays both latencies back to back.
        order.push("location:start");
        releaseMenu();
        return [location()].filter((l) => ids.includes(l.id));
      },
    };

    await resolveBindings(collectBindings(pageWithItems(["a", "b"])), COST_CTX, slowSources);

    expect(order.indexOf("location:start")).toBeLessThan(order.indexOf("menu:end"));
  });

  it("keeps location bindings resolved when the menu source throws", async () => {
    const halfBroken: ResolverSources = {
      async fetchMenuItems() {
        throw new Error("get_menus_for_location failed: boom");
      },
      async fetchLocations() {
        return [location()];
      },
    };

    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { map } = await resolveBindings(
      collectBindings(pageWithItems(["a"])),
      COST_CTX,
      halfBroken,
    );
    spy.mockRestore();

    // A menu outage must not blank the address and opening hours too.
    expect(lookupLocation(map, LOCATION_ID).status).toBe("ok");
    expect(lookupMenuItem(map, "a").status).toBe("unavailable");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// brand pages (one site, many locations — 2026-08-15)
// ─────────────────────────────────────────────────────────────────────────────

describe("unscoped (brand page) resolution", () => {
  const BRAND_CTX = { merchantId: "m_1", locationId: LOCATION_ID, scoped: false };

  it("does not hide 86'd items when no location has been chosen", async () => {
    // The location was borrowed to read names and photos. Its 86 state says
    // nothing about the restaurant the visitor will actually order from, so
    // hiding a signature dish on its account would be arbitrary.
    const { map } = await resolveBindings(
      collectBindings(pageWithItems(["a"])),
      BRAND_CTX,
      sources([item("a", { available: false })]),
    );

    expect(lookupMenuItem(map, "a").status).toBe("ok");
  });

  it("still hides items that do not exist at all", async () => {
    // A deleted item has no name or photo to show, unlike an 86'd one.
    const { map } = await resolveBindings(
      collectBindings(pageWithItems(["gone"])),
      BRAND_CTX,
      sources([]),
    );

    expect(lookupMenuItem(map, "gone").status).toBe("unavailable");
  });

  it("keeps hiding 86'd items once a location IS chosen", async () => {
    const { map } = await resolveBindings(
      collectBindings(pageWithItems(["a"])),
      { merchantId: "m_1", locationId: LOCATION_ID },
      sources([item("a", { available: false })]),
    );

    expect(lookupMenuItem(map, "a").status).toBe("unavailable");
  });
});
