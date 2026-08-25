import { isDiscountExpired, type Discount } from "@/types/discount";

/**
 * Single source of truth for discount badge presentation (D-11).
 *
 * Mirrors the shape of `TABLE_STATUS_STYLES` in `table-status.ts` — a dot, a
 * text colour and a tint — so every status badge in the product reads as one
 * system. Replaces the shadcn `<Badge variant="default">` / `"destructive"`
 * solid fills the discounts area used to carry, which shouted over the flat
 * panel surfaces around them.
 *
 * A discount has no single status column: it is a product of `is_active` and
 * the date window. `discountStatus()` collapses those into the one label a
 * merchant actually reads.
 */

export interface BadgeStyle {
  dot: string;
  text: string;
  bg: string;
}

export type DiscountStatus = "active" | "inactive" | "expired" | "scheduled";

export const DISCOUNT_STATUS_LABELS: Record<DiscountStatus, string> = {
  active: "Active",
  inactive: "Inactive",
  expired: "Expired",
  scheduled: "Scheduled",
};

export const DISCOUNT_STATUS_STYLES: Record<DiscountStatus, BadgeStyle> = {
  active: {
    dot: "bg-emerald-500",
    text: "text-emerald-700 dark:text-emerald-400",
    bg: "bg-emerald-50 dark:bg-emerald-900/20",
  },
  // The neutral state uses tokens rather than a `slate-*` ramp: §8 bans the
  // literal palette, and it is the one style here with a token equivalent.
  inactive: {
    dot: "bg-muted-foreground/50",
    text: "text-muted-foreground",
    bg: "bg-muted/60",
  },
  expired: {
    dot: "bg-rose-500",
    text: "text-rose-700 dark:text-rose-400",
    bg: "bg-rose-50 dark:bg-rose-900/20",
  },
  scheduled: {
    dot: "bg-amber-500",
    text: "text-amber-700 dark:text-amber-400",
    bg: "bg-amber-50 dark:bg-amber-900/20",
  },
};

export function discountStatusStyle(status: DiscountStatus): BadgeStyle {
  return DISCOUNT_STATUS_STYLES[status] ?? DISCOUNT_STATUS_STYLES.inactive;
}

export function discountStatusLabel(status: DiscountStatus): string {
  return DISCOUNT_STATUS_LABELS[status] ?? "Unknown";
}

/**
 * Collapse `is_active` + the date window into one user-facing status.
 *
 * Order matters: a discount past its end date reads "Expired" whether or not
 * the toggle is on, because the toggle no longer changes what the POS does.
 * An inactive toggle then wins over a future start date — "Inactive" is the
 * more actionable of the two.
 *
 * Expiry defers to `isDiscountExpired` rather than re-comparing dates here, so
 * there is one definition of "expired" — it floors to midnight, meaning a
 * discount whose window ends today still reads as running.
 */
export function discountStatus(
  discount: Pick<Discount, "is_active" | "start_date" | "end_date">
): DiscountStatus {
  if (isDiscountExpired(discount)) return "expired";
  if (!discount.is_active) return "inactive";

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  if (discount.start_date && new Date(discount.start_date) > startOfToday)
    return "scheduled";

  return "active";
}
