/**
 * Presentation for the two availability states surfaced on Menu → Out of stock.
 *
 * Mirrors `TABLE_STATUS_STYLES` / `PAYMENT_STATUS_STYLES` — a dot, a text
 * colour and a tint — so every status badge in the product reads as one system
 * (DS-CTL-09 / D-11). The page used to render `<Badge variant="secondary">`,
 * which gave a timed 86 and a manual switch-off the same neutral grey and left
 * the two states indistinguishable at a glance.
 *
 * The distinction matters operationally: a snooze clears itself on the
 * auto-restore cron, a turned-off item never does.
 */

import type { BadgeStyle } from "./table-status";

export type AvailabilityStatus = "snoozed" | "turned_off";

export const AVAILABILITY_STATUS_STYLES: Record<AvailabilityStatus, BadgeStyle> = {
  /** Timed 86 — restores itself. Amber reads as "temporary". */
  snoozed: {
    dot: "bg-amber-500",
    text: "text-amber-700 dark:text-amber-400",
    bg: "bg-amber-50 dark:bg-amber-900/20",
  },
  /** Deliberate switch-off — stays off until someone turns it back on. */
  turned_off: {
    dot: "bg-slate-500",
    text: "text-slate-700 dark:text-slate-400",
    bg: "bg-slate-100 dark:bg-slate-800/40",
  },
};

export function availabilityStatusStyle(status: AvailabilityStatus): BadgeStyle {
  return AVAILABILITY_STATUS_STYLES[status] ?? AVAILABILITY_STATUS_STYLES.turned_off;
}
