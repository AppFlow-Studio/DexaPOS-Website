import type { BadgeStyle } from "./table-status";

/**
 * Single source of truth for the badge presentation on the Item Library.
 *
 * Every badge here is deliberately NEUTRAL — one muted grey pill, no per-meaning
 * hue, no dot, no icon. The previous scheme gave each concept its own colour
 * (emerald = global, violet = location, plus five cascade colours) and painted
 * the label in that same hue on a matching tint. At a glance that read as
 * decoration rather than information: a wall of coloured chips where the colour
 * had to be memorised to mean anything.
 *
 * The words carry the meaning now. `dot` is kept in the shape only because
 * `BadgeStyle` is shared with the table/payment status styles, which still use
 * it legitimately; the menu surfaces no longer render it.
 *
 * If a future surface genuinely needs colour to separate two states at speed,
 * add it there deliberately — don't reintroduce it here, where it fans out to
 * every badge on four pages at once.
 */

export type { BadgeStyle };

/**
 * The one grey every badge on these surfaces resolves to. `bg-muted/60` sits
 * just off the card surface in both themes, so the pill stays visible without
 * announcing itself.
 */
const NEUTRAL: BadgeStyle = {
  dot: "bg-muted-foreground/40",
  text: "text-muted-foreground",
  bg: "bg-muted/60",
};

/**
 * Which level of the 5-tier pricing cascade supplied an item's effective price.
 * Keys match `FlatItem["price_source"]`.
 */
export const PRICE_SOURCE_STYLES: Record<string, BadgeStyle> = {
  base: NEUTRAL,
  location_item: NEUTRAL,
  category: NEUTRAL,
  location_category: NEUTRAL,
  location_menu: NEUTRAL,
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
  global: NEUTRAL,
  location: NEUTRAL,
};

export function categoryScopeStyle(isGlobal: boolean): BadgeStyle {
  return isGlobal ? CATEGORY_SCOPE_STYLES.global : CATEGORY_SCOPE_STYLES.location;
}

/**
 * Item availability. `unavailable` is the only state shown as a badge — an
 * available item needs no marker, and badging every card would be noise.
 */
export const ITEM_AVAILABILITY_STYLES: Record<"available" | "unavailable", BadgeStyle> = {
  available: NEUTRAL,
  unavailable: NEUTRAL,
};

/** Tax treatment. "Exempt" vs "Taxed" is carried by the word, not a colour. */
export const TAX_BADGE_STYLES: Record<"exempt" | "taxed", BadgeStyle> = {
  exempt: NEUTRAL,
  taxed: NEUTRAL,
};

/** Item carries a location-specific price override on top of the global one. */
export const OVERRIDE_BADGE_STYLE: BadgeStyle = NEUTRAL;

/**
 * A modifier group is scoped exactly like a category — global to the merchant,
 * or owned by one location — so it reuses the same emerald/violet pair rather
 * than inventing a third colour for the same idea.
 */
export function modifierScopeStyle(isGlobal: boolean): BadgeStyle {
  return categoryScopeStyle(isGlobal);
}

/**
 * The badge for a plain count (options, linked items). Kept here so the
 * modifiers page never falls back to a bordered `<Badge variant="outline">`,
 * which reads as a different system beside these pills.
 */
export const COUNT_BADGE_STYLE: BadgeStyle = NEUTRAL;

/** Modifier options assigned at the item level vs. inherited by a category. */
export const LINKED_ITEM_BADGE_STYLE: BadgeStyle = NEUTRAL;
