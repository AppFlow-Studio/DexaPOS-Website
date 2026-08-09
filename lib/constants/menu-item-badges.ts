import type { BadgeStyle } from "./table-status";

/**
 * Single source of truth for the badge presentation on the Item Library.
 *
 * Mirrors `TABLE_STATUS_STYLES` and `PAYMENT_STATUS_STYLES` — a dot, a text
 * colour and a soft tint — so every badge in the product reads as one system
 * (D-11). Replaces the `bg-blue-50 text-blue-700 border-blue-200` triples that
 * used to be written inline at six separate call sites in `menu/items/page.tsx`,
 * where a new `price_source` could silently render with no colour at all.
 *
 * Every entry carries a `dark:` variant: the light-only tints these replaced
 * turned into near-white blocks on the dark dashboard card (C4).
 */

export type { BadgeStyle };

/**
 * Which level of the 5-tier pricing cascade supplied an item's effective price.
 * Keys match `FlatItem["price_source"]`.
 */
export const PRICE_SOURCE_STYLES: Record<string, BadgeStyle> = {
  base: {
    dot: "bg-slate-400",
    text: "text-slate-700 dark:text-slate-300",
    bg: "bg-slate-100 dark:bg-slate-800/40",
  },
  location_item: {
    dot: "bg-blue-500",
    text: "text-blue-700 dark:text-blue-400",
    bg: "bg-blue-50 dark:bg-blue-900/20",
  },
  category: {
    dot: "bg-emerald-500",
    text: "text-emerald-700 dark:text-emerald-400",
    bg: "bg-emerald-50 dark:bg-emerald-900/20",
  },
  location_category: {
    dot: "bg-violet-500",
    text: "text-violet-700 dark:text-violet-400",
    bg: "bg-violet-50 dark:bg-violet-900/20",
  },
  location_menu: {
    dot: "bg-orange-500",
    text: "text-orange-700 dark:text-orange-400",
    bg: "bg-orange-50 dark:bg-orange-900/20",
  },
};

export function priceSourceStyle(source: string | null | undefined): BadgeStyle {
  return PRICE_SOURCE_STYLES[source ?? "base"] ?? PRICE_SOURCE_STYLES.base;
}

/** `location_item` → `Location item`. Underscores read as raw column names. */
export function priceSourceLabel(source: string | null | undefined): string {
  if (!source) return "Base";
  const spaced = source.replace(/_/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/**
 * A category is either global (shared by every location) or owned by one
 * location. The same emerald/violet pair encodes this on cards, rows and
 * category headers.
 */
export const CATEGORY_SCOPE_STYLES: Record<"global" | "location", BadgeStyle> = {
  global: {
    dot: "bg-emerald-500",
    text: "text-emerald-700 dark:text-emerald-400",
    bg: "bg-emerald-50 dark:bg-emerald-900/20",
  },
  location: {
    dot: "bg-violet-500",
    text: "text-violet-700 dark:text-violet-400",
    bg: "bg-violet-50 dark:bg-violet-900/20",
  },
};

export function categoryScopeStyle(isGlobal: boolean): BadgeStyle {
  return isGlobal ? CATEGORY_SCOPE_STYLES.global : CATEGORY_SCOPE_STYLES.location;
}

/**
 * Item availability. `unavailable` is the only state shown as a badge — an
 * available item needs no marker, and badging every card would be noise.
 */
export const ITEM_AVAILABILITY_STYLES: Record<"available" | "unavailable", BadgeStyle> = {
  available: {
    dot: "bg-emerald-500",
    text: "text-emerald-700 dark:text-emerald-400",
    bg: "bg-emerald-50 dark:bg-emerald-900/20",
  },
  unavailable: {
    dot: "bg-red-500",
    text: "text-red-700 dark:text-red-400",
    bg: "bg-red-50 dark:bg-red-900/20",
  },
};

/** Tax treatment: exempt items are flagged amber, taxed items stay neutral. */
export const TAX_BADGE_STYLES: Record<"exempt" | "taxed", BadgeStyle> = {
  exempt: {
    dot: "bg-amber-500",
    text: "text-amber-700 dark:text-amber-400",
    bg: "bg-amber-50 dark:bg-amber-900/20",
  },
  taxed: {
    dot: "bg-slate-400",
    text: "text-muted-foreground",
    bg: "bg-muted/60",
  },
};

/** Item carries a location-specific price override on top of the global one. */
export const OVERRIDE_BADGE_STYLE: BadgeStyle = {
  dot: "bg-amber-500",
  text: "text-amber-700 dark:text-amber-400",
  bg: "bg-amber-50 dark:bg-amber-900/20",
};
