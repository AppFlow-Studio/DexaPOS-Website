import { describe, expect, it, vi } from "vitest";

import { collectBindings, extractBindings, groupByType } from "../bindings/collect";
import {
  resolveBindings,
  unresolvedIds,
  type MenuItemSource,
  type ResolverSources,
} from "../bindings/resolve";
import { createSupabaseResolverSources, flattenMenuItems } from "../bindings/supabase-sources";
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

  /**
   * The property that makes `get_menus_for_location_lite` substitutable.
   *
   * The lite RPC is the full payload with unread keys deleted, so the two must
   * flatten to byte-identical results. If someone later makes this function read
   * a field the projection drops — `modifier_groups`, `price_levels`, anything
   * under them — this fails, which is the point: that change also needs a line
   * in 20260816120000_get_menus_for_location_lite.sql or it silently returns
   * undefined in production.
   */
  it("flattens the lite payload identically to the full one", () => {
    const full = [
      {
        id: "menu_1",
        merchant_id: "m_1",
        location_id: null,
        description: "Evening service",
        is_active: true,
        created_at: "2026-01-01T00:00:00Z",
        name: "Dinner",
        categories: [
          {
            id: "mc_1",
            category_id: "c_1",
            display_order: 1,
            is_active: true,
            category: { id: "c_1", name: "Pizza", image: null },
            items: [
              {
                id: "ci_1",
                menu_item_id: "i1",
                display_order: 1,
                is_featured: false,
                menu_item: {
                  id: "i1",
                  name: "Margherita",
                  description: "San Marzano, basil",
                  effective_price: 18,
                  effective_cash_price: 17.1,
                  effective_delivery_price: 21,
                  image: "https://cdn/i1.jpg",
                  effective_availability: true,
                  dietary_flags: ["vegetarian"],
                  allergens: ["gluten", "dairy"],
                  // Everything below is what the lite projection drops.
                  price_levels: { level_1_base: 20, level_3_category: 18 },
                  modifier_groups: [{ id: "mg_1", modifiers: [{ id: "mo_1", price: 2 }] }],
                  meal_types: ["dinner"],
                  card_bg_color: "#fff",
                  stock_tracking_mode: "none",
                  current_stock: null,
                  price_source: "category",
                  has_location_item_override: false,
                },
              },
            ],
          },
        ],
      },
    ];

    const lite = [
      {
        id: "menu_1",
        name: "Dinner",
        categories: [
          {
            id: "mc_1",
            is_active: true,
            items: [
              {
                menu_item: {
                  id: "i1",
                  name: "Margherita",
                  description: "San Marzano, basil",
                  image: "https://cdn/i1.jpg",
                  allergens: ["gluten", "dairy"],
                  dietary_flags: ["vegetarian"],
                  effective_availability: true,
                  effective_price: 18,
                  effective_cash_price: 17.1,
                  effective_delivery_price: 21,
                },
              },
            ],
          },
        ],
      },
    ];

    expect(flattenMenuItems(lite)).toEqual(flattenMenuItems(full));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// lite RPC fallback
//
// The builder must keep working in an environment where the lite migration has
// not been applied — otherwise deploying the code ahead of the migration takes
// the editor down. Equally, a real failure must not be retried against a
// different function and reported as though it were the same question.
// ─────────────────────────────────────────────────────────────────────────────

describe("get_menus_for_location_lite fallback", () => {
  const CTX = { merchantId: "m_1", locationId: LOCATION_ID };

  /** Records which RPCs were called, answering each from `replies`. */
  function rpcClient(replies: Record<string, { data?: unknown; error?: unknown }>) {
    const called: string[] = [];
    const client = {
      rpc: async (name: string) => {
        called.push(name);
        return replies[name] ?? { data: null, error: null };
      },
      from: () => ({ select: () => ({ in: async () => ({ data: [], error: null }) }) }),
    };
    return { client: client as never, called };
  }

  const oneItem = [
    { categories: [{ is_active: true, items: [{ menu_item: { id: "i1", effective_price: 7 } }] }] },
  ];

  it("prefers the lite RPC and never calls the full one", async () => {
    const { client, called } = rpcClient({
      get_menus_for_location_lite: { data: oneItem, error: null },
    });

    const items = await createSupabaseResolverSources(client).fetchMenuItems(CTX);

    expect(called).toEqual(["get_menus_for_location_lite"]);
    expect(items.map((i) => i.id)).toEqual(["i1"]);
  });

  it("falls back to the full RPC when the function is not deployed", async () => {
    const { client, called } = rpcClient({
      get_menus_for_location_lite: { data: null, error: { code: "PGRST202", message: "not found" } },
      get_menus_for_location: { data: oneItem, error: null },
    });

    const items = await createSupabaseResolverSources(client).fetchMenuItems(CTX);

    expect(called).toEqual(["get_menus_for_location_lite", "get_menus_for_location"]);
    expect(items.map((i) => i.id)).toEqual(["i1"]);
  });

  // A dropped connection reaches supabase-js through the same error channel as a
  // query Postgres refused, so the wrapper used to name an RPC that was never
  // reached — "get_menus_for_location_lite failed: TypeError: fetch failed" reads
  // as a missing migration when the real answer is that the network went away.
  it("names the network, not the RPC, when the connection never completed", async () => {
    const { client, called } = rpcClient({
      get_menus_for_location_lite: {
        data: null,
        // What supabase-js actually hands back when undici throws: a message,
        // and no code, because nothing answered.
        error: { code: "", message: "TypeError: fetch failed" },
      },
      get_menus_for_location: { data: oneItem, error: null },
    });

    await expect(createSupabaseResolverSources(client).fetchMenuItems(CTX)).rejects.toThrow(
      /could not reach the database/,
    );

    // Still no fallback: an unreachable database is not a missing function, and
    // asking a second time down the same dead socket answers nothing.
    expect(called).toEqual(["get_menus_for_location_lite"]);
  });

  it("keeps naming the RPC when the database did answer", async () => {
    const { client } = rpcClient({
      get_menus_for_location_lite: {
        data: null,
        error: { code: "42501", message: "permission denied" },
      },
    });

    await expect(createSupabaseResolverSources(client).fetchMenuItems(CTX)).rejects.toThrow(
      /get_menus_for_location_lite failed: permission denied/,
    );
  });

  it("separates the two for locations as well", async () => {
    const clientFor = (error: unknown) =>
      ({
        rpc: async () => ({ data: null, error: null }),
        from: () => ({ select: () => ({ in: async () => ({ data: null, error }) }) }),
      }) as never;

    await expect(
      createSupabaseResolverSources(clientFor({ code: "", message: "TypeError: fetch failed" }))
        .fetchLocations([LOCATION_ID]),
    ).rejects.toThrow(/could not reach the database/);

    await expect(
      createSupabaseResolverSources(clientFor({ code: "42501", message: "permission denied" }))
        .fetchLocations([LOCATION_ID]),
    ).rejects.toThrow(/location fetch failed: permission denied/);
  });

  it("does NOT fall back on a real failure — it reports it", async () => {
    const { client, called } = rpcClient({
      get_menus_for_location_lite: {
        data: null,
        error: { code: "42501", message: "permission denied" },
      },
      get_menus_for_location: { data: oneItem, error: null },
    });

    await expect(createSupabaseResolverSources(client).fetchMenuItems(CTX)).rejects.toThrow(
      /permission denied/,
    );
    expect(called).toEqual(["get_menus_for_location_lite"]);
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

  // ───────────────────────────────────────────────────────────────────────────
  // Instance sharing.
  //
  // The builder page seeds its starter document from the menu and then renders
  // it, which is two consumers of the same data in one request. These two tests
  // pin down where the memo lives: on the *instance*. That is the whole reason
  // `request-scope.ts` hands out a `cache()`d singleton rather than letting each
  // caller construct its own — a plain factory silently doubles a 320 KB fetch,
  // and the page renders identically either way, so nothing else would notice.
  // ───────────────────────────────────────────────────────────────────────────

  /** A Supabase stand-in that counts RPC calls. */
  function countingClient() {
    let rpcCalls = 0;
    const client = {
      rpc: async () => {
        rpcCalls += 1;
        return { data: [], error: null };
      },
      from: () => ({
        select: () => ({ in: async () => ({ data: [], error: null }) }),
      }),
    };
    // The real signature wants a SupabaseClient; the sources only ever touch
    // `.rpc` and `.from`, and `flattenMenuItems` is tested directly elsewhere.
    return { client: client as never, calls: () => rpcCalls };
  }

  it("shares one menu fetch between the seed helper and the renderer", async () => {
    const { client, calls } = countingClient();
    const sources = createSupabaseResolverSources(client, {});

    // 1. what `loadSampleMenuItemIds` does when seeding a starter page
    await sources.fetchMenuItems(COST_CTX);
    // 2. what the renderer does immediately afterwards
    await resolveBindings(collectBindings(pageWithItems(["a"])), COST_CTX, sources);

    expect(calls()).toBe(1);
  });

  it("does NOT share across two instances — why the singleton is cached", async () => {
    const { client, calls } = countingClient();

    const perCallerSources = createSupabaseResolverSources(client, {});
    const anotherInstance = createSupabaseResolverSources(client, {});

    await perCallerSources.fetchMenuItems(COST_CTX);
    await anotherInstance.fetchMenuItems(COST_CTX);

    // This is the regression that `getResolverSources` exists to prevent: the
    // builder page and `renderCanvas` each built their own instance and paid
    // for the menu twice on every page open.
    expect(calls()).toBe(2);
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

// ─────────────────────────────────────────────────────────────────────────────
// which door the location read goes through

describe("public location reads", () => {
  const ROW = {
    id: "loc_1",
    name: "Downtown Hamra",
    address_line1: "Hamra main street",
    city: "hamra",
    phone: "(192) 391-0320",
    business_hours: { monday: "9-9" },
  };

  /** Records whether the table or the function was used. */
  function spyClient() {
    const calls: string[] = [];
    const client = {
      rpc: async (name: string, args: Record<string, unknown>) => {
        calls.push(`rpc:${name}:${JSON.stringify(args)}`);
        return { data: [ROW], error: null };
      },
      from: (table: string) => ({
        select: () => ({
          in: async () => {
            calls.push(`table:${table}`);
            // Anon genuinely gets this: zero rows and no error, because every
            // SELECT policy on `locations` is authenticated-only.
            return { data: [], error: null };
          },
        }),
      }),
    };
    return { client: client as never, calls };
  }

  it("reads through get_public_locations when rendering publicly", async () => {
    const { client, calls } = spyClient();

    const locations = await createSupabaseResolverSources(client, {
      publicMerchantId: "m_1",
    }).fetchLocations(["loc_1"]);

    expect(calls).toEqual([
      'rpc:get_public_locations:{"p_merchant_id":"m_1","p_ids":["loc_1"]}',
    ]);
    expect(locations[0].addressLine1).toBe("Hamra main street");
    expect(locations[0].phone).toBe("(192) 391-0320");
  });

  /**
   * The editor reads as a signed-in merchant, where the table is both readable
   * and richer. Sending it through the public projection would quietly narrow
   * what the merchant can see about their own restaurant.
   */
  it("still reads the table directly for a signed-in merchant", async () => {
    const { client, calls } = spyClient();

    await createSupabaseResolverSources(client).fetchLocations(["loc_1"]);

    expect(calls).toEqual(["table:locations"]);
  });

  /**
   * The public projection deliberately omits `email`: nothing renders it, and a
   * merchant's contact address should not be readable by anyone who can call
   * the function. A missing column must therefore degrade to null rather than
   * `undefined` leaking into a resolved location.
   */
  it("resolves a public location with no email rather than an undefined one", async () => {
    const { client } = spyClient();

    const [location] = await createSupabaseResolverSources(client, {
      publicMerchantId: "m_1",
    }).fetchLocations(["loc_1"]);

    expect(location.email).toBeNull();
    expect(location.name).toBe("Downtown Hamra");
  });

  it("asks for nothing when there are no location bindings", async () => {
    const { client, calls } = spyClient();

    expect(
      await createSupabaseResolverSources(client, { publicMerchantId: "m_1" }).fetchLocations([]),
    ).toEqual([]);
    expect(calls).toEqual([]);
  });
});
