"use client";

import { useEffect, useRef } from "react";

import type { StorefrontItem, StorefrontMenu } from "@/types/storefront";
import { useCart } from "../hooks/useCart";

/** The query parameter a built site's "+" buttons arrive with. */
export const ITEM_PARAM = "item";

/**
 * Opens one item's details modal when the page is arrived at from a built
 * site's `+` button (`?item=<menu_item id>`).
 *
 * **Why it renders nothing and lives above the template fork.** Four layouts —
 * `MenuBrowser`, `HeroLayout`, `MarketLayout`, `BoutiqueLayout` — already watch
 * the cart store's `pendingModalItem` and pop their own modal when it is set.
 * Feeding that one action means this works on every template from a single
 * mount point, instead of four copies of the same effect drifting apart.
 *
 * **The id is never trusted.** It is public input on a public URL, so it is only
 * ever *matched against menu data this page has already loaded* — never used to
 * fetch. An id for an item on another merchant's menu, a deleted item, or a
 * random UUID all resolve to nothing and the page renders normally. That also
 * means the parameter cannot be used to probe whether an item exists: every
 * miss looks identical to a visitor and to a script.
 *
 * **The parameter is consumed, not kept.** `pendingModalItem` is deliberately
 * absent from the cart store's `partialize`, so it never survives a navigation
 * on its own; this strips the parameter after handling it so a refresh, a
 * back-button, or a URL pasted to a friend does not re-open a modal over the
 * menu they actually wanted to browse.
 */
export function ItemDeepLink({ menus }: { menus: StorefrontMenu[] }) {
  const requestOpenModal = useCart((s) => s.requestOpenModal);
  // Effects re-run when `menus` identity changes; the modal must not re-open.
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current) return;
    if (typeof window === "undefined") return;

    const outcome = consumeItemDeepLink(window.location.href, menus);
    if (!outcome) return;

    handled.current = true;
    window.history.replaceState({}, "", outcome.nextHref);
    if (outcome.item) requestOpenModal(outcome.item);
  }, [menus, requestOpenModal]);

  return null;
}

/**
 * Everything the effect above needs, decided in one pass.
 *
 * Composed rather than left as two calls at the call site because the order
 * matters and is easy to get wrong: `history.replaceState` updates
 * `window.location` synchronously, so stripping before resolving reads a search
 * string the parameter has already left and opens nothing. Reading both off the
 * same `href` here makes that mistake unrepresentable — and testable without a
 * DOM.
 *
 * Null means "not a deep link, leave the URL alone". A non-null result always
 * carries `nextHref`, because a parameter that matched nothing is still consumed.
 */
export function consumeItemDeepLink(
  href: string,
  menus: StorefrontMenu[],
): { item: StorefrontItem | null; nextHref: string } | null {
  const url = new URL(href);
  if (!url.searchParams.has(ITEM_PARAM)) return null;

  return {
    item: resolveDeepLinkItem(menus, url.search),
    nextHref: stripItemParam(href),
  };
}

/**
 * The item a `?item=` parameter refers to, or null.
 *
 * Pure, and separated from the effect above deliberately: this is the whole of
 * the trust boundary, so it is the part that carries the tests. Everything it
 * can return came out of `menus` — the data the page already rendered — so
 * there is no id a caller can supply that reaches anything else.
 *
 * Null covers every failure identically: no parameter, an empty one, an id from
 * another merchant's menu, a deleted item, and an item that is 86'd right now.
 * A visitor and a script see the same page in all five cases, so the parameter
 * cannot be used to probe whether an item exists.
 */
export function resolveDeepLinkItem(
  menus: StorefrontMenu[],
  search: string,
): StorefrontItem | null {
  const id = new URLSearchParams(search).get(ITEM_PARAM);
  if (!id) return null;

  for (const menu of menus) {
    for (const category of menu.categories) {
      const found = category.items.find((item) => item.id === id);
      // An 86'd item opens nothing: the storefront's own "+" is disabled in
      // that state, and a modal for something the kitchen cannot make is worse
      // than simply landing on the menu.
      if (found) return found.availability ? found : null;
    }
  }
  return null;
}

/**
 * The same URL with the parameter consumed, so a refresh, a back-button or a
 * link pasted to a friend does not re-open a modal over the menu they meant to
 * browse. Every other parameter — a QR table token, a campaign tag — survives.
 */
export function stripItemParam(href: string): string {
  const url = new URL(href);
  url.searchParams.delete(ITEM_PARAM);
  return `${url.pathname}${url.search}${url.hash}`;
}
