import type { BadgeStyle } from "./table-status";

export type { BadgeStyle };

export type CashDrawerState = "inactive" | "open" | "closed";

export function cashDrawerStatus(
  isActive: boolean,
  isOpen: boolean,
): CashDrawerState {
  if (!isActive) return "inactive";
  return isOpen ? "open" : "closed";
}

export const CASH_DRAWER_STATUS_LABELS: Record<CashDrawerState, string> = {
  open: "Open",
  closed: "Closed",
  inactive: "Inactive",
};

/**
 * Badge presentation for a drawer's state (D-11).
 *
 * Mirrors `TABLE_STATUS_STYLES`: a dot, a text colour and a soft tint, so every
 * status badge in the product reads as one system. These were previously
 * written inline at the call site — the "open" badge carried a saturated
 * `bg-emerald-100 hover:bg-emerald-200` fill with a hover state no other badge
 * has, and "closed"/"inactive" used bare `<Badge variant>`s that encode nothing.
 *
 * ⚠️ This is a `.ts` file, which Tailwind does not scan (C7). These classes
 * generate CSS only because the same literals are also spelled out in a `.tsx`
 * (see `TABLE_STATUS_STYLES`, whose emerald/slate values these reuse).
 */
const NEUTRAL: BadgeStyle = {
  // A dot needs a literal background colour — `text-muted-foreground` cannot
  // fill one. Matches the neutral dot in `TABLE_STATUS_STYLES`.
  dot: "bg-slate-500",
  text: "text-muted-foreground",
  bg: "bg-muted/60",
};

/**
 * All three states are neutral grey. The word carries the meaning; a green
 * "Open" pill beside grey "Closed"/"Inactive" made one ordinary state look like
 * a success condition, and the same neutral pass was applied to the menu badges
 * in `menu-item-badges.ts`.
 */
export const CASH_DRAWER_STATUS_STYLES: Record<CashDrawerState, BadgeStyle> = {
  open: NEUTRAL,
  closed: NEUTRAL,
  inactive: NEUTRAL,
};

export function cashDrawerStatusStyle(status: CashDrawerState): BadgeStyle {
  return CASH_DRAWER_STATUS_STYLES[status];
}
