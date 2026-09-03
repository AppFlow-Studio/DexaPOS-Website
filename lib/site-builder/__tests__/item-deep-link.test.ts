import { describe, expect, it } from "vitest";

import {
  consumeItemDeepLink,
  resolveDeepLinkItem,
  stripItemParam,
} from "@/app/sites/components/ItemDeepLink";
import type {
  StorefrontItem,
  StorefrontMenu,
} from "@/types/storefront";

/**
 * The trust boundary for the built site's "+" buttons.
 *
 * `?item=` is public input on a public URL, so the property under test is not
 * "the right modal opens" but "nothing outside the page's own menu data is ever
 * reachable, and every failure looks the same".
 */

function item(id: string, over: Partial<StorefrontItem> = {}): StorefrontItem {
  return {
    id,
    name: `Item ${id}`,
    description: null,
    price: 10,
    cash_price: 9,
    delivery_price: 11,
    image: null,
    availability: true,
    ...over,
  } as StorefrontItem;
}

function menus(...items: StorefrontItem[]): StorefrontMenu[] {
  return [
    {
      id: "menu_1",
      name: "All day",
      categories: [
        { id: "cat_1", name: "Mains", items: items.slice(0, 1) },
        { id: "cat_2", name: "Sides", items: items.slice(1) },
      ],
    },
  ] as unknown as StorefrontMenu[];
}

const shown = menus(item("item_a"), item("item_b"), item("item_86", { availability: false }));

describe("?item= deep link", () => {
  it("finds an item the page is already showing, in any category", () => {
    expect(resolveDeepLinkItem(shown, "?item=item_a")?.id).toBe("item_a");
    expect(resolveDeepLinkItem(shown, "?item=item_b")?.id).toBe("item_b");
  });

  it("decodes the id the + encoded", () => {
    const odd = menus(item("a&b c"));
    expect(resolveDeepLinkItem(odd, "?item=a%26b%20c")?.id).toBe("a&b c");
  });

  it("treats every miss identically, so the parameter cannot probe for items", () => {
    const misses = [
      "", // arrived with no parameter at all
      "?item=",
      "?item=00000000-0000-0000-0000-000000000000", // well-formed, unknown
      "?item=item_a_but_not_quite",
      "?item=../../etc/passwd",
      "?item[]=item_a",
      "?other=item_a",
    ];

    for (const search of misses) {
      expect(resolveDeepLinkItem(shown, search), search).toBeNull();
    }
  });

  it("refuses an item that is 86'd right now", () => {
    // It IS on the page's menu data — this is not a lookup failure, it is a
    // deliberate refusal, matching the storefront's own disabled "+".
    expect(resolveDeepLinkItem(shown, "?item=item_86")).toBeNull();
  });

  it("resolves nothing at all when the page has no menus", () => {
    expect(resolveDeepLinkItem([], "?item=item_a")).toBeNull();
  });
});

describe("consuming the parameter", () => {
  it("removes it so a refresh or a shared link does not re-open the modal", () => {
    expect(stripItemParam("https://x.test/sites/tonys?item=item_a")).toBe("/sites/tonys");
  });

  it("keeps every other parameter, including a QR table token", () => {
    expect(stripItemParam("https://x.test/sites/tonys?t=abc&item=item_a&utm=spring")).toBe(
      "/sites/tonys?t=abc&utm=spring",
    );
  });

  it("keeps the hash", () => {
    expect(stripItemParam("https://x.test/sites/tonys?item=item_a#menu")).toBe(
      "/sites/tonys#menu",
    );
  });

  it("is a no-op on a URL that never had one", () => {
    expect(stripItemParam("https://x.test/sites/tonys?t=abc")).toBe("/sites/tonys?t=abc");
  });
});

describe("resolving and consuming in one pass", () => {
  const href = (search: string) => `https://x.test/sites/tonys${search}`;

  /**
   * The regression this composition exists for. `history.replaceState` updates
   * `window.location` synchronously, so an implementation that stripped the
   * parameter before resolving it would resolve against a search string the
   * parameter had already left — and silently open nothing, on every link.
   */
  it("resolves the item AND hands back the cleaned URL from one read", () => {
    const outcome = consumeItemDeepLink(href("?item=item_a"), shown);

    expect(outcome).not.toBeNull();
    expect(outcome!.item?.id).toBe("item_a");
    expect(outcome!.nextHref).toBe("/sites/tonys");
  });

  it("still consumes a parameter that matched nothing", () => {
    const outcome = consumeItemDeepLink(href("?item=nope&t=abc"), shown);

    expect(outcome!.item).toBeNull();
    // Cleaned anyway, so a refresh does not retry a link that will never work.
    expect(outcome!.nextHref).toBe("/sites/tonys?t=abc");
  });

  it("leaves a URL that is not a deep link completely alone", () => {
    expect(consumeItemDeepLink(href("?t=abc"), shown)).toBeNull();
    expect(consumeItemDeepLink(href(""), shown)).toBeNull();
  });
});
